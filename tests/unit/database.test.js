// @vitest-environment node
//
// Runs database/schema.sql and database/policies.sql against a real Postgres
// engine (PGlite) with Supabase-style stubs, then checks the security rules:
// who can read, write and invite whom. Catches SQL mistakes before they reach
// a live project.

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { trophyDelta } from '../../js/leagues.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

let db;

async function as(user, fn) {
  await db.exec(`SET app.uid = '${user}'; SET ROLE authenticated;`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}

async function rejects(user, sql, params) {
  try { await as(user, () => db.query(sql, params)); return false; } catch (e) { return true; }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE PUBLICATION supabase_realtime;
  `);
  // Both files must be safe to run twice.
  for (let i = 0; i < 2; i++) {
    await db.exec(readFileSync('database/schema.sql', 'utf8'));
    await db.exec(readFileSync('database/policies.sql', 'utf8'));
  }
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    INSERT INTO auth.users VALUES ('${A}'), ('${B}'), ('${C}');
  `);
}, 60000);


describe('ranked matches', () => {
  const call = async (user, sql, params) => (await as(user, () => db.query(sql, params))).rows[0];
  const trophies = async (user) => (await db.query('SELECT trophies FROM player_trophies WHERE user_id = $1', [user])).rows[0].trophies;

  it('uses the same trophy math as the game', async () => {
    const cases = [[1000, 1000, 'win'], [1000, 1000, 'loss'], [1000, 1400, 'win'], [1000, 600, 'loss'], [305, 305, 'loss'], [300, 300, 'loss'], [0, 0, 'loss'], [1000, 100, 'win'], [1000, 1000, 'draw'], [2700, 2500, 'win'], [3650, 3900, 'loss']];
    for (const [mine, theirs, outcome] of cases) {
      const row = (await db.query('SELECT ranked_delta($1,$2,$3) AS d', [mine, theirs, outcome])).rows[0];
      expect(row.d, mine + ' vs ' + theirs + ' ' + outcome).toBe(trophyDelta(mine, theirs, outcome));
    }
  });

  it('pairs two waiting players and moves trophies once both agree', async () => {
    const a = (await call(A, "SELECT ranked_find_match('ABCDE') AS r")).r;
    expect(a.role).toBe('host');
    const b = (await call(B, "SELECT ranked_find_match('FGHJK') AS r")).r;
    expect(b.role).toBe('guest');
    expect(b.room_code).toBe('ABCDE');
    const polled = (await call(A, 'SELECT ranked_poll_match() AS r')).r;
    expect(polled.matched).toBe(true);
    expect(polled.match_id).toBe(b.match_id);

    // a single win claim does not move anything yet
    const first = (await call(A, "SELECT ranked_report($1, 'win') AS r", [b.match_id])).r;
    expect(first.settled).toBe(false);
    expect(await trophies(A)).toBe(0);
    const second = (await call(B, "SELECT ranked_report($1, 'loss') AS r", [b.match_id])).r;
    expect(second.settled).toBe(true);
    expect(await trophies(A)).toBe(20);
    expect(await trophies(B)).toBe(0); // nobody drops below the start of their league
    // reporting again changes nothing
    await call(B, "SELECT ranked_report($1, 'win') AS r", [b.match_id]);
    expect(await trophies(A)).toBe(20);
  });

  it('ignores a match where both players claim to have won', async () => {
    await call(A, "SELECT ranked_find_match('QQQQ2') AS r");
    const m = (await call(B, "SELECT ranked_find_match('RRRR3') AS r")).r;
    expect(m.role).toBe('guest');
    const before = await trophies(A);
    await call(A, "SELECT ranked_report($1, 'win') AS r", [m.match_id]);
    const res = (await call(B, "SELECT ranked_report($1, 'win') AS r", [m.match_id])).r;
    expect(res.settled).toBe(true);
    expect(await trophies(A)).toBe(before);
  });

  it('settles at once when a player admits the loss, and after 90 seconds when the other side vanishes', async () => {
    await call(A, "SELECT ranked_find_match('CCCC4') AS r");
    const m = (await call(B, "SELECT ranked_find_match('DDDD5') AS r")).r;
    const bBefore = await trophies(B);
    const conceded = (await call(A, "SELECT ranked_report($1, 'loss') AS r", [m.match_id])).r;
    expect(conceded.settled).toBe(true);
    expect(await trophies(B)).toBeGreaterThan(bBefore);

    await call(A, "SELECT ranked_find_match('EEEE6') AS r");
    const m2 = (await call(B, "SELECT ranked_find_match('FFFF7') AS r")).r;
    const aBefore = await trophies(A);
    const early = (await call(A, "SELECT ranked_report($1, 'win') AS r", [m2.match_id])).r;
    expect(early.settled).toBe(false);
    await db.query("UPDATE ranked_reports SET reported_at = now() - interval '2 minutes' WHERE match_id = $1", [m2.match_id]);
    const n = (await call(C, 'SELECT ranked_settle_stale() AS n')).n;
    expect(n).toBeGreaterThan(0);
    expect(await trophies(A)).toBeGreaterThan(aBefore);
  });

  it('keeps strangers out of each other\'s matches and players away from the tables', async () => {
    await call(A, "SELECT ranked_find_match('GGGG8') AS r");
    const m = (await call(B, "SELECT ranked_find_match('HHHH9') AS r")).r;
    expect(await rejects(C, "SELECT ranked_report($1, 'win')", [m.match_id])).toBe(true);
    expect(await rejects(C, "SELECT ranked_find_match('bad')", [])).toBe(true);
    const upd = await as(C, () => db.query("UPDATE player_trophies SET trophies = 9999 WHERE user_id = $1", [C]));
    expect(upd.affectedRows).toBe(0);
    const visible = (await as(C, () => db.query('SELECT * FROM player_trophies'))).rows;
    expect(visible).toHaveLength(0);
  });

  it('does not pair players far apart in strength, but widens the search as they wait', async () => {
    await db.query("DELETE FROM ranked_queue");
    await db.query("INSERT INTO player_trophies (user_id, trophies) VALUES ($1, 1500) ON CONFLICT (user_id) DO UPDATE SET trophies = 1500", [C]);
    await call(C, "SELECT ranked_find_match('JJJJ2') AS r");
    const far = (await call(A, "SELECT ranked_find_match('KKKK3') AS r")).r;
    expect(far.role).toBe('host'); // 1500 vs ~20 is too far apart right now
    await db.query("UPDATE ranked_queue SET joined_at = now() - interval '5 minutes' WHERE user_id = $1", [C]);
    const later = (await call(B, "SELECT ranked_find_match('LLLL4') AS r")).r;
    expect(later.role).toBe('guest'); // after 5 minutes the window is wide enough
    expect(later.room_code).toBe('JJJJ2');
  });

  it('lists top players', async () => {
    const rows = (await as(A, () => db.query('SELECT * FROM ranked_top(10)'))).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].trophies).toBeGreaterThanOrEqual(rows[rows.length - 1].trophies);
  });
});

