import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EVENTS, eventNames, cleanEvent, scrubString, REPORTABLE_SETTINGS } from '../../js/analytics/catalog.js';
import { parseTouch, channelOf, recordTouch, refCodeFor, decorateShareUrl, hostOf, isMarketingTouch } from '../../js/analytics/attribution.js';
import { bucket, parseBrowser, parseOS, formFactor, collectContext } from '../../js/analytics/context.js';
import { unitHash, sanitizeExperiments, assignVariant, createExperiments } from '../../js/analytics/experiments.js';
import { createRunTracker, createFrameMeter } from '../../js/analytics/runtracker.js';
import { createStepTracker } from '../../js/analytics/steptracker.js';
import { screenName, errorFingerprint } from '../../js/analytics/instrument.js';
import { analyticsEndpoint } from '../../js/analytics/backend.js';
import { GAME_MODES, RUN_END_REASONS } from '../../js/game/enginedefs.js';

function memStore() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }

describe('event catalog', function () {
  it('every event has a group, a description and well-formed property types', function () {
    eventNames().forEach(function (name) {
      var e = EVENTS[name];
      expect(name).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
      expect(e[0]).toMatch(/^[a-z]+$/);
      expect(e[1].length).toBeGreaterThan(10);
      Object.keys(e[2]).forEach(function (k) {
        expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(e[2][k]).toMatch(/^(s\d*|n|i|b|m|sa|rows|e:[a-z0-9_|-]+)!?$/);
      });
    });
  });

  it('every event name is accepted by the database name pattern', function () {
    var sql = readFileSync('database/analytics.sql', 'utf8');
    var m = /name ~ '([^']+)'/.exec(sql) || /~ '(\^\[a-z\][^']*)'/.exec(sql);
    expect(m).toBeTruthy();
    var re = new RegExp(m[1]);
    eventNames().forEach(function (n) { expect(re.test(n)).toBe(true); });
  });

  it('knows every game mode and every way a run can end (so the engine cannot add one the data would call "other")', function () {
    Object.keys(GAME_MODES).forEach(function (k) {
      var r = cleanEvent('run_start', { run_id: 'r', mode: GAME_MODES[k] });
      expect(r.props.mode).toBe(GAME_MODES[k]);
    });
    Object.keys(RUN_END_REASONS).forEach(function (k) {
      var r = cleanEvent('run_end', { run_id: 'r', mode: 'endless', reason: RUN_END_REASONS[k] });
      expect(r.props.reason).toBe(RUN_END_REASONS[k]);
    });
  });

  it('cleans types: numbers, whole numbers, booleans, enums, strings', function () {
    var r = cleanEvent('run_end', { run_id: 'r1', mode: 'endless', reason: 'bogus', duration_s: 12.7, score: 'x', accuracy: 0.123456, ranked: true, powerups: { shield: 2, bad: 'a' }, extra: 5 });
    expect(r.ok).toBe(true);
    expect(r.props.duration_s).toBe(13);
    expect(r.props.reason).toBe('other');
    expect(r.props.score).toBeUndefined();
    expect(r.props.accuracy).toBe(0.123);
    expect(r.props.ranked).toBe(true);
    expect(r.props.extra).toBeUndefined();
    expect(r.props.powerups.shield).toBe(2);
    expect(r.props.powerups.bad).toBeUndefined();
  });

  it('drops an event missing a required property', function () {
    expect(cleanEvent('run_end', { mode: 'endless' }).ok).toBe(false);
    expect(cleanEvent('nope', {}).ok).toBe(false);
  });

  it('removes links, e-mail addresses and control characters from text', function () {
    expect(scrubString('see https://a.b/c and me@x.com ok', 100)).not.toMatch(/https?|@/);
    expect(scrubString('a\u0000b\u0007c', 10)).toBe('a b c');
    expect(scrubString('x'.repeat(500), 20).length).toBeLessThanOrEqual(20);
  });

  it('limits packed rows', function () {
    var rows = []; for (var i = 0; i < 200; i++) rows.push([String(i), 1, 800, 0, 0, -1, 0, 3]);
    var r = cleanEvent('run_cards', { run_id: 'r', rows: rows });
    expect(r.props.rows.length).toBeLessThanOrEqual(60);
  });

  it('never carries free text fields that could hold what a player typed', function () {
    // the feedback event has a length and flags, never the message
    expect(Object.keys(EVENTS.feedback_sent[2])).not.toContain('message');
    expect(Object.keys(EVENTS.custom_card[2])).not.toContain('text');
    var names = JSON.stringify(Object.keys(REPORTABLE_SETTINGS));
    expect(names).not.toMatch(/name|email|password/i);
  });
});

