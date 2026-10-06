// @vitest-environment node
//
// The analytics backend: runs database/analytics.sql (and analytics_views.sql when present) on a fresh Postgres
// and checks what the app can and cannot do with it.

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, existsSync } from 'node:fs';

let db;
const uuid = (n, k = 0) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(k).padStart(12, '0')}`;
const INSTALL = uuid(1);
const SESSION = uuid(2);

async function asRole(role, fn) {
  await db.exec(`SET ROLE ${role};`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
const send = (batch, role = 'anon') => asRole(role, async () => (await db.query('SELECT ingest_analytics($1::jsonb) AS r', [JSON.stringify(batch)])).rows[0].r);
const rejects = async (role, sql, params) => { try { await asRole(role, () => db.query(sql, params)); return false; } catch (e) { return true; } };
const ev = (n, k, name, props = {}, t = Date.now(), extra = {}) => ({ id: uuid(n, k), n: name, t, q: k, s: SESSION, p: props, ...extra });
const batch = (events, o = {}) => ({
  sent_at: Date.now(),
  install: { id: INSTALL, platform: 'web', version: '2.0.0', ref_code: 'abcdef0123', consent_v: 1, first: { channel: 'search', utm_source: 'google', utm_campaign: 'launch', referrer_host: 'google.com', landing: '/', has_click_id: true }, ...(o.install || {}) },
  sessions: o.sessions || { [SESSION]: { started: Date.now(), ctx: { platform: 'web', version: '2.0.0', os: 'android', os_major: 14, browser: 'chrome', browser_major: 120, form: 'phone', screen_w: 400, screen_h: 800, touch: true, tier: 'medium', language: 'en-US', tz_offset: -5 } } },
  events
});
const q = async (sql, params) => (await db.query(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
  `);
  await db.exec(readFileSync('database/analytics.sql', 'utf8'));
  await db.exec(readFileSync('database/analytics.sql', 'utf8')); // safe to run twice
  if (existsSync('database/analytics_views.sql')) await db.exec(readFileSync('database/analytics_views.sql', 'utf8'));
}, 60000);