describe('score limits', () => {
  it('rejects impossible scores and floods from a player, but not normal play', async () => {
    expect(await rejects(C, "INSERT INTO scores (user_id, player_name, score, run_id) VALUES ($1,'C',9999999,'big1')", [C])).toBe(true);
    expect(await rejects(C, "INSERT INTO scores (user_id, player_name, score, best_streak, run_id) VALUES ($1,'C',100,5000,'st1')", [C])).toBe(true);
    expect(await rejects(C, "INSERT INTO scores (user_id, player_name, score, run_id) VALUES ($1,'C',1200,'ok1')", [C])).toBe(false);
    expect(await rejects(C, "INSERT INTO scores (user_id, player_name, score, run_id) VALUES ($1,'C',1300,'ok2')", [C])).toBe(true);
  });
});

describe('one best run per player, mode and season', () => {
  const season = '2099-W01';
  const insert = (u, score, run, mode = 'endless') =>
    db.query(`INSERT INTO scores (user_id, player_name, score, run_id, mode, season, created_at) VALUES ($1,'x',$2,$3,$4,$5, now() - interval '1 hour')`, [u, score, run, mode, season]);
  const mine = async (u, mode = 'endless') =>
    (await db.query('SELECT score FROM scores WHERE user_id = $1 AND mode = $2 AND season = $3', [u, mode, season])).rows.map((r) => r.score);

  it('keeps a single row, replacing it only with a higher score', async () => {
    await insert(A, 300, 'kb1');
    expect(await mine(A)).toEqual([300]);
    await insert(A, 200, 'kb2');   // lower: ignored
    expect(await mine(A)).toEqual([300]);
    await insert(A, 300, 'kb3');   // equal: ignored
    expect(await mine(A)).toEqual([300]);
    await insert(A, 500, 'kb4');   // higher: replaces
    expect(await mine(A)).toEqual([500]);
  });

  it('keeps each mode and each player separate', async () => {
    await insert(A, 50, 'kb5', 'weakness');
    await insert(B, 70, 'kb6');
    expect(await mine(A, 'weakness')).toEqual([50]);
    expect(await mine(A)).toEqual([500]);
    expect(await mine(B)).toEqual([70]);
  });

  it('still shows one entry per player on the board', async () => {
    const rows = (await db.query(`SELECT user_id FROM leaderboard_best WHERE season = $1 AND mode = 'endless'`, [season])).rows;
    expect(new Set(rows.map((r) => r.user_id)).size).toBe(rows.length);
  });
});

