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
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
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
      expect((await one(D, 'SELECT get_my_pro() AS r')).r).toEqual({ active: false, library: true });
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