describe('sending events', () => {
  it('stores the install, the session and the events, and says how many were accepted', async () => {
    const res = await send(batch([ev(10, 1, 'session_start', { reason: 'launch' }), ev(10, 2, 'run_start', { mode: 'endless' })]));
    expect(res.accepted).toBe(2);
    expect((await q('SELECT count(*)::int AS n FROM analytics_events'))[0].n).toBe(2);
    const inst = (await q('SELECT * FROM analytics_installs'))[0];
    expect(inst).toMatchObject({ platform: 'web', first_channel: 'search', first_source: 'google', first_campaign: 'launch', first_referrer: 'google.com', has_click_id: true, ref_code: 'abcdef0123', events_total: 2 });
    const sess = (await q('SELECT * FROM analytics_sessions'))[0];
    expect(sess).toMatchObject({ os: 'android', browser: 'chrome', form: 'phone', screen_w: 400, tier: 'medium', language: 'en-US' });
  });

  it('ignores an event it has already seen (so a retry never counts twice)', async () => {
    const e = ev(11, 1, 'app_open');
    const first = await send(batch([e]));
    const again = await send(batch([e]));
    expect(first.accepted).toBe(1);
    expect(again.accepted).toBe(0);
    expect(again.duplicates).toBe(1);
  });

  it('corrects event times for a wrong clock on the device', async () => {
    const hourAgo = Date.now() - 3600 * 1000;
    // the device thinks it is an hour in the past: the event, which it stamped 10 s before sending, is 10 s ago for real
    await send({ ...batch([ev(12, 1, 'clock_test', {}, hourAgo - 10000)]), sent_at: hourAgo });
    const row = (await q("SELECT extract(epoch FROM now() - ts) AS ago FROM analytics_events WHERE name = 'clock_test'"))[0];
    expect(Number(row.ago)).toBeGreaterThan(8);
    expect(Number(row.ago)).toBeLessThan(15);
  });

  it('keeps the sample rate and the experiment variants', async () => {
    await send(batch([ev(13, 1, 'obstacle_outcome', { kind: 'jump' }, Date.now(), { r: 0.2, x: { swap_price: 'cheap' } })]));
    const row = (await q("SELECT sample_rate, experiments FROM analytics_events WHERE name = 'obstacle_outcome'"))[0];
    expect(row.sample_rate).toBeCloseTo(0.2, 5);
    expect(row.experiments).toEqual({ swap_price: 'cheap' });
  });

  it('refuses bad input without storing it', async () => {
    const bad = [
      { ...batch([]), install: { id: 'not-a-uuid' } },
      { ...batch([]), events: 'nope' },
      { ...batch([]), sent_at: 'later' },
      { ...batch(Array.from({ length: 101 }, (_, i) => ev(14, i + 1, 'x_event'))) }
    ];
    for (const b of bad) expect(await rejects('anon', 'SELECT ingest_analytics($1::jsonb)', [JSON.stringify(b)])).toBe(true);
    const res = await send(batch([
      ev(15, 1, 'Bad Name'), ev(15, 2, 'ok_name', {}, Date.now() - 30 * 86400 * 1000), { ...ev(15, 3, 'ok_name'), id: 'zzz' },
      ev(15, 4, 'huge', { text: 'x'.repeat(7000) }), ev(15, 5, 'fine_event', { a: 1 })
    ]));
    expect(res.accepted).toBe(1);
    expect(res.rejected).toBe(4);
  });

  it('limits how many events one install can send in an hour', async () => {
    const other = uuid(99);
    let accepted = 0;
    for (let b = 0; b < 3; b++) {
      const events = Array.from({ length: 100 }, (_, i) => ({ id: uuid(100 + b, i + 1), n: 'spam', t: Date.now(), s: SESSION, p: {} }));
      for (let rep = 0; rep < 14; rep++) {
        const evs = events.map((e, i) => ({ ...e, id: uuid(200 + b * 20 + rep, i + 1) }));
        const r = await send({ ...batch(evs), install: { id: other, platform: 'web', version: '2.0.0' }, sessions: {} });
        accepted += r.accepted;
      }
    }
    expect(accepted).toBeLessThanOrEqual(4000);
    expect(accepted).toBeGreaterThan(0);
  });
});

describe('who can do what', () => {
  it('the app can send but not read: the tables and the install ids are closed to everyone but the owner', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const t of ['analytics_events', 'analytics_installs', 'analytics_sessions', 'analytics_limits', 'analytics_consent_counts']) {
        expect(await rejects(role, `SELECT * FROM ${t}`), role + ' ' + t).toBe(true);
        expect(await rejects(role, `DELETE FROM ${t}`), role + ' delete ' + t).toBe(true);
      }
      expect(await rejects(role, "INSERT INTO analytics_events (event_id, install_id, name, ts) VALUES (gen_random_uuid(), gen_random_uuid(), 'hack', now())")).toBe(true);
      expect(await rejects(role, 'SELECT analytics_purge(30)')).toBe(true);
    }
  });

  it('a signed-in player can send too', async () => {
    const res = await send(batch([ev(20, 1, 'app_open')]), 'authenticated');
    expect(res.accepted).toBe(1);
  });
});

describe('the anonymous yes and no tally', () => {
  it('counts shown, granted and denied with no id, and ignores anything else', async () => {
    for (const o of ['shown', 'shown', 'granted', 'denied', 'bogus']) await asRole('anon', () => db.query("SELECT count_consent($1, 'prompt', 'android', '2.0.0')", [o]));
    const rows = await q("SELECT outcome, n FROM analytics_consent_counts ORDER BY outcome");
    expect(rows).toEqual([{ outcome: 'denied', n: 1 }, { outcome: 'granted', n: 1 }, { outcome: 'shown', n: 2 }]);
  });
});