describe('scores and profiles', () => {
  it('lets players write only their own scores, and never edit them', async () => {
    expect(await rejects(A, `INSERT INTO scores (user_id, player_name, score, run_id) VALUES ($1,'A',10,'x1')`, [A])).toBe(false);
    expect(await rejects(A, `INSERT INTO scores (user_id, player_name, score, run_id) VALUES ($1,'B',10,'x2')`, [B])).toBe(true);
    const res = await as(A, () => db.query('UPDATE scores SET score = 99999'));
    expect(res.affectedRows).toBe(0);
  });

  it('only lets a player upsert their own profile, and bests never go down', async () => {
    await as(A, () => db.query(`SELECT upsert_player_profile($1,'Alice','a','{}',500,5,true)`, [A]));
    await as(A, () => db.query(`SELECT upsert_player_profile($1,'Alice','a','{}',100,1,true)`, [A]));
    const row = (await db.query('SELECT best_score, best_streak FROM player_profiles WHERE user_id = $1', [A])).rows[0];
    expect(row).toEqual({ best_score: 500, best_streak: 5 });
    expect(await rejects(A, `SELECT upsert_player_profile($1,'Hax','a','{}',9,9,true)`, [B])).toBe(true);
  });
});

describe('friends, blocks and invites', () => {
  it('enforces the request lifecycle', async () => {
    expect(await rejects(A, 'INSERT INTO friends (requester_id, addressee_id) VALUES ($1,$2)', [A, B])).toBe(false);
    expect(await rejects(C, 'INSERT INTO friends (requester_id, addressee_id) VALUES ($1,$2)', [A, C])).toBe(true);
    expect(await rejects(C, "INSERT INTO friends (requester_id, addressee_id, status) VALUES ($1,$2,'accepted')", [C, A])).toBe(true);
    expect(await rejects(B, 'INSERT INTO friends (requester_id, addressee_id) VALUES ($1,$2)', [B, A])).toBe(true);
    expect((await as(A, () => db.query("UPDATE friends SET status='accepted'"))).affectedRows).toBe(0);
    expect((await as(B, () => db.query("UPDATE friends SET status='accepted'"))).affectedRows).toBe(1);
  });

  it('stops blocked users from sending requests', async () => {
    await as(B, () => db.query('INSERT INTO friend_blocks (blocker_id, blocked_id) VALUES ($1,$2)', [B, C]));
    expect(await rejects(C, 'INSERT INTO friends (requester_id, addressee_id) VALUES ($1,$2)', [C, B])).toBe(true);
  });

  it('only allows invites between accepted friends', async () => {
    expect(await rejects(A, "INSERT INTO match_invites (from_user, to_user, room_code) VALUES ($1,$2,'ABCDE')", [A, B])).toBe(false);
    expect(await rejects(A, "INSERT INTO match_invites (from_user, to_user, room_code) VALUES ($1,$2,'ABCDE')", [A, C])).toBe(true);
    expect((await as(C, () => db.query('SELECT * FROM match_invites'))).rows).toHaveLength(0);
  });
});

