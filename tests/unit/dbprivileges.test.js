// @vitest-environment node
//
// Who can call what, on a database that behaves like Supabase. Supabase gives every new function and table to the
// signed-in (authenticated) and signed-out (anon) roles by default, and "REVOKE ... FROM PUBLIC" does not take that
// away, so a function meant only for the payment server (like the one that grants Pro) was callable by any player.
// The other database tests miss this because a plain Postgres has no such default. This one adds it back.
//
// Run order (as in database/README / docs): schema, policies, cohorts, discovery, pro, analytics, analytics_views, lockdown.

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ORDER = ['schema', 'policies', 'cohorts', 'discovery', 'pro', 'analytics', 'analytics_views'];

async function supabaseLikeDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('is_anonymous', coalesce(nullif(current_setting('app.anon', true), ''), 'false')::boolean) $$;
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE PUBLICATION supabase_realtime;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated, service_role;
    -- what a Supabase project does to everything its SQL editor creates
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
  `);
  return db;
}

async function load(db, files) {
  for (const f of files) await db.exec(readFileSync('database/' + f + '.sql', 'utf8'));
}

const callable = async (db, role) => (await db.query(`
  SELECT DISTINCT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND has_function_privilege('${role}', p.oid, 'EXECUTE') ORDER BY 1`)).rows.map((r) => r.name);

// Everything the app is allowed to call. A new function is NOT on this list until someone decides it should be.
const SIGNED_IN = [
  'cancel_group_request', 'can_see_activity', 'can_see_post', 'cohort_create', 'cohort_join', 'cohort_kick', 'cohort_leave',
  'cohort_search', 'cohort_set_role', 'cohort_war_standings', 'create_group', 'delete_my_account', 'discover_groups',
  'find_buddies', 'force_save', 'get_feed', 'get_my_pro', 'get_shared_deck', 'give_kudos', 'group_goal_status',
  'group_leaderboard', 'group_requests', 'has_block_between', 'is_group_member', 'join_group', 'join_public_group',
  'leave_group', 'my_buddy_listing', 'my_cohort', 'my_groups', 'my_recent_kudos', 'publish_deck', 'push_save',
  'ranked_cancel', 'ranked_find_match', 'ranked_my_stats', 'ranked_poll_match', 'ranked_report', 'ranked_settle_stale',
  'ranked_top', 'redeem_pro_code', 'remove_buddy_listing', 'remove_kudos', 'report_content', 'report_diagnostic',
  'report_study', 'resolve_group_request', 'restore_backup_save', 'school_standings', 'season_standing',
  'set_activity_visibility', 'set_buddy_listing', 'set_group_discovery', 'set_group_goal', 'start_my_trial',
  'submit_feedback', 'upsert_player_profile'
];
const OPEN_TO_ALL = ['count_consent', 'delete_analytics', 'ingest_analytics'];

// Functions that grant money's worth, hand out data or change other people's state: the app roles must never reach them.
const MUST_BE_CLOSED = [
  'pro_grant', 'pro_grant_until', 'pro_grant_item', 'pro_grant_library', 'pro_revoke', 'pro_revoke_plan', 'pro_revoke_item',
  'pro_revoke_library', 'pro_has_item', 'pro_make_code', 'pro_event_once', 'pro_link_customer', 'pro_customer_user',
  'pro_user_customer', 'pro_forget_user', 'apple_token_save', 'apple_token_get', 'ranked_apply', 'ranked_try_settle', 'cohort_add_war_points', 'analytics_purge', 'keep_richest_save'
];

describe('with the database files run in order, then lockdown.sql', () => {
  let db;
  beforeAll(async () => {
    db = await supabaseLikeDb();
    await load(db, ORDER);
    await load(db, ['lockdown', 'lockdown']); // (safe to run twice)
  }, 90000);

  it('lets the signed-in app call exactly the listed functions, and nothing else', async () => {
    const got = await callable(db, 'authenticated');
    expect(got.filter((n) => !SIGNED_IN.includes(n) && !OPEN_TO_ALL.includes(n))).toEqual([]); // nothing unlisted is open
    expect(SIGNED_IN.concat(OPEN_TO_ALL).filter((n) => !got.includes(n))).toEqual([]); // nothing listed got shut by mistake
  });

  it('lets someone who is not signed in call only the anonymous statistics functions', async () => {
    expect(await callable(db, 'anon')).toEqual(OPEN_TO_ALL);
  });

  it('keeps the payment, matchmaking and clean-up functions out of reach of both', async () => {
    for (const role of ['anon', 'authenticated']) {
      const got = await callable(db, role);
      expect(MUST_BE_CLOSED.filter((n) => got.includes(n)), role).toEqual([]);
    }
  });

  it('gives nobody signed out any way to write, and nobody any way to truncate or alter a table', async () => {
    const rows = (await db.query(`
      SELECT c.relname,
        has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE') AS anon_writes,
        has_table_privilege('authenticated', c.oid, 'TRUNCATE') OR has_table_privilege('authenticated', c.oid, 'TRIGGER') OR has_table_privilege('authenticated', c.oid, 'REFERENCES') AS user_ddl
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')`)).rows;
    expect(rows.filter((r) => r.anon_writes).map((r) => r.relname)).toEqual([]);
    expect(rows.filter((r) => r.user_ddl).map((r) => r.relname)).toEqual([]);
  });

  it('puts row security on every table', async () => {
    const rows = (await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`)).rows;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('keeps the money tables and the owner views unreachable for both roles', async () => {
    const owner = ['pro_entitlements', 'pro_items', 'pro_library', 'pro_trials', 'pro_codes', 'pro_redemptions', 'pro_attempts',
      'pro_stripe_customers', 'pro_stripe_events', 'pro_v_active', 'pro_v_codes', 'pro_v_redemptions', 'player_saves_backup',
      'app_feedback', 'feedback_inbox', 'moderation_queue', 'client_diagnostics', 'content_reports'];
    for (const t of owner) {
      for (const role of ['anon', 'authenticated']) {
        const r = (await db.query(`SELECT has_table_privilege('${role}', '${t}', 'SELECT') OR has_table_privilege('${role}', '${t}', 'INSERT') OR has_table_privilege('${role}', '${t}', 'UPDATE') OR has_table_privilege('${role}', '${t}', 'DELETE') AS x`)).rows[0].x;
        expect(r, role + ' on ' + t).toBe(false);
      }
    }
  });
});

describe('an attacker with a normal account', () => {
  let db;
  const as = async (user, fn) => {
    await db.exec(`SET app.uid = '${user}'; SET ROLE authenticated;`);
    try { return await fn(); } finally { await db.exec('RESET ROLE'); }
  };
  const denied = async (user, sql, params) => { try { await as(user, () => db.query(sql, params)); return false; } catch (e) { return /permission denied|not authenticated/i.test(String(e.message)); } };
  beforeAll(async () => {
    db = await supabaseLikeDb();
    await load(db, ORDER.concat(['lockdown']));
  }, 90000);

  it('cannot give themselves Pro, a premium item, a library or a code', async () => {
    expect(await denied(A, `SELECT pro_grant('${A}', 3650)`)).toBe(true);
    expect(await denied(A, `SELECT pro_grant_until('${A}', now() + interval '3000 days', 'lifetime', 'stripe', false)`)).toBe(true);
    expect(await denied(A, `SELECT pro_grant_item('${A}', 'avatar_m_king', 'stripe')`)).toBe(true);
    expect(await denied(A, `SELECT pro_grant_library('${A}')`)).toBe(true);
    expect(await denied(A, `SELECT pro_make_code(3650)`)).toBe(true);
    expect(await denied(A, `INSERT INTO pro_entitlements (user_id, until) VALUES ('${A}', now() + interval '1 year')`)).toBe(true);
    expect(await denied(A, `INSERT INTO pro_items (user_id, item_id) VALUES ('${A}', 'avatar_m_king')`)).toBe(true);
    const mine = (await as(A, () => db.query('SELECT get_my_pro() AS r'))).rows[0].r;
    expect(mine.active).toBe(false);
    expect(mine.items).toEqual([]);
  });

  it('cannot take Pro or items away from someone else, or read who holds what', async () => {
    await db.query(`SELECT pro_grant('${B}', 30, 'yearly', 'stripe')`);
    await db.query(`SELECT pro_grant_item('${B}', 'avatar_m_king', 'stripe')`);
    expect(await denied(A, `SELECT pro_revoke('${B}')`)).toBe(true);
    expect(await denied(A, `SELECT pro_revoke_item('${B}', 'avatar_m_king')`)).toBe(true);
    expect(await denied(A, `SELECT pro_customer_user('cus_x')`)).toBe(true);
    expect(await denied(A, `SELECT * FROM pro_entitlements`)).toBe(true);
    expect((await as(B, () => db.query('SELECT get_my_pro() AS r'))).rows[0].r.active).toBe(true);
  });

  it('cannot settle a match for themselves, add clan points, or wipe the statistics', async () => {
    expect(await denied(A, `SELECT ranked_apply('${A}', 1000, 1000, 'win')`)).toBe(true);
    expect(await denied(A, `SELECT cohort_add_war_points('${A}', 100)`)).toBe(true);
    expect(await denied(A, `SELECT analytics_purge(0)`)).toBe(true);
  });

  it('cannot write another player\'s save, profile or scores', async () => {
    await as(B, () => db.query(`SELECT force_save('{"coins":900}'::jsonb, 40)`));
    expect(await denied(A, `UPDATE player_saves SET data = '{}'`)).toBe(true);
    expect(await denied(B, `DELETE FROM player_saves`)).toBe(true);                                     // (not even their own: a hostile page could wipe it)
    expect((await as(B, () => db.query('SELECT count(*)::int AS n FROM player_saves'))).rows[0].n).toBe(1);
    expect((await as(A, () => db.query('SELECT data FROM player_saves'))).rows).toHaveLength(0);
    expect(await denied(A, `UPDATE player_profiles SET player_name = 'hax' WHERE user_id = '${B}'`)).toBe(true);
    expect(await denied(A, `INSERT INTO scores (user_id, player_name, score, mode) VALUES ('${B}', 'x', 1, 'endless')`)).toBe(false); // refused by row security, not a missing privilege
    expect((await as(A, () => db.query(`SELECT count(*)::int AS n FROM scores WHERE user_id = '${B}'`))).rows[0].n).toBe(0);
  });
});

describe('an attacker cannot forge friendships, invites or profile records', () => {
  let db;
  const C = '33333333-3333-4333-8333-333333333333';
  const as = async (user, fn) => {
    await db.exec(`SET app.uid = '${user}'; SET ROLE authenticated;`);
    try { return await fn(); } finally { await db.exec('RESET ROLE'); }
  };
  const fails = async (user, sql) => { try { await as(user, () => db.query(sql)); return false; } catch (e) { return true; } };
  beforeAll(async () => {
    db = await supabaseLikeDb();
    await db.exec(`INSERT INTO auth.users VALUES ('${C}', 'c@example.com')`);
    await load(db, ORDER.concat(['lockdown']));
    await as(A, () => db.query(`INSERT INTO friends (requester_id, addressee_id) VALUES ('${A}', '${B}')`)); // A asks B
  }, 90000);

  it('the person asked can accept or decline, but cannot rewrite who the friendship is between', async () => {
    expect(await fails(B, `UPDATE friends SET requester_id = '${C}', status = 'accepted'`)).toBe(true);   // would make C "friends" with B without C agreeing
    expect(await fails(B, `UPDATE friends SET addressee_id = '${C}'`)).toBe(true);
    await as(B, () => db.query(`UPDATE friends SET status = 'accepted'`));
    expect((await db.query(`SELECT requester_id, status FROM friends`)).rows[0]).toMatchObject({ requester_id: A, status: 'accepted' });
    expect((await as(C, () => db.query(`SELECT count(*)::int AS n FROM friends`))).rows[0].n).toBe(0);
  });

  it('nobody else can touch the friendship', async () => {
    expect((await as(C, () => db.query(`UPDATE friends SET status = 'declined'`))).affectedRows).toBe(0);
    expect((await as(A, () => db.query(`UPDATE friends SET status = 'declined'`))).affectedRows).toBe(0); // (the asker cannot answer for B)
  });

  it('invites can be answered but not re-addressed', async () => {
    await as(A, () => db.query(`INSERT INTO match_invites (from_user, to_user, room_code) VALUES ('${A}', '${B}', 'ABCDE')`));
    expect(await fails(B, `UPDATE match_invites SET from_user = '${C}', status = 'accepted'`)).toBe(true);
    expect(await fails(A, `UPDATE match_invites SET to_user = '${C}', status = 'cancelled'`)).toBe(true);
    await as(B, () => db.query(`UPDATE match_invites SET status = 'accepted'`));
  });

  it('a profile can only be written through the function that keeps bests from going down', async () => {
    await as(A, () => db.query(`SELECT upsert_player_profile('${A}', 'Alice', 'avatar_intern', '{}', 100, 5, true)`));
    expect(await fails(A, `UPDATE player_profiles SET best_score = 999999999`)).toBe(true);
    expect(await fails(A, `INSERT INTO player_profiles (user_id, player_name) VALUES ('${C}', 'Fake')`)).toBe(true);
    await as(A, () => db.query(`SELECT upsert_player_profile('${A}', 'Alice', 'avatar_intern', '{}', 10, 1, true)`));
    expect((await db.query(`SELECT best_score FROM player_profiles WHERE user_id = '${A}'`)).rows[0].best_score).toBe(100); // (bests never go down)
  });
});

describe('each file on its own already closes what it owns (so a missed lockdown step is not a hole)', () => {
  it('keeps the payment and internal functions closed without lockdown.sql, and friendships cannot be re-pointed', async () => {
    const db = await supabaseLikeDb();
    await load(db, ORDER);
    const colUpdate = async (t, c) => (await db.query(`SELECT has_column_privilege('authenticated', 'public.${t}', '${c}', 'UPDATE') AS x`)).rows[0].x;
    expect(await colUpdate('friends', 'requester_id')).toBe(false);
    expect(await colUpdate('friends', 'status')).toBe(true);
    expect(await colUpdate('match_invites', 'to_user')).toBe(false);
    for (const role of ['anon', 'authenticated']) {
      const got = await callable(db, role);
      expect(MUST_BE_CLOSED.filter((n) => got.includes(n)), role).toEqual([]);
    }
  }, 90000);
});


describe('database/audit.sql, the check the owner runs on the live project', () => {
  const text = readFileSync('database/audit.sql', 'utf8');
  const listFrom = (sql, marker) => {
    const at = sql.indexOf('ARRAY[', sql.indexOf(marker));
    return (sql.slice(at, sql.indexOf(']', at)).match(/'([a-z_]+)'/g) || []).map((x) => x.replace(/'/g, '')).sort();
  };

  it('uses the same lists as lockdown.sql and this test', () => {
    const lock = readFileSync('database/lockdown.sql', 'utf8');
    expect(listFrom(text, 'signed_in AS')).toEqual(SIGNED_IN.slice().sort());
    expect(listFrom(lock, 'signed_in text[]')).toEqual(SIGNED_IN.slice().sort());
    expect(listFrom(text, 'open_to_all AS')).toEqual(OPEN_TO_ALL.slice().sort());
    expect(listFrom(lock, 'open_to_all text[]')).toEqual(OPEN_TO_ALL.slice().sort());
  });

  it('finds the holes on a database with only Supabase\'s default grants, and finds nothing once locked down', async () => {
    const open = await supabaseLikeDb();
    await load(open, ORDER.filter((f) => f !== 'policies').concat([]));
    const before = (await open.query(text.replace(/;\s*$/, ''))).rows;
    expect(before.length).toBeGreaterThan(10);
    expect(before.map((r) => r.problem)).toContain('function a signed-in player can call that the app does not use');

    const locked = await supabaseLikeDb();
    await load(locked, ORDER.concat(['lockdown']));
    const after = (await locked.query(text.replace(/;\s*$/, ''))).rows;
    expect(after).toEqual([]);
  }, 120000);

  it('every function that runs with the owner\'s rights fixes its search path', async () => {
    const db = await supabaseLikeDb();
    await load(db, ORDER.concat(['lockdown']));
    const rows = (await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND NOT coalesce(p.proconfig::text ILIKE '%search_path=%', false)`)).rows;
    expect(rows).toEqual([]);
  }, 120000);
});

