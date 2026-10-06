/**
 * instrument.js — connects the analytics engine to the rest of the app without the rest of the app having to know:
 * it watches the game's event stream, wraps a handful of storage and screen methods, listens to the browser's
 * lifecycle, errors and install events, and sends the events from them.
 *
 * Features that need to say something specific (a share, a rating prompt) call `track` themselves.
 */

import { analytics, track, trackOnce, startAnalytics, setAppHooks } from './index.js';
import { analyticsConfig } from '../remoteconfig.js';
import { createRunTracker } from './runtracker.js';
import { REPORTABLE_SETTINGS } from './catalog.js';
import { setErrorObserver } from '../errors.js';
import { levelFromXp } from '../progress.js';
import { getNativePlatform } from '../native.js';
import { getQuality } from '../game/quality.js';

var SCREEN_IDS = { screenHome: 'home', screenStats: 'stats', screenShop: 'shop', screenQuests: 'quests', screenProfile: 'profile', screenSettings: 'settings',
  screenFlash: 'flashcards', screenFlashcard: 'flashcards', screenExam: 'exam', screenMyCards: 'mycards', screenCardBrowser: 'mycards', screenCardEditor: 'mycards',
  screenImportExport: 'settings', screenPostRun: 'postrun' };

/** The analytics name of a screen element id ('screenShop' → 'shop'). */
export function screenName(id) { return SCREEN_IDS[id] || 'other'; }

/** A short, stable code for an error so the same bug groups together: the system, operation and message without numbers. */
export function errorFingerprint(system, operation, message) {
  var text = String(system || '') + '|' + String(operation || '') + '|' + String(message || '').replace(/[0-9a-f]{8,}/gi, '#').replace(/\d+/g, '#').slice(0, 80);
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}

function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
function days(from) { return from ? Math.max(0, Math.floor((Date.now() - from) / 86400000)) : 0; }
var SAFE_TIER = function () { return safe(getQuality) || ''; };

export var runTracker = null;
var state = { screen: 'home', prevScreen: '', inRun: false, runs: 0, runsThisSession: 0, lastRunEnd: 0, errors: 0, errorCounts: {}, offlineSince: 0, hiddenAt: 0, bootAt: Date.now(), settingTimers: {} };

/** The screen the player is on, for tagging other events. */
export function currentScreen() { return state.screen; }
export function inRun() { return state.inRun; }

function snapshot(storage, cards) {
  var xp = safe(function () { return storage.get('xp'); }) || 0;
  var owned = safe(function () { return storage.get('ownedItems'); }) || [];
  var streak = safe(function () { return storage.getStreakStatus(); }) || {};
  var profile = safe(function () { return storage.getProfile(); }) || {};
  var selected = safe(function () { return storage.get('selectedSubjects'); }) || [];
  var first = safe(function () { return storage.data.settings.firstRunAt; }) || 0;
  return {
    level: levelFromXp(xp).level || 0, xp: xp, coins: safe(function () { return storage.get('coins'); }) || 0, streak_days: streak.streak || 0, best_streak_days: streak.best || streak.streak || 0,
    runs_total: safe(function () { return storage.data.settings.runsFinished; }) || 0,
    answered_total: (storage.get('totalCorrect') || 0) + (storage.get('totalWrong') || 0), correct_total: storage.get('totalCorrect') || 0,
    owned_items: owned.length, owned_maps: owned.filter(function (id) { return /^map_/.test(id); }).length,
    achievements: safe(function () { return storage.getAchievementCount(); }) || 0, subjects_selected: selected.length, subjects_total: (cards && cards.subjects) || 15,
    exam_filters: safe(function () { return storage.getSelectedExams(); }) || [], has_account: !!profile.hasAccount, has_name: !!storage.get('profileName'),
    custom_cards: (cards && cards.custom) || 0, days_since_install: days(first || safe(function () { return Number(localStorage.getItem('dx_an_t0')); })), best_score: storage.get('bestScore') || 0,
    daily_done: !!storage.get('dailyDone'), reminders_on: !!safe(function () { return storage.data.settings.reminders; })
  };
}

/**
 * Wire everything up. Call once, after the game, storage and UI exist.
 * @param {{game: object, storage: object, ui: object, customCardCount?: function(): number, subjectCount?: number}} app
 */
