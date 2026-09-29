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

var SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

// ===== CONFIGURATION =====
// Replace these with your Supabase project values.
// These are safe to expose — RLS handles authorization.

var SUPABASE_URL = 'YOUR_SUPABASE_URL';
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// ===== INTERNAL STATE =====

var _client = null;
var _session = null;
var _userId = null;
var _loadPromise = null;
var _subscriptions = [];
var _disposed = false;

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
  'timed_practice': 'Timed Practice'
};

// ===== HELPERS =====

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
  if (_loadPromise) {
    return _loadPromise;
  }

  _loadPromise = new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[data-buzzword-supabase]');
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', function () {
        existing.dataset.loaded = 'true';
        resolve();
      });
      existing.addEventListener('error', function () {
        reject(new Error('Failed to load Supabase from CDN'));
      });
      return;
    }

    var script = document.createElement('script');
    script.src = SUPABASE_CDN_URL;
    script.async = true;
    script.dataset.buzzwordSupabase = 'true';

    script.onload = function () {
      script.dataset.loaded = 'true';
      if (window.supabase && window.supabase.createClient) {
        resolve();
      } else {
        reject(new Error('Supabase loaded but createClient unavailable'));
      }
    };

    script.onerror = function () {
      reject(new Error('Failed to load Supabase from CDN'));
    };

    document.head.appendChild(script);
  });

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
      });

      // Store for cleanup
      if (authSubscription && authSubscription.data && authSubscription.data.subscription) {
        _subscriptions.push(authSubscription.data.subscription);
      }

      // Check initial session
      return _client.auth.getSession().then(function (result) {
        if (result.data && result.data.session) {
          _session = result.data.session;
          _userId = result.data.session.user ? result.data.session.user.id : null;
        }
      });
    }).catch(function (e) {
      console.warn('[Leaderboard] Init failed:', e.message);
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
      season: 'default'
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
   * @returns {Promise<object[]>}
   */
  getTopScores: function (options) {
    if (!_client) return Promise.resolve([]);
    options = options || {};

    var query = _client
      .from('leaderboard_best')
      .select('*')
      .order('score', { ascending: false })
      .limit(options.limit || 50);

    if (options.mode) {
      query = query.eq('mode', options.mode);
    }
    if (options.season) {
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
