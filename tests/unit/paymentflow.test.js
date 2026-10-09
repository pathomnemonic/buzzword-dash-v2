// @vitest-environment node
//
// The payment rules (billing.js) running against the real database functions (pro.sql, on PGlite), the way the webhook
// calls them: by name, with named arguments, as PostgREST does. A name or argument that drifts between the two files
// would make a paid-for purchase silently do nothing, and the rule tests with a stand-in database cannot see that.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { handleEvent } from '../../supabase/functions/_shared/billing.js';

const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const DAY = 86400;
let db;
const now = () => Math.floor(Date.now() / 1000);

async function rpc(name, args) {
  const keys = Object.keys(args || {});
  const call = name + '(' + keys.map((k, i) => k + ' => $' + (i + 1)).join(', ') + ')';
  const r = await db.query('SELECT ' + call + ' AS v', keys.map((k) => args[k]));
  return r.rows[0].v;
}

async function asUser(user, sql) {
  await db.exec(`SET app.uid = '${user}'; SET ROLE authenticated;`);
  try { return (await db.query(sql)).rows[0]; } finally { await db.exec('RESET ROLE'); }
}
const mine = async (user) => (await asUser(user, 'SELECT get_my_pro() AS r')).r;

function deps(over) {
  return Object.assign({
    rpc, now: now(),
    getSubscription: async (id) => ({ id, status: 'active', current_period_end: now() + 30 * DAY, metadata: { user_id: U, plan: 'monthly' } })
  }, over || {});
}
const session = (over, meta) => ({ id: 'evt_' + Math.random(), type: 'checkout.session.completed', data: { object: Object.assign({ client_reference_id: U, payment_status: 'paid', customer: 'cus_1', metadata: Object.assign({ user_id: U }, meta || {}) }, over || {}) } });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"is_anonymous": false}'::jsonb $$;
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${U}'), ('${V}');
  `);
  await db.exec(readFileSync('database/pro.sql', 'utf8'));
  await db.exec(readFileSync('database/lockdown.sql', 'utf8'));
}, 60000);

beforeEach(async () => {
  await db.exec('TRUNCATE pro_entitlements, pro_items, pro_library, pro_stripe_customers, pro_stripe_events, pro_trials');
});

describe('a purchase, start to finish, through the real database', () => {
  it('a monthly subscription turns Pro on until the paid period (plus a grace), and a renewal extends it', async () => {
    expect((await mine(U)).active).toBe(false);
    expect((await handleEvent(session({ subscription: 'sub_1' }, { plan: 'monthly' }), deps())).action).toBe('subscription');
    const r = await mine(U);
    expect(r).toMatchObject({ active: true, plan: 'monthly', source: 'stripe', trial: false });
    const first = new Date(r.until).getTime();
    expect(first).toBeGreaterThan(Date.now() + 29 * DAY * 1000);

    const later = deps({ now: now() + 30 * DAY, getSubscription: async () => ({ id: 'sub_1', status: 'active', current_period_end: now() + 60 * DAY, metadata: { user_id: U, plan: 'monthly' } }) });
    const inv = { type: 'invoice.paid', data: { object: { customer: 'cus_1', subscription: 'sub_1' } } };
    expect((await handleEvent(inv, later)).action).toBe('renewal');
    expect(new Date((await mine(U)).until).getTime()).toBeGreaterThan(first + 25 * DAY * 1000);
  });

  it('delivering the same event twice changes nothing the second time', async () => {
    const ev = session({ subscription: 'sub_1' }, { plan: 'monthly' });
    await handleEvent(ev, deps());
    const a = (await mine(U)).until;
    await handleEvent(ev, deps());
    expect((await mine(U)).until).toBe(a);
    expect(await rpc('pro_event_once', { p_event: 'evt_dup', p_kind: 'x' })).toBe(true);
    expect(await rpc('pro_event_once', { p_event: 'evt_dup', p_kind: 'x' })).toBe(false);
  });

  it('lifetime, an item and the old library all arrive, and a refund of one takes back only that one', async () => {
    await handleEvent(session({ payment_intent: 'pi_l', subscription: null }, { plan: 'lifetime' }), deps());
    await handleEvent(session({ payment_intent: 'pi_i', subscription: null }, { kind: 'item', item_id: 'trail_fire' }), deps());
    await handleEvent(session({ payment_intent: 'pi_b', subscription: null }, { plan: 'library' }), deps());
    let r = await mine(U);
    expect(r).toMatchObject({ active: true, plan: 'lifetime', library: true });
    expect(r.items).toEqual(['trail_fire']);
    expect(new Date(r.until).getTime()).toBeGreaterThan(Date.now() + 3000 * DAY * 1000);

    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, metadata: { user_id: U, kind: 'item', item_id: 'trail_fire' } } } }, deps());
    r = await mine(U);
    expect(r.items).toEqual([]);
    expect(r.active).toBe(true);
    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, metadata: { user_id: U, plan: 'lifetime' } } } }, deps());
    r = await mine(U);
    expect(r.active).toBe(false);
    expect(r.library).toBe(true);
  });

  it('a refunded lifetime does not end a subscription the same person still pays for', async () => {
    const sub = { id: 'sub_1', status: 'active', current_period_end: now() + 20 * DAY, metadata: { user_id: U, plan: 'monthly' } };
    const d = deps({ getSubscription: async () => sub, listSubscriptions: async () => [sub] });
    await handleEvent(session({ subscription: 'sub_1' }, { plan: 'monthly' }), d);
    await handleEvent(session({ payment_intent: 'pi_l', subscription: null }, { plan: 'lifetime' }), d);
    expect((await mine(U)).plan).toBe('lifetime');
    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, metadata: { user_id: U, plan: 'lifetime' } } } }, d);
    const r = await mine(U);
    expect(r).toMatchObject({ active: true, plan: 'monthly' });
    // and with nothing else held, the refund ends Pro
    await db.exec('TRUNCATE pro_entitlements');
    await handleEvent(session({ payment_intent: 'pi_l2', subscription: null }, { plan: 'lifetime' }), deps({ listSubscriptions: async () => [] }));
    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, metadata: { user_id: U, plan: 'lifetime' } } } }, deps({ listSubscriptions: async () => [] }));
    expect((await mine(U)).active).toBe(false);
  });

  it('a payment refunded before its "completed" event arrives is not given', async () => {
    const out = await handleEvent(session({ payment_intent: 'pi_x', subscription: null }, { plan: 'lifetime' }), deps({ isPaymentReturned: async () => true }));
    expect(out.action).toBe('already_returned');
    expect((await mine(U)).active).toBe(false);
  });

  it('a chargeback takes the item away, and winning it gives it back', async () => {
    await handleEvent(session({ payment_intent: 'pi_i', subscription: null }, { kind: 'item', item_id: 'map_dna_helix_tunnel' }), deps());
    const meta = { user_id: U, kind: 'item', item_id: 'map_dna_helix_tunnel' };
    let charge = { id: 'ch_1', disputed: true, dispute: { status: 'needs_response' }, metadata: meta };
    const d = deps({ getCharge: async () => charge });
    await handleEvent({ type: 'charge.dispute.created', data: { object: { charge: 'ch_1' } } }, d);
    expect((await mine(U)).items).toEqual([]);
    charge = { ...charge, dispute: { status: 'won' } };
    await handleEvent({ type: 'charge.dispute.closed', data: { object: { charge: 'ch_1', status: 'won' } } }, d);
    expect((await mine(U)).items).toEqual(['map_dna_helix_tunnel']);
  });

  it('paying twice for one item keeps the first payment\'s item, returns the second, and that refund takes nothing', async () => {
    const refunds = [];
    const d = deps({ refundPayment: async (pi) => { refunds.push(pi); } });
    const pay = (pi) => session({ payment_intent: pi, subscription: null }, { kind: 'item', item_id: 'trail_fire' });
    expect((await handleEvent(pay('pi_a'), d)).action).toBe('item');
    expect((await handleEvent(pay('pi_a'), d)).action).toBe('item');                 // (the same event again)
    expect(refunds).toEqual([]);
    expect((await handleEvent(pay('pi_b'), d)).action).toBe('item_duplicate_refunded');
    expect(refunds).toEqual(['pi_b']);
    const second = { id: 'ch_b', refunded: true, payment_intent: 'pi_b', metadata: { user_id: U, kind: 'item', item_id: 'trail_fire' } };
    await handleEvent({ type: 'charge.refunded', data: { object: second } }, deps({ getCharge: async () => second }));
    expect((await mine(U)).items).toEqual(['trail_fire']);                            // the first payment still owns it
    const first = { id: 'ch_a', refunded: true, payment_intent: 'pi_a', metadata: { user_id: U, kind: 'item', item_id: 'trail_fire' } };
    await handleEvent({ type: 'charge.refunded', data: { object: first } }, deps({ getCharge: async () => first }));
    expect((await mine(U)).items).toEqual([]);                                        // refunding the first one does take it
  });

  it('one person\'s purchase never shows on another\'s account', async () => {
    await handleEvent(session({ payment_intent: 'pi_i', subscription: null }, { kind: 'item', item_id: 'trail_fire' }), deps());
    await handleEvent(session({ subscription: 'sub_1' }, { plan: 'monthly' }), deps());
    const other = await mine(V);
    expect(other.active).toBe(false);
    expect(other.items).toEqual([]);
    expect(other.library).toBe(false);
  });

  it('the free trial is once per account and never over a paid plan', async () => {
    expect((await asUser(U, 'SELECT start_my_trial() AS r')).r.ok).toBe(true);
    expect((await asUser(U, 'SELECT start_my_trial() AS r')).r.ok).toBe(false);
    await handleEvent(session({ subscription: 'sub_1' }, { plan: 'monthly' }), deps());
    const r = await mine(U);
    expect(r).toMatchObject({ active: true, plan: 'monthly', trial: false });
    expect((await asUser(V, 'SELECT start_my_trial() AS r')).r.ok).toBe(true);
    await db.exec(`DELETE FROM pro_entitlements WHERE user_id = '${V}'`);
    expect((await asUser(V, 'SELECT start_my_trial() AS r')).r.ok).toBe(false); // (spent, even after it ran out)
  });

  it('a code cannot be used twice by the same account, past its limit, or after it expires', async () => {
    const code = await rpc('pro_make_code', { p_days: 30, p_max_uses: 1 });
    expect((await asUser(U, `SELECT redeem_pro_code('${code}') AS r`)).r.ok).toBe(true);
    expect((await asUser(U, `SELECT redeem_pro_code('${code}') AS r`)).r.ok).toBe(false);
    expect((await asUser(V, `SELECT redeem_pro_code('${code}') AS r`)).r.ok).toBe(false); // (the single use is spent)
    const old = await rpc('pro_make_code', { p_days: 30, p_expires_days: 1 });
    await db.exec(`UPDATE pro_codes SET expires_at = now() - interval '1 hour' WHERE code = '${old}'`);
    expect((await asUser(V, `SELECT redeem_pro_code('${old}') AS r`)).r.ok).toBe(false);
  });
});

// Events from Stripe can arrive late, twice, or in any order. Whatever the order, the member must end up with exactly what
// Stripe says they paid for and have not got back.
describe('payment events in any order', () => {
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const shuffle = (r, a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

  const KINDS = [
    { id: 'trail_fire', meta: { kind: 'item', item_id: 'trail_fire' } },
    { id: 'map_dna_helix_tunnel', meta: { kind: 'item', item_id: 'map_dna_helix_tunnel' } },
    { id: 'lifetime', meta: { plan: 'lifetime' } }
  ];

  it('ends with exactly what was paid for and not given back, for 400 random shuffles, repeats and outcomes', async () => {
    const problems = [];
    for (let seed = 1; seed <= 400; seed++) {
      await db.exec('TRUNCATE pro_entitlements, pro_items, pro_library, pro_stripe_customers, pro_stripe_events, pro_trials');
      const r = rng(seed);
      const buys = KINDS.filter(() => r() < 0.8).map((k) => {
        const roll = r();
        // what finally happened to the money
        const outcome = roll < 0.5 ? 'kept' : roll < 0.7 ? 'refunded' : roll < 0.82 ? 'lost' : roll < 0.94 ? 'won' : 'open';
        return { ...k, pi: 'pi_' + seed + k.id, ch: 'ch_' + seed + k.id, outcome };
      });
      const stripeCharge = (b) => ({
        id: b.ch, refunded: b.outcome === 'refunded', disputed: ['lost', 'won', 'open'].includes(b.outcome),
        dispute: b.outcome === 'lost' ? { status: 'lost' } : b.outcome === 'won' ? { status: 'won' } : b.outcome === 'open' ? { status: 'under_review' } : null,
        metadata: Object.assign({ user_id: U }, b.meta)
      });
      const byCharge = Object.fromEntries(buys.map((b) => [b.ch, b]));
      const events = [];
      buys.forEach((b) => {
        events.push(session({ payment_intent: b.pi, subscription: null }, b.meta));
        if (b.outcome === 'refunded') events.push({ id: 'e', type: 'charge.refunded', data: { object: { id: b.ch, refunded: true, metadata: { user_id: U, ...b.meta } } } });
        if (['lost', 'won', 'open'].includes(b.outcome)) events.push({ id: 'e', type: 'charge.dispute.created', data: { object: { charge: b.ch } } });
        if (b.outcome === 'lost' || b.outcome === 'won') events.push({ id: 'e', type: 'charge.dispute.closed', data: { object: { charge: b.ch, status: b.outcome } } });
      });
      // every event arrives at least once, in any order, some more than once
      const delivered = shuffle(r, events.concat(events.filter(() => r() < 0.3)));
      const d = deps({
        getCharge: async (id) => stripeCharge(byCharge[id]),
        isPaymentReturned: async (pi) => { const b = buys.find((x) => x.pi === pi); return b ? ['refunded', 'lost', 'open'].includes(b.outcome) : false; }
      });
      for (const ev of delivered) await handleEvent(ev, d);

      const have = await mine(U);
      const expectedItems = buys.filter((b) => b.meta.kind === 'item' && ['kept', 'won'].includes(b.outcome)).map((b) => b.id).sort();
      const expectLife = buys.some((b) => b.id === 'lifetime' && ['kept', 'won'].includes(b.outcome));
      if (JSON.stringify((have.items || []).slice().sort()) !== JSON.stringify(expectedItems) || (have.active && have.plan === 'lifetime') !== expectLife) {
        problems.push({ seed, buys: buys.map((b) => b.id + ':' + b.outcome), order: delivered.map((e) => e.type.replace('checkout.session.completed', 'paid') + (e.data.object.status ? ':' + e.data.object.status : '')), have: { active: have.active, plan: have.plan, items: have.items }, expectedItems, expectLife });
        if (problems.length >= 3) break;
      }
    }
    expect(problems).toEqual([]);
  }, 120000);
});