describe('attribution', function () {
  it('reads campaign tags and the referring host, never the full link', function () {
    var t = parseTouch('?utm_source=Reddit&utm_medium=social&utm_campaign=Launch_1&gclid=abc123', 'https://www.reddit.com/r/medicalschool/comments/1', { path: '/' });
    expect(t.utm_source).toBe('reddit');
    expect(t.referrer_host).toBe('reddit.com');
    expect(t.has_click_id).toBe(true);
    expect(JSON.stringify(t)).not.toContain('abc123');
    expect(JSON.stringify(t)).not.toContain('comments');
  });

  it('groups visits into channels', function () {
    expect(parseTouch('', '', {}).channel).toBe('direct');
    expect(parseTouch('', 'https://www.google.com/', {}).channel).toBe('search');
    expect(parseTouch('', 'https://twitter.com/x', {}).channel).toBe('social');
    expect(parseTouch('', 'https://blog.example.org/post', {}).channel).toBe('referral');
    expect(parseTouch('?utm_medium=cpc', '', {}).channel).toBe('paid');
    expect(parseTouch('?utm_medium=email', '', {}).channel).toBe('email');
    expect(parseTouch('?utm_source=dxdash_share&r=abc', '', {}).channel).toBe('share');
    expect(channelOf({ has_click_id: true })).toBe('paid');
  });

  it('ignores the app\'s own site as a referrer', function () {
    expect(parseTouch('', 'https://me.github.io/dx/', { ownHost: 'me.github.io' }).referrer_host).toBe('');
    expect(hostOf('not a url')).toBe('');
  });

  it('keeps the first touch for ever and only replaces the last touch with a real source', function () {
    var s = memStore();
    var a = recordTouch(s, parseTouch('?utm_source=a', '', {}), 1);
    expect(a.isFirst).toBe(true);
    var direct = recordTouch(s, parseTouch('', '', {}), 2);
    expect(direct.first.utm_source).toBe('a');
    expect(direct.last.utm_source).toBe('a');
    var b = recordTouch(s, parseTouch('?utm_source=b', '', {}), 3);
    expect(b.first.utm_source).toBe('a');
    expect(b.last.utm_source).toBe('b');
    expect(isMarketingTouch(parseTouch('', '', {}))).toBe(false);
  });

  it('turns an install id into a short code that does not contain it, and tags share links', function () {
    var id = '123e4567-e89b-12d3-a456-426614174000';
    var code = refCodeFor(id);
    expect(code).toMatch(/^[0-9a-f]{10}$/);
    expect(code).toBe(refCodeFor(id));
    expect(id.replace(/-/g, '')).not.toContain(code);
    var url = decorateShareUrl('https://x.io/app/#c=1', { kind: 'results', refCode: code });
    expect(url).toBe('https://x.io/app/?utm_source=dxdash_share&utm_medium=results&utm_campaign=viral&r=' + code + '#c=1');
    expect(decorateShareUrl('https://x.io/?a=1', { kind: 'app' })).toContain('?a=1&utm_source');
    // a link coming back through parseTouch is recognised as a share
    expect(parseTouch(url.slice(url.indexOf('?'), url.indexOf('#')), '', {}).share_ref).toBe(code);
  });
});