export function installAnalytics(app) {
  var game = app.game, storage = app.storage, ui = app.ui;
  setAppHooks({ platform: getNativePlatform, tier: getQuality, config: analyticsConfig });
  var consent = startAnalytics();

  try { if (!localStorage.getItem('dx_an_t0')) localStorage.setItem('dx_an_t0', String(Date.now())); } catch (e) { /* no storage */ }

  runTracker = createRunTracker({ track: function (n, p) { return track(n, p); }, game: game });

  // ---- the engine's event stream ----
  game.setEventSink(function (ev) {
    try {
      if (ev.type === 'run_started') {
        runTracker.start(ev.runId, game.mode, { speed_dial: game.userSpeed, lives: game.lives });
        runTracker.event('run_started', ev.payload);
        state.inRun = true;
        if (!state.lastTier) state.lastTier = SAFE_TIER();
        track('run_start', runStartProps(ev.runId));
      } else {
        runTracker.event(ev.type, ev.payload);
        if (ev.type === 'encounter_resolved') { milestone('answer'); if (ev.payload.correct) milestone('correct_answer'); }
        if (ev.type === 'coin_collected' && ev.payload.type === 'coin') milestone('coin');
        if (ev.type === 'damage_taken' && ev.payload.source === 'obstacle') maybeSampleObstacle('hit', ev.runId);
        if (ev.type === 'obstacle_dodged') maybeSampleObstacle('cleared', ev.runId, ev.payload.type);
      }
    } catch (e) { /* analytics never breaks the game */ }
  });

  function maybeSampleObstacle(outcome, runId, kind) {
    track('obstacle_outcome', { kind: kind === 'slide' ? 'slide' : 'jump', outcome: outcome, run_id: runId });
  }

  function runStartProps(runId) {
    var eq = safe(function () { return storage.get('equipped'); }) || {};
    var st = function (k) { return safe(function () { return storage.data.settings[k]; }); };
    var level = levelFromXp(storage.get('xp') || 0).level || 0;
    var selected = storage.get('selectedSubjects') || [];
    var since = state.lastRunEnd ? Math.round((Date.now() - state.lastRunEnd) / 60000) : 0;
    return {
      run_id: runId, mode: game.mode, run_number: (safe(function () { return storage.data.settings.runsFinished; }) || 0) + 1, map: game.currentSkin ? game.currentSkin.name : '',
      hero: eq.skin || '', monster: eq.monster || '', trail: eq.trail || '', speed_dial: game.userSpeed, lives: game.lives, subjects_selected: selected.length, subjects_total: app.subjectCount || 15,
      exam_filters: safe(function () { return storage.getSelectedExams(); }) || [], pool_size: game.cardPool ? game.cardPool.length : 0,
      custom_rules: game._rules && game._rules.custom ? [].concat(game._rules.hazardsOff ? ['hazards_off'] : [], game._rules.monsterOff ? ['monster_off'] : [], (game._rules.disabledPowerups || []).map(function (p) { return 'no_' + p; })) : [],
      relaxed_pace: !!st('relaxedPace'), ranked: !(game._rules && game._rules.custom), dash_control: st('dashControl') || 'auto', camera: st('cameraView') || 'default', tier: SAFE_TIER() || 'medium',
      music: st('musicOn') !== false, sfx: st('sfxEnabled') !== false, haptics: st('hapticsEnabled') !== false, tts: !!st('ttsEnabled'), night: !!st('nightMode'), colorblind: !!st('colorblindMode'),
      dyslexia: !!st('dyslexiaFont'), lefty: st('handedness') === 'left', reduced_motion: !!st('reducedMotion'), online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      seeded: !!game.seededCardOrder, start_screen: state.screen, minutes_since_last_run: since, coins: storage.get('coins') || 0, level: level, streak_days: (safe(function () { return storage.getStreakStatus().streak; }) || 0)
    };
  }

  // ---- screens ----
  var origShow = ui.show;
  ui.show = function (screenId, slideFrom) {
    var res = origShow.apply(this, arguments);
    try {
      var name = screenName(screenId);
      if (name !== state.screen) {
        var from = state.screen;
        state.prevScreen = from;
        state.screen = name;
        var via = slideFrom ? 'swipe' : 'button';
        track('screen_view', { screen: name, from: from, via: state.inRun ? 'run_end' : via });
        analytics.bump('screens');
        if (name === 'shop') track('locker_opened', { tab: 'all', coins: storage.get('coins') || 0, owned_items: (storage.get('ownedItems') || []).length });
      }
    } catch (e) { /* ignore */ }
    return res;
  };

  // ---- storage ----
  function wrap(name, after) {
    var orig = storage[name];
    if (typeof orig !== 'function') return;
    storage[name] = function () {
      var before = { coins: storage.get('coins') || 0, owned: (storage.get('ownedItems') || []).length };
      var res = orig.apply(this, arguments);
      try { after(res, arguments, before); } catch (e) { /* ignore */ }
      return res;
    };
  }
  function itemKind(id) {
    id = String(id || '');
    if (/^avatar_/.test(id)) return 'skin';
    if (/^trail_/.test(id)) return 'trail';
    if (/^monster_/.test(id)) return 'monster';
    if (/^map_/.test(id)) return 'map';
    if (/^hat_/.test(id)) return 'hat';
    if (/^gear_/.test(id)) return 'gear';
    if (/^cloth_/.test(id)) return 'clothing';
    if (/^pal_/.test(id)) return 'pal';
    return 'other';
  }
  wrap('buyItem', function (ok, args, before) {
    var id = args[0], price = args[1];
    if (ok) track('purchase', { item_id: id, item_type: itemKind(id), price: price, coins_before: before.coins, coins_after: storage.get('coins') || 0, owned_before: before.owned, via: 'locker' });
    else track('purchase_blocked', { item_id: id, item_type: itemKind(id), price: price, coins: before.coins, short_by: Math.max(0, price - before.coins) });
  });
  wrap('equipItem', function (res, args) { track('item_equipped', { item_id: args[0], item_type: String(args[1] || itemKind(args[0])).slice(0, 20), owned_via: 'other' }); });
  wrap('spendCoins', function (ok, args, before) { if (ok && !state.inRun) { /* the callers report why */ } void before; });
  wrap('swapQuest', function (res, args, before) {
    if (res && res.success) { track('quest_swapped', { from: args[0], to: res.newId, cost: res.cost, ok: true, reason: 'ok' }); track('coins_spent', { on: 'quest_swap', amount: res.cost, coins_before: before.coins }); }
    else track('quest_swapped', { from: String(args[0] || 'unknown'), ok: false, reason: /need/i.test((res && res.error) || '') ? 'not_enough_coins' : /done/i.test((res && res.error) || '') ? 'done' : /no other/i.test((res && res.error) || '') ? 'none_left' : 'other', cost: res && res.cost || 0 });
    void before;
  });
  wrap('claimQuest', function (res, args) {
    if (res && res.success && !res.alreadyClaimed) track('quest_claimed', { id: args[0], category: String((res.category || '')).slice(0, 20), reward: res.reward || 0, late: !!(args[1] && args[1] !== storage.getTodayKey()) });
  });
  wrap('unlockAchievement', function (res, args) { if (res) track('achievement_unlocked', { id: args[0], total: safe(function () { return storage.getAchievementCount(); }) || 0 }); });
  wrap('markSecretFound', function () { /* the engine's secret_found already reports it */ });
  wrap('toggleCardDisabled', function () { /* counted through card_browser */ });
  wrap('addCardReport', function (res, args) { track('card_reported', { card_id: String(args[0] || ''), reason: String(args[1] || 'other').slice(0, 24) }); });
  wrap('setProfileName', function () { track('account_event', { action: 'name_set' }); });

  // study filters: one event after the player stops tapping
  var filterTimer = null;
  function reportFilters() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(function () {
      var subjects = storage.get('selectedSubjects') || [];
      track('subjects_changed', { subjects: subjects.length, total: app.subjectCount || 15, exams: safe(function () { return storage.getSelectedExams(); }) || [], sources: safe(function () { return storage.get('selectedSources'); }) || [] });
    }, 1200);
  }
  wrap('toggleArrayItem', reportFilters);
  wrap('toggleExamFilter', reportFilters);
  wrap('toggleSourceFilter', reportFilters);
  wrap('clearFilter', reportFilters);

  // backups and resets
  wrap('exportBackup', function () { track('data_action', { action: 'backup_saved', ok: true }); });
  wrap('importBackup', function (res) { track('data_action', { action: res && res.ok ? 'restored' : 'restore_failed', ok: !!(res && res.ok) }); });
  wrap('reset', function () { track('data_action', { action: 'reset', ok: true }); });

  // the player's own cards
  var cc = app.customCards;
  if (cc) {
    ['add', 'update', 'remove', 'addMany', 'removeWhere'].forEach(function (name) {
      var orig = cc[name];
      if (typeof orig !== 'function') return;
      cc[name] = function () {
        var res = orig.apply(this, arguments);
        try {
          var count = Array.isArray(res) ? res.length : (typeof res === 'number' ? res : 1);
          track('custom_card', { action: name === 'update' ? 'edited' : name === 'remove' || name === 'removeWhere' ? 'deleted' : name === 'addMany' ? 'imported' : 'created', count: count, cards_total: cc.getAll().length });
        } catch (e) { /* ignore */ }
        return res;
      };
    });
  }

  // settings: a short pause so dragging a slider is one event
  var origSet = storage.set;
  storage.set = function (key, value) {
    var prev = safe(function () { return storage.data.settings[key]; });
    var res = origSet.apply(this, arguments);
    try {
      if (REPORTABLE_SETTINGS[key] !== undefined && value !== prev) {
        clearTimeout(state.settingTimers[key]);
        state.settingTimers[key] = setTimeout(function () {
          track('setting_changed', { key: key, value: String(value).slice(0, 24), prev: prev === undefined ? '' : String(prev).slice(0, 24), screen: state.screen });
        }, 600);
      }
    } catch (e) { /* ignore */ }
    return res;
  };

  // ---- errors and performance ----
  setErrorObserver(function (info) {
    try {
      if (info.kind === 'perf') {
        track('perf_sample', { fps_avg: Math.round(info.fps || 0), tier: SAFE_TIER() || 'medium', map: info.map || '', seconds: info.seconds || 0 });
        return;
      }
      var fp = errorFingerprint(info.system, info.operation, info.message);
      state.errorCounts[fp] = (state.errorCounts[fp] || 0) + 1;
      state.errors++;
      analytics.bump('errors');
      var n = state.errorCounts[fp];
      if (n > 3 && (n & (n - 1)) !== 0) return; // after the third, only the 4th, 8th, 16th...
      track('error', { system: info.system, operation: info.operation, message: info.message, fingerprint: fp, count: n, screen: state.screen, mode: game.mode, recoverable: !!info.recoverable, in_run: state.inRun });
    } catch (e) { /* ignore */ }
  });

  // ---- lifecycle ----
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { state.hiddenAt = Date.now(); analytics.hide(); }
    else if (state.hiddenAt) {
      var away = Date.now() - state.hiddenAt;
      state.hiddenAt = 0;
      if (away > 60000) {
        track('app_open', { launch: 'resume', online: navigator.onLine !== false, display: displayMode(), days_since_install: installDays() });
        sessionSnapshot();
      }
    }
  });
  window.addEventListener('pagehide', function () { analytics.hide(); });
  window.addEventListener('online', function () { var s = state.offlineSince; state.offlineSince = 0; track('connection_changed', { online: true, seconds_offline: s ? Math.round((Date.now() - s) / 1000) : 0 }); });
  window.addEventListener('offline', function () { state.offlineSince = Date.now(); track('connection_changed', { online: false }); });

  // ---- install prompt ----
  window.addEventListener('beforeinstallprompt', function () { track('pwa_prompt_available', {}); });
  window.addEventListener('appinstalled', function () { track('pwa_installed', {}); });

  var MILESTONE_OF = { run_start: 'run_started', run_end: 'run_ended', purchase: 'purchase', item_equipped: 'equip', quest_claimed: 'quest_claim', map_changed: 'map_change',
    achievement_unlocked: 'achievement', share: 'share', flashcard_session: 'flashcards', exam_started: 'exam', custom_card: 'custom_card', account_event: 'account', level_up: 'level_up', powerup_collected: 'powerup' };
  function milestone(name) {
    var t0 = safe(function () { return Number(localStorage.getItem('dx_an_t0')); }) || Date.now();
    trackOnce('ms_' + name, 'first_run_milestone', { milestone: name, seconds_since_install: Math.max(0, Math.round((Date.now() - t0) / 1000)), sessions_so_far: analytics.sessionCount() });
  }
  analytics.on(function (type, data) {
    if (type === 'event' && data && MILESTONE_OF[data.n]) milestone(MILESTONE_OF[data.n]);
    if (type === 'session_start') sessionSnapshot();
    else if (type === 'consent') { if (data && data.state === 'granted') firstOpen(); else snapSent = false; }
  });

  function displayMode() {
    if (getNativePlatform() !== 'web') return 'native';
    return safe(function () { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }) ? 'standalone' : 'browser';
  }
  function installDays() { return days(safe(function () { return Number(localStorage.getItem('dx_an_t0')); })); }
  var snapSent = false;
  function sessionSnapshot() {
    try {
      var snap = snapshot(storage, { custom: app.customCardCount ? app.customCardCount() : 0, subjects: app.subjectCount });
      track('user_snapshot', snap);
      if (snap.streak_days >= 3) milestone('streak_3');
      if (snap.days_since_install >= 1 && snap.runs_total > 0) milestone('day2_return');
      if (snap.answered_total > 0 && storage.getStudiedToday() > 0) milestone('study_day');
    } catch (e) { /* ignore */ }
  }

  // ---- first open, this launch, load timings ----
  if (consent === 'granted' || analytics.consentState() === 'granted') firstOpen();

  function firstOpen() {
    if (snapSent) return;
    snapSent = true;
    var att = safe(function () { return JSON.parse(localStorage.getItem('dx_an_first')); }) || {};
    trackOnce('first_open', 'app_first_open', {
      install_kind: getNativePlatform() === 'web' ? (displayMode() === 'standalone' ? 'pwa' : 'web') : getNativePlatform(), landing: att.landing, referrer_host: att.referrer_host, utm_source: att.utm_source,
      utm_medium: att.utm_medium, utm_campaign: att.utm_campaign, utm_content: att.utm_content, utm_term: att.utm_term, has_click_id: !!att.has_click_id, share_ref: att.share_ref,
      store: getNativePlatform() === 'android' ? 'play' : getNativePlatform() === 'ios' ? 'appstore' : 'web', first_open_hour: new Date().getHours()
    });
    if (att.share_ref) trackOnce('referral', 'referral_landed', { share_ref: att.share_ref, kind: att.utm_medium || '' });
    track('app_open', { launch: 'cold', online: navigator.onLine !== false, display: displayMode(), days_since_install: installDays() });
    setTimeout(sendLoadTimings, 4000);
  }

  function sendLoadTimings() {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (!nav) return;
      var paint = performance.getEntriesByType('paint').filter(function (p) { return p.name === 'first-contentful-paint'; })[0];
      var conn = navigator.connection && navigator.connection.effectiveType;
      track('perf_load', {
        ttfb_ms: Math.round(nav.responseStart), dom_ready_ms: Math.round(nav.domContentLoadedEventEnd), load_ms: Math.round(nav.loadEventEnd), first_paint_ms: paint ? Math.round(paint.startTime) : 0,
        boot_ms: Date.now() - state.bootAt, transfer_kb: Math.round((nav.transferSize || 0) / 1024), cached: nav.transferSize === 0,
        sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), connection: conn === 'slow-2g' || conn === '2g' || conn === '3g' || conn === '4g' ? conn : 'unknown'
      });
    } catch (e) { /* ignore */ }
  }

  return { runTracker: runTracker, snapshot: sessionSnapshot, state: state };
}