describe('leaderboards, groups and decks', () => {
  it('builds weekly and all-time boards', async () => {
    const week = (await db.query(`SELECT to_char(now() AT TIME ZONE 'utc', 'IYYY-"W"IW') AS w`)).rows[0].w;
    await db.query(`SELECT upsert_player_profile($1,'x','a','{}',0,0,true)`, [A]).catch(() => {});
    await db.exec(`SET app.uid = '${B}'`);
    await db.query(`SELECT upsert_player_profile($1,'Bob','a','{}',0,0,true)`, [B]);
    await db.query(`INSERT INTO scores (user_id, player_name, score, run_id, season) VALUES ($1,'Alice',500,'w1',$2)`, [A, week]);
    await db.query(`INSERT INTO scores (user_id, player_name, score, run_id, season) VALUES ($1,'Bob',900,'w2','2020-W01')`, [B]);
    const weekly = (await db.query('SELECT player_name FROM leaderboard_best WHERE season = $1', [week])).rows;
    expect(weekly.map((r) => r.player_name)).toContain('Alice');
    expect(weekly.map((r) => r.player_name)).not.toContain('Bob');
    const all = (await db.query('SELECT player_name FROM leaderboard_alltime ORDER BY score DESC')).rows;
    expect(all[0].player_name).toBe('Bob');
  });

  it('limits group boards to members and removes empty groups', async () => {
    const group = (await as(A, () => db.query("SELECT * FROM create_group('Class')"))).rows[0];
    await as(B, () => db.query('SELECT * FROM join_group($1)', [group.code.toLowerCase()]));
    const scores = (await as(B, () => db.query("SELECT player_name FROM group_leaderboard($1,'endless','all')", [group.id]))).rows;
    expect(scores.length).toBeGreaterThan(0);
    expect(await rejects(C, "SELECT * FROM group_leaderboard($1,'endless','all')", [group.id])).toBe(true);
    expect(await rejects(C, "SELECT * FROM join_group('ZZZZZZ')")).toBe(true);
    expect(await rejects(A, "INSERT INTO study_groups (name, code, owner_id) VALUES ('x','ABC123',$1)", [A])).toBe(true);
    await as(A, () => db.query('SELECT leave_group($1)', [group.id]));
    await as(B, () => db.query('SELECT leave_group($1)', [group.id]));
    expect((await db.query('SELECT count(*)::int AS n FROM study_groups')).rows[0].n).toBe(0);
  });

  it('shares decks by code only, without listing or direct inserts', async () => {
    const code = (await as(A, () => db.query(`SELECT publish_deck('D', '[{"id":"1"}]'::jsonb) AS code`))).rows[0].code;
    const fetched = (await as(B, () => db.query('SELECT name FROM get_shared_deck($1)', [code.toLowerCase()]))).rows;
    expect(fetched[0].name).toBe('D');
    expect((await as(B, () => db.query('SELECT * FROM shared_decks'))).rows).toHaveLength(0);
    expect(await rejects(A, "INSERT INTO shared_decks (code, owner_id, name, card_count, cards) VALUES ('AAAAAAAA',$1,'x',1,'[]')", [A])).toBe(true);
  });

  it('keeps card reports private to the reporter', async () => {
    expect(await rejects(A, "INSERT INTO card_reports (reporter_id, card_id, reason) VALUES ($1,'n001','wrong')", [A])).toBe(false);
    expect(await rejects(A, "INSERT INTO card_reports (reporter_id, card_id, reason) VALUES ($1,'n001','wrong')", [B])).toBe(true);
    expect((await as(B, () => db.query('SELECT * FROM card_reports'))).rows).toHaveLength(0);
  });
});

