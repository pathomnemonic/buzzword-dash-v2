// @vitest-environment node
//
// The two payment functions, run as the servers would run them (a stand-in for Deno, for Stripe and for the database),
// to check the wiring that the rule tests in billing.test.js cannot see: who is let in, what is charged, what is granted.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signPayload } from '../../supabase/functions/_shared/billing.js';
import { PREMIUM_ITEMS } from '../../supabase/functions/_shared/premium.js';

const SECRET = 'whsec_test';
const ENVV = {
  STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET, SITE_URL: 'https://me.github.io/dx',
  STRIPE_PRICE_YEARLY: 'price_y', STRIPE_PRICE_LIFETIME: 'price_l', SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'svc'
};

let db;          // what the fake database was asked to do
let stripeCalls; // what Stripe was asked
let users;       // jwt -> user
let owned;       // item ids the member already owns
let held;        // pro_entitlements row for the member
let dbReady;
let stripeReply;
let customerId;   // the member's Stripe customer id ('' for none)
let deleted;       // users deleted through the auth admin API
let cancelFails;

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    auth: { getUser: async (jwt) => ({ data: { user: users[jwt] || null } }), admin: { deleteUser: async (id) => { deleted.push(id); return { error: null }; } } },
    rpc: async (name, args) => {
      db.push([name, args]);
      if (name === 'pro_has_item') return dbReady ? { data: owned.includes(args.p_item), error: null } : { data: null, error: { message: 'function does not exist' } };
      if (name === 'pro_user_customer') return { data: customerId, error: null };
      return { data: null, error: null };
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: held }) }) }) })
  })
}));

let handlers;
async function boot(file) {
  vi.resetModules();
  handlers = null;
  globalThis.Deno = { env: { get: (k) => ENVV[k] }, serve: (fn) => { handlers = fn; } };
  await import(file + '?t=' + Math.random());
  return handlers;
}

beforeEach(() => {
  db = []; stripeCalls = []; owned = []; held = null; dbReady = true; customerId = ''; deleted = []; cancelFails = false;
  users = { good: { id: 'u1', email: 'a@example.com', is_anonymous: false }, guest: { id: 'g1', email: '', is_anonymous: true } };
  stripeReply = (path) => ({ id: 'cs_1', url: 'https://checkout.stripe.com/pay/cs_1', data: [] });
  globalThis.fetch = vi.fn(async (url, init) => {
    const path = String(url).replace('https://api.stripe.com/v1/', '');
    stripeCalls.push({ path, method: (init && init.method) || 'GET', body: init && init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null });
    if (cancelFails && init && init.method === 'DELETE') return { ok: false, status: 500, json: async () => ({ error: { message: 'stripe is down' } }) };
    return { ok: true, status: 200, json: async () => stripeReply(path) };
  });
});