/** Called by main.js at the end of a run, with what main.js knows that the engine does not. */
export function reportRunEnd(summary, extra) {
  try {
    if (!runTracker || !runTracker.active()) return;
    state.inRun = false;
    state.runsThisSession++;
    analytics.bump('runs');
    analytics.bump('answers', (summary.correct || 0) + (summary.wrong || 0));
    var tierNow = SAFE_TIER();
    if (state.lastTier && tierNow && state.lastTier !== tierNow) track('tier_changed', { from: state.lastTier, to: tierNow, reason: 'auto_perf' });
    state.lastTier = tierNow;
    var unresolved = runTracker.unresolvedContinue();
    if (unresolved) track('continue_prompt', unresolved);
    var props = runTracker.endProps(summary, Object.assign({ tier_end: SAFE_TIER(), session_run_index: state.runsThisSession }, extra || {}));
    track('run_end', props);
    runTracker.cardEvents(summary.mode).forEach(function (p) { track('run_cards', p); });
    var secs = Math.round(runTracker.frames.frames() ? runTracker.frames.frames() / Math.max(1, runTracker.frames.avgFps()) : 0);
    if (secs >= 15) track('perf_sample', { fps_avg: runTracker.frames.avgFps(), fps_p5: runTracker.frames.p5Fps(), frames: runTracker.frames.frames(), tier: SAFE_TIER() || 'medium', seconds: secs, map: props.maps && props.maps[0] || '' });
    state.lastRunEnd = Date.now();
    runTracker.finish();
  } catch (e) { /* ignore */ }
}

/** One drawn frame (milliseconds since the last one), for the run's frame rate. */
export function reportFrame(ms) { if (runTracker) runTracker.frame(ms); }
