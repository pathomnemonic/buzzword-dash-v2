// @vitest-environment node
//
// Runs database/schema.sql and database/policies.sql against a real Postgres
// engine (PGlite) with Supabase-style stubs, then checks the security rules:
// who can read, write and invite whom. Catches SQL mistakes before they reach
// a live project.

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

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


describe('account deletion', () => {
  it('removes the caller and everything tied to them, and only them', async () => {
    const D = '44444444-4444-4444-4444-444444444444';
    const E = '55555555-5555-5555-5555-555555555555';
    await db.exec(`INSERT INTO auth.users VALUES ('${D}'), ('${E}')`);
    await as(D, () => db.query(`SELECT upsert_player_profile($1,'Doomed','a','{}',10,1,true)`, [D]));
    await as(D, () => db.query(`SELECT push_save('{"x":1}'::jsonb, 1, NULL)`));
    await as(D, () => db.query(`INSERT INTO scores (user_id, player_name, score, run_id) VALUES ($1,'Doomed',5,'del1')`, [D]));
    await as(E, () => db.query(`SELECT upsert_player_profile($1,'Keeper','a','{}',10,1,true)`, [E]));

    await as(D, () => db.query('SELECT delete_my_account()'));

    const count = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);
    expect(await count('SELECT count(*) AS n FROM auth.users WHERE id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM player_profiles WHERE user_id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM player_saves WHERE user_id = $1', [D])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM scores WHERE user_id = $1', [D])).toBe(0);
    // Someone else's data is untouched
    expect(await count('SELECT count(*) AS n FROM player_profiles WHERE user_id = $1', [E])).toBe(1);
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
