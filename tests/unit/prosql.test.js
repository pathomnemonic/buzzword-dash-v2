// @vitest-environment node
//
// Dx Dash Pro backend: entitlements and codes. The app can only ask and redeem; it cannot grant itself anything.

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db;

async function as(user, fn) {
  await db.exec(`SET app.uid = '${user || ''}'; SET ROLE authenticated;`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
const one = async (user, sql, params) => (await as(user, () => db.query(sql, params))).rows[0];
const rejects = async (user, sql, params) => { try { await as(user, () => db.query(sql, params)); return false; } catch (e) { return true; } };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('is_anonymous', coalesce(nullif(current_setting('app.anon', true), ''), 'false')::boolean) $$;
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated, anon;
  `);
  for (let i = 0; i < 2; i++) await db.exec(readFileSync('database/pro.sql', 'utf8')); // safe to run twice
}, 60000);

describe('Dx Dash Pro backend', () => {
  it('says "no" to someone with nothing, and to someone not signed in', async () => {
    expect((await one(A, 'SELECT get_my_pro() AS r')).r.active).toBe(false);
    expect((await one(null, 'SELECT get_my_pro() AS r')).r.active).toBe(false);
  });

  it('the app cannot read or write the tables, or grant itself Pro', async () => {
    expect(await rejects(A, 'SELECT * FROM pro_entitlements')).toBe(true);
    expect(await rejects(A, "INSERT INTO pro_entitlements (user_id, until) VALUES ('" + A + "', now() + interval '1 year')")).toBe(true);
    expect(await rejects(A, 'SELECT * FROM pro_codes')).toBe(true);
    expect(await rejects(A, "SELECT pro_grant('" + A + "', 30)")).toBe(true);
    expect(await rejects(A, 'SELECT * FROM pro_v_active')).toBe(true);
  });

  it('an owner grant turns Pro on, extends it, and a revoke turns it off', async () => {
    await db.query("SELECT pro_grant($1, 30, 'yearly', 'stripe')", [A]);
    const r = (await one(A, 'SELECT get_my_pro() AS r')).r;
    expect(r).toMatchObject({ active: true, plan: 'yearly', source: 'stripe', trial: false });
    const first = new Date(r.until).getTime();
    await db.query("SELECT pro_grant($1, 30, 'yearly', 'stripe')", [A]);
    const second = new Date((await one(A, 'SELECT get_my_pro() AS r')).r.until).getTime();
    expect(second - first).toBeGreaterThan(29 * 86400000);
    await db.query('SELECT pro_revoke($1)', [A]);
    expect((await one(A, 'SELECT get_my_pro() AS r')).r.active).toBe(false);
  });

  it('remembers when Pro began: kept across renewals, restarted after a lapse or when a trial becomes a purchase', async () => {
    const C = '88888888-8888-4888-8888-888888888888';
    const since = async () => new Date((await one(C, 'SELECT get_my_pro() AS r')).r.since).getTime();
    await db.query("SELECT pro_grant_until($1, now() + interval '30 days', 'monthly', 'stripe', false)", [C]);
    expect(Math.abs((await since()) - Date.now())).toBeLessThan(60000);
    await db.query("UPDATE pro_entitlements SET started_at = now() - interval '90 days' WHERE user_id = $1", [C]);
    const old = await since();
    await db.query("SELECT pro_grant_until($1, now() + interval '60 days', 'monthly', 'stripe', false)", [C]);
    expect(await since()).toBe(old); // a renewal does not move it
    await db.query("UPDATE pro_entitlements SET until = now() - interval '1 day' WHERE user_id = $1", [C]);
    await db.query("SELECT pro_grant_until($1, now() + interval '30 days', 'monthly', 'stripe', false)", [C]);
    expect(Math.abs((await since()) - Date.now())).toBeLessThan(60000); // after a lapse it starts again
    await db.query("UPDATE pro_entitlements SET trial = true, started_at = now() - interval '6 days' WHERE user_id = $1", [C]);
    await db.query("SELECT pro_grant_until($1, now() + interval '365 days', 'yearly', 'stripe', false)", [C]);
    expect(Math.abs((await since()) - Date.now())).toBeLessThan(60000); // a trial turning into a purchase starts again
  });

  it('a refunded lifetime takes back only the lifetime; a subscription held as well, or a trial, stays', async () => {
    const D = '99999999-9999-4999-8999-999999999999';
    await db.query("SELECT pro_grant_until($1, now() + interval '30 days', 'monthly', 'stripe', false)", [D]);
    await db.query('SELECT pro_revoke_plan($1, $2)', [D, 'lifetime']);
    expect((await one(D, 'SELECT get_my_pro() AS r')).r.active).toBe(true);
    await db.query("SELECT pro_grant_until($1, now() + interval '3649 days', 'lifetime', 'stripe', false)", [D]);
    expect((await one(D, 'SELECT get_my_pro() AS r')).r.plan).toBe('lifetime');
    await db.query('SELECT pro_revoke_plan($1, $2)', [D, 'lifetime']);
    expect((await one(D, 'SELECT get_my_pro() AS r')).r.active).toBe(false);
    expect(await rejects(D, "SELECT pro_revoke_plan('" + D + "', 'lifetime')")).toBe(true); // not callable by a player
  });

  it('grants never shorten, whatever the order: a lifetime outlasts a later subscription event, and an old event cannot undo a newer one', async () => {
    const F = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await db.query("SELECT pro_grant_until($1, now() + interval '3649 days', 'lifetime', 'stripe', false)", [F]);
    await db.query("SELECT pro_grant_until($1, now() + interval '30 days', 'monthly', 'stripe', false)", [F]);
    let r = (await one(F, 'SELECT get_my_pro() AS r')).r;
    expect(r.plan).toBe('lifetime');
    expect((new Date(r.until).getTime() - Date.now()) / 86400000).toBeGreaterThan(3600);
    const G = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await db.query("SELECT pro_grant_until($1, now() + interval '60 days', 'monthly', 'stripe', false)", [G]);
    await db.query("SELECT pro_grant_until($1, now() + interval '30 days', 'monthly', 'stripe', false)", [G]); // an older event arrives late
    r = (await one(G, 'SELECT get_my_pro() AS r')).r;
    expect((new Date(r.until).getTime() - Date.now()) / 86400000).toBeGreaterThan(58);
  });

  it('premium items: granted once whatever happens, listed to their owner only, kept when Pro lapses, taken back only on refund', async () => {
    const H = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const J = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    expect((await one(H, 'SELECT get_my_pro() AS r')).r.items).toEqual([]);
    await db.query("SELECT pro_grant_item($1, 'trail_rainbow', 'stripe')", [H]);
    await db.query("SELECT pro_grant_item($1, 'trail_rainbow', 'stripe')", [H]); // the same event twice
    await db.query("SELECT pro_grant_item($1, 'gear_wings', 'stripe')", [H]);
    expect((await one(H, 'SELECT get_my_pro() AS r')).r.items).toEqual(['trail_rainbow', 'gear_wings']);
    expect((await one(J, 'SELECT get_my_pro() AS r')).r.items).toEqual([]); // not shared
    // they are reported whether or not Pro is active, and survive a lapse
    await db.query("SELECT pro_grant_until($1, now() + interval '30 days', 'monthly', 'stripe', false)", [H]);
    expect((await one(H, 'SELECT get_my_pro() AS r')).r.items.length).toBe(2);
    await db.query("UPDATE pro_entitlements SET until = now() - interval '1 day' WHERE user_id = $1", [H]);
    const lapsed = (await one(H, 'SELECT get_my_pro() AS r')).r;
    expect(lapsed.active).toBe(false);
    expect(lapsed.items.length).toBe(2);
    // players cannot read the table or grant themselves anything
    expect(await rejects(H, 'SELECT * FROM pro_items')).toBe(true);
    expect(await rejects(H, "SELECT pro_grant_item('" + H + "', 'avatar_m_king', 'x')")).toBe(true);
    expect(await rejects(H, "SELECT pro_revoke_item('" + H + "', 'gear_wings')")).toBe(true);
    // a refund takes back that one item
    await db.query("SELECT pro_revoke_item($1, 'trail_rainbow')", [H]);
    expect((await one(H, 'SELECT get_my_pro() AS r')).r.items).toEqual(['gear_wings']);
    expect((await db.query("SELECT pro_has_item($1, 'gear_wings') AS h", [H])).rows[0].h).toBe(true);
  });

  it('redeems a code once per person, up to its limit', async () => {
    await db.exec("INSERT INTO pro_codes (code, days, max_uses, note) VALUES ('LAUNCH30', 30, 1, 'test')");
    expect((await one(null, "SELECT redeem_pro_code('LAUNCH30') AS r")).r.ok).toBe(false);
    const ok = (await one(B, "SELECT redeem_pro_code('  launch30 ') AS r")).r;
    expect(ok.ok).toBe(true);
    expect((await one(B, 'SELECT get_my_pro() AS r')).r).toMatchObject({ active: true, source: 'code' });
    expect((await one(B, "SELECT redeem_pro_code('LAUNCH30') AS r")).r.error).toMatch(/already|not valid/);
    // the single use is spent
    expect((await one(A, "SELECT redeem_pro_code('LAUNCH30') AS r")).r.ok).toBe(false);
  });

  it('refuses unknown and expired codes, and stops guessing after ten wrong tries', async () => {
    await db.exec("INSERT INTO pro_codes (code, days, max_uses, expires_at) VALUES ('OLDCODE', 7, 10, now() - interval '1 day')");
    expect((await one(A, "SELECT redeem_pro_code('OLDCODE') AS r")).r.ok).toBe(false);
    for (let i = 0; i < 12; i++) await one(A, "SELECT redeem_pro_code('NOPE" + i + "') AS r");
    const r = (await one(A, "SELECT redeem_pro_code('NOPE99') AS r")).r;
    expect(r.error).toMatch(/Too many/);
    // even a good code is refused while locked out
    await db.exec("INSERT INTO pro_codes (code, days, max_uses) VALUES ('GOODONE', 7, 10)");
    expect((await one(A, "SELECT redeem_pro_code('GOODONE') AS r")).r.ok).toBe(false);
  });

  it('rejects malformed codes and silly grants at the table', async () => {
    await expect(db.exec("INSERT INTO pro_codes (code, days) VALUES ('lower', 5)")).rejects.toThrow();
    await expect(db.exec("INSERT INTO pro_codes (code, days) VALUES ('GOOD1', 0)")).rejects.toThrow();
    await expect(db.query("SELECT pro_grant($1, 99999)", [A])).rejects.toThrow();
  });

  it('the owner views show who has Pro and how codes are used', async () => {
    const active = (await db.query('SELECT * FROM pro_v_active')).rows;
    expect(active.reduce((n, r) => n + Number(r.users), 0)).toBeGreaterThanOrEqual(1);
    expect((await db.query("SELECT used FROM pro_v_codes WHERE code = 'LAUNCH30'")).rows[0].used).toBe(1);
  });

  describe('the free trial', () => {
    const T1 = '55555555-5555-4555-8555-555555555555';
    const T2 = '66666666-6666-4666-8666-666666666666';
    const G = '77777777-7777-4777-8777-777777777777';
    const guest = async (sql) => { await db.exec("SET app.anon = 'true'"); try { return await one(G, sql); } finally { await db.exec("SET app.anon = 'false'"); } };

    it('is offered to a signed-in account, once, and gives seven days', async () => {
      expect((await one(T1, 'SELECT get_my_pro() AS r')).r).toMatchObject({ active: false, trial_available: true });
      const r = (await one(T1, 'SELECT start_my_trial() AS r')).r;
      expect(r).toMatchObject({ ok: true, days: 7 });
      const days = (new Date(r.until).getTime() - Date.now()) / 86400000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
      expect((await one(T1, 'SELECT get_my_pro() AS r')).r).toMatchObject({ active: true, trial: true, plan: 'trial', source: 'trial', trial_available: false });
      expect((await one(T1, 'SELECT start_my_trial() AS r')).r.ok).toBe(false);
    });

    it('is never offered again after it ends', async () => {
      await db.query("UPDATE pro_entitlements SET until = now() - interval '1 hour' WHERE user_id = $1", [T1]);
      expect((await one(T1, 'SELECT get_my_pro() AS r')).r).toMatchObject({ active: false, trial_available: false });
      expect((await one(T1, 'SELECT start_my_trial() AS r')).r.error).toMatch(/already been used/);
    });

    it('is not for a guest, someone not signed in, or someone who already has Pro', async () => {
      expect((await guest('SELECT get_my_pro() AS r')).r.trial_available).toBe(false);
      expect((await guest('SELECT start_my_trial() AS r')).r).toMatchObject({ ok: false });
      expect((await one(null, 'SELECT start_my_trial() AS r')).r.ok).toBe(false);
      await db.query("SELECT pro_grant($1, 30, 'monthly', 'stripe')", [T2]);
      expect((await one(T2, 'SELECT start_my_trial() AS r')).r.error).toMatch(/already have Pro/);
      expect((await one(T2, 'SELECT get_my_pro() AS r')).r.trial_available).toBe(false);
    });

    it('cannot be read or granted by the app directly', async () => {
      expect(await rejects(T1, 'SELECT * FROM pro_trials')).toBe(true);
      expect(await rejects(T1, "INSERT INTO pro_trials (user_id) VALUES ('" + T1 + "')")).toBe(true);
    });
  });

  describe('web payments', () => {
    const C = '33333333-3333-4333-8333-333333333333';
    const D = '44444444-4444-4444-8444-444444444444';

    it('a paid period lasts exactly until its end and never shortens a longer grant', async () => {
      await db.query("SELECT pro_grant_until($1, now() + interval '30 days', 'monthly', 'stripe')", [C]);
      let r = (await one(C, 'SELECT get_my_pro() AS r')).r;
      expect(r).toMatchObject({ active: true, plan: 'monthly', source: 'stripe', library: false });
      const first = new Date(r.until).getTime();
      await db.query("SELECT pro_grant_until($1, now() + interval '10 days', 'monthly', 'stripe')", [C]); // an older renewal arriving late
      expect(new Date((await one(C, 'SELECT get_my_pro() AS r')).r.until).getTime()).toBe(first);
      await db.query("SELECT pro_grant_until($1, now() + interval '3650 days', 'lifetime', 'stripe')", [C]);
      r = (await one(C, 'SELECT get_my_pro() AS r')).r;
      expect(r.plan).toBe('lifetime');
      await expect(db.query("SELECT pro_grant_until($1, now() + interval '9999 days')", [C])).rejects.toThrow();
    });

    it('the one-time library unlock opens the cards without turning Pro on, and can be taken back', async () => {
      await db.query("SELECT pro_grant_library($1)", [D]);
      await db.query("SELECT pro_grant_library($1)", [D]); // twice is fine
      expect((await one(D, 'SELECT get_my_pro() AS r')).r).toMatchObject({ active: false, library: true });
      await db.query("SELECT pro_revoke_library($1)", [D]);
      expect((await one(D, 'SELECT get_my_pro() AS r')).r.library).toBe(false);
    });

    it('remembers which Stripe customer is whose, and sees each webhook event only once', async () => {
      await db.query("SELECT pro_link_customer('cus_123', $1)", [C]);
      expect((await db.query("SELECT pro_customer_user('cus_123') AS u")).rows[0].u).toBe(C);
      expect((await db.query("SELECT pro_user_customer($1) AS c", [C])).rows[0].c).toBe('cus_123');
      expect((await db.query("SELECT pro_customer_user('cus_nope') AS u")).rows[0].u).toBeNull();
      expect((await db.query("SELECT pro_event_once('evt_1', 'checkout.session.completed') AS ok")).rows[0].ok).toBe(true);
      expect((await db.query("SELECT pro_event_once('evt_1', 'checkout.session.completed') AS ok")).rows[0].ok).toBe(false);
    });

    it('the app itself can run none of them', async () => {
      for (const sql of ["SELECT pro_grant_until('" + A + "', now() + interval '1 day')", "SELECT pro_grant_library('" + A + "')", "SELECT pro_link_customer('x', '" + A + "')", "SELECT pro_event_once('e', 'k')", 'SELECT * FROM pro_library', 'SELECT * FROM pro_stripe_customers']) {
        expect(await rejects(A, sql), sql).toBe(true);
      }
    });
  });
});