describe('tournament standing, activity feed and group goals', () => {
  it('ranks a player among everyone with a score for that season', async () => {
    const season = '2026-W40';
    await db.query(`INSERT INTO player_profiles (user_id, player_name) VALUES ($1,'Cara') ON CONFLICT DO NOTHING`, [C]);
    for (const [u, score, run] of [[A, 100, 't1'], [B, 300, 't2'], [C, 200, 't3']]) {
      await db.query(`INSERT INTO scores (user_id, player_name, score, run_id, mode, season) VALUES ($1,'x',$2,$3,'tournament',$4)`, [u, score, run, season]);
    }
    const mine = (await as(C, () => db.query(`SELECT rank::int AS rank, total::int AS total FROM season_standing('tournament', $1)`, [season]))).rows[0];
    expect(mine).toEqual({ rank: 2, total: 3 });
    const none = (await as(C, () => db.query(`SELECT * FROM season_standing('tournament', '2020-W01')`))).rows;
    expect(none).toHaveLength(0);
  });

  it('shows activity to the poster and accepted friends only', async () => {
    await as(A, () => db.query(`INSERT INTO activity_events (user_id, kind, payload) VALUES ($1,'streak','{"name":"Alice","streak":20}')`, [A]));
    expect((await as(B, () => db.query('SELECT * FROM activity_events'))).rows).toHaveLength(1); // A and B are friends
    expect((await as(C, () => db.query('SELECT * FROM activity_events'))).rows).toHaveLength(0); // C is not
    expect(await rejects(B, `INSERT INTO activity_events (user_id, kind) VALUES ($1,'streak')`, [A])).toBe(true);
    expect(await rejects(A, `INSERT INTO activity_events (user_id, kind) VALUES ($1,'made_up')`, [A])).toBe(true);
  });

  it('keeps private runs private, and lets friends give kudos on shared ones', async () => {
    const post = async (user, vis, kind = 'run') => (await as(user, () => db.query(
      "INSERT INTO activity_events (user_id, kind, visibility, payload) VALUES ($1,$2,$3,'{\"mode\":\"endless\",\"score\":900}') RETURNING id", [user, kind, vis]))).rows[0].id;
    const shared = await post(A, 'friends');
    const secret = await post(A, 'private');

    const bSees = (await as(B, () => db.query('SELECT id FROM activity_events'))).rows.map((r) => r.id);
    expect(bSees).toContain(shared);
    expect(bSees).not.toContain(secret);
    expect((await as(A, () => db.query('SELECT id FROM activity_events WHERE id = $1', [secret]))).rows).toHaveLength(1);

    // kudos: friends only, not on your own, not on what you cannot see
    await as(B, () => db.query('SELECT give_kudos($1, $2)', [shared, 'fire']));
    expect(await rejects(B, 'SELECT give_kudos($1)', [secret])).toBe(true);
    expect(await rejects(A, 'SELECT give_kudos($1)', [shared])).toBe(true);
    expect(await rejects(C, 'SELECT give_kudos($1)', [shared])).toBe(true);
    expect(await rejects(B, "SELECT give_kudos($1, 'insult')", [shared])).toBe(true);
    await as(B, () => db.query('SELECT give_kudos($1, $2)', [shared, 'brain'])); // changing it keeps one per friend
    const row = (await as(A, () => db.query('SELECT * FROM get_feed(40, NULL, $1) WHERE id = $2', ['all', shared]))).rows[0];
    expect(Number(row.kudos_count)).toBe(1);
    const bRow = (await as(B, () => db.query('SELECT * FROM get_feed(40, NULL, $1) WHERE id = $2', ['all', shared]))).rows[0];
    expect(bRow.i_gave).toBe('brain');
    expect((await as(A, () => db.query('SELECT * FROM my_recent_kudos()'))).rows).toHaveLength(1);

    // the feed hides private runs from friends and respects scopes
    const bFeed = (await as(B, () => db.query("SELECT id FROM get_feed(40, NULL, 'friends')"))).rows.map((r) => r.id);
    expect(bFeed).toContain(shared);
    expect(bFeed).not.toContain(secret);
    expect((await as(A, () => db.query("SELECT id FROM get_feed(40, NULL, 'mine')"))).rows.map((r) => r.id)).toContain(secret);
    expect((await as(C, () => db.query("SELECT id FROM get_feed(40, NULL, 'all')"))).rows).toHaveLength(0);

    // changing visibility later: only the owner, and it takes effect straight away
    expect(await rejects(B, "SELECT set_activity_visibility($1, 'private')", [shared])).toBe(true);
    await as(A, () => db.query("SELECT set_activity_visibility($1, 'private')", [shared]));
    expect((await as(B, () => db.query('SELECT id FROM activity_events WHERE id = $1', [shared]))).rows).toHaveLength(0);
    expect(await rejects(B, 'SELECT give_kudos($1)', [shared])).toBe(true);
    await as(A, () => db.query("SELECT set_activity_visibility($1, 'friends')", [shared]));

    await as(B, () => db.query('SELECT remove_kudos($1)', [shared]));
    expect((await as(A, () => db.query('SELECT * FROM my_recent_kudos()'))).rows).toHaveLength(0);
  });

  it('hides a blocked player from the feed and stops their kudos', async () => {
    const id = (await as(A, () => db.query("INSERT INTO activity_events (user_id, kind, visibility) VALUES ($1,'run','friends') RETURNING id", [A]))).rows[0].id;
    await as(B, () => db.query('SELECT give_kudos($1)', [id]));
    await as(A, () => db.query('INSERT INTO friend_blocks (blocker_id, blocked_id) VALUES ($1,$2)', [A, B]));
    expect((await as(B, () => db.query('SELECT id FROM activity_events WHERE id = $1', [id]))).rows).toHaveLength(0);
    expect((await as(A, () => db.query('SELECT * FROM my_recent_kudos()'))).rows).toHaveLength(0);
    await db.query('DELETE FROM friend_blocks WHERE blocker_id = $1 AND blocked_id = $2', [A, B]);
  });

  it('limits how fast one player can post', async () => {
    for (let i = 0; i < 30; i++) await db.query("INSERT INTO activity_events (user_id, kind) VALUES ($1,'streak')", [C]);
    // (C is at 30 of the 60 an hour) the next 40 cannot all go through
    let blocked = false;
    for (let i = 0; i < 40 && !blocked; i++) blocked = await rejects(C, "INSERT INTO activity_events (user_id, kind) VALUES ($1,'streak')", [C]);
    expect(blocked).toBe(true);
    await db.query('DELETE FROM activity_events WHERE user_id = $1', [C]);
  });

  it('tracks a group study goal that only the owner can set', async () => {
    const group = (await as(A, () => db.query("SELECT * FROM create_group('Goal group')"))).rows[0];
    await as(B, () => db.query('SELECT * FROM join_group($1)', [group.code]));
    expect(await rejects(B, 'SELECT set_group_goal($1, 500)', [group.id])).toBe(true);
    await as(A, () => db.query('SELECT set_group_goal($1, 500)', [group.id]));
    await as(A, () => db.query("SELECT report_study('2026-W40', 120)"));
    await as(B, () => db.query("SELECT report_study('2026-W40', 80)"));
    await as(B, () => db.query("SELECT report_study('2026-W40', 50)")); // lower reports never reduce progress
    const rows = (await as(B, () => db.query("SELECT goal, cards FROM group_goal_status($1, '2026-W40')", [group.id]))).rows;
    expect(rows.map((r) => r.cards).sort((x, y) => y - x)).toEqual([120, 80]);
    expect(rows[0].goal).toBe(500);
    expect(await rejects(C, "SELECT * FROM group_goal_status($1, '2026-W40')", [group.id])).toBe(true);
    const listed = (await as(A, () => db.query('SELECT weekly_goal FROM my_groups()'))).rows;
    expect(listed[0].weekly_goal).toBe(500);
  });
});