describe('erasing an install and purging old data', () => {
  it('delete_analytics removes everything about one install and nobody else', async () => {
    const mine = uuid(300);
    const theirs = uuid(301);
    await send({ ...batch([ev(30, 1, 'app_open')]), install: { id: mine, platform: 'web', version: '2.0.0' }, sessions: {} });
    await send({ ...batch([ev(31, 1, 'app_open')]), install: { id: theirs, platform: 'web', version: '2.0.0' }, sessions: {} });
    await asRole('anon', () => db.query('SELECT delete_analytics($1)', [mine]));
    expect((await q('SELECT count(*)::int AS n FROM analytics_events WHERE install_id = $1', [mine]))[0].n).toBe(0);
    expect((await q('SELECT count(*)::int AS n FROM analytics_installs WHERE install_id = $1', [mine]))[0].n).toBe(0);
    expect((await q('SELECT count(*)::int AS n FROM analytics_events WHERE install_id = $1', [theirs]))[0].n).toBe(1);
  });

  it('analytics_purge (owner only) removes raw data past the retention period', async () => {
    await db.exec(`INSERT INTO analytics_events (event_id, install_id, name, ts) VALUES ('${uuid(400)}', '${uuid(401)}', 'old_one', now() - interval '500 days')`);
    const r = (await q('SELECT analytics_purge(400) AS r'))[0].r;
    expect(r.events).toBeGreaterThanOrEqual(1);
    expect((await q("SELECT count(*)::int AS n FROM analytics_events WHERE name = 'old_one'"))[0].n).toBe(0);
  });
});

// ───────────────────────── the views ─────────────────────────

