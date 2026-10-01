// @vitest-environment node
//
// Cohorts and cohort wars (not released yet): runs database/cohorts.sql on top of
// the main schema and checks membership rules, rosters and war points.

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const U = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const [A, B, C, D, E] = ['1', '2', '3', '4', '5'].map(U);

let db;

async function as(user, fn) {
  await db.exec(`SET app.uid = '${user}'; SET ROLE authenticated;`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
const one = async (user, sql, params) => (await as(user, () => db.query(sql, params))).rows[0];
const rejects = async (user, sql, params) => { try { await as(user, () => db.query(sql, params)); return false; } catch (e) { return true; } };

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
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  await db.exec(readFileSync('database/policies.sql', 'utf8'));
  for (let i = 0; i < 2; i++) await db.exec(readFileSync('database/cohorts.sql', 'utf8')); // safe to run twice
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    INSERT INTO auth.users VALUES ('${A}'), ('${B}'), ('${C}'), ('${D}'), ('${E}');
    INSERT INTO player_profiles (user_id, player_name) VALUES ('${A}', 'Ada'), ('${B}', 'Bo'), ('${C}', 'Cy'), ('${D}', 'Di'), ('${E}', 'Ed');
  `);
}, 60000);

describe('cohorts', () => {
  let tag;

  it('lets a player start a cohort for their school and become its leader', async () => {
    const r = (await one(A, "SELECT cohort_create('Night Owls', '  State   Medical  School ', 'Study late') AS r")).r;
    expect(r.name).toBe('Night Owls');
    expect(r.tag).toMatch(/^[A-Z2-9]{5}$/);
    tag = r.tag;
    const mine = (await one(A, 'SELECT my_cohort() AS r')).r;
    expect(mine).toMatchObject({ name: 'Night Owls', school: 'State Medical School', my_role: 'leader' });
    expect(mine.members).toHaveLength(1);
    // one cohort per player; names are unique
    expect(await rejects(A, "SELECT cohort_create('Another', NULL, '')")).toBe(true);
    expect(await rejects(B, "SELECT cohort_create('night owls', NULL, '')")).toBe(true);
  });

  it('lets others join by code, up to the size limit', async () => {
    expect(await rejects(B, "SELECT cohort_join('ZZZZZ')")).toBe(true);
    await one(B, 'SELECT cohort_join($1) AS r', [tag.toLowerCase()]);
    await one(C, 'SELECT cohort_join($1) AS r', [tag]);
    expect(await rejects(C, 'SELECT cohort_join($1)', [tag])).toBe(true); // already in one
    await db.exec("UPDATE cohorts SET max_members = 3");
    expect(await rejects(D, 'SELECT cohort_join($1)', [tag])).toBe(true); // full
    await db.exec('UPDATE cohorts SET max_members = 50');
  });

  it('shows the roster to members only, and nothing to direct table reads', async () => {
    expect((await one(B, 'SELECT my_cohort() AS r')).r.members).toHaveLength(3);
    expect((await one(D, 'SELECT my_cohort() AS r')).r).toBeNull();
    expect(await rejects(D, 'SELECT * FROM cohort_members')).toBe(true);
    expect(await rejects(D, "INSERT INTO cohort_members (cohort_id, user_id, role) SELECT id, $1, 'leader' FROM cohorts", [D])).toBe(true);
  });

  it('keeps leader powers with the leader', async () => {
    expect(await rejects(B, 'SELECT cohort_set_role($1, $2)', [C, 'officer'])).toBe(true);
    await as(A, () => db.query('SELECT cohort_set_role($1, $2)', [B, 'officer']));
    expect(await rejects(B, 'SELECT cohort_kick($1)', [A])).toBe(true);   // cannot remove the leader
    await as(B, () => db.query('SELECT cohort_kick($1)', [C]));            // officer removes a member
    expect((await one(C, 'SELECT my_cohort() AS r')).r).toBeNull();
    await one(C, 'SELECT cohort_join($1) AS r', [tag]);
  });

  it('searches open cohorts by name or school', async () => {
    const byName = (await as(D, () => db.query("SELECT * FROM cohort_search('owls')"))).rows;
    expect(byName.map((r) => r.name)).toContain('Night Owls');
    const bySchool = (await as(D, () => db.query("SELECT * FROM cohort_search('medical')"))).rows;
    expect(bySchool[0]).toMatchObject({ school: 'State Medical School', members: 3 });
    expect((await as(D, () => db.query("SELECT * FROM cohort_search('nothing like this')"))).rows).toHaveLength(0);
  });

  it('turns ranked wins into war points, capped per player', async () => {
    // Ada (cohort) beats Di (no cohort): the cohort scores
    await db.exec(`INSERT INTO ranked_matches (host_id, guest_id, room_code, host_trophies, guest_trophies) VALUES ('${A}', '${D}', 'ROOM1', 0, 0)`);
    const m1 = (await db.query("SELECT id FROM ranked_matches WHERE room_code = 'ROOM1'")).rows[0].id;
    await as(A, () => db.query("SELECT ranked_report($1, 'win')", [m1]));
    await as(D, () => db.query("SELECT ranked_report($1, 'loss')", [m1]));
    let mine = (await one(B, 'SELECT my_cohort() AS r')).r;
    expect(mine.war_points).toBe(10);
    expect(mine.members.find((m) => m.name === 'Ada').war_points).toBe(10);

    // the cap: one player brings in at most 100 points a week
    for (let i = 0; i < 12; i++) {
      await db.exec(`INSERT INTO ranked_matches (host_id, guest_id, room_code, host_trophies, guest_trophies) VALUES ('${A}', '${D}', 'CAP${i % 10}', 0, 0)`);
    }
    const ids = (await db.query("SELECT id FROM ranked_matches WHERE room_code LIKE 'CAP%'")).rows.map((r) => r.id);
    for (const id of ids) {
      await as(D, () => db.query("SELECT ranked_report($1, 'loss')", [id]));
    }
    mine = (await one(B, 'SELECT my_cohort() AS r')).r;
    expect(mine.members.find((m) => m.name === 'Ada').war_points).toBe(100);
    expect(mine.war_points).toBe(100);
  });

  it('ranks cohorts and schools by war points this week', async () => {
    await one(E, "SELECT cohort_create('Rival Rounds', 'Other College', '') AS r");
    await db.exec(`INSERT INTO ranked_matches (host_id, guest_id, room_code, host_trophies, guest_trophies) VALUES ('${E}', '${D}', 'ROOM2', 0, 0)`);
    const m = (await db.query("SELECT id FROM ranked_matches WHERE room_code = 'ROOM2'")).rows[0].id;
    await as(E, () => db.query("SELECT ranked_report($1, 'win')", [m]));
    await as(D, () => db.query("SELECT ranked_report($1, 'loss')", [m]));
    const wars = (await as(D, () => db.query('SELECT * FROM cohort_war_standings(10)'))).rows;
    expect(wars.map((w) => [w.name, Number(w.war_points), Number(w.rank)])).toEqual([['Night Owls', 100, 1], ['Rival Rounds', 10, 2]]);
    const schools = (await as(D, () => db.query('SELECT * FROM school_standings(10)'))).rows;
    expect(schools.map((s) => s.name)).toEqual(['State Medical School', 'Other College']);
  });

  it('passes leadership on, and closes a cohort when the last member leaves', async () => {
    await as(A, () => db.query('SELECT cohort_leave()'));
    const roster = (await one(B, 'SELECT my_cohort() AS r')).r;
    expect(roster.members.filter((m) => m.role === 'leader')).toHaveLength(1);
    expect(roster.my_role).toBe('leader'); // the officer inherits
    await as(B, () => db.query('SELECT cohort_leave()'));
    await as(C, () => db.query('SELECT cohort_leave()'));
    expect((await db.query("SELECT count(*)::int AS n FROM cohorts WHERE name = 'Night Owls'")).rows[0].n).toBe(0);
  });

  it('survives an account being deleted', async () => {
    await db.exec(`DELETE FROM auth.users WHERE id = '${E}'`);
    expect((await db.query("SELECT count(*)::int AS n FROM cohorts WHERE name = 'Rival Rounds'")).rows[0].n).toBe(0);
  });
});