describe('moderation queue', () => {
  it('collects every kind of report in one list that only the owner can read', async () => {
    await as(A, () => db.query("INSERT INTO user_reports (reporter_id, reported_id, reason) VALUES ($1,$2,'rude name')", [A, B]));
    await as(A, () => db.query("INSERT INTO card_reports (reporter_id, card_id, reason, details) VALUES ($1,'c1','wrong','typo')", [A]));
    await as(A, () => db.query("SELECT report_content('buddy', $1, 'spam')", [B]));
    const rows = (await db.query('SELECT source, detail FROM moderation_queue')).rows;
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(['buddy', 'card', 'player']));
    expect(rows.map((r) => r.detail)).toContain('wrong: typo');
    // (players are denied by REVOKE in policies.sql; this test's setup grants everything afterwards, so only the content is checked here)
  });
});

describe('opt-in diagnostics', () => {
  it('accepts a report from a signed-in player but nobody can read the table', async () => {
    await as(A, () => db.query("SELECT report_diagnostic('error', 'boom', 'audio', 'play', 'abc123', 'medium')"));
    expect((await db.query('SELECT message, tier FROM client_diagnostics')).rows).toEqual([{ message: 'boom', tier: 'medium' }]);
    expect((await as(A, () => db.query('SELECT * FROM client_diagnostics'))).rows).toHaveLength(0); // no read policy
    expect(await rejects(A, "INSERT INTO client_diagnostics (kind, message) VALUES ('error','x')")).toBe(true);
    expect(await rejects(A, "SELECT report_diagnostic('spam', 'x')")).toBe(true); // unknown kind
    await db.exec("RESET ROLE; SET app.uid = ''");
    expect(await rejects('', "SELECT report_diagnostic('error', 'x')")).toBe(true); // signed out
  });

  it('keeps no user id and limits what is stored', async () => {
    await as(B, () => db.query("SELECT report_diagnostic('perf', $1, NULL, NULL, NULL, 'huge')", ['x'.repeat(500)]));
    const row = (await db.query("SELECT * FROM client_diagnostics WHERE kind = 'perf'")).rows[0];
    expect(row.message.length).toBe(300);
    expect(row.tier).toBeNull();
    expect(Object.keys(row)).not.toContain('user_id');
  });
});