describe('deleting an account while a subscription is still billing', () => {
  let db;
  const as = async (user, fn) => {
    await db.exec(`SET app.uid = '${user}'; SET ROLE authenticated;`);
    try { return await fn(); } finally { await db.exec('RESET ROLE'); }
  };
  beforeAll(async () => {
    db = await supabaseLikeDb();
    await load(db, ORDER.concat(['lockdown']));
  }, 90000);

  it('is refused by the database (the payment function cancels it first), but a lifetime purchase or a trial does not block it', async () => {
    await db.query(`SELECT pro_grant_until('${A}', now() + interval '20 days', 'monthly', 'stripe', false)`);
    let message = '';
    try { await as(A, () => db.query('SELECT delete_my_account()')); } catch (e) { message = String(e.message); }
    expect(message).toMatch(/subscription that is still billing/i);
    expect((await db.query(`SELECT count(*)::int AS n FROM auth.users WHERE id = '${A}'`)).rows[0].n).toBe(1);

    await db.query(`SELECT pro_grant_until('${B}', now() + interval '3000 days', 'lifetime', 'stripe', false)`);
    await db.query(`SELECT pro_grant_item('${B}', 'trail_fire', 'stripe', 'pi_1')`);
    await db.query(`SELECT pro_link_customer('cus_B', '${B}')`);
    await as(B, () => db.query('SELECT delete_my_account()'));
    expect((await db.query(`SELECT count(*)::int AS n FROM auth.users WHERE id = '${B}'`)).rows[0].n).toBe(0);
    // ... and their payment records went with them
    for (const t of ['pro_entitlements', 'pro_items', 'pro_stripe_customers']) {
      expect((await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = '${B}'`)).rows[0].n, t).toBe(0);
    }
  });
});