describe('device context', function () {
  it('rounds sizes so a device cannot be singled out', function () {
    expect(bucket(393, 40)).toBe(400);
    expect(bucket(0, 40)).toBe(0);
    expect(bucket('x', 40)).toBe(0);
  });
  it('reads browsers and systems from user agents', function () {
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0').name).toBe('edge');
    expect(parseBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit Version/17.2 Mobile Safari/604').name).toBe('safari');
    expect(parseBrowser('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/121.0')).toEqual({ name: 'firefox', major: 121 });
    expect(parseOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)').major).toBe(14);
    expect(parseOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)').name).toBe('ios');
    expect(formFactor(390, 844, true)).toBe('phone');
    expect(formFactor(820, 1180, true)).toBe('tablet');
    expect(formFactor(1920, 1080, false)).toBe('desktop');
  });
  it('collects a context without anything identifying', function () {
    var ctx = collectContext({ win: { innerWidth: 393, innerHeight: 851, devicePixelRatio: 2.75, matchMedia: function () { return { matches: false }; } }, nav: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120', language: 'en-US', hardwareConcurrency: 8, deviceMemory: 4, maxTouchPoints: 5 }, platform: 'android', version: '2.0.0' });
    expect(ctx.platform).toBe('android');
    expect(ctx.version).toBe('2.0.0');
    expect(ctx.form).toBe('phone');
    expect(JSON.stringify(ctx)).not.toMatch(/Mozilla|Pixel/);
  });
});

describe('experiments', function () {
  var defs = sanitizeExperiments({ swap_price: { variants: { control: 50, cheap: 50 } }, bad: { variants: { only: 1 } }, 'BAD NAME': { variants: { a: 1, b: 1 } }, off: { enabled: false, variants: { a: 1, b: 1 } } });
  it('accepts only well-formed experiments', function () { expect(Object.keys(defs)).toEqual(['swap_price']); });
  it('gives an install the same variant every time', function () {
    var v = assignVariant('install-1', 'swap_price', defs);
    for (var i = 0; i < 5; i++) expect(assignVariant('install-1', 'swap_price', defs)).toBe(v);
  });
  it('splits roughly by weight', function () {
    var cheap = 0;
    for (var i = 0; i < 4000; i++) if (assignVariant('i' + i, 'swap_price', defs) === 'cheap') cheap++;
    expect(cheap).toBeGreaterThan(1800);
    expect(cheap).toBeLessThan(2200);
    expect(unitHash('a')).toBeGreaterThanOrEqual(0);
    expect(unitHash('a')).toBeLessThan(1);
  });
  it('records an exposure once and lists active variants', function () {
    var seen = [];
    var ex = createExperiments({ installId: function () { return 'abc'; }, store: memStore(), onExposure: function (n, v) { seen.push(n + ':' + v); } });
    ex.setDefinitions({ swap_price: { variants: { control: 1, cheap: 1 } } });
    var v = ex.getVariant('swap_price');
    ex.getVariant('swap_price');
    expect(seen.length).toBe(1);
    expect(ex.active().swap_price).toBe(v);
    expect(ex.getVariant('missing')).toBe('');
  });
});

describe('backend config', function () {
  it('is off for placeholders and anything that is not https', function () {
    expect(analyticsEndpoint({})).toBeNull();
    expect(analyticsEndpoint({ VITE_SUPABASE_URL: 'YOUR_SUPABASE_URL', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
    expect(analyticsEndpoint({ VITE_SUPABASE_URL: 'http://x.co', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
    expect(analyticsEndpoint({ VITE_SUPABASE_URL: 'https://x.supabase.co/rest/v1/', VITE_SUPABASE_ANON_KEY: 'k' }).url).toBe('https://x.supabase.co');
  });
});

describe('instrument helpers', function () {
  it('names screens', function () {
    expect(screenName('screenShop')).toBe('shop');
    expect(screenName('screenNothing')).toBe('other');
  });
  it('gives the same error the same fingerprint whatever the numbers in it', function () {
    var a = errorFingerprint('cards', 'load', 'Failed at line 12 id 5551234');
    var b = errorFingerprint('cards', 'load', 'Failed at line 99 id 1');
    expect(a).toBe(b);
    expect(errorFingerprint('cards', 'save', 'Failed')).not.toBe(errorFingerprint('cards', 'load', 'Failed'));
  });
});

describe('frame meter', function () {
  it('averages and finds the slow end', function () {
    var m = createFrameMeter();
    for (var i = 0; i < 95; i++) m.add(16.7);
    for (var j = 0; j < 5; j++) m.add(100);
    expect(m.frames()).toBe(100);
    expect(m.avgFps()).toBeGreaterThan(45);
    expect(m.avgFps()).toBeLessThan(65);
    expect(m.p5Fps()).toBeLessThanOrEqual(11);
    expect(m.slowFrames()).toBe(5);
  });
  it('ignores gaps (a hidden tab) and nonsense', function () {
    var m = createFrameMeter();
    m.add(5000); m.add(-3); m.add(NaN);
    expect(m.frames()).toBe(0);
  });
});

describe('run tracker', function () {
  function setup() {
    var sent = [];
    var game = { streak: 3, coins: 40, score: 900, currentSkin: { name: 'City' }, speed: 3.75 };
    var t = createRunTracker({ now: function () { return 1000 + clock.t; }, track: function (n, p) { sent.push([n, p]); }, game: game });
    var clock = { t: 0 };
    return { t: t, sent: sent, game: game, clock: clock };
  }
  var card = { id: 'c1', subj: 'Cardio', d: ['x', 'y', 'z'] };

  it('records answers with decision time, lanes and which wrong answer was taken', function () {
    var s = setup();
    s.t.start('run1', 'endless', { lives: 3, speed_dial: 1 });
    s.t.event('encounter_resolved', { correct: true, card: card, encounterResult: { decisionMs: 900, committedLane: 0, correctLane: 0, choice: 'ans' } });
    s.t.event('encounter_resolved', { correct: false, card: card, encounterResult: { decisionMs: 2400, committedLane: 1, correctLane: 2, choice: 'y' } });
    var cards = s.t.cardEvents('endless');
    expect(cards.length).toBe(1);
    expect(cards[0].rows[0]).toEqual(['c1', 1, 900, 0, 0, -1, 0, 3]);
    expect(cards[0].rows[1][5]).toBe(1);
    var end = s.t.endProps({ correct: 1, wrong: 1, score: 900, bestStreak: 4, endReason: 'out_of_lives', durationMs: 60000 }, {});
    expect(end.answered).toBe(2);
    expect(end.accuracy).toBe(0.5);
    expect(end.median_decision_ms).toBe(1650);
    expect(end.fastest_decision_ms).toBe(900);
    expect(end.slowest_decision_ms).toBe(2400);
    expect(end.subjects).toEqual({ Cardio: 2 });
    expect(end.subject_correct).toEqual({ Cardio: 1 });
  });

  it('splits long runs into several card events', function () {
    var s = setup();
    s.t.start('run2', 'endless', {});
    for (var i = 0; i < 95; i++) s.t.event('encounter_resolved', { correct: true, card: { id: 'c' + i, subj: 'S' }, encounterResult: { decisionMs: 500 } });
    var parts = s.t.cardEvents('endless');
    expect(parts.length).toBe(3);
    expect(parts[0].parts).toBe(3);
    expect(parts[2].rows.length).toBe(15);
  });

  it('counts lives lost by source, power-ups, fusions, pauses, continues and coin chains', function () {
    var s = setup();
    s.t.start('run3', 'endless', { lives: 3 });
    s.t.event('damage_taken', { source: 'wrong_answer' });
    s.t.event('damage_taken', { source: 'obstacle' });
    s.t.event('powerup_collected', { type: 'shield' });
    s.t.event('powerup_fused', { id: 'storm' });
    s.t.event('state_changed', { from: 'playing', to: 'paused' });
    s.clock.t += 5000;
    s.t.event('state_changed', { from: 'paused', to: 'playing' });
    s.t.event('continue_requested', { cost: 150 });
    s.t.event('continue_applied', {});
    for (var i = 0; i < 12; i++) s.t.event('coin_collected', { type: 'coin', chain: i, air: i === 3 });
    var end = s.t.endProps({ correct: 0, wrong: 1, continued: true }, {});
    expect(end.lives_lost_gate).toBe(1);
    expect(end.lives_lost_obstacle).toBe(1);
    expect(end.powerups).toEqual({ shield: 1 });
    expect(end.fusions).toEqual({ storm: 1 });
    expect(end.pauses).toBe(1);
    expect(end.paused_s).toBe(5);
    expect(end.coin_chain_max).toBe(12);
    expect(end.coins_air).toBe(1);
    expect(end.continued).toBe(true);
    var names = s.sent.map(function (x) { return x[0]; });
    expect(names).toContain('powerup_collected');
    expect(names).toContain('powerup_fused');
    expect(names).toContain('run_paused');
    expect(names).toContain('coins_spent');
  });

  it('sends only catalog-valid events and props', function () {
    var s = setup();
    s.t.start('run4', 'daily', {});
    s.t.event('hazard_started', { type: 'blackout' });
    s.t.event('skin_transition_started', { skinName: 'Library' });
    s.t.event('secret_found', { first: true, coins: 20 });
    s.sent.forEach(function (x) { expect(cleanEvent(x[0], x[1]).ok).toBe(true); });
    var end = s.t.endProps({ correct: 0, wrong: 0 }, {});
    expect(cleanEvent('run_end', end).ok).toBe(true);
    s.t.cardEvents('daily').forEach(function (c) { expect(cleanEvent('run_cards', c).ok).toBe(true); });
  });

  it('does nothing outside a run', function () {
    var s = setup();
    s.t.event('powerup_collected', { type: 'x' });
    expect(s.sent.length).toBe(0);
    expect(s.t.endProps({}, {})).toBeNull();
  });
});

describe('step tracker', function () {
  it('reports start, each step once, completion and how it ended', function () {
    var sent = [];
    var clock = 0;
    var st = createStepTracker('practice', { firstTime: true, now: function () { return clock; }, send: function (n, p) { sent.push([n, p]); } });
    st.view('welcome', 0); clock += 1000;
    st.view('swipe', 1); clock += 2000;
    st.view('swipe', 1);
    st.end('skipped', true);
    var names = sent.map(function (x) { return x[0]; });
    expect(names[0]).toBe('tutorial_started');
    expect(sent[0][1].first_time).toBe(true);
    expect(names.filter(function (n) { return n === 'tutorial_ended'; }).length).toBe(1);
    var ended = sent[sent.length - 1][1];
    expect(ended.outcome).toBe('exited');
    expect(ended.last_step).toBe('swipe');
    expect(ended.exit_confirm_shown).toBe(true);
    sent.forEach(function (x) { expect(cleanEvent(x[0], x[1]).ok).toBe(true); });
  });
});