describe('account deletion', () => {
  it('removes the caller and everything tied to them, and only them', async () => {
    const D = '44444444-4444-4444-4444-444444444444';
    const E = '55555555-5555-5555-5555-555555555555';
    await db.exec(`INSERT INTO auth.users VALUES ('${D}'), ('${E}')`);
    await as(D, () => db.query(`SELECT upsert_player_profile($1,'Doomed','a','{}',10,1,true)`, [D]));
    await as(D, () => db.query(`SELECT push_save('{"x":1}'::jsonb, 1, NULL)`));
    await as(D, () => db.query(`INSERT INTO scores (user_id, player_name, score, run_id) VALUES ($1,'Doomed',5,'del1')`, [D]));
    await as(E, () => db.query(`SELECT upsert_player_profile($1,'Keeper','a','{}',10,1,true)`, [E]));
    // posts and kudos (the social side) go too
    await db.query("INSERT INTO friends (requester_id, addressee_id, status) VALUES ($1,$2,'accepted')", [D, E]);
    const post = (await as(D, () => db.query("INSERT INTO activity_events (user_id, kind, visibility) VALUES ($1,'run','friends') RETURNING id", [D]))).rows[0].id;
    const theirs = (await as(E, () => db.query("INSERT INTO activity_events (user_id, kind, visibility) VALUES ($1,'run','friends') RETURNING id", [E]))).rows[0].id;
    await as(E, () => db.query('SELECT give_kudos($1)', [post]));
    await as(D, () => db.query('SELECT give_kudos($1)', [theirs]));

    await as(D, () => db.query('SELECT delete_my_account()'));

    const count = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);
    expect(await count('SELECT count(*) AS n FROM auth.users WHERE id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM player_profiles WHERE user_id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM player_saves WHERE user_id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM scores WHERE user_id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM activity_events WHERE user_id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM activity_kudos WHERE event_id = $1 OR user_id = $2', [post, D])).toBe(0);
    // Someone else's data is untouched
    expect(await count('SELECT count(*) AS n FROM player_profiles WHERE user_id = $1', [E])).toBe(1);
    expect(await count('SELECT count(*) AS n FROM activity_events WHERE id = $1', [theirs])).toBe(1);
  });

  it('requires a signed-in user', async () => {
    await db.exec("SET app.uid = ''; SET ROLE authenticated;");
    let failed = false;
    try { await db.query('SELECT delete_my_account()'); } catch (e) { failed = true; }
    await db.exec('RESET ROLE');
    expect(failed).toBe(true);
  });
});

