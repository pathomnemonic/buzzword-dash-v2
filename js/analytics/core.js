/**
 * core.js — the analytics engine: consent, install and session ids, a queue that survives going offline, batching,
 * retries and the rules that keep it private.
 *
 *  - First party. Events go to this app's own Supabase project (database/analytics.sql). No third-party SDK, no
 *    advertising ID, no cookies, nothing sent to anyone else.
 *  - Consent first. Until the player says yes (or has said yes before) nothing is recorded or sent. A browser that
 *    signals Do Not Track or Global Privacy Control counts as a no unless the player turns analytics on themselves.
 *    The only thing counted without consent is an anonymous tally of how many people said yes or no (no id).
 *  - Anonymous. The install is a random id made on the device; it is not tied to a name, e-mail or account.
 *  - Only listed events and properties (catalog.js) are kept, and strings are scrubbed of links and e-mail addresses.
 *  - Never in the way. Every public function swallows its own errors; sending is batched, deferred and retried with
 *    backoff; a full queue drops its oldest events.
 */

import { EVENTS, cleanEvent } from './catalog.js';

export var CONSENT_VERSION = 1;
export var SESSION_GAP_MS = 30 * 60 * 1000;

var K = {
  id: 'dx_an_id', consent: 'dx_an_consent', queue: 'dx_an_q', once: 'dx_an_once', seq: 'dx_an_seq', install: 'dx_an_install', sessions: 'dx_an_sessions'
};
var MAX_QUEUE = 500;
var BATCH = 40;
var MAX_AGE_MS = 5 * 24 * 3600 * 1000;
var FLUSH_EVERY_MS = 15000;

