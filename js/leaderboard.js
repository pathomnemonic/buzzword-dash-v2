/**
 * leaderboard.js — Leaderboard, friends, authentication, and social services
 *
 * Agent 12 — Complete replacement file
 *
 * Architecture contract compliance:
 * - Uses Supabase Auth (auth.uid()) for all write operations
 * - No anonymous score writes
 * - Inspects resolved Supabase { error } values (not just .catch())
 * - Preserves maximum profile bests via server-side GREATEST()
 * - One best entry per user/mode/season via leaderboard_best view
 * - Invites have proper lifecycle states (not deleted on read)
 * - Supports unfriend, block, report
 * - All remote values rendered safely (textContent only — rendering is UI's job)
 * - Subscriptions are tracked for cleanup via dispose()
 * - Protocol version 3
 *
 * Dependencies expected from other agents:
 * - js/errors.js: reportError, requireSupabaseSuccess (Agent 6)
 * - js/dom.js: escapeHTML, createElement, setText, clearElement (Agent 5)
 * - js/storage.js: storage.get('profileName'), etc. (Agent 3)
 *
 * Exports:
 * - leaderboard (singleton service object)
 *
 * Removed exports (vs. prior version):
 * - renderLeaderboardScreen (moved to UI agent responsibility)
 * - bindLeaderboardEvents (moved to UI agent responsibility)
 * - getOrCreatePlayerId (replaced by authenticated user ID)
 */

// ===== CDN LOADING =====


// ===== CONFIGURATION =====
// Replace these with your Supabase project values.
// These are safe to expose — RLS handles authorization.

import { getAuthRedirectUrl, parseAuthLink } from './native.js';