describe('the views', () => {
  const ids = Array.from({ length: 10 }, (_, i) => uuid(1000 + i));
  const sessionOf = (i, d) => uuid(2000 + i * 100 + d);
  let nextId = 5000;
  async function addEvent(i, daysAgo, name, props = {}, hour = 12, extra = {}) {
    nextId++;
    await db.query(
      `INSERT INTO analytics_events (event_id, install_id, session_id, name, ts, props, experiments, sample_rate)
       VALUES ($1, $2, $3, $4, (current_date - $5::int) + make_interval(hours => $6), $7::jsonb, $8::jsonb, 1)`,
      [uuid(nextId, 1), ids[i], extra.session || sessionOf(i, daysAgo), name, daysAgo, hour, JSON.stringify(props), extra.exp ? JSON.stringify(extra.exp) : null]
    );
  }
  async function addSession(i, daysAgo, o = {}) {
    await db.query(
      `INSERT INTO analytics_sessions (session_id, install_id, started_at, platform, version, os, os_major, browser, form, screen_w, screen_h, tier, language, tz_offset, connection, standalone, last_channel)
       VALUES ($1, $2, (current_date - $3::int) + interval '12 hours', 'web', $4, $5, 14, $6, $7, 400, 800, $8, 'en-US', -5, '4g', false, 'search')`,
      [sessionOf(i, daysAgo), ids[i], daysAgo, o.version || '2.0.0', o.os || 'android', o.browser || 'chrome', o.form || 'phone', o.tier || 'medium']
    );
    await addEvent(i, daysAgo, 'session_start', { reason: 'launch', session_number: 1 }, 12);
    await addEvent(i, daysAgo, 'session_end', { duration_s: 300 + i * 20, active_s: 200, screens: 6, runs: 2, answers: 20, errors: i === 3 ? 1 : 0, in_run: false, last_screen: 'home' }, 13);
  }
  const runProps = (i, n, o = {}) => ({
    run_id: `run-${i}-${n}`, mode: 'endless', reason: 'out_of_lives', duration_s: 120 + n * 10, answered: 10, correct: 7, wrong: 3, accuracy: 0.7, best_streak: 4, score: 900 + n * 50,
    lives_lost: 3, lives_lost_gate: 2, lives_lost_obstacle: 1, obstacles_jumped: 4, obstacles_slid: 3, obstacles_hit: 1, coins_pickup: 100, coins_total: 120, coins_air: 8, coin_chain_max: 12,
    powerups: { shield: 1, magnet: 2 }, fusions: { goldRush: 1 }, subjects: { Cardiology: 6, Neurology: 4 }, subject_correct: { Cardiology: 5, Neurology: 2 }, run_number: n, fps_avg: 52, fps_p5: 40,
    tier_end: 'medium', monster_caught: false, ...o
  });

  beforeAll(async () => {
    await db.exec('TRUNCATE analytics_events, analytics_sessions, analytics_installs, analytics_limits, analytics_consent_counts');
    // 10 installs: 0-5 came 12 days ago (search), 6-7 came 5 days ago (direct), 8-9 came 5 days ago from a share link of install 0
    for (let i = 0; i < 10; i++) {
      const old = i < 6;
      await db.query(
        `INSERT INTO analytics_installs (install_id, first_seen, last_seen, platform, first_version, first_channel, first_source, first_campaign, ref_code, referred_by_code)
         VALUES ($1, (current_date - $2::int) + interval '10 hours', now(), 'web', '2.0.0', $3, $4, $5, $6, $7)`,
        [ids[i], old ? 12 : 5, i < 6 ? 'search' : (i < 8 ? 'direct' : 'share'), i < 6 ? 'google' : null, i < 6 ? 'launch' : null, `ref${i}00000`, i >= 8 ? 'ref000000' : null]
      );
    }
    await db.exec(`UPDATE analytics_installs SET ref_code = 'ref000000' WHERE install_id = '${ids[0]}'`);
    // sessions: everyone on arrival day; installs 0-4 also on day 1 after arrival; 0-2 on day 7 after arrival
    for (let i = 0; i < 10; i++) {
      const arrival = i < 6 ? 12 : 5;
      await addSession(i, arrival, i === 9 ? { os: 'ios', browser: 'safari', version: '2.0.1' } : {});
      if (i < 5) await addSession(i, arrival - 1);
      if (i < 3 && arrival === 12) await addSession(i, arrival - 7);
    }
    // onboarding: 8 started the tutorial, 6 finished
    for (let i = 0; i < 8; i++) {
      const arrival = i < 6 ? 12 : 5;
      await addEvent(i, arrival, 'tutorial_started', { kind: 'real_track', first_time: true });
      await addEvent(i, arrival, 'tutorial_step', { step: 'left', index: 1, outcome: 'viewed', kind: 'real_track' });
      await addEvent(i, arrival, 'tutorial_step', { step: 'left', index: 1, outcome: 'completed', attempts: 1, ms: 2000 + i * 100, kind: 'real_track' });
      if (i < 6) await addEvent(i, arrival, 'tutorial_ended', { outcome: 'finished', steps_done: 7, ms: 60000, kind: 'real_track' });
      else await addEvent(i, arrival, 'tutorial_ended', { outcome: 'exited', last_step: 'jump', steps_done: 3, ms: 20000, exit_confirm_shown: true, kind: 'real_track' });
    }
    // runs: installs 0-5 play 3 runs each; the rest 1
    for (let i = 0; i < 10; i++) {
      const arrival = i < 6 ? 12 : 5;
      const n = i < 6 ? 3 : 1;
      for (let r = 1; r <= n; r++) {
        await addEvent(i, arrival, 'run_start', { run_id: `run-${i}-${r}`, mode: 'endless', run_number: r, map: r === 1 ? 'Hospital Hallway' : 'Operating Room', hero: 'avatar_intern', input: 'touch', tier: 'medium', speed_dial: 1, subjects_selected: 15, dyslexia: i === 1, lefty: i === 2 });
        await addEvent(i, arrival, 'run_end', runProps(i, r));
        await addEvent(i, arrival, 'run_cards', { run_id: `run-${i}-${r}`, part: 1, parts: 1, rows: [['card1', r % 2, 1500, 1, 2, r % 2 ? -1 : 0, 0, 1], ['card2', 1, 900, 0, 0, -1, 1, 2]] });
      }
      await addEvent(i, arrival, 'first_run_milestone', { milestone: 'correct_answer', seconds_since_install: 90 + i * 10, sessions_so_far: 1 });
    }
    // snapshots, purchases, shares, errors, perf, experiments, quests, ratings
    for (let i = 0; i < 10; i++) await addEvent(i, i < 6 ? 12 : 5, 'user_snapshot', { level: 1 + i, coins: 100 * i, streak_days: i % 4, runs_total: 3, owned_items: 8, days_since_install: 3 });
    for (let i = 0; i < 4; i++) await addEvent(i, 12, 'purchase', { item_id: 'trail_pills', item_type: 'trail', price: 300, coins_before: 400, coins_after: 100, days_since_install: 0 });
    await addEvent(0, 12, 'item_previewed', { item_id: 'trail_pills', item_type: 'trail', owned: false, affordable: true });
    await addEvent(5, 12, 'purchase_blocked', { item_id: 'trail_pills', item_type: 'trail', price: 300, coins: 100, short_by: 200 });
    await addEvent(0, 12, 'share', { kind: 'challenge', method: 'native', ok: true });
    await addEvent(3, 12, 'error', { system: 'engine', operation: 'init', message: 'boom', fingerprint: 'abc123', in_run: true });
    await addEvent(1, 12, 'perf_load', { boot_ms: 1800, cards_ready_ms: 2500, first_paint_ms: 600, cached: false, connection: '4g', transfer_kb: 900 });
    await addEvent(0, 12, 'experiment_exposed', { experiment: 'swap_price', variant: 'cheap' }, 12, { exp: { swap_price: 'cheap' } });
    await addEvent(1, 12, 'experiment_exposed', { experiment: 'swap_price', variant: 'control' }, 12, { exp: { swap_price: 'control' } });
    await addEvent(0, 12, 'quest_swapped', { from: 'q_streak12', to: 'q_50enc', cost: 75, ok: true, reason: 'ok', progress: 0 });
    await addEvent(0, 12, 'quest_completed', { id: 'q_streak12', category: 'accuracy', reward: 50 });
    await addEvent(0, 12, 'rating_prompt', { step: 'shown', trigger: 'run_end', runs_total: 3, days_since_install: 1 });
    await addEvent(0, 12, 'setting_changed', { key: 'dyslexiaFont', value: 'true' });
    await addEvent(0, 12, 'level_up', { level: 2, rank: 'Intern', via: 'run' });
    await addEvent(0, 12, 'screen_view', { screen: 'shop', from: 'home', via: 'tab' });
    await addEvent(0, 12, 'coins_earned', { source: 'login', amount: 30 });
    await addEvent(0, 12, 'tip_prompt', { step: 'shown', trigger: 'run_end', runs_total: 3, days_since_install: 1 });
    await db.query("INSERT INTO analytics_consent_counts (day, outcome, source, platform, version, n) VALUES (current_date, 'shown', 'first_run', 'web', '2.0.0', 10), (current_date, 'granted', 'prompt', 'web', '2.0.0', 8), (current_date, 'denied', 'prompt', 'web', '2.0.0', 2)");
    // many answers on one hard card to test the content views
    for (let k = 0; k < 40; k++) await addEvent(k % 6, 12, 'run_cards', { run_id: `hard-${k}`, part: 1, parts: 1, rows: [['hardcard', k % 5 === 0 ? 1 : 0, 3000, 1, 2, k % 2, 0, 0], ['easycard', 1, 800, 0, 0, -1, 0, 0]] });
  }, 120000);

  it('every view runs without an error on real-looking data', async () => {
    const views = (await q("SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'analytics\\_v\\_%' ORDER BY 1")).map((r) => r.viewname);
    expect(views.length).toBeGreaterThan(70);
    for (const v of views) {
      let ok = true;
      try { await db.query(`SELECT * FROM ${v}`); } catch (e) { ok = false; throw new Error(v + ': ' + e.message); }
      expect(ok, v).toBe(true);
    }
  });

  it('the views cannot be read by the app', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(await rejects(role, 'SELECT * FROM analytics_v_daily_overview'), role).toBe(true);
      expect(await rejects(role, 'SELECT * FROM analytics_v_runs'), role).toBe(true);
    }
  });

  it('retention counts installs that came back on each day', async () => {
    const row = (await q("SELECT * FROM analytics_v_retention WHERE installs = 6"))[0];
    expect(Number(row.installs)).toBe(6);
    expect(Number(row.d1)).toBe(5);  // installs 0-4 had a session the day after arriving
    expect(Number(row.d7)).toBe(3);  // installs 0-2 on day 7
    expect(Number(row.d1_pct)).toBeCloseTo(83.3, 1);
    expect(Number(row.d7_pct)).toBeCloseTo(50, 1);
  });

  it('retention by channel counts only installs old enough, and separates the sources', async () => {
    const rows = await q('SELECT * FROM analytics_v_retention_by_channel');
    const search = rows.find((r) => r.channel === 'search');
    expect(Number(search.installs)).toBe(6);
    expect(Number(search.d1_pct)).toBeCloseTo(83.3, 1);
    const direct = rows.find((r) => r.channel === 'direct');
    expect(Number(direct.d7_pct)).toBeNull; // no direct install is a week old yet
    expect(direct.d7_pct).toBeNull();
  });

  it('the onboarding funnel lists how many installs got to each step', async () => {
    const f = (await q('SELECT * FROM analytics_v_onboarding_funnel'))[0];
    expect(Number(f.installs)).toBe(10);
    expect(Number(f.tutorial_started)).toBe(8);
    expect(Number(f.tutorial_finished)).toBe(6);
    expect(Number(f.run_started)).toBe(10);
    expect(Number(f.three_runs)).toBe(6);
    expect(Number(f.first_purchase)).toBe(4);
    expect(Number(f.tutorial_completion_pct)).toBeCloseTo(75, 1);
  });

  it('the acquisition view groups installs by where they came from', async () => {
    const rows = await q('SELECT * FROM analytics_v_acquisition');
    const google = rows.find((r) => r.source === 'google' && r.campaign === 'launch');
    expect(Number(google.installs)).toBe(6);
    expect(Number(google.finished_tutorial_pct)).toBeCloseTo(100, 1);
    expect(Number(google.purchased_pct)).toBeCloseTo(66.7, 1);
    expect(rows.some((r) => r.channel === 'share' && Number(r.installs) === 2)).toBe(true);
  });

  it('referrals trace new installs back to the share code that brought them', async () => {
    const top = (await q('SELECT * FROM analytics_v_top_referrers'))[0];
    expect(top.ref_code).toBe('ref000000');
    expect(Number(top.installs_brought)).toBe(2);
    expect(Number(top.who_played)).toBe(2);
  });

  it('the card views find the hard and the easy cards and the favourite wrong answer', async () => {
    const hard = (await q("SELECT * FROM analytics_v_cards_too_hard WHERE card_id = 'hardcard'"))[0];
    expect(Number(hard.asked)).toBe(40);
    expect(Number(hard.correct_pct)).toBeCloseTo(20, 1);
    expect(Number((await q("SELECT correct_pct FROM analytics_v_cards_too_easy WHERE card_id = 'easycard'"))[0].correct_pct)).toBe(100);
    const d = await q("SELECT * FROM analytics_v_card_distractors WHERE card_id = 'hardcard' ORDER BY wrong_answer_index");
    expect(d.length).toBe(2);
    expect(Number(d[0].share_of_wrong_answers_pct) + Number(d[1].share_of_wrong_answers_pct)).toBeCloseTo(100, 0);
  });

  it('subject accuracy comes from the runs', async () => {
    const rows = await q('SELECT * FROM analytics_v_subjects');
    const cardio = rows.find((r) => r.subject === 'Cardiology');
    expect(Number(cardio.accuracy_pct)).toBeCloseTo(83.3, 1);
  });

  it('economy views add up coins in and out, and show what is wanted but unaffordable', async () => {
    const items = (await q("SELECT * FROM analytics_v_items WHERE item = 'trail_pills'"))[0];
    expect(Number(items.purchases)).toBe(4);
    expect(Number(items.tried_to_buy_without_coins)).toBe(1);
    expect(Number(items.avg_short_by)).toBe(200);
    const eco = (await q('SELECT sum(spent_on_items) AS s, sum(purchases) AS p FROM analytics_v_economy_daily'))[0];
    expect(Number(eco.s)).toBe(1200);
    expect(Number(eco.p)).toBe(4);
  });

  it('quests, experiments, consent and crash-free sessions are readable', async () => {
    expect(Number((await q("SELECT swapped_away FROM analytics_v_quests WHERE quest = 'q_streak12'"))[0].swapped_away)).toBe(1);
    const ex = await q("SELECT * FROM analytics_v_experiments WHERE experiment = 'swap_price' ORDER BY variant");
    expect(ex.map((r) => r.variant)).toEqual(['cheap', 'control']);
    const consent = (await q('SELECT * FROM analytics_v_consent'))[0];
    expect(Number(consent.opt_in_pct)).toBeCloseTo(80, 1);
    const cf = (await q("SELECT * FROM analytics_v_crash_free WHERE version = '2.0.0'"))[0];
    expect(Number(cf.crash_free_sessions_pct)).toBeLessThan(100);
  });

  it('errors are grouped by what they are and who they hit', async () => {
    const e = (await q('SELECT * FROM analytics_v_errors'))[0];
    expect(e.fingerprint).toBe('abc123');
    expect(Number(e.installs)).toBe(1);
    expect(Number(e.during_runs)).toBe(1);
  });

  it('data health shows which events are arriving', async () => {
    const vol = await q('SELECT * FROM analytics_v_event_volume');
    expect(vol.find((r) => r.name === 'run_end')).toBeTruthy();
    expect(Number(vol.find((r) => r.name === 'run_end').total)).toBe(22);
  });
});

