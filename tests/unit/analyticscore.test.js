import { describe, it, expect } from 'vitest';
import { createAnalytics } from '../../js/analytics/core.js';

function memStore() {
  var m = {};
  return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m };
}

function make(over) {
  var clock = { t: 1700000000000 };
  var store = (over && over.store) || memStore();
  var calls = [];
  var respond = (over && over.respond) || function () { return { ok: true, status: 200 }; };
  var timers = [];
  var a = createAnalytics(Object.assign({
    store: store,
    now: function () { return clock.t; },
    endpoint: { url: 'https://x.supabase.co', key: 'k' },
    fetchFn: function (url, opts) { calls.push({ url: url, body: JSON.parse(opts.body), opts: opts }); return Promise.resolve(respond(url, opts)); },
    getContext: function () { return { platform: 'web', version: '2.0.0' }; },
    getAttribution: function () { return { first: { channel: 'direct' }, last: { channel: 'direct' } }; },
    setTimer: function (fn) { timers.push(fn); return timers.length; },
    refCode: function () { return 'abc123' }
  }, over || {}));
  return { a: a, clock: clock, store: store, calls: calls, timers: timers, ingests: function () { return calls.filter(function (c) { return /ingest_analytics/.test(c.url); }); } };
}

describe('analytics core: consent', function () {
  it('records nothing until the player says yes', function () {
    var t = make();
    t.a.init();
    expect(t.a.consentState()).toBe('unset');
    expect(t.a.needsPrompt()).toBe(true);
    expect(t.a.track('app_open', { launch: 'cold' })).toBe(false);
    expect(t.a.queueLength()).toBe(0);
  });

  it('records after yes, and wipes everything after no', function () {
    var t = make();
    t.a.init();
    t.a.setConsent(true, 'prompt');
    expect(t.a.track('app_open', { launch: 'cold' })).toBe(true);
    expect(t.a.queueLength()).toBeGreaterThan(0);
    t.a.setConsent(false, 'settings');
    expect(t.a.queueLength()).toBe(0);
    expect(t.a.track('app_open', { launch: 'cold' })).toBe(false);
  });

  it('remembers the answer across a restart', function () {
    var store = memStore();
    var t = make({ store: store });
    t.a.init();
    t.a.setConsent(true, 'prompt');
    var t2 = make({ store: store });
    expect(t2.a.init()).toBe('granted');
    expect(t2.a.needsPrompt()).toBe(false);
  });

  it('treats Do Not Track and Global Privacy Control as a no until the player opts in', function () {
    var t = make({ signals: { doNotTrack: true } });
    expect(t.a.init()).toBe('denied');
    expect(t.a.track('app_open', {})).toBe(false);
    t.a.setConsent(true, 'settings');
    expect(t.a.consentState()).toBe('granted');
    var g = make({ signals: { gpc: true } });
    expect(g.a.init()).toBe('denied');
    expect(g.a.consentInfo().source).toBe('gpc');
  });

  it('sends nothing to the server without consent, even if events were forced', async function () {
    var t = make();
    t.a.init();
    var r = await t.a.flush({ force: true });
    expect(r.sent).toBe(0);
    expect(t.calls.length).toBe(0);
  });
});

describe('analytics core: events', function () {
  function granted() { var t = make(); t.a.init(); t.a.setConsent(true, 'prompt'); return t; }

  it('drops events that are not in the catalog', function () {
    var t = granted();
    var before = t.a.queueLength();
    expect(t.a.track('made_up_event', { a: 1 })).toBe(false);
    expect(t.a.queueLength()).toBe(before);
  });

  it('keeps only catalog properties and strips links and e-mail addresses', function () {
    var t = granted();
    t.a.track('feedback_sent', { mood: 'bug', length: 12, has_contact: true, ok: true, message: 'my text', email: 'me@x.com' });
    var ev = t.a.recent().filter(function (e) { return e.n === 'feedback_sent'; })[0];
    expect(ev.p.message).toBeUndefined();
    expect(ev.p.email).toBeUndefined();
    t.a.track('error', { system: 'x', operation: 'y', message: 'failed at https://evil.test/a?b=1 for me@x.com' });
    var err = t.a.recent().filter(function (e) { return e.n === 'error'; })[0];
    expect(err.p.message).not.toMatch(/https?:/);
    expect(err.p.message).not.toMatch(/@/);
  });

  it('starts a session with the first event and a new one after 30 minutes away', function () {
    var t = granted();
    t.a.track('app_open', { launch: 'cold' });
    var s1 = t.a.session();
    expect(s1).toBeTruthy();
    t.clock.t += 31 * 60000;
    t.a.track('app_open', { launch: 'resume' });
    expect(t.a.session().id).not.toBe(s1.id);
    expect(t.a.sessionCount()).toBeGreaterThanOrEqual(2);
  });

  it('numbers events in order and gives each a unique id', function () {
    var t = granted();
    for (var i = 0; i < 5; i++) t.a.track('screen_view', { screen: 'home' });
    var ids = {};
    var last = -1;
    t.a.recent().forEach(function (e) { expect(ids[e.e]).toBeUndefined(); ids[e.e] = true; expect(e.q).toBeGreaterThan(last); last = e.q; });
  });

  it('trackOnce sends an event only once per install', function () {
    var t = granted();
    expect(t.a.trackOnce('k', 'app_first_open', { install_kind: 'web' })).toBe(true);
    expect(t.a.trackOnce('k', 'app_first_open', { install_kind: 'web' })).toBe(false);
    expect(t.a.hasOnce('k')).toBe(true);
  });

  it('applies the remote kill list, sample rate and per-event rates', function () {
    var t = make({ getConfig: function () { return { enabled: true, sample: 1, killed: ['screen_view'], rates: {} }; } });
    t.a.init(); t.a.setConsent(true, 'prompt');
    expect(t.a.track('screen_view', { screen: 'home' })).toBe(false);
    var off = make({ getConfig: function () { return { enabled: false }; } });
    off.a.init(); off.a.setConsent(true, 'prompt');
    expect(off.a.track('screen_view', { screen: 'home' })).toBe(false);
    var none = make({ getConfig: function () { return { sample: 0 }; } });
    none.a.init(); none.a.setConsent(true, 'prompt');
    expect(none.a.track('screen_view', { screen: 'home' })).toBe(false);
  });
});