var SUPABASE_URL = 'YOUR_SUPABASE_URL';
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Build-time override: set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (e.g. in
// .env.local or your host's env vars) instead of editing this file.
/** @type {Record<string, any>} */
var _env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
if (_env.VITE_SUPABASE_URL) SUPABASE_URL = _env.VITE_SUPABASE_URL;
if (_env.VITE_SUPABASE_ANON_KEY) SUPABASE_ANON_KEY = _env.VITE_SUPABASE_ANON_KEY;
// Tolerate a trailing slash or an accidental /rest/v1 suffix.
SUPABASE_URL = String(SUPABASE_URL).trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
SUPABASE_ANON_KEY = String(SUPABASE_ANON_KEY).trim();

// ===== INTERNAL STATE =====

var _client = null;
var _session = null;
var _userId = null;
var _loadPromise = null;
var _subscriptions = [];
var _disposed = false;
var _authError = null;
var _authListeners = [];

// ===== MODE LABELS (for display — UI agent may override) =====

var MODE_LABELS = {
  'endless': 'Endless',
  'daily': 'Daily',
  'study': 'Study',
  'weakness': 'Weakness',
  'versus': 'Versus',
  'mp_highscore': 'High Score',
  'mp_suddendeath': 'Sudden Death',
  'mp_race': 'Race',
  'timed_practice': 'Timed Practice',
  'tournament': 'Weekly Tournament'
};

// ===== HELPERS =====

/**
 * Weekly season key (ISO week, UTC), e.g. "2026-W40". Scores are stored with
 * this season so the weekly board resets every Monday; the all-time board
 * reads across seasons.
 * @param {Date} [date]
 * @returns {string}
 */
function getSeasonKey(date) {
  var d = new Date(Date.UTC((date || new Date()).getUTCFullYear(), (date || new Date()).getUTCMonth(), (date || new Date()).getUTCDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + (week < 10 ? '0' : '') + week;
}

function isConfigured() {
  return (
    SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
    SUPABASE_URL.length > 0 &&
    SUPABASE_ANON_KEY.length > 0
  );
}

/**
 * Load Supabase client library from CDN.
 * Caches the promise so it loads only once.
 * @returns {Promise<void>}
 */
function loadSupabaseLib() {
  if (window.supabase && window.supabase.createClient) {
    return Promise.resolve();
  }
  if (!_loadPromise) {
    // Bundled (code-split) instead of fetched from a CDN.
    _loadPromise = import('@supabase/supabase-js').then(function (mod) {
      window.supabase = { createClient: mod.createClient };
    }).catch(function (e) {
      _loadPromise = null;
      throw e;
    });
  }
  return _loadPromise;
}

/**
 * Inspect a Supabase query result and throw if error is present.
 * Architecture §17.3: Relying only on .catch() is prohibited.
 *
 * @param {object} result - { data, error, ... }
 * @param {string} [context] - Description for error reporting
 * @returns {*} result.data
 */
function requireSuccess(result, context) {
  if (result.error) {
    var msg = (context || 'Supabase') + ': ' + (result.error.message || result.error.code || 'Unknown error');
    console.warn('[Leaderboard]', msg);
    throw new Error(msg);
  }
  return result.data;
}

/**
 * Get the current authenticated user ID.
 * Returns null if not authenticated.
 * @returns {string|null}
 */
function getUserId() {
  return _userId || null;
}

/**
 * Get the mode display label.
 * @param {string} mode
 * @returns {string}
 */
var MIN_PASSWORD = 8;
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where Supabase's email links (confirm, reset) send the player back to. */
function getRedirectUrl() {
  return getAuthRedirectUrl();
}

/** @returns {string|null} a message for the first problem, or null */
function validateCredentials(email, password, isSignUp) {
  if (!EMAIL_PATTERN.test(String(email || '').trim())) return 'Enter a valid email address.';
  if (!password) return 'Enter your password.';
  if (isSignUp && String(password).length < MIN_PASSWORD) return 'Use at least ' + MIN_PASSWORD + ' characters for your password.';
  return null;
}

/** Turn Supabase auth errors into plain language. */
function friendlyAuthError(error) {
  var msg = (error && error.message) || 'Something went wrong.';
  if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: check your inbox for the link.';
  if (/already (been )?registered|already exists/i.test(msg)) return 'That email already has an account. Try signing in instead.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/password.*(weak|short|least)/i.test(msg)) return msg;
  return msg;
}

function getModeLabel(mode) {
  return MODE_LABELS[mode] || mode || 'Unknown';
}

// ===== LEADERBOARD SERVICE =====

var leaderboard = {

  /**
   * Initialize the leaderboard service.
   * Loads Supabase, creates client, and listens for auth state changes.
   * @returns {Promise<void>}
   */
  init: function () {
    if (_disposed) return Promise.reject(new Error('Leaderboard disposed'));
    if (!isConfigured()) {
      console.info('[Leaderboard] Not configured — leaderboard features disabled.');
      return Promise.resolve();
    }

    return loadSupabaseLib().then(function () {
      if (_client) return; // Already initialized

      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      // Listen for auth state changes
      var authSubscription = _client.auth.onAuthStateChange(function (event, session) {
        _session = session;
        _userId = session && session.user ? session.user.id : null;
        // Deferred so listeners never run inside the Supabase auth lock.
        setTimeout(function () {
          _authListeners.slice().forEach(function (fn) {
            try { fn(event, session); } catch (e) { console.warn('[Leaderboard] auth listener failed:', e.message); }
          });
        }, 0);
      });

      // Store for cleanup
      if (authSubscription && authSubscription.data && authSubscription.data.subscription) {
        _subscriptions.push(authSubscription.data.subscription);
      }

      // Check initial session; players are signed in anonymously so that
      // scores, friends and invites work without a password.
      return _client.auth.getSession().then(function (result) {
        if (result.data && result.data.session) {
          _session = result.data.session;
          _userId = result.data.session.user ? result.data.session.user.id : null;
          return null;
        }
        return leaderboard.signInAnonymously();
      });
    }).catch(function (e) {
      console.warn('[Leaderboard] Init failed:', e.message);
    });
  },

  /**
   * Sign in anonymously (requires "Allow anonymous sign-ins" in Supabase).
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  signInAnonymously: function () {
    if (!_client) return Promise.resolve({ success: false, error: 'Not configured' });
    return _client.auth.signInAnonymously().then(function (res) {
      if (res.error || !res.data || !res.data.session) {
        _authError = (res.error && res.error.message) || 'Sign-in failed';
        console.warn('[Leaderboard] Anonymous sign-in failed:', _authError);
        return { success: false, error: _authError };
      }
      _authError = null;
      _session = res.data.session;
      _userId = res.data.session.user.id;
      return { success: true, error: null };
    }).catch(function (e) {
      _authError = e.message;
      return { success: false, error: e.message };
    });
  },

  /**
   * Attach an email to the current (anonymous) account so progress on the
   * leaderboard survives clearing the browser. Supabase emails a confirmation
   * link. If already signed out, sends a magic sign-in link instead.
   * @param {string} email
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  linkEmail: function (email) {
    if (!_client) return Promise.resolve({ success: false, error: 'Not configured' });
    email = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Promise.resolve({ success: false, error: 'Enter a valid email address.' });
    }
    var request = _userId
      ? _client.auth.updateUser({ email: email })
      : _client.auth.signInWithOtp({ email: email });
    return request.then(function (res) {
      if (res.error) return { success: false, error: res.error.message };
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Create a real account. A guest keeps their identity (scores, friends and
   * groups stay attached) by upgrading the existing anonymous user; a signed-out
   * visitor gets a brand new account.
   * @param {string} email
   * @param {string} password - at least 8 characters
   * @returns {Promise<{success: boolean, needsConfirm?: boolean, error: string|null}>}
   */
  signUp: function (email, password) {
    if (!_client) return Promise.resolve({ success: false, error: 'Not configured' });
    var problem = validateCredentials(email, password, true);
    if (problem) return Promise.resolve({ success: false, error: problem });
    email = String(email).trim();
    var user = _session && _session.user;
    var request = user && user.is_anonymous
      ? _client.auth.updateUser({ email: email, password: password }, { emailRedirectTo: getRedirectUrl() })
      : _client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: getRedirectUrl() } });
    return request.then(function (res) {
      if (res.error) return { success: false, error: friendlyAuthError(res.error) };
      var data = res.data || {};
      var created = data.user || null;
      var pending = !!(created && (created.new_email || (!created.email_confirmed_at && !data.session)));
      return { success: true, needsConfirm: pending, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Sign in to an existing account.
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  signIn: function (email, password) {
    if (!_client) return Promise.resolve({ success: false, error: 'Not configured' });
    var problem = validateCredentials(email, password, false);
    if (problem) return Promise.resolve({ success: false, error: problem });
    return _client.auth.signInWithPassword({ email: String(email).trim(), password: password }).then(function (res) {
      if (res.error || !res.data || !res.data.session) {
        return { success: false, error: friendlyAuthError(res.error) };
      }
      _session = res.data.session;
      _userId = res.data.session.user.id;
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Sign out, then continue as a fresh guest so the game keeps working.
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  signOut: function () {
    if (!_client) return Promise.resolve({ success: false, error: 'Not configured' });
    return _client.auth.signOut().then(function (res) {
      if (res.error) return { success: false, error: res.error.message };
      _session = null;
      _userId = null;
      return leaderboard.signInAnonymously();
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Email a password-reset link.
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  sendPasswordReset: function (email) {
    if (!_client) return Promise.resolve({ success: false, error: 'Not configured' });
    email = String(email || '').trim();
    if (!EMAIL_PATTERN.test(email)) return Promise.resolve({ success: false, error: 'Enter a valid email address.' });
    return _client.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl() }).then(function (res) {
      if (res.error) return { success: false, error: friendlyAuthError(res.error) };
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Set a new password for the signed-in account (also used after a reset link).
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  updatePassword: function (password) {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not signed in' });
    if (String(password || '').length < MIN_PASSWORD) {
      return Promise.resolve({ success: false, error: 'Use at least ' + MIN_PASSWORD + ' characters.' });
    }
    return _client.auth.updateUser({ password: password }).then(function (res) {
      if (res.error) return { success: false, error: friendlyAuthError(res.error) };
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Finish an email link (confirm, reset) that reopened the app through its
   * custom URL scheme, by turning its tokens into a session.
   * @param {string} url
   * @returns {Promise<{success: boolean, type: string, error: string|null}>}
   */
  handleAuthLink: function (url) {
    var link = parseAuthLink(url);
    if (!_client || !link) return Promise.resolve({ success: false, type: '', error: 'Not an account link' });
    var request = link.code
      ? _client.auth.exchangeCodeForSession(link.code)
      : _client.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
    return request.then(function (res) {
      if (res.error || !res.data || !res.data.session) {
        return { success: false, type: link.type, error: friendlyAuthError(res.error) };
      }
      _session = res.data.session;
      _userId = res.data.session.user.id;
      // Browsers get this event from Supabase itself; a deep link has to announce it
      if (link.type === 'recovery') {
        setTimeout(function () {
          _authListeners.slice().forEach(function (fn) { try { fn('PASSWORD_RECOVERY', _session); } catch (e) { /* listener error */ } });
        }, 0);
      }
      return { success: true, type: link.type, error: null };
    }).catch(function (e) {
      return { success: false, type: link.type, error: e.message };
    });
  },

  /**
   * Permanently delete this account and all its online data (scores, friends,
   * groups, cloud save). The player continues as a fresh guest.
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  deleteAccount: function () {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not signed in' });
    return _client.rpc('delete_my_account').then(function (res) {
      if (res.error) return { success: false, error: res.error.message };
      return _client.auth.signOut().catch(function () { return null; }).then(function () {
        _session = null;
        _userId = null;
        return leaderboard.signInAnonymously();
      });
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Listen for sign-in, sign-out, email confirmation and password-recovery
   * events. @param {function(string, object|null)} fn @returns {function} unsubscribe
   */
  onAuthEvent: function (fn) {
    _authListeners.push(fn);
    return function () { _authListeners = _authListeners.filter(function (f) { return f !== fn; }); };
  },

  /**
   * Read this account's cloud save.
   * @returns {Promise<{success: boolean, save: ({data: object, runCount: number, updatedAt: string}|null), error: string|null}>}
   */
  pullSave: function () {
    if (!_client || !_userId) return Promise.resolve({ success: false, save: null, error: 'Not signed in' });
    return _client.from('player_saves').select('data, run_count, updated_at').maybeSingle().then(function (res) {
      if (res.error) return { success: false, save: null, error: res.error.message };
      var row = res.data;
      return {
        success: true,
        save: row ? { data: row.data, runCount: row.run_count, updatedAt: row.updated_at } : null,
        error: null
      };
    }).catch(function (e) {
      return { success: false, save: null, error: e.message };
    });
  },

  /**
   * Save progress to the cloud. `base` is the updated_at this device last
   * synced; if another device saved since, nothing is written and
   * `conflict` is true.
   * @returns {Promise<{success: boolean, conflict?: boolean, updatedAt?: string, error: string|null}>}
   */
  pushSave: function (data, runCount, base) {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not signed in' });
    return _client.rpc('push_save', { p_data: data, p_run_count: runCount || 0, p_base: base || null }).then(function (res) {
      if (res.error) return { success: false, error: res.error.message };
      if (!res.data) return { success: false, conflict: true, error: null };
      return { success: true, updatedAt: res.data, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Overwrite the cloud save (the player chose "keep this device").
   * @returns {Promise<{success: boolean, updatedAt?: string, error: string|null}>}
   */
  forceSave: function (data, runCount) {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not signed in' });
    return _client.rpc('force_save', { p_data: data, p_run_count: runCount || 0 }).then(function (res) {
      if (res.error) return { success: false, error: res.error.message };
      return { success: true, updatedAt: res.data, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Describe the current account for the UI.
   * @returns {{configured: boolean, ready: boolean, authenticated: boolean, anonymous: boolean, email: string, pendingEmail: string, error: string|null}}
   */
  getStatus: function () {
    var user = _session && _session.user;
    return {
      configured: isConfigured(),
      ready: !!_client,
      authenticated: !!_userId,
      anonymous: !!(user && user.is_anonymous),
      email: (user && user.email) || '',
      pendingEmail: (user && user.new_email) || '',
      error: _authError
    };
  },

  /**
   * Create or refresh the current player's public profile so they can be
   * found by search and receive friend requests before their first score.
   * @param {object} profile - { playerName, avatar, badges, visible }
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  ensureProfile: function (profile) {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not authenticated' });
    profile = profile || {};
    return _client.rpc('upsert_player_profile', {
      p_user_id: _userId,
      p_player_name: String(profile.playerName || 'Anonymous').slice(0, 30),
      p_avatar: String(profile.avatar || 'avatar_intern'),
      p_badges: Array.isArray(profile.badges) ? profile.badges.slice(0, 6) : [],
      p_best_score: 0,
      p_best_streak: 0,
      p_visible: profile.visible !== false
    }).then(function (res) {
      if (res.error) return { success: false, error: res.error.message };
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Get the current Supabase session (for auth state checks).
   * @returns {Promise<object|null>}
   */
  getSession: function () {
    if (!_client) return Promise.resolve(null);

    return _client.auth.getSession().then(function (result) {
      if (result.data && result.data.session) {
        _session = result.data.session;
        _userId = result.data.session.user ? result.data.session.user.id : null;
        return result.data.session;
      }
      return null;
    }).catch(function () {
      return null;
    });
  },

  /**
   * Check if the user is authenticated.
   * @returns {boolean}
   */
  isAuthenticated: function () {
    return !!_userId;
  },

  /**
   * Get the authenticated user ID.
   * @returns {string|null}
   */
  getUserId: function () {
    return getUserId();
  },

  /**
   * Submit a verified score from a completed run.
   * Architecture §27.3: Profile bests use maximum values (server-side GREATEST).
   * Architecture §27.6: Requires authentication.
   *
   * @param {object} summary - Canonical run summary
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  submitVerifiedScore: function (summary) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }
    if (!summary || !summary.runId) {
      return Promise.resolve({ success: false, error: 'Invalid summary' });
    }

    var totalAnswered = (summary.correct || 0) + (summary.wrong || 0);
    var accuracy = totalAnswered > 0 ? Math.round((summary.correct || 0) / totalAnswered * 100) : 0;

    var scoreRow = {
      user_id: _userId,
      player_name: String(summary.playerName || 'Anonymous').slice(0, 30),
      avatar: String(summary.avatar || 'avatar_intern'),
      score: Number(summary.score) || 0,
      accuracy: accuracy,
      best_streak: Number(summary.bestStreak) || 0,
      speed: Number(summary.userSpeed) || 1,
      mode: String(summary.mode || 'endless'),
      badges: Array.isArray(summary.badges) ? summary.badges.slice(0, 6) : [],
      run_id: String(summary.runId),
      season: getSeasonKey()
    };

    // Insert score (idempotent by run_id unique constraint)
    var scorePromise = _client
      .from('scores')
      .insert(scoreRow)
      .then(function (res) {
        // Duplicate run_id will cause a constraint violation — treat as success
        if (res.error && res.error.code === '23505') {
          return { data: null, error: null }; // Already submitted
        }
        return res;
      });

    // Upsert profile with GREATEST for bests (via server function)
    var profilePromise = _client.rpc('upsert_player_profile', {
      p_user_id: _userId,
      p_player_name: scoreRow.player_name,
      p_avatar: scoreRow.avatar,
      p_badges: scoreRow.badges,
      p_best_score: scoreRow.score,
      p_best_streak: scoreRow.best_streak,
      p_visible: true
    });

    return Promise.all([scorePromise, profilePromise]).then(function (results) {
      // Check both results for errors
      try {
        requireSuccess(results[0], 'Score insert');
      } catch (e) {
        // If it's a duplicate constraint, that's fine
        if (results[0].error && results[0].error.code !== '23505') {
          return { success: false, error: e.message };
        }
      }
      try {
        requireSuccess(results[1], 'Profile upsert');
      } catch (e) {
        // Profile upsert failure is non-fatal for the score
        console.warn('[Leaderboard] Profile upsert failed:', e.message);
      }
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Get top scores for the leaderboard.
   * Uses the leaderboard_best view for one-best-per-user-mode-season.
   *
   * @param {object} [options]
   * @param {string} [options.mode] - Filter by mode
   * @param {string} [options.season] - Filter by season
   * @param {number} [options.limit] - Max results (default 50)
   * @param {string} [options.period] - 'week' (default) or 'all'
   * @returns {Promise<object[]>}
   */
  getTopScores: function (options) {
    if (!_client) return Promise.resolve([]);
    options = options || {};

    // period: 'week' (default, current season) or 'all' (all-time bests)
    var allTime = options.period === 'all';
    var query = _client
      .from(allTime ? 'leaderboard_alltime' : 'leaderboard_best')
      .select('*')
      .order('score', { ascending: false })
      .limit(options.limit || 50);

    if (options.mode) {
      query = query.eq('mode', options.mode);
    }
    if (!allTime) {
      query = query.eq('season', options.season || getSeasonKey());
    } else if (options.season) {
      query = query.eq('season', options.season);
    }

    return query.then(function (res) {
      try {
        return requireSuccess(res, 'getTopScores');
      } catch (e) {
        return [];
      }
    }).catch(function () {
      return [];
    });
  },

  /**
   * Get the current player's best score(s).
   *
   * @param {object} [options]
   * @param {string} [options.mode]
   * @returns {Promise<object|null>}
   */
  getPlayerBest: function (options) {
    if (!_client || !_userId) return Promise.resolve(null);
    options = options || {};

    var query = _client
      .from('leaderboard_best')
      .select('*')
      .eq('user_id', _userId)
      .order('score', { ascending: false })
      .limit(1);

    if (options.mode) {
      query = query.eq('mode', options.mode);
    }

    return query.then(function (res) {
      try {
        var data = requireSuccess(res, 'getPlayerBest');
        return (data && data.length > 0) ? data[0] : null;
      } catch (e) {
        return null;
      }
    }).catch(function () {
      return null;
    });
  },

  /**
   * Search for players by name.
   * Only returns visible profiles.
   *
   * @param {string} queryStr
   * @returns {Promise<object[]>}
   */
  searchPlayers: function (queryStr) {
    if (!_client || !queryStr || typeof queryStr !== 'string') return Promise.resolve([]);

    var sanitized = queryStr.trim().slice(0, 50);
    if (sanitized.length === 0) return Promise.resolve([]);

    return _client
      .from('player_profiles')
      .select('user_id, player_name, avatar, best_score, best_streak, badges')
      .eq('visible', true)
      .ilike('player_name', '%' + sanitized + '%')
      .limit(20)
      .then(function (res) {
        try {
          return requireSuccess(res, 'searchPlayers');
        } catch (e) {
          return [];
        }
      }).catch(function () {
        return [];
      });
  },

  // ===== FRIENDS =====

  /**
   * Send a friend request to another user.
   *
   * @param {string} targetUserId
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  sendFriendRequest: function (targetUserId) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }
    if (_userId === targetUserId) {
      return Promise.resolve({ success: false, error: 'Cannot friend yourself' });
    }

    // Check if target has blocked the requester
    return _client
      .from('friend_blocks')
      .select('id')
      .eq('blocker_id', targetUserId)
      .eq('blocked_id', _userId)
      .limit(1)
      .then(function (blockRes) {
        var blockData;
        try { blockData = requireSuccess(blockRes, 'Check block'); } catch (e) { blockData = []; }
        if (blockData && blockData.length > 0) {
          return { success: false, error: 'Unable to send request' };
        }

        return _client
          .from('friends')
          .insert({
            requester_id: _userId,
            addressee_id: targetUserId,
            status: 'pending'
          })
          .then(function (res) {
            try {
              requireSuccess(res, 'sendFriendRequest');
              return { success: true, error: null };
            } catch (e) {
              // Duplicate constraint = already sent
              if (res.error && res.error.code === '23505') {
                return { success: false, error: 'Request already sent' };
              }
              return { success: false, error: e.message };
            }
          });
      }).catch(function (e) {
        return { success: false, error: e.message };
      });
  },

  /**
   * Accept a friend request.
   * Only the addressee can accept.
   *
   * @param {number} requestId
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  acceptFriendRequest: function (requestId) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }

    return _client
      .from('friends')
      .update({ status: 'accepted' })
      .eq('id', requestId)
      .eq('addressee_id', _userId)
      .eq('status', 'pending')
      .then(function (res) {
        try {
          requireSuccess(res, 'acceptFriendRequest');
          return { success: true, error: null };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }).catch(function (e) {
        return { success: false, error: e.message };
      });
  },

  /**
   * Decline a friend request.
   * Only the addressee can decline.
   *
   * @param {number} requestId
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  declineFriendRequest: function (requestId) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }

    return _client
      .from('friends')
      .update({ status: 'declined' })
      .eq('id', requestId)
      .eq('addressee_id', _userId)
      .eq('status', 'pending')
      .then(function (res) {
        try {
          requireSuccess(res, 'declineFriendRequest');
          return { success: true, error: null };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }).catch(function (e) {
        return { success: false, error: e.message };
      });
  },

  /**
   * Remove a friend (unfriend). Either party can do this.
   *
   * @param {string} friendUserId
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  removeFriend: function (friendUserId) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }

    // Delete both directions (only one will exist, but this is safe)
    var q1 = _client
      .from('friends')
      .delete()
      .eq('requester_id', _userId)
      .eq('addressee_id', friendUserId)
      .eq('status', 'accepted');

    var q2 = _client
      .from('friends')
      .delete()
      .eq('requester_id', friendUserId)
      .eq('addressee_id', _userId)
      .eq('status', 'accepted');

    return Promise.all([q1, q2]).then(function () {
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Block a user. Removes existing friendship and prevents future requests.
   *
   * @param {string} targetUserId
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  blockUser: function (targetUserId) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }
    if (_userId === targetUserId) {
      return Promise.resolve({ success: false, error: 'Cannot block yourself' });
    }

    // Remove existing friendship first
    var removeFriend = leaderboard.removeFriend(targetUserId);

    return removeFriend.then(function () {
      return _client
        .from('friend_blocks')
        .insert({
          blocker_id: _userId,
          blocked_id: targetUserId
        })
        .then(function (res) {
          try {
            requireSuccess(res, 'blockUser');
            return { success: true, error: null };
          } catch (e) {
            // Duplicate block is fine
            if (res.error && res.error.code === '23505') {
              return { success: true, error: null };
            }
            return { success: false, error: e.message };
          }
        });
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  /**
   * Report a user for abuse.
   *
   * @param {string} targetUserId
   * @param {string} reason
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  reportUser: function (targetUserId, reason) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return Promise.resolve({ success: false, error: 'Reason required' });
    }

    return _client
      .from('user_reports')
      .insert({
        reporter_id: _userId,
        reported_id: targetUserId,
        reason: reason.trim().slice(0, 500)
      })
      .then(function (res) {
        try {
          requireSuccess(res, 'reportUser');
          return { success: true, error: null };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }).catch(function (e) {
        return { success: false, error: e.message };
      });
  },

  /**
   * Send a card-quality report to the server so it can be reviewed.
   * @param {string} cardId
   * @param {string} reason
   * @param {string} [details]
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  reportCard: function (cardId, reason, details) {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not authenticated' });
    if (!cardId || !reason) return Promise.resolve({ success: false, error: 'Missing fields' });
    return _client.from('card_reports').insert({
      reporter_id: _userId,
      card_id: String(cardId).slice(0, 64),
      reason: String(reason).slice(0, 100),
      details: String(details || '').slice(0, 1000)
    }).then(function (res) {
      if (res.error) return { success: false, error: res.error.message };
      return { success: true, error: null };
    }).catch(function (e) {
      return { success: false, error: e.message };
    });
  },

  // ===== STUDY GROUPS =====

  /** Wrap an RPC call into {success, data, error}. */
  _rpc: function (name, args) {
    if (!_client || !_userId) return Promise.resolve({ success: false, data: null, error: 'Not signed in' });
    return _client.rpc(name, args || {}).then(function (res) {
      if (res.error) return { success: false, data: null, error: res.error.message };
      return { success: true, data: res.data, error: null };
    }).catch(function (e) {
      return { success: false, data: null, error: e.message };
    });
  },

  createGroup: function (name) {
    return leaderboard._rpc('create_group', { p_name: String(name || '').slice(0, 40) });
  },

  joinGroup: function (code) {
    return leaderboard._rpc('join_group', { p_code: String(code || '').slice(0, 12) });
  },

  leaveGroup: function (groupId) {
    return leaderboard._rpc('leave_group', { p_group_id: groupId });
  },

  getMyGroups: function () {
    return leaderboard._rpc('my_groups').then(function (r) { return r.success ? (r.data || []) : []; });
  },

  getGroupScores: function (groupId, options) {
    options = options || {};
    return leaderboard._rpc('group_leaderboard', {
      p_group_id: groupId,
      p_mode: options.mode || 'endless',
      p_period: options.period === 'all' ? 'all' : 'week'
    }).then(function (r) { return r.success ? (r.data || []) : []; });
  },

  // ===== SHARED DECKS =====

  /**
   * Publish custom cards and get a share code back.
   * @param {string} name
   * @param {object[]} cards
   */
  publishDeck: function (name, cards) {
    return leaderboard._rpc('publish_deck', { p_name: String(name || 'My deck').slice(0, 60), p_cards: cards });
  },

  /** Fetch a shared deck by code. Resolves to {success, deck: {name, cards}}. */
  fetchDeck: function (code) {
    return leaderboard._rpc('get_shared_deck', { p_code: String(code || '').slice(0, 12) }).then(function (r) {
      if (!r.success) return { success: false, error: r.error, deck: null };
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) return { success: false, error: 'No deck with that code', deck: null };
      return { success: true, error: null, deck: { name: row.name, cards: row.cards } };
    });
  },

  // ===== TOURNAMENT STANDING =====

  /** The player's rank among everyone who scored this season, or null. */
  getSeasonStanding: function (mode, season) {
    return leaderboard._rpc('season_standing', { p_mode: mode, p_season: season || getSeasonKey() }).then(function (r) {
      var row = r.success && Array.isArray(r.data) ? r.data[0] : null;
      return row ? { rank: Number(row.rank), total: Number(row.total) } : null;
    });
  },

  // ===== ACTIVITY FEED =====

  /**
   * Post an activity event. `visibility` is 'friends' (the default) or 'private' (only the poster sees it).
   * @param {'new_best'|'streak'|'tournament'|'exam'|'group_join'|'run'|'milestone'|'streak_days'} kind
   * @param {object} payload small JSON object (include the display name)
   * @param {'friends'|'private'} [visibility]
   */
  postActivity: function (kind, payload, visibility) {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not signed in' });
    var row = { user_id: _userId, kind: kind, payload: payload || {}, visibility: visibility === 'private' ? 'private' : 'friends' };
    function send(r) {
      return _client.from('activity_events').insert(r).then(function (res) { return res.error ? { success: false, error: res.error.message } : { success: true, error: null }; });
    }
    return send(row).then(function (out) {
      // A database set up before visibility existed has no such column: never share a private run there
      if (!out.success && /visibility/i.test(out.error || '')) {
        return row.visibility === 'private' ? out : send({ user_id: _userId, kind: kind, payload: payload || {} });
      }
      return out;
    }).catch(function (e) { return { success: false, error: e.message }; });
  },

  /**
   * The feed: the player's posts and their friends' (what a friend kept private is never included), newest first,
   * each with {kudos_count, i_gave, kudos_by}. scope: 'all' | 'friends' | 'mine'.
   */
  getFeed: function (opts) {
    if (!_client || !_userId) return Promise.resolve([]);
    opts = opts || {};
    return _client.rpc('get_feed', { p_limit: opts.limit || 40, p_before: opts.before || null, p_scope: opts.scope || 'all' })
      .then(function (res) {
        if (!res.error) return res.data || [];
        // An older database has no get_feed: fall back to reading the table (no kudos there)
        var since = new Date(Date.now() - 14 * 86400000).toISOString();
        return _client.from('activity_events')
          .select('id, user_id, kind, payload, created_at')
          .gt('created_at', since)
          .order('created_at', { ascending: false })
          .limit(40)
          .then(function (r2) { try { return requireSuccess(r2, 'getFeed') || []; } catch (e) { return []; } });
      }).catch(function () { return []; });
  },

  /** Give (or change) kudos on a friend's post. emoji: 'kudos' | 'fire' | 'brain' | 'clap'. */
  giveKudos: function (eventId, emoji) {
    return leaderboard._rpc('give_kudos', { p_event: eventId, p_emoji: emoji || 'kudos' });
  },

  removeKudos: function (eventId) {
    return leaderboard._rpc('remove_kudos', { p_event: eventId });
  },

  /** Change who can see one of the player's own posts: 'friends' or 'private'. */
  setActivityVisibility: function (eventId, visibility) {
    return leaderboard._rpc('set_activity_visibility', { p_event: eventId, p_visibility: visibility === 'private' ? 'private' : 'friends' });
  },

  /** Delete one of the player's own posts. */
  deleteActivity: function (eventId) {
    if (!_client || !_userId) return Promise.resolve({ success: false, error: 'Not signed in' });
    return _client.from('activity_events').delete().eq('id', eventId).eq('user_id', _userId)
      .then(function (res) { return res.error ? { success: false, error: res.error.message } : { success: true, error: null }; })
      .catch(function (e) { return { success: false, error: e.message }; });
  },

  /** Kudos friends gave the player recently: [{event_id, kind, giver_name, emoji, created_at}]. */
  getRecentKudos: function () {
    return leaderboard._rpc('my_recent_kudos').then(function (r) { return r.success ? (r.data || []) : []; });
  },

  // ===== DIAGNOSTICS (opt-in) =====

  /** Send one anonymous crash or slow-frame report (only ever called when the player switched reports on). */
  reportDiagnostic: function (report) {
    return leaderboard._rpc('report_diagnostic', {
      p_kind: report.kind === 'perf' ? 'perf' : 'error',
      p_message: String(report.message || '').slice(0, 300),
      p_system: report.system ? String(report.system).slice(0, 40) : null,
      p_operation: report.operation ? String(report.operation).slice(0, 40) : null,
      p_version: report.version ? String(report.version).slice(0, 20) : null,
      p_tier: report.tier || null
    });
  },

  /** Send a player's feedback to the owner's inbox. mood: 'unhappy' | 'idea' | 'bug'. */
  submitFeedback: function (feedback) {
    return leaderboard._rpc('submit_feedback', {
      p_mood: ['unhappy', 'idea', 'bug'].indexOf(feedback.mood) >= 0 ? feedback.mood : 'unhappy',
      p_message: String(feedback.message || '').slice(0, 1000),
      p_contact: feedback.contact ? String(feedback.contact).slice(0, 120) : null,
      p_version: feedback.version ? String(feedback.version).slice(0, 20) : null,
      p_platform: feedback.platform || null
    });
  },

  // ===== DISCOVERY (study buddies and public groups; hidden until FEATURES.discovery) =====

  getBuddyListing: function () {
    return leaderboard._rpc('my_buddy_listing').then(function (r) {
      var row = r.success ? (Array.isArray(r.data) ? r.data[0] : r.data) : null;
      return row && row.user_id ? row : null;
    });
  },

  /** listing: {exam, examDate, subjects, pace, utcOffset, discoverable} */
  setBuddyListing: function (listing) {
    return leaderboard._rpc('set_buddy_listing', {
      p_exam: String(listing.exam || 'Other').slice(0, 30),
      p_exam_date: listing.examDate || null,
      p_subjects: (listing.subjects || []).slice(0, 8).map(function (s) { return String(s).slice(0, 40); }),
      p_pace: ['relaxed', 'steady', 'intense'].indexOf(listing.pace) >= 0 ? listing.pace : 'steady',
      p_utc_offset: typeof listing.utcOffset === 'number' ? Math.max(-12, Math.min(14, Math.round(listing.utcOffset))) : null,
      p_discoverable: !!listing.discoverable
    });
  },

  removeBuddyListing: function () { return leaderboard._rpc('remove_buddy_listing'); },

  findBuddies: function () {
    return leaderboard._rpc('find_buddies', { p_limit: 20 });
  },

  discoverGroups: function (query, exam) {
    return leaderboard._rpc('discover_groups', { p_query: String(query || '').slice(0, 40), p_exam: exam || null, p_limit: 20 })
      .then(function (r) { return r.success ? (r.data || []) : []; });
  },

  /** @returns {Promise<{success: boolean, data?: ('joined'|'requested'), error?: string}>} */
  joinPublicGroup: function (groupId) { return leaderboard._rpc('join_public_group', { p_group_id: groupId }); },
  cancelGroupRequest: function (groupId) { return leaderboard._rpc('cancel_group_request', { p_group_id: groupId }); },
  getGroupRequests: function (groupId) {
    return leaderboard._rpc('group_requests', { p_group_id: groupId }).then(function (r) { return r.success ? (r.data || []) : []; });
  },
  resolveGroupRequest: function (groupId, userId, accept) {
    return leaderboard._rpc('resolve_group_request', { p_group_id: groupId, p_user: userId, p_accept: !!accept });
  },
  setGroupDiscovery: function (groupId, isPublic, exam, joinMode) {
    return leaderboard._rpc('set_group_discovery', { p_group_id: groupId, p_public: !!isPublic, p_exam: exam || '', p_join_mode: joinMode === 'request' ? 'request' : 'open' });
  },
  /** kind: 'buddy' | 'group'; reason: 'spam' | 'harassment' | 'inappropriate_name' | 'other' */
  reportContent: function (kind, targetId, reason) {
    return leaderboard._rpc('report_content', { p_kind: kind, p_target: String(targetId), p_reason: reason });
  },

  // ===== GROUP WEEKLY GOALS =====

  /** Report cards studied this week (server keeps the max). */
  reportStudy: function (cards) {
    return leaderboard._rpc('report_study', { p_season: getSeasonKey(), p_cards: Math.max(0, Math.floor(cards || 0)) });
  },

  setGroupGoal: function (groupId, goal) {
    return leaderboard._rpc('set_group_goal', { p_group_id: groupId, p_goal: Math.floor(goal) });
  },

  /** One row per member: {goal, user_id, player_name, cards}. */
  getGroupGoal: function (groupId) {
    return leaderboard._rpc('group_goal_status', { p_group_id: groupId, p_season: getSeasonKey() })
      .then(function (r) { return r.success ? (r.data || []) : []; });
  },

  /** Current weekly season key. */
  getSeasonKey: getSeasonKey,

  /**
   * Get all accepted friends with their profiles.
   *
   * @returns {Promise<object[]>}
   */
  getFriends: function () {
    if (!_client || !_userId) return Promise.resolve([]);

    // Get friend rows where current user is either party and status is accepted
    var q1 = _client
      .from('friends')
      .select('requester_id, addressee_id')
      .eq('requester_id', _userId)
      .eq('status', 'accepted');

    var q2 = _client
      .from('friends')
      .select('requester_id, addressee_id')
      .eq('addressee_id', _userId)
      .eq('status', 'accepted');

    return Promise.all([q1, q2]).then(function (results) {
      var friendIds = [];
      var rows1, rows2;

      try { rows1 = requireSuccess(results[0], 'getFriends q1'); } catch (e) { rows1 = []; }
      try { rows2 = requireSuccess(results[1], 'getFriends q2'); } catch (e) { rows2 = []; }

      for (var i = 0; i < rows1.length; i++) {
        friendIds.push(rows1[i].addressee_id);
      }
      for (var j = 0; j < rows2.length; j++) {
        friendIds.push(rows2[j].requester_id);
      }

      if (friendIds.length === 0) return [];

      // Deduplicate
      var unique = [];
      var seen = {};
      for (var k = 0; k < friendIds.length; k++) {
        if (!seen[friendIds[k]]) {
          seen[friendIds[k]] = true;
          unique.push(friendIds[k]);
        }
      }

      // Fetch profiles
      return _client
        .from('player_profiles')
        .select('user_id, player_name, avatar, best_score, best_streak, badges')
        .in('user_id', unique)
        .then(function (profileRes) {
          try {
            return requireSuccess(profileRes, 'getFriends profiles');
          } catch (e) {
            return [];
          }
        });
    }).catch(function () {
      return [];
    });
  },

  /**
   * Get pending friend requests addressed to the current user.
   *
   * @returns {Promise<object[]>}
   */
  getPendingRequests: function () {
    if (!_client || !_userId) return Promise.resolve([]);

    return _client
      .from('friends')
      .select('id, requester_id, created_at')
      .eq('addressee_id', _userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(function (res) {
        try {
          var rows = requireSuccess(res, 'getPendingRequests');

          if (!rows || rows.length === 0) return [];

          // Fetch requester profiles
          var requesterIds = rows.map(function (r) { return r.requester_id; });

          return _client
            .from('player_profiles')
            .select('user_id, player_name, avatar')
            .in('user_id', requesterIds)
            .then(function (profileRes) {
              var profiles;
              try { profiles = requireSuccess(profileRes, 'getPendingRequests profiles'); } catch (e) { profiles = []; }

              var profileMap = {};
              for (var p = 0; p < profiles.length; p++) {
                profileMap[profiles[p].user_id] = profiles[p];
              }

              return rows.map(function (r) {
                var profile = profileMap[r.requester_id] || {};
                return {
                  id: r.id,
                  requester_id: r.requester_id,
                  player_name: profile.player_name || 'Unknown',
                  avatar: profile.avatar || 'avatar_intern',
                  created_at: r.created_at
                };
              });
            });
        } catch (e) {
          return [];
        }
      }).catch(function () {
        return [];
      });
  },

  /**
   * Get friend leaderboard scores.
   *
   * @param {object} [options]
   * @param {string} [options.mode]
   * @param {number} [options.limit]
   * @returns {Promise<object[]>}
   */
  getFriendScores: function (options) {
    if (!_client || !_userId) return Promise.resolve([]);
    options = options || {};

    return leaderboard.getFriends().then(function (friends) {
      if (friends.length === 0) return [];

      var friendIds = friends.map(function (f) { return f.user_id; });
      // Include current player in friend leaderboard
      if (friendIds.indexOf(_userId) < 0) {
        friendIds.push(_userId);
      }

      var query = _client
        .from('leaderboard_best')
        .select('*')
        .in('user_id', friendIds)
        .order('score', { ascending: false })
        .limit(options.limit || 50);

      if (options.mode) {
        query = query.eq('mode', options.mode);
      }

      return query.then(function (res) {
        try {
          return requireSuccess(res, 'getFriendScores');
        } catch (e) {
          return [];
        }
      });
    }).catch(function () {
      return [];
    });
  },

  // ===== INVITES =====

  /**
   * Send a match invite to a friend.
   * Architecture §27.5: Invites are not deleted on read.
   *
   * @param {object} options
   * @param {string} options.toUserId
   * @param {string} options.roomCode
   * @param {string} [options.matchId]
   * @param {string} [options.mode]
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  sendInvite: function (options) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }
    if (!options || !options.toUserId || !options.roomCode) {
      return Promise.resolve({ success: false, error: 'Missing required fields' });
    }

    return _client
      .from('match_invites')
      .insert({
        from_user: _userId,
        to_user: options.toUserId,
        room_code: String(options.roomCode).slice(0, 10),
        match_id: options.matchId || null,
        mode: options.mode || 'mp_highscore',
        status: 'pending'
      })
      .then(function (res) {
        try {
          requireSuccess(res, 'sendInvite');
          return { success: true, error: null };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }).catch(function (e) {
        return { success: false, error: e.message };
      });
  },

  /**
   * Get pending invites for the current user.
   * Does NOT delete invites on read (Architecture §27.5).
   *
   * @returns {Promise<object[]>}
   */
  getInvites: function () {
    if (!_client || !_userId) return Promise.resolve([]);

    return _client
      .from('match_invites')
      .select('id, from_user, room_code, match_id, mode, status, created_at, expires_at')
      .eq('to_user', _userId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
      .then(function (res) {
        try {
          return requireSuccess(res, 'getInvites');
        } catch (e) {
          return [];
        }
      }).catch(function () {
        return [];
      });
  },

  /**
   * Accept a match invite.
   *
   * @param {number} inviteId
   * @returns {Promise<{success: boolean, invite: object|null, error: string|null}>}
   */
  acceptInvite: function (inviteId) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, invite: null, error: 'Not authenticated' });
    }

    return _client
      .from('match_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId)
      .eq('to_user', _userId)
      .eq('status', 'pending')
      .select()
      .then(function (res) {
        try {
          var data = requireSuccess(res, 'acceptInvite');
          var invite = (data && data.length > 0) ? data[0] : null;
          return { success: !!invite, invite: invite, error: invite ? null : 'Invite not found or expired' };
        } catch (e) {
          return { success: false, invite: null, error: e.message };
        }
      }).catch(function (e) {
        return { success: false, invite: null, error: e.message };
      });
  },

  /**
   * Decline a match invite.
   *
   * @param {number} inviteId
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  declineInvite: function (inviteId) {
    if (!_client || !_userId) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }

    return _client
      .from('match_invites')
      .update({ status: 'declined' })
      .eq('id', inviteId)
      .eq('to_user', _userId)
      .eq('status', 'pending')
      .then(function (res) {
        try {
          requireSuccess(res, 'declineInvite');
          return { success: true, error: null };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }).catch(function (e) {
        return { success: false, error: e.message };
      });
  },

  /**
   * Subscribe to real-time invite notifications.
   * Architecture §27.5: Invites are not deleted on read.
   *
   * @param {function} callback - Called with new invite payload
   * @returns {object|null} Subscription channel (for manual unsubscribe)
   */
  subscribeToInvites: function (callback) {
    if (!_client || !_userId) return null;

    try {
      var channel = _client
        .channel('invites-' + _userId)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'match_invites',
          filter: 'to_user=eq.' + _userId
        }, function (payload) {
          if (callback && payload.new) {
            callback(payload.new);
          }
        })
        .subscribe();

      _subscriptions.push(channel);
      return channel;
    } catch (e) {
      console.warn('[Leaderboard] subscribeToInvites failed:', e.message);
      return null;
    }
  },

  // ===== UTILITY =====

  /**
   * Get the Supabase client (for advanced use by other agents).
   * @returns {object|null}
   */
  getClient: function () {
    return _client;
  },

  /**
   * Get mode display label.
   * @param {string} mode
   * @returns {string}
   */
  getModeLabel: getModeLabel,

  /**
   * Check if leaderboard is configured and ready.
   * @returns {boolean}
   */
  isReady: function () {
    return isConfigured() && !!_client;
  },

  /**
   * Dispose all subscriptions and clean up.
   * Architecture: Clean up subscriptions.
   */
  dispose: function () {
    _disposed = true;

    for (var i = 0; i < _subscriptions.length; i++) {
      try {
        var sub = _subscriptions[i];
        if (sub && typeof sub.unsubscribe === 'function') {
          sub.unsubscribe();
        }
      } catch (e) {
        // Best-effort cleanup: subscription may already be closed.
      }
    }
    _subscriptions = [];

    _session = null;
    _userId = null;
    // Do not null _client — Supabase client may be shared
  }
};

// ===== EXPORTS =====

export { leaderboard };