describe('cloud saves', () => {
  it('keeps each save private and writable only through the save functions', async () => {
    const ts = (await as(A, () => db.query(`SELECT push_save('{"runs":3}'::jsonb, 3, NULL) AS ts`))).rows[0].ts;
    expect(ts).toBeTruthy();
    expect((await as(A, () => db.query('SELECT data FROM player_saves'))).rows).toHaveLength(1);
    expect((await as(B, () => db.query('SELECT data FROM player_saves'))).rows).toHaveLength(0);
    expect(await rejects(B, `INSERT INTO player_saves (user_id, data) VALUES ($1, '{}')`, [A])).toBe(true);
    expect(await rejects(A, `INSERT INTO player_saves (user_id, data) VALUES ($1, '{}')`, [A])).toBe(true);
    expect((await as(B, () => db.query(`UPDATE player_saves SET data = '{"hax":1}'`))).affectedRows).toBe(0);
  });

  it('refuses to overwrite a newer save from another device', async () => {
    const first = (await as(B, () => db.query(`SELECT push_save('{"v":1}'::jsonb, 1, NULL) AS ts`))).rows[0].ts;
    // Device 1 saves again with the timestamp it last saw.
    const second = (await as(B, () => db.query(`SELECT push_save('{"v":2}'::jsonb, 2, $1) AS ts`, [first]))).rows[0].ts;
    expect(second).toBeTruthy();
    // Device 2 still holds the first timestamp: rejected (NULL), data unchanged.
    const stale = (await as(B, () => db.query(`SELECT push_save('{"v":99}'::jsonb, 9, $1) AS ts`, [first]))).rows[0].ts;
    expect(stale).toBeNull();
    // Saving with no base when a save exists is also refused.
    expect((await as(B, () => db.query(`SELECT push_save('{"v":98}'::jsonb, 9, NULL) AS ts`))).rows[0].ts).toBeNull();
    expect((await as(B, () => db.query('SELECT data FROM player_saves'))).rows[0].data).toEqual({ v: 2 });
    // The player can choose to overwrite deliberately.
    await as(B, () => db.query(`SELECT force_save('{"v":3}'::jsonb, 3)`));
    expect((await as(B, () => db.query('SELECT data, run_count FROM player_saves'))).rows[0]).toEqual({ data: { v: 3 }, run_count: 3 });
  });

  it('requires a signed-in user', async () => {
    await db.exec("SET app.uid = ''; SET ROLE authenticated;");
    let failed = false;
    try { await db.query(`SELECT push_save('{}'::jsonb, 0, NULL)`); } catch (e) { failed = true; }
    await db.exec('RESET ROLE');
    expect(failed).toBe(true);
  });
});