describe('Dx Dash Pro and tip views', () => {
  it('turn paywall, purchase, gate and status events into funnels and revenue', async () => {
    const P = uuid(900);
    const S = uuid(901);
    const t = Date.now();
    const events = [
      ['paywall_viewed', { trigger: 'gate_offline_pack', variant: 'a' }],
      ['paywall_action', { action: 'plan_selected', plan: 'dxdash_pro_yearly', trigger: 'gate_offline_pack' }],
      ['paywall_action', { action: 'purchase_started', plan: 'dxdash_pro_yearly', trigger: 'gate_offline_pack' }],
      ['paywall_action', { action: 'purchased', plan: 'dxdash_pro_yearly', trigger: 'gate_offline_pack', micros: 29990000, currency: 'USD', price: '$29.99' }],
      ['pro_gate_hit', { feature: 'offline_pack', mode: 'locked', used: 0, limit: 0 }],
      ['pro_status', { active: true, source: 'store', plan: 'yearly', trial: false }],
      ['tip_purchase', { outcome: 'completed', product: 'dxdash_tip_small', micros: 1990000, currency: 'USD' }]
    ].map(([n, p], i) => ({ id: uuid(902, i), n, t, q: i, s: S, p }));
    const res = await send({ sent_at: t, install: { id: P, platform: 'android', version: '2.0.0', consent_v: 1 }, sessions: { [S]: { started: t, ctx: { platform: 'android' } } }, events });
    expect(res.accepted).toBe(7);
    const funnel = (await q("SELECT * FROM analytics_v_paywall WHERE trigger = 'gate_offline_pack'"))[0];
    expect(funnel).toMatchObject({ variant: 'a' });
    expect(Number(funnel.bought)).toBe(1);
    expect(Number(funnel.viewers)).toBe(1);
    const rev = (await q("SELECT * FROM analytics_v_pro_revenue WHERE plan = 'dxdash_pro_yearly'"))[0];
    expect(Number(rev.gross)).toBeCloseTo(29.99, 2);
    expect((await q('SELECT * FROM analytics_v_pro_gates'))[0]).toMatchObject({ feature: 'offline_pack', mode: 'locked' });
    expect((await q('SELECT * FROM analytics_v_pro_users WHERE active'))[0]).toMatchObject({ source: 'store', plan: 'yearly' });
    const tips = (await q("SELECT * FROM analytics_v_tip_revenue WHERE outcome = 'completed'"))[0];
    expect(Number(tips.total)).toBeCloseTo(1.99, 2);
  });
});
