// @vitest-environment node
//
// Study-buddy and group discovery (not released yet): runs database/discovery.sql on top of the main schema
// and checks who can be found, by whom, and what they can do about it.

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
const rows = async (user, sql, params) => (await as(user, () => db.query(sql, params))).rows;
const one = async (user, sql, params) => (await rows(user, sql, params))[0];
const rejects = async (user, sql, params) => { try { await as(user, () => db.query(sql, params)); return false; } catch (e) { return true; } };
const list = (user, exam, date, subjects, pace, tz, on = true) =>
  one(user, 'SELECT set_buddy_listing($1,$2,$3,$4,$5,$6)', [exam, date, subjects, pace, tz, on]);

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
  for (let i = 0; i < 2; i++) await db.exec(readFileSync('database/discovery.sql', 'utf8')); // safe to run twice
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    INSERT INTO auth.users VALUES ('${A}'), ('${B}'), ('${C}'), ('${D}'), ('${E}');
    INSERT INTO player_profiles (user_id, player_name, visible) VALUES ('${A}', 'Ada', true), ('${B}', 'Bo', true), ('${C}', 'Cy', true), ('${D}', 'Di', true), ('${E}', 'Ed', false);
  `);
}, 60000);

describe('study buddies', () => {
  it('nobody can read or write listings directly', async () => {
    expect(await rejects(A, 'SELECT * FROM buddy_listings')).toBe(true);
    expect(await rejects(A, "INSERT INTO buddy_listings (user_id, exam) VALUES ($1, 'x')", [A])).toBe(true);
  });

  it('is off until the player turns it on, and needs a visible profile', async () => {
    await list(A, 'USMLE Step 1', '2027-03-01', ['Cardiology', 'Renal'], 'steady', -5, false);
    expect(await rejects(B, 'SELECT * FROM find_buddies()')).toBe(true);
    expect(await rejects(A, 'SELECT * FROM find_buddies()')).toBe(true); // a hidden listing does not let you browse
    expect(await rejects(E, "SELECT set_buddy_listing('USMLE Step 1', NULL, '{}', 'steady', 0, true)")).toBe(true); // profile hidden
    expect(await rejects(A, "SELECT set_buddy_listing('USMLE Step 1', NULL, '{}', 'sprinting', 0, true)")).toBe(true);
  });

  it('ranks compatible players, hides everyone else and shows only listing fields', async () => {
    await list(A, 'USMLE Step 1', '2027-03-01', ['Cardiology', 'Renal'], 'steady', -5);
    await list(B, 'USMLE Step 1', '2027-03-10', ['Cardiology', 'Renal'], 'steady', -4);
    await list(C, 'COMLEX Level 1', '2027-09-01', ['Pharmacology'], 'intense', 8);
    await list(D, 'USMLE Step 1', null, ['Renal'], 'relaxed', null, false); // not discoverable

    const found = await rows(A, 'SELECT * FROM find_buddies()');
    expect(found.map((r) => r.player_name)).toEqual(['Bo', 'Cy']);
    expect(found[0].score).toBeGreaterThan(found[1].score);
    expect(found[0].score).toBe(3 + 2 + 2 + 1 + 1); // exam, date, two subjects, pace, time zone
    expect(Object.keys(found[0]).sort()).toEqual(['avatar', 'exam', 'exam_date', 'pace', 'player_name', 'score', 'subjects', 'user_id', 'utc_offset']);
    expect((await rows(C, 'SELECT player_name FROM find_buddies()')).map((r) => r.player_name)).not.toContain('Di');
  });

  it('leaves out friends, people already asked, and blocked players', async () => {
    await db.query("INSERT INTO friends (requester_id, addressee_id, status) VALUES ($1,$2,'pending')", [A, B]);
    expect((await rows(A, 'SELECT player_name FROM find_buddies()')).map((r) => r.player_name)).toEqual(['Cy']);
    expect((await rows(B, 'SELECT player_name FROM find_buddies()')).map((r) => r.player_name)).not.toContain('Ada');
    await db.query("DELETE FROM friends");
    await db.query('INSERT INTO friend_blocks (blocker_id, blocked_id) VALUES ($1,$2)', [C, A]);
    expect((await rows(A, 'SELECT player_name FROM find_buddies()')).map((r) => r.player_name)).toEqual(['Bo']);
    expect((await rows(C, 'SELECT player_name FROM find_buddies()')).map((r) => r.player_name)).not.toContain('Ada');
    await db.query('DELETE FROM friend_blocks');
  });

  it('can be switched off or removed', async () => {
    await list(B, 'USMLE Step 1', null, [], 'steady', null, false);
    expect((await rows(A, 'SELECT player_name FROM find_buddies()')).map((r) => r.player_name)).not.toContain('Bo');
    await one(B, 'SELECT remove_buddy_listing()');
    expect(await one(B, 'SELECT * FROM my_buddy_listing()')).toMatchObject({ user_id: null });
  });
});

describe('public groups', () => {
  let open, byRequest, hidden;
  it('lists only public groups the player is not already in', async () => {
    open = (await one(A, "SELECT * FROM create_group('Step 1 Crew')"));
    byRequest = (await one(A, "SELECT * FROM create_group('Quiet Study')"));
    hidden = (await one(A, "SELECT * FROM create_group('Private Pals')"));
    expect(await rejects(B, "SELECT set_group_discovery($1, true, 'USMLE Step 1', 'open')", [open.id])).toBe(true); // not the owner
    await one(A, "SELECT set_group_discovery($1, true, 'USMLE Step 1', 'open')", [open.id]);
    await one(A, "SELECT set_group_discovery($1, true, 'COMLEX Level 1', 'request')", [byRequest.id]);

    const seenByB = (await rows(B, 'SELECT * FROM discover_groups()')).map((g) => g.name).sort();
    expect(seenByB).toEqual(['Quiet Study', 'Step 1 Crew']);
    expect((await rows(A, 'SELECT * FROM discover_groups()'))).toHaveLength(0); // the owner is already in them
    expect((await rows(B, "SELECT name FROM discover_groups('crew')")).map((g) => g.name)).toEqual(['Step 1 Crew']);
    expect((await rows(B, "SELECT name FROM discover_groups('', 'comlex level 1')")).map((g) => g.name)).toEqual(['Quiet Study']);
    expect((await rows(B, "SELECT name FROM discover_groups('%')")).length).toBe(2); // wildcards are not honoured
    const g = (await rows(B, "SELECT * FROM discover_groups('crew')"))[0];
    expect(Object.keys(g).sort()).toEqual(['exam', 'id', 'join_mode', 'member_count', 'name', 'owner_name', 'requested', 'weekly_goal']);
  });

  it('lets anyone join an open group but asks the owner for the others', async () => {
    expect(await one(B, 'SELECT join_public_group($1) AS r', [open.id])).toEqual({ r: 'joined' });
    expect((await rows(B, 'SELECT name FROM my_groups()')).map((g) => g.name)).toContain('Step 1 Crew');
    expect(await one(C, 'SELECT join_public_group($1) AS r', [byRequest.id])).toEqual({ r: 'requested' });
    expect(await rejects(C, 'SELECT join_public_group($1)', [hidden.id])).toBe(true); // not public
    expect((await rows(C, 'SELECT name FROM my_groups()'))).toHaveLength(0);
    expect((await rows(C, "SELECT requested FROM discover_groups('quiet')"))[0].requested).toBe(true);
  });

  it('shows requests only to the owner, who can accept or decline', async () => {
    expect(await rejects(B, 'SELECT * FROM group_requests($1)', [byRequest.id])).toBe(true);
    expect((await rows(A, 'SELECT player_name FROM group_requests($1)', [byRequest.id])).map((r) => r.player_name)).toEqual(['Cy']);
    expect((await rows(A, "SELECT pending_requests FROM my_groups() WHERE name = 'Quiet Study'"))[0].pending_requests).toBe(1);
    expect(await rejects(C, 'SELECT resolve_group_request($1, $2, true)', [byRequest.id, C])).toBe(true);
    await one(A, 'SELECT resolve_group_request($1, $2, true)', [byRequest.id, C]);
    expect((await rows(C, 'SELECT name FROM my_groups()')).map((g) => g.name)).toEqual(['Quiet Study']);
    expect(await rejects(A, 'SELECT resolve_group_request($1, $2, true)', [byRequest.id, C])).toBe(true); // no request left

    await one(D, 'SELECT join_public_group($1)', [byRequest.id]);
    await one(A, 'SELECT resolve_group_request($1, $2, false)', [byRequest.id, D]);
    expect((await rows(D, 'SELECT name FROM my_groups()'))).toHaveLength(0);
    await one(D, 'SELECT join_public_group($1)', [byRequest.id]);
    await one(D, 'SELECT cancel_group_request($1)', [byRequest.id]);
    expect((await rows(A, 'SELECT * FROM group_requests($1)', [byRequest.id]))).toHaveLength(0);
  });

  it('hides groups from players the owner has blocked, and can be taken private again', async () => {
    await db.query('INSERT INTO friend_blocks (blocker_id, blocked_id) VALUES ($1,$2)', [A, D]);
    expect(await rows(D, 'SELECT * FROM discover_groups()')).toHaveLength(0);
    expect(await rejects(D, 'SELECT join_public_group($1)', [open.id])).toBe(true);
    await db.query('DELETE FROM friend_blocks');
    await one(A, "SELECT set_group_discovery($1, false, NULL, 'open')", [open.id]);
    expect((await rows(D, 'SELECT name FROM discover_groups()')).map((g) => g.name)).toEqual(['Quiet Study']);
  });

  it('caps pending requests and accepts only preset report reasons', async () => {
    expect(await rejects(B, "SELECT report_content('group', $1, 'rude words')", [open.id])).toBe(true);
    await one(B, "SELECT report_content('group', $1, 'spam')", [byRequest.id]);
    await one(B, "SELECT report_content('buddy', $1, 'harassment')", [A]);
    expect(await rejects(B, "SELECT report_content('everything', 'x', 'spam')")).toBe(true);
    expect(await rejects(B, 'SELECT * FROM content_reports')).toBe(true);
  });
});