/** A random version-4 style id. */
export function newId(rng) {
  try {
    if (!rng && typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  var r = rng || Math.random;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var n = Math.floor(r() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}

function readJson(store, key, fallback) {
  try { var raw = store.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
}
function writeJson(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

/**
 * @param {object} deps
 * @param {Storage} deps.store                 where ids, consent and the queue live (localStorage)
 * @param {function(): number} [deps.now]      the clock (ms)
 * @param {function} [deps.fetchFn]            fetch
 * @param {{url: string, key: string}|null} [deps.endpoint] the Supabase project; null keeps events on the device only
 * @param {function(): object} [deps.getContext]  device and version details for a session
 * @param {function(): object} [deps.getAttribution] { first, last } touches
 * @param {function(): object} [deps.getConfig]   remote config: { enabled, sample, killed[], rates{}, flushMs }
 * @param {function(): object} [deps.getExperiments] active experiment variants { name: variant }
 * @param {{doNotTrack?: boolean, gpc?: boolean}} [deps.signals] browser privacy signals
 * @param {function(): number} [deps.rand]
 * @param {function(function, number): *} [deps.setTimer]
 * @param {function(): string} [deps.rng]       random hex source (tests)
 * @param {function(string, object): void} [deps.onInvalid] told when an event is dropped as invalid
 * @param {function(string): string} [deps.refCode] one-way referral code for an install id
 */
export function createAnalytics(deps) {
  var store = deps.store;
  var now = deps.now || function () { return Date.now(); };
  var fetchFn = deps.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  var rand = deps.rand || Math.random;
  var setTimer = deps.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
  var signals = deps.signals || {};

  var self = {};
  var installId = '';
  var consent = { state: 'unset', at: 0, source: '', v: 0 };
  var queue = [];
  var seq = 0;
  var session = null;           // { id, startedAt, lastAt, number, activeMs, lastActive, screens, runs, answers, errors, lastScreen, inRun }
  var sessionsSent = {};        // session ids whose context has been sent
  var stats = { dropped_invalid: 0, dropped_full: 0, send_failures: 0, sent: 0, healthSentThisSession: false };
  var failureStreak = 0;
  var retryAt = 0;
  var flushTimer = null;
  var flushing = false;
  var recent = [];              // the last events accepted, for debugging (memory only)
  var listeners = [];
  var ready = false;

  // ───────────── storage ─────────────
  function persistQueue() { if (queue.length) writeJson(store, K.queue, queue); else { try { store.removeItem(K.queue); } catch (e) { /* ignore */ } } }

  function configNow() {
    var c = {};
    try { c = (deps.getConfig && deps.getConfig()) || {}; } catch (e) { c = {}; }
    return {
      enabled: c.enabled !== false,
      sample: typeof c.sample === 'number' ? Math.max(0, Math.min(1, c.sample)) : 1,
      killed: Array.isArray(c.killed) ? c.killed : [],
      rates: c.rates && typeof c.rates === 'object' ? c.rates : {},
      flushMs: typeof c.flushMs === 'number' && c.flushMs >= 2000 ? c.flushMs : FLUSH_EVERY_MS
    };
  }

  // ───────────── consent ─────────────
  function evaluateConsent() {
    var saved = readJson(store, K.consent, null);
    if (saved && (saved.state === 'granted' || saved.state === 'denied')) consent = saved;
    else consent = { state: 'unset', at: 0, source: '', v: 0 };
    // A browser that says "do not track" is a no until the player turns analytics on themselves
    if (consent.state === 'unset' && (signals.doNotTrack || signals.gpc)) {
      consent = { state: 'denied', at: now(), source: signals.gpc ? 'gpc' : 'dnt', v: CONSENT_VERSION, implicit: true };
    }
  }

  /** True when events may be recorded right now. */
  self.enabled = function () {
    return ready && consent.state === 'granted' && configNow().enabled && inSample();
  };
  function inSample() {
    var cfg = configNow();
    if (cfg.sample >= 1) return true;
    if (cfg.sample <= 0) return false;
    // stable per install: the same install is always in or always out
    var h = 2166136261 >>> 0; var s = installId + ':sample';
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h / 4294967296) < cfg.sample;
  }

  /** @returns {"unset"|"granted"|"denied"} */
  self.consentState = function () { return /** @type {"unset"|"granted"|"denied"} */ (consent.state); };
  self.needsPrompt = function () { return ready && consent.state === 'unset'; };
  self.consentInfo = function () { return { state: consent.state, source: consent.source, at: consent.at, implicit: !!consent.implicit }; };
  self.signals = function () { return { doNotTrack: !!signals.doNotTrack, gpc: !!signals.gpc }; };

  /**
   * Record the player's answer. Granting starts the first session; denying wipes the queue and everything kept.
   * @param {boolean} granted
   * @param {'prompt'|'settings'|'dnt'|'gpc'} source
   */
  self.setConsent = function (granted, source) {
    try {
      var was = consent.state;
      consent = { state: granted ? 'granted' : 'denied', at: now(), source: source || 'settings', v: CONSENT_VERSION };
      writeJson(store, K.consent, consent);
      countConsent(granted ? 'granted' : 'denied', source);
      if (granted) {
        if (was !== 'granted') startSession('first');
        self.track('consent_changed', { granted: true, source: source || 'settings' });
        emit('consent', consent);
      } else {
        wipe(false);
        session = null;
        emit('consent', consent);
      }
    } catch (e) { /* analytics must never break the app */ }
  };

  /** The anonymous tally: how many said yes and no. No id, no queue, nothing else. */
  function countConsent(outcome, source) {
    if (!deps.endpoint || !fetchFn) return;
    try {
      var ctx = (deps.getContext && deps.getContext()) || {};
      post('count_consent', { p_outcome: outcome, p_source: String(source || ''), p_platform: String(ctx.platform || 'web').slice(0, 12), p_version: String(ctx.version || '').slice(0, 20) }, false);
    } catch (e) { /* ignore */ }
  }
  /** Counted when the question is shown, so the rate of yes can be worked out. */
  self.countPromptShown = function (surface) { countConsent('shown', surface || 'first_run'); };

  function wipe(keepConsent) {
    queue = [];
    try {
      store.removeItem(K.queue); store.removeItem(K.once); store.removeItem(K.seq); store.removeItem(K.sessions); store.removeItem(K.install);
      if (!keepConsent) { /* the consent record itself stays: it is what says "no" */ }
    } catch (e) { /* ignore */ }
    sessionsSent = {};
  }

  // ───────────── sessions ─────────────
  function startSession(reason, gapMs) {
    var count = (readJson(store, K.sessions, { n: 0 }).n || 0) + 1;
    writeJson(store, K.sessions, { n: count });
    session = { id: newId(deps.rng), startedAt: now(), lastAt: now(), number: count, activeMs: 0, lastActive: now(), screens: 0, runs: 0, answers: 0, errors: 0, lastScreen: 'home', inRun: false };
    stats.healthSentThisSession = false;
    // The first event of a session says what kind of start it was; the caller adds the snapshot and app_open
    self.track('session_start', { reason: reason, gap_minutes: gapMs ? Math.round(gapMs / 60000) : 0, session_number: count });
    emit('session_start', session);
  }

  /** Call on every user action: keeps the session alive, starts a new one after a long gap, adds up active time. */
  self.touch = function () {
    if (!ready || consent.state !== 'granted') return false;
    try {
      var t = now();
      if (session && t - session.lastAt > SESSION_GAP_MS) {
        var gap = t - session.lastAt;
        if (!(session.endSentAt >= session.lastAt)) sendSessionEnd(session, session.lastAt); // (a session that was never hidden still gets its summary)
        startSession('resume_after_gap', gap);
        return true;
      }
      if (!session) { startSession('launch'); return true; }
      var dt = t - session.lastActive;
      if (dt > 0 && dt <= 10000) session.activeMs += dt; else if (dt > 10000) session.activeMs += 1000;
      session.lastActive = t;
      session.lastAt = t;
      return false;
    } catch (e) { return false; }
  };

  self.session = function () { return session; };
  self.sessionCount = function () { return readJson(store, K.sessions, { n: 0 }).n || 0; };

  function sendSessionEnd(s, at) {
    var duration = Math.max(0, Math.round(((at || now()) - s.startedAt) / 1000));
    self.track('session_end', {
      duration_s: duration, active_s: Math.round(s.activeMs / 1000), screens: s.screens, runs: s.runs, answers: s.answers, errors: s.errors, in_run: !!s.inRun,
      last_screen: s.lastScreen
    }, { session: s, t: at || now() });
    s.endSentAt = at || now();
  }

  /** Counters for the session summary. */
  self.bump = function (what, n) {
    if (session && typeof session[what] === 'number') session[what] += (n || 1);
  };
  self.setSessionFlag = function (what, value) { if (session) session[what] = value; };

  // ───────────── tracking ─────────────
  function sampledOut(name) {
    var cfg = configNow();
    if (cfg.killed.indexOf(name) >= 0) return true;
    var rate = cfg.rates[name];
    if (typeof rate === 'number' && rate < 1) return rand() >= rate;
    return false;
  }

  /**
   * Record an event. Returns true when it was accepted.
   * @param {string} name an event in the catalog
   * @param {object} [props]
   * @param {{session?: object, t?: number, passive?: boolean}} [opts] passive: a background event that does not keep the session alive
   */
  self.track = function (name, props, opts) {
    try {
      if (!ready || consent.state !== 'granted') return false;
      if (!configNow().enabled || !inSample()) return false;
      opts = opts || {};
      var t = typeof opts.t === 'number' ? opts.t : now();
      if (!session && !opts.session) startSession('launch');
      var sess = opts.session || session;
      if (!opts.session && !opts.passive && name !== 'session_end' && name !== 'session_start') self.touch();
      if (!EVENTS[name]) { stats.dropped_invalid++; return false; }
      if (sampledOut(name)) return false;
      var cleaned = cleanEvent(name, props);
      if (!cleaned.ok) { stats.dropped_invalid++; if (deps.onInvalid) deps.onInvalid(name, cleaned.reason); return false; }
      seq++;
      var ev = { e: newId(deps.rng), n: name, t: t, q: seq, s: sess ? sess.id : null, p: cleaned.props };
      var rate = configNow().rates[name];
      if (typeof rate === 'number' && rate < 1 && rate > 0) ev.r = rate;
      var exp = deps.getExperiments ? deps.getExperiments() : null;
      if (exp && Object.keys(exp).length) ev.x = exp;
      queue.push(ev);
      if (queue.length > MAX_QUEUE) {
        var drop = queue.length - MAX_QUEUE;
        queue.splice(0, drop);
        stats.dropped_full += drop;
      }
      recent.push(ev);
      if (recent.length > 300) recent.shift();
      schedulePersist();
      scheduleFlush();
      if (queue.length >= BATCH) flushSoon();
      emit('event', ev);
      return true;
    } catch (e) { return false; }
  };

  /** Record an event only the first time for this install (the key is kept on the device). */
  self.trackOnce = function (key, name, props) {
    try {
      if (!ready || consent.state !== 'granted') return false;
      var once = readJson(store, K.once, {});
      if (once[key]) return false;
      var ok = self.track(name, props);
      if (ok) { once[key] = now(); writeJson(store, K.once, once); }
      return ok;
    } catch (e) { return false; }
  };
  self.hasOnce = function (key) { return !!readJson(store, K.once, {})[key]; };

  var persistTimer = null;
  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimer(function () { persistTimer = null; persistQueue(); writeJson(store, K.seq, { n: seq }); }, 800);
  }

  // ───────────── sending ─────────────
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimer(function () { flushTimer = null; self.flush(); }, configNow().flushMs);
  }
  function flushSoon() {
    if (flushTimer) { try { clearTimeout(flushTimer); } catch (e) { /* ignore */ } flushTimer = null; }
    setTimer(function () { self.flush(); }, 50);
  }

  function post(fn, body, keepalive) {
    var ep = deps.endpoint;
    if (!ep || !fetchFn) return Promise.resolve({ ok: false, offline: true });
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ep.key, Authorization: 'Bearer ' + ep.key },
      body: JSON.stringify(body),
      keepalive: !!keepalive
    };
    return Promise.resolve().then(function () { return fetchFn(ep.url + '/rest/v1/rpc/' + fn, opts); })
      .then(function (res) { return { ok: !!(res && res.ok), status: res && res.status, res: res }; })
      .catch(function () { return { ok: false, network: true }; });
  }

  function envelope(events) {
    var ctx = (deps.getContext && deps.getContext()) || {};
    var att = (deps.getAttribution && deps.getAttribution()) || {};
    var sessionCtx = {};
    events.forEach(function (ev) {
      if (ev.s && !sessionsSent[ev.s]) sessionCtx[ev.s] = { ctx: ctx, last: att.last || null, started: ev.t };
    });
    return {
      sent_at: now(),
      install: { id: installId, first: att.first || null, ref_code: deps.refCode ? deps.refCode(installId) : null, consent_v: CONSENT_VERSION, platform: ctx.platform || 'web', version: ctx.version || '' , },
      sessions: sessionCtx,
      events: events.map(function (ev) { var o = { id: ev.e, n: ev.n, t: ev.t, q: ev.q, s: ev.s, p: ev.p }; if (ev.r) o.r = ev.r; if (ev.x) o.x = ev.x; return o; })
    };
  }

  /**
   * Send what is waiting. Resolves with { sent, left }. Safe to call at any time; does nothing while a send is going
   * on, while offline, or while backing off after a failure.
   * @param {{keepalive?: boolean, force?: boolean}} [opts]
   */
  self.flush = function (opts) {
    opts = opts || {};
    try {
      if (!ready || consent.state !== 'granted') return Promise.resolve({ sent: 0, left: queue.length });
      if (flushing) return Promise.resolve({ sent: 0, left: queue.length, busy: true });
      if (!queue.length) return Promise.resolve({ sent: 0, left: 0 });
      if (!deps.endpoint || !fetchFn) return Promise.resolve({ sent: 0, left: queue.length, offline: true });
      if (!opts.force && now() < retryAt) return Promise.resolve({ sent: 0, left: queue.length, waiting: true });
      // events too old to be useful are let go
      var cutoff = now() - MAX_AGE_MS;
      queue = queue.filter(function (ev) { return ev.t >= cutoff; });
      if (!queue.length) { persistQueue(); return Promise.resolve({ sent: 0, left: 0 }); }
      maybeHealth();
      flushing = true;
      var batch = queue.slice(0, BATCH);
      var env = envelope(batch);
      return post('ingest_analytics', { p_batch: env }, opts.keepalive).then(function (r) {
        flushing = false;
        if (r.ok) {
          var ids = {};
          batch.forEach(function (ev) { ids[ev.e] = true; if (ev.s) sessionsSent[ev.s] = true; });
          queue = queue.filter(function (ev) { return !ids[ev.e]; });
          stats.sent += batch.length;
          failureStreak = 0; retryAt = 0;
          writeJson(store, K.install, { at: now() });
          persistQueue();
          if (queue.length && !opts.keepalive) flushSoon();
          return { sent: batch.length, left: queue.length };
        }
        // 4xx other than rate limits: the batch is bad and would fail for ever, so let it go
        if (r.status && r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 408) {
          var gone = {};
          batch.forEach(function (ev) { gone[ev.e] = true; });
          queue = queue.filter(function (ev) { return !gone[ev.e]; });
          stats.dropped_invalid += batch.length;
          persistQueue();
          return { sent: 0, left: queue.length, rejected: batch.length };
        }
        stats.send_failures++;
        failureStreak++;
        retryAt = now() + Math.min(300000, 1000 * Math.pow(2, Math.min(failureStreak, 9)));
        persistQueue();
        scheduleFlush();
        return { sent: 0, left: queue.length, failed: true };
      });
    } catch (e) { flushing = false; return Promise.resolve({ sent: 0, left: queue.length, error: true }); }
  };

  function maybeHealth() {
    if (stats.healthSentThisSession || !session) return;
    if (!(stats.dropped_invalid || stats.dropped_full || stats.send_failures)) return;
    stats.healthSentThisSession = true;
    var oldest = queue.length ? Math.round((now() - queue[0].t) / 60000) : 0;
    self.track('analytics_health', { queued: queue.length, dropped_invalid: stats.dropped_invalid, dropped_full: stats.dropped_full, send_failures: stats.send_failures, sent: stats.sent, oldest_queued_min: oldest });
  }

  // ───────────── leaving ─────────────
  /** The app is being hidden or closed: end the session summary and push everything out. */
  self.hide = function () {
    try {
      if (!ready || consent.state !== 'granted' || !session) return Promise.resolve();
      sendSessionEnd(session, now()); // (the session carries on if the player comes back soon: the last summary wins)
      persistQueue();
      return self.flush({ keepalive: true, force: true });
    } catch (e) { return Promise.resolve(); }
  };

  // ───────────── deleting ─────────────
  /**
   * Remove this install's data from the server and from the device, and start over with a new id. The consent answer
   * is kept.
   */
  self.deleteMyData = function () {
    var old = installId;
    var ep = deps.endpoint;
    var finish = function (ok) {
      wipe(true);
      session = null;
      installId = newId(deps.rng);
      try { store.setItem(K.id, installId); } catch (e) { /* ignore */ }
      emit('deleted', ok);
      return ok;
    };
    if (!ep || !fetchFn) return Promise.resolve(finish(true));
    return post('delete_analytics', { p_install: old }, false).then(function (r) { return finish(!!r.ok); });
  };

  // ───────────── introspection ─────────────
  self.installId = function () { return installId; };
  self.queueLength = function () { return queue.length; };
  self.recent = function () { return recent.slice(); };
  self.stats = function () { return Object.assign({}, stats); };
  self.on = function (fn) { listeners.push(fn); };
  function emit(type, data) { listeners.forEach(function (fn) { try { fn(type, data); } catch (e) { /* ignore */ } }); }

  /** Load the saved state. Call once at start. */
  self.init = function () {
    try {
      try { installId = store.getItem(K.id) || ''; } catch (e) { installId = ''; }
      if (!installId) { installId = newId(deps.rng); try { store.setItem(K.id, installId); } catch (e) { /* kept in memory */ } }
      evaluateConsent();
      queue = readJson(store, K.queue, []);
      if (!Array.isArray(queue)) queue = [];
      seq = readJson(store, K.seq, { n: 0 }).n || 0;
      // a player who said no must have nothing left over from before
      if (consent.state !== 'granted') { queue = []; try { store.removeItem(K.queue); } catch (e) { /* ignore */ } }
      ready = true;
      if (consent.state === 'granted') { startSession('launch'); }
      return consent.state;
    } catch (e) { ready = false; return 'unset'; }
  };

  /** Everything ready to try again later (tests). */
  self._reset = function () { queue = []; session = null; };
  return self;
}