describe('analytics core: sending', function () {
  function granted(over) { var t = make(over); t.a.init(); t.a.setConsent(true, 'prompt'); return t; }

  it('sends a batch with install, session context and events, then clears the queue', async function () {
    var t = granted();
    t.a.track('app_open', { launch: 'cold' });
    t.a.track('screen_view', { screen: 'home' });
    var n = t.a.queueLength();
    var r = await t.a.flush({ force: true });
    expect(r.sent).toBe(n);
    expect(t.a.queueLength()).toBe(0);
    var body = t.ingests()[0].body.p_batch;
    expect(t.ingests()[0].url).toBe('https://x.supabase.co/rest/v1/rpc/ingest_analytics');
    expect(body.install.id).toMatch(/[0-9a-f-]{8,}/);
    expect(body.install.ref_code).toBe('abc123');
    expect(Object.keys(body.sessions).length).toBe(1);
    expect(body.events.length).toBe(n);
    expect(JSON.stringify(body)).not.toMatch(/Bearer/);
  });

  it('sends session context once per session only', async function () {
    var t = granted();
    t.a.track('app_open', { launch: 'cold' });
    await t.a.flush({ force: true });
    t.a.track('screen_view', { screen: 'shop' });
    await t.a.flush({ force: true });
    expect(Object.keys(t.ingests()[1].body.p_batch.sessions).length).toBe(0);
  });

  it('keeps events through a failure and retries with backoff', async function () {
    var fail = true;
    var t = granted({ respond: function () { return fail ? { ok: false, status: 503 } : { ok: true, status: 200 }; } });
    t.a.track('app_open', { launch: 'cold' });
    var n = t.a.queueLength();
    var r = await t.a.flush({ force: true });
    expect(r.failed).toBe(true);
    expect(t.a.queueLength()).toBe(n);
    var wait = await t.a.flush();
    expect(wait.waiting).toBe(true);
    fail = false;
    t.clock.t += 10 * 60000;
    var ok = await t.a.flush();
    expect(ok.sent).toBeGreaterThan(0);
  });

  it('lets go of a batch the server calls invalid instead of retrying for ever', async function () {
    var t = granted({ respond: function () { return { ok: false, status: 400 }; } });
    t.a.track('app_open', { launch: 'cold' });
    var r = await t.a.flush({ force: true });
    expect(r.rejected).toBeGreaterThan(0);
    expect(t.a.queueLength()).toBe(0);
  });

  it('survives going offline: the queue is saved and picked up after a restart', async function () {
    var store = memStore();
    var t = make({ store: store, endpoint: null });
    t.a.init(); t.a.setConsent(true, 'prompt');
    t.a.track('app_open', { launch: 'cold' });
    t.a.track('screen_view', { screen: 'home' });
    // the queue is written shortly after (a timer in the real app)
    t.timers.forEach(function (fn) { fn(); });
    await t.a.hide();
    var raw = JSON.parse(store.getItem('dx_an_q') || '[]');
    expect(raw.length).toBeGreaterThan(0);
    var t2 = make({ store: store });
    t2.a.init();
    expect(t2.a.queueLength()).toBeGreaterThanOrEqual(raw.length);
    var waiting = t2.a.queueLength();
    var r = await t2.a.flush({ force: true });
    expect(r.sent).toBe(waiting);
  });

  it('caps the queue and counts what it dropped', function () {
    var t = granted({ endpoint: null });
    for (var i = 0; i < 620; i++) t.a.track('screen_view', { screen: 'home' });
    expect(t.a.queueLength()).toBeLessThanOrEqual(500);
    expect(t.a.stats().dropped_full).toBeGreaterThan(0);
  });

  it('hide() sends a session summary and flushes with keepalive', async function () {
    var t = granted();
    t.a.track('app_open', { launch: 'cold' });
    t.a.bump('runs');
    await t.a.hide();
    var names = t.ingests()[0].body.p_batch.events.map(function (e) { return e.n; });
    expect(names).toContain('session_end');
    expect(t.ingests()[0].opts.keepalive).toBe(true);
  });
});

describe('analytics core: deleting', function () {
  it('deletes on the server, clears the device and starts a new id, keeping the answer', async function () {
    var t = make();
    t.a.init(); t.a.setConsent(true, 'prompt');
    t.a.track('app_open', { launch: 'cold' });
    var old = t.a.installId();
    var ok = await t.a.deleteMyData();
    expect(ok).toBe(true);
    expect(t.calls.some(function (c) { return /delete_analytics/.test(c.url) && c.body.p_install === old; })).toBe(true);
    expect(t.a.installId()).not.toBe(old);
    expect(t.a.queueLength()).toBe(0);
    expect(t.a.consentState()).toBe('granted');
  });

  it('counts consent answers anonymously (no install id)', async function () {
    var t = make();
    t.a.init();
    t.a.countPromptShown('first_run');
    t.a.setConsent(false, 'prompt');
    await Promise.resolve();
    var tallies = t.calls.filter(function (c) { return /count_consent/.test(c.url); });
    expect(tallies.length).toBe(2);
    tallies.forEach(function (c) { expect(JSON.stringify(c.body)).not.toContain(t.a.installId()); });
  });
});