const post = (body, headers) => new Request('https://fn/', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('stripe-webhook', () => {
  const signed = async (event, over) => {
    const raw = JSON.stringify(event);
    const t = (over && over.t) || Math.floor(Date.now() / 1000);
    const sig = await signPayload(raw, (over && over.secret) || SECRET, t);
    return post(raw, { 'stripe-signature': 't=' + t + ',v1=' + sig });
  };
  const itemEvent = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { client_reference_id: 'u1', payment_status: 'paid', customer: 'cus_1', metadata: { kind: 'item', item_id: 'trail_fire', user_id: 'u1' } } } };

  it('refuses anything that is not a signed POST', async () => {
    const h = await boot('../../supabase/functions/stripe-webhook/index.js');
    expect((await h(new Request('https://fn/', { method: 'GET' }))).status).toBe(405);
    expect((await h(post(itemEvent))).status).toBe(400);                                    // no signature
    expect((await h(await signed(itemEvent, { secret: 'whsec_other' }))).status).toBe(400); // wrong secret
    expect((await h(await signed(itemEvent, { t: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(400); // an old, replayed event
    const tampered = await signed(itemEvent);
    const forged = post(JSON.stringify({ ...itemEvent, data: { object: { ...itemEvent.data.object, client_reference_id: 'attacker' } } }), { 'stripe-signature': tampered.headers.get('stripe-signature') });
    expect((await h(forged)).status).toBe(400);                                              // the body was changed after signing
    expect(db).toEqual([]);                                                                  // nothing was granted by any of them
  });

  it('gives a paid item to the buyer named in the signed event, once recorded', async () => {
    const h = await boot('../../supabase/functions/stripe-webhook/index.js');
    stripeReply = () => ({ latest_charge: { refunded: false, disputed: false } });
    const res = await h(await signed(itemEvent));
    expect(res.status).toBe(200);
    expect(db.map((c) => c[0])).toEqual(['pro_link_customer', 'pro_grant_item', 'pro_event_once']);
    expect(db[1][1]).toEqual({ p_user: 'u1', p_item: 'trail_fire', p_source: 'stripe', p_ref: null });
  });

  it('does not hand back a purchase whose payment was already refunded', async () => {
    const h = await boot('../../supabase/functions/stripe-webhook/index.js');
    stripeReply = () => ({ latest_charge: { refunded: true } });
    const ev = { ...itemEvent, data: { object: { ...itemEvent.data.object, payment_intent: 'pi_9' } } };
    expect((await h(await signed(ev))).status).toBe(200);
    expect(db.filter((c) => c[0].startsWith('pro_grant'))).toEqual([]);
  });

  it('tells Stripe to try again when the database fails, so a payment is never lost', async () => {
    const h = await boot('../../supabase/functions/stripe-webhook/index.js');
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    expect(mod).toBeTruthy();
    const failing = { ...itemEvent, data: { object: { ...itemEvent.data.object, payment_intent: 'pi_9' } } };
    stripeReply = () => { throw new Error('stripe down'); };
    expect((await h(await signed(failing))).status).toBe(500);
  });

  it('ignores events it does not know without error', async () => {
    const h = await boot('../../supabase/functions/stripe-webhook/index.js');
    const res = await h(await signed({ id: 'evt_x', type: 'customer.created', data: { object: { id: 'cus_1' } } }));
    expect(res.status).toBe(200);
    expect(db).toEqual([]);
  });
});

describe('pro-checkout', () => {
  const call = async (h, body, jwt) => {
    const res = await h(post(body, jwt ? { authorization: 'Bearer ' + jwt } : {}));
    return { status: res.status, body: await res.json() };
  };

  it('needs a real signed-in account to buy anything', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    expect((await call(h, { action: 'checkout', plan: 'yearly' })).status).toBe(401);
    expect((await call(h, { action: 'checkout', plan: 'yearly' }, 'nobody')).status).toBe(401);
    expect((await call(h, { action: 'checkout', plan: 'yearly' }, 'guest')).status).toBe(403);
    expect(stripeCalls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('charges the catalog price for an item, whatever the page asks for', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    const r = await call(h, { action: 'item', item: 'trail_fire', price: 1, amount: 1, unit_amount: 1, user_id: 'someone-else', name: 'x' }, 'good');
    expect(r.status).toBe(200);
    const sent = stripeCalls.find((c) => c.path === 'checkout/sessions').body;
    expect(sent['line_items[0][price_data][unit_amount]']).toBe(String(PREMIUM_ITEMS.trail_fire));
    expect(sent['metadata[user_id]']).toBe('u1');           // the buyer is the signed-in account, never a value from the page
    expect(sent['client_reference_id']).toBe('u1');
    expect(sent['success_url'].startsWith('https://me.github.io/dx/')).toBe(true);
  });

  it('does not sell what is not for sale, what the member owns, or anything while the database is not ready', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    expect((await call(h, { action: 'item', item: 'avatar_intern' }, 'good')).status).toBe(400);   // not a premium item
    expect((await call(h, { action: 'item', item: '__proto__' }, 'good')).status).toBe(400);
    expect((await call(h, { action: 'item', item: 'constructor' }, 'good')).status).toBe(400);
    owned = ['trail_fire'];
    expect((await call(h, { action: 'item', item: 'trail_fire' }, 'good')).status).toBe(409);
    owned = []; dbReady = false;
    const r = await call(h, { action: 'item', item: 'trail_fire' }, 'good');
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not been charged/i);
    expect(stripeCalls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('sells a plan at the price set on the server, and refuses an unknown plan or a second lifetime', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    expect((await call(h, { action: 'checkout', plan: 'free-forever' }, 'good')).status).toBe(400);
    expect((await call(h, { action: 'checkout', plan: 'monthly' }, 'good')).status).toBe(400);   // no price set for it
    const ok = await call(h, { action: 'checkout', plan: 'yearly', price: 'price_cheap' }, 'good');
    expect(ok.status).toBe(200);
    expect(stripeCalls.find((c) => c.path === 'checkout/sessions').body['line_items[0][price]']).toBe('price_y');
    held = { plan: 'lifetime', until: new Date(Date.now() + 86400000 * 3000).toISOString() };
    stripeCalls.length = 0;
    expect((await call(h, { action: 'checkout', plan: 'lifetime' }, 'good')).status).toBe(409);
    expect(stripeCalls.filter((c) => c.method === 'POST')).toEqual([]);
  });
});


describe('pro-checkout: deleting an account', () => {
  const call = async (h, body, jwt) => {
    const res = await h(post(body, jwt ? { authorization: 'Bearer ' + jwt } : {}));
    return { status: res.status, body: await res.json() };
  };

  it('cancels a subscription that is still billing, then deletes the account', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    customerId = 'cus_1';
    stripeReply = (path) => (path.startsWith('subscriptions?') ? { data: [{ id: 'sub_live', status: 'active' }, { id: 'sub_old', status: 'canceled' }, { id: 'sub_due', status: 'past_due' }] } : {});
    const r = await call(h, { action: 'delete_account' }, 'good');
    expect(r.status).toBe(200);
    expect(stripeCalls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['subscriptions/sub_live', 'subscriptions/sub_due']);
    expect(deleted).toEqual(['u1']);
    expect(db.map((c) => c[0])).toContain('pro_forget_user');
  });

  it('does NOT delete the account when the subscription could not be cancelled, so nothing keeps charging', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    customerId = 'cus_1'; cancelFails = true;
    stripeReply = (path) => (path.startsWith('subscriptions?') ? { data: [{ id: 'sub_live', status: 'active' }] } : {});
    const r = await call(h, { action: 'delete_account' }, 'good');
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/nothing was deleted/i);
    expect(deleted).toEqual([]);
  });

  it('deletes straight away when there is nothing to cancel, and never for a guest or a stranger', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    expect((await call(h, { action: 'delete_account' }, 'good')).status).toBe(200);
    expect(deleted).toEqual(['u1']);
    deleted.length = 0;
    expect((await call(h, { action: 'delete_account' }, 'guest')).status).toBe(403);
    expect((await call(h, { action: 'delete_account' })).status).toBe(401);
    expect((await call(h, { action: 'delete_account', user_id: 'someone-else' }, 'nobody')).status).toBe(401);
    expect(deleted).toEqual([]);
  });

  it('deletes only the signed-in account, whatever the page says', async () => {
    const h = await boot('../../supabase/functions/pro-checkout/index.js');
    await call(h, { action: 'delete_account', user_id: 'victim', id: 'victim' }, 'good');
    expect(deleted).toEqual(['u1']);
  });
});
