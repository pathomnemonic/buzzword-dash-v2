// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  PRODUCTS, configuredProducts, productFor, periodOf, describePrice, periodEnd, subscriptionUntil, checkoutParams,
  anyProductFor, chargeReturned, portalConfig, invoiceSubscriptionId, grantsFromSubscriptions, itemCheckoutParams, parseSignatureHeader, signPayload, verifyStripeSignature, handleEvent, GRACE_SECONDS
} from '../../supabase/functions/_shared/billing.js';

const NOW = 1_800_000_000;
const ENV = { STRIPE_PRICE_YEARLY: 'price_y', STRIPE_PRICE_LIFETIME: 'price_l', STRIPE_PRICE_LIBRARY: 'price_b', SITE_URL: 'https://me.github.io/dx/' };

function fake(over) {
  const calls = [];
  return {
    calls,
    deps: Object.assign({
      now: NOW,
      rpc: async (name, args) => { calls.push([name, args]); return name === 'pro_customer_user' ? 'user-from-customer' : null; },
      getSubscription: async (id) => ({ id, status: 'active', current_period_end: NOW + 30 * 86400, metadata: { user_id: 'u1', plan: 'yearly' } })
    }, over || {})
  };
}

describe('products and prices', () => {
  it('sells four products, found by id or plan name, and shows the ones with a price set', () => {
    expect(Object.keys(PRODUCTS)).toEqual(['dxdash_pro_yearly', 'dxdash_pro_pass3m', 'dxdash_pro_monthly', 'dxdash_pro_lifetime']);
    expect(productFor('yearly').id).toBe('dxdash_pro_yearly');
    expect(productFor('nope')).toBeNull();
    expect(productFor('dxdash_library')).toBeNull();                      // the Full Library is not sold any more...
    expect(anyProductFor('dxdash_library').def.plan).toBe('library');     // ...but an old purchase or refund is still understood
    expect(configuredProducts(ENV)).toEqual(['dxdash_pro_yearly', 'dxdash_pro_lifetime']);
  });

  it('turns a Stripe price into what the paywall shows (same shape as the stores)', () => {
    expect(periodOf({ recurring: { interval: 'year', interval_count: 1 } })).toBe('P1Y');
    expect(periodOf({ recurring: { interval: 'month', interval_count: 3 } })).toBe('P3M');
    expect(periodOf({})).toBe('');
    const y = describePrice('dxdash_pro_yearly', { unit_amount: 3999, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } }, ENV);
    expect(y).toMatchObject({ id: 'dxdash_pro_yearly', price: '$39.99', micros: 39990000, currency: 'USD', period: 'P1Y', trialDays: 0 });
    expect(describePrice('dxdash_pro_lifetime', { unit_amount: 7999, currency: 'usd' })).toMatchObject({ period: '', trialDays: 0 });
  });
});

describe('checkout', () => {
  it('builds a subscription session that carries the player and the plan (no Stripe trial: the free trial is belongs to the account)', () => {
    const f = checkoutParams('yearly', 'u1', ENV, {});
    expect(f).toMatchObject({ mode: 'subscription', client_reference_id: 'u1', 'line_items[0][price]': 'price_y', success_url: 'https://me.github.io/dx/?pro=success', cancel_url: 'https://me.github.io/dx/?pro=cancelled', 'metadata[plan]': 'yearly', 'subscription_data[metadata][user_id]': 'u1' });
    expect(checkoutParams('yearly', 'u1', ENV, {})['subscription_data[trial_period_days]']).toBeUndefined();
    expect(checkoutParams('yearly', 'u1', ENV, { customer: 'cus_1' }).customer).toBe('cus_1');
  });

  it('builds a one-time session whose charge can be traced for a refund, and refuses bad requests', () => {
    const f = checkoutParams('dxdash_pro_lifetime', 'u1', ENV, {});
    expect(f).toMatchObject({ mode: 'payment', 'payment_intent_data[metadata][plan]': 'lifetime', 'payment_intent_data[metadata][user_id]': 'u1' });
    expect(() => checkoutParams('dxdash_library', 'u1', ENV)).toThrow(/Unknown/);
    expect(() => checkoutParams('monthly', 'u1', ENV)).toThrow(/not for sale/);
    expect(() => checkoutParams('wat', 'u1', ENV)).toThrow(/Unknown/);
    expect(() => checkoutParams('yearly', '', ENV)).toThrow(/Sign in/);
    expect(() => checkoutParams('yearly', 'u1', { STRIPE_PRICE_YEARLY: 'p', SITE_URL: 'http://x' })).toThrow(/site address/);
  });
});

describe('invoices on newer Stripe API versions', () => {
  it('finds the subscription in either place', () => {
    expect(invoiceSubscriptionId({ subscription: 'sub_1' })).toBe('sub_1');
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_2' } } })).toBe('sub_2');
    expect(invoiceSubscriptionId({ subscription: null, parent: { subscription_details: { subscription: { id: 'sub_3' } } } })).toBe('sub_3');
    expect(invoiceSubscriptionId({})).toBe('');
  });
  it('a renewal still grants Pro when the invoice has no top-level subscription', async () => {
    const calls = [];
    const sub = { id: 'sub_9', status: 'active', metadata: { user_id: 'u1', plan: 'monthly' }, items: { data: [{ current_period_end: NOW + 30 * 86400 }] } };
    const out = await handleEvent({ type: 'invoice.paid', data: { object: { amount_paid: 349, customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_9' } } } } },
      { rpc: async (n, a) => { calls.push([n, a]); return null; }, getSubscription: async () => sub, now: NOW });
    expect(out).toEqual({ handled: true, action: 'renewal' });
    expect(calls[0][0]).toBe('pro_grant_until');
  });
});

describe('the billing portal', () => {
  it('has its own settings so nothing has to be set up in the Stripe Dashboard', () => {
    const f = portalConfig(ENV);
    expect(f).toMatchObject({ 'features[subscription_cancel][enabled]': 'true', 'features[subscription_cancel][mode]': 'at_period_end', 'features[payment_method_update][enabled]': 'true', 'business_profile[terms_of_service_url]': 'https://me.github.io/dx/terms.html', 'business_profile[privacy_policy_url]': 'https://me.github.io/dx/privacy.html' });
    expect('business_profile[terms_of_service_url]' in portalConfig({})).toBe(false);
  });
});

describe('webhook signatures', () => {
  it('accepts a correct recent signature and rejects forged, stale or missing ones', async () => {
    const body = '{"id":"evt_1"}';
    const v1 = await signPayload(body, 'whsec_x', NOW);
    const header = `t=${NOW},v1=${v1}`;
    expect(parseSignatureHeader(header)).toEqual({ t: NOW, v1: [v1] });
    expect(await verifyStripeSignature(body, header, 'whsec_x', NOW + 10)).toBe(true);
    expect(await verifyStripeSignature(body + ' ', header, 'whsec_x', NOW)).toBe(false);          // body changed
    expect(await verifyStripeSignature(body, header, 'whsec_other', NOW)).toBe(false);            // wrong secret
    expect(await verifyStripeSignature(body, header, 'whsec_x', NOW + 3600)).toBe(false);         // a replay an hour later
    expect(await verifyStripeSignature(body, `t=${NOW},v1=00`, 'whsec_x', NOW)).toBe(false);
    expect(await verifyStripeSignature(body, '', 'whsec_x', NOW)).toBe(false);
    expect(await verifyStripeSignature(body, header, '', NOW)).toBe(false);
  });
});

describe('what a payment does', () => {
  const session = (plan, extra) => ({ id: 'evt', type: 'checkout.session.completed', data: { object: Object.assign({ client_reference_id: 'u1', customer: 'cus_1', payment_status: 'paid', metadata: { plan }, subscription: 'sub_1' }, extra || {}) } });

  it('a subscription gives Pro until the end of the paid period, plus a short grace', async () => {
    const { deps, calls } = fake();
    const r = await handleEvent(session('yearly'), deps);
    expect(r).toEqual({ handled: true, action: 'subscription' });
    expect(calls[0]).toEqual(['pro_link_customer', { p_customer: 'cus_1', p_user: 'u1' }]);
    const grant = calls[1];
    expect(grant[0]).toBe('pro_grant_until');
    expect(new Date(grant[1].p_until).getTime() / 1000).toBe(NOW + 30 * 86400 + GRACE_SECONDS);
    expect(grant[1]).toMatchObject({ p_user: 'u1', p_plan: 'yearly', p_source: 'stripe', p_trial: false });
  });

  it('a free trial is marked as a trial', async () => {
    const { deps, calls } = fake({ getSubscription: async () => ({ status: 'trialing', current_period_end: NOW + 7 * 86400 }) });
    await handleEvent(session('yearly'), deps);
    expect(calls[1][1].p_trial).toBe(true);
  });

  it('lifetime gives ten years; the library unlock is its own switch and gives no Pro', async () => {
    let t = fake();
    expect((await handleEvent(session('lifetime', { subscription: null }), t.deps)).action).toBe('lifetime');
    expect(t.calls[1][1]).toMatchObject({ p_plan: 'lifetime' });
    expect(new Date(t.calls[1][1].p_until).getTime() / 1000).toBeGreaterThan(NOW + 3000 * 86400);
    t = fake();
    expect((await handleEvent(session('library', { subscription: null }), t.deps)).action).toBe('library');
    expect(t.calls.map((c) => c[0])).toEqual(['pro_link_customer', 'pro_grant_library']);
  });

  it('a renewal extends Pro (even a free one, from a coupon); unpaid sessions do nothing', async () => {
    let t = fake();
    const paid = { id: 'e2', type: 'invoice.paid', data: { object: { subscription: 'sub_1', customer: 'cus_1', amount_paid: 3999 } } };
    expect((await handleEvent(paid, t.deps)).action).toBe('renewal');
    expect(t.calls[0][0]).toBe('pro_grant_until');
    t = fake();
    expect((await handleEvent({ ...paid, data: { object: { ...paid.data.object, amount_paid: 0 } } }, t.deps)).action).toBe('renewal');
    t = fake();
    expect((await handleEvent(session('yearly', { payment_status: 'unpaid' }), t.deps)).handled).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('finds the player from the customer when the subscription has no note of it', async () => {
    const t = fake({ getSubscription: async () => ({ status: 'active', current_period_end: NOW + 86400, metadata: { plan: 'monthly' } }) });
    await handleEvent({ id: 'e3', type: 'invoice.paid', data: { object: { subscription: 's', customer: 'cus_9', amount_paid: 699 } } }, t.deps);
    expect(t.calls[1][1].p_user).toBe('user-from-customer');
  });

  it('a full refund takes a library or lifetime purchase back; a partial refund or anything else does not', async () => {
    const refund = (plan, refunded) => ({ id: 'e4', type: 'charge.refunded', data: { object: { refunded, metadata: { user_id: 'u1', plan } } } });
    let t = fake();
    expect((await handleEvent(refund('library', true), t.deps)).action).toBe('library_refunded');
    expect(t.calls[0]).toEqual(['pro_revoke_library', { p_user: 'u1' }]);
    t = fake();
    expect((await handleEvent(refund('lifetime', true), t.deps)).action).toBe('lifetime_refunded');
    expect(t.calls[0][0]).toBe('pro_revoke_plan');
    t = fake();
    expect((await handleEvent(refund('library', false), t.deps)).handled).toBe(false);
    expect((await handleEvent({ id: 'x', type: 'customer.created', data: { object: {} } }, t.deps)).handled).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('works out a period end from either place Stripe puts it, and gives nothing for a long-ended one', () => {
    expect(periodEnd({ current_period_end: 5 })).toBe(5);
    expect(periodEnd({ items: { data: [{ current_period_end: 7 }, { current_period_end: 9 }] } })).toBe(9);
    expect(subscriptionUntil({ current_period_end: NOW - 10 * 86400 }, NOW)).toBe('');
    expect(subscriptionUntil({ current_period_end: NOW + 100 }, NOW)).toMatch(/Z$/);
  });
});


// ───────────────────────── trying to break it: a paying member must never be left without Pro ─────────────────────────
describe('a payment is never lost to a missing field, a free renewal or an odd order of events', () => {
  const session = (over) => ({ type: 'checkout.session.completed', data: { object: Object.assign({ client_reference_id: 'u1', payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1', metadata: { user_id: 'u1', plan: 'monthly' } }, over || {}) } });

  it('a new subscription with no period end in the answer still gets one paid period', async () => {
    const { calls, deps } = fake({ getSubscription: async () => ({ id: 'sub_1', status: 'active', metadata: { user_id: 'u1', plan: 'monthly' } }) });
    expect(await handleEvent(session(), deps)).toEqual({ handled: true, action: 'subscription' });
    const grant = calls.find((c) => c[0] === 'pro_grant_until')[1];
    const days = (new Date(grant.p_until).getTime() / 1000 - NOW) / 86400;
    expect(days).toBeGreaterThan(32);
    expect(days).toBeLessThan(35);
  });

  it('but a subscription that is not live gives nothing', () => {
    ['canceled', 'incomplete', 'incomplete_expired', 'unpaid'].forEach((status) => expect(subscriptionUntil({ status, metadata: { plan: 'monthly' } }, NOW)).toBe(''));
  });

  it('a renewal that cost nothing (a 100% coupon) still renews', async () => {
    const { calls, deps } = fake({ getSubscription: async () => ({ id: 'sub_1', status: 'active', current_period_end: NOW + 30 * 86400, metadata: { user_id: 'u1', plan: 'monthly' } }) });
    const out = await handleEvent({ type: 'invoice.paid', data: { object: { amount_paid: 0, subscription: 'sub_1', customer: 'cus_1' } } }, deps);
    expect(out).toEqual({ handled: true, action: 'renewal' });
    expect(calls[0][0]).toBe('pro_grant_until');
  });

  it('an invoice for a subscription that has ended grants nothing', async () => {
    const { deps } = fake({ getSubscription: async () => ({ id: 'sub_1', status: 'canceled', current_period_end: NOW + 30 * 86400, metadata: { user_id: 'u1', plan: 'monthly' } }) });
    expect((await handleEvent({ type: 'invoice.paid', data: { object: { amount_paid: 349, subscription: 'sub_1' } } }, deps)).handled).toBe(false);
  });

  it('a late payment still counts: past due is paid for until its period ends', () => {
    expect(subscriptionUntil({ status: 'past_due', current_period_end: NOW + 5 * 86400, metadata: { plan: 'monthly' } }, NOW)).toBeTruthy();
  });

  it('the same event twice, or two events in either order, give the same result', async () => {
    const run = async (events) => { const { calls, deps } = fake(); for (const e of events) await handleEvent(e, deps); return calls.filter((c) => c[0] === 'pro_grant_until').map((c) => c[1].p_until).sort().pop(); };
    const inv = { type: 'invoice.paid', data: { object: { amount_paid: 349, subscription: 'sub_1', customer: 'cus_1' } } };
    expect(await run([session(), inv])).toBe(await run([inv, session()]));
    expect(await run([session(), session(), inv, inv])).toBe(await run([session()]));
  });

  it('a refund of a lifetime takes back only the lifetime, never a subscription held as well', async () => {
    const { calls, deps } = fake();
    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, metadata: { user_id: 'u1', plan: 'lifetime' } } } }, deps);
    expect(calls).toEqual([['pro_revoke_plan', { p_user: 'u1', p_plan: 'lifetime' }]]);
  });

  it('a partial refund takes nothing back', async () => {
    const { calls, deps } = fake();
    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: false, metadata: { user_id: 'u1', plan: 'lifetime' } } } }, deps);
    expect(calls).toEqual([]);
  });

  it('a full refund of the invoice that paid for the current period ends that subscription; an older invoice does not', async () => {
    const sub = { id: 'sub_1', status: 'active', current_period_end: NOW + 30 * 86400, latest_invoice: 'in_new', metadata: { user_id: 'u1', plan: 'monthly' } };
    const mk = (invoice) => fake({ getInvoice: async () => ({ id: invoice, parent: { subscription_details: { subscription: 'sub_1' } } }), getSubscription: async () => sub });
    let t = mk('in_new');
    const out = await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, invoice: 'in_new', metadata: {} } } }, t.deps);
    expect(out.action).toBe('monthly_refunded');
    expect(t.calls).toEqual([['pro_revoke_plan', { p_user: 'u1', p_plan: 'monthly' }]]);
    t = mk('in_old');
    expect((await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, invoice: 'in_old', metadata: {} } } }, t.deps)).handled).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('a payment that finishes later (a bank debit) gives the purchase, exactly like one that finished at once', async () => {
    const t = fake();
    const ev = { type: 'checkout.session.async_payment_succeeded', data: { object: { client_reference_id: 'u1', payment_status: 'paid', customer: 'cus_1', metadata: { kind: 'item', item_id: 'trail_fire', user_id: 'u1' } } } };
    expect((await handleEvent(ev, t.deps)).action).toBe('item');
    expect(t.calls.map((c) => c[0])).toEqual(['pro_link_customer', 'pro_grant_item']);
    const unpaid = fake();
    ev.data.object.payment_status = 'unpaid';
    expect((await handleEvent(ev, unpaid.deps)).handled).toBe(false);
    expect(unpaid.calls).toEqual([]);
  });

  it('a purchase that was already refunded is not handed back by a late "completed" event', async () => {
    const t = fake({ isPaymentReturned: async () => true });
    const ev = { type: 'checkout.session.completed', data: { object: { client_reference_id: 'u1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { plan: 'lifetime', user_id: 'u1' } } } };
    expect(await handleEvent(ev, t.deps)).toEqual({ handled: false, action: 'already_returned' });
    expect(t.calls).toEqual([]);
    const item = { type: 'checkout.session.completed', data: { object: { client_reference_id: 'u1', payment_status: 'paid', payment_intent: 'pi_2', metadata: { kind: 'item', item_id: 'trail_fire', user_id: 'u1' } } } };
    expect((await handleEvent(item, t.deps)).handled).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('a chargeback takes the purchase back, a lost one keeps it taken, and a won one gives it again', async () => {
    // (the charge as Stripe describes it at each stage; the handler reads it fresh whatever event woke it)
    const open = { id: 'ch_1', disputed: true, dispute: { status: 'needs_response' }, metadata: { user_id: 'u1', plan: 'lifetime' } };
    const lostC = { ...open, dispute: { status: 'lost' } };
    const wonC = { ...open, dispute: { status: 'won' } };
    const dispute = (type, status) => ({ type, data: { object: { charge: 'ch_1', status } } });
    let t = fake({ getCharge: async () => open });
    expect((await handleEvent(dispute('charge.dispute.created'), t.deps)).action).toBe('lifetime_disputed');
    expect(t.calls).toEqual([['pro_revoke_plan', { p_user: 'u1', p_plan: 'lifetime' }]]);
    t = fake({ getCharge: async () => lostC });
    expect((await handleEvent(dispute('charge.dispute.closed', 'lost'), t.deps)).action).toBe('lifetime_disputed');
    t = fake({ getCharge: async () => wonC });
    expect((await handleEvent(dispute('charge.dispute.closed', 'won'), t.deps)).action).toBe('lifetime_restored');
    expect(t.calls[0][0]).toBe('pro_grant_until');
    // an item, too
    const itemMeta = { user_id: 'u1', kind: 'item', item_id: 'trail_fire' };
    let stage = { id: 'ch_2', disputed: true, dispute: { status: 'needs_response' }, metadata: itemMeta };
    t = fake({ getCharge: async () => stage });
    await handleEvent(dispute('charge.dispute.created'), t.deps);
    stage = { ...stage, dispute: { status: 'won' } };
    await handleEvent(dispute('charge.dispute.closed', 'won'), t.deps);
    expect(t.calls.map((c) => c[0])).toEqual(['pro_revoke_item', 'pro_grant_item']);
    // a charge we cannot match to anyone changes nothing
    t = fake({ getCharge: async () => ({ id: 'ch_3', disputed: true, dispute: { status: 'lost' }, metadata: {} }) });
    expect((await handleEvent(dispute('charge.dispute.created'), t.deps)).handled).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('a one-time purchase gets a Stripe customer, so it can be found again; a returning customer is reused', () => {
    expect(checkoutParams('lifetime', 'u1', ENV).customer_creation).toBe('always');
    expect(checkoutParams('lifetime', 'u1', ENV, { customer: 'cus_9' }).customer_creation).toBeUndefined();
    expect(checkoutParams('yearly', 'u1', ENV).customer_creation).toBeUndefined();
  });

  it('what Stripe says someone holds becomes grants (for putting right a lost event)', () => {
    const subs = [
      { status: 'active', current_period_end: NOW + 20 * 86400, metadata: { plan: 'yearly', user_id: 'u1' } },
      { status: 'canceled', current_period_end: NOW + 20 * 86400, metadata: { plan: 'monthly', user_id: 'u1' } },
      { status: 'trialing', current_period_end: NOW + 3 * 86400, metadata: { plan: 'monthly', user_id: 'u1' } }
    ];
    const g = grantsFromSubscriptions(subs, NOW);
    expect(g.map((x) => x.plan)).toEqual(['yearly', 'monthly']);
    expect(g[1].trial).toBe(true);
    expect(grantsFromSubscriptions([{ status: 'active', current_period_end: NOW - 10 * 86400, metadata: { plan: 'yearly' } }], NOW)).toEqual([]); // long over
  });

  it('a signed event is accepted, an altered or stale one is not', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
    const sig = 't=' + NOW + ',v1=' + (await signPayload(body, 'whsec_x', NOW));
    expect(await verifyStripeSignature(body, sig, 'whsec_x', NOW)).toBe(true);
    expect(await verifyStripeSignature(body + ' ', sig, 'whsec_x', NOW)).toBe(false);
    expect(await verifyStripeSignature(body, sig, 'whsec_other', NOW)).toBe(false);
    expect(await verifyStripeSignature(body, sig, 'whsec_x', NOW + 3600)).toBe(false);
    expect(await verifyStripeSignature(body, '', 'whsec_x', NOW)).toBe(false);
    expect(await verifyStripeSignature(body, sig, '', NOW)).toBe(false);
  });
});


describe('premium Locker items (real money)', () => {
  const itemSession = (over) => ({ type: 'checkout.session.completed', data: { object: Object.assign({ client_reference_id: 'u1', payment_status: 'paid', customer: 'cus_1', metadata: { kind: 'item', item_id: 'trail_fire', user_id: 'u1' } }, over || {}) } });

  it('a checkout charges the catalog price, once, in dollars, and creates a customer so it can be found again', () => {
    const f = itemCheckoutParams('trail_fire', 'u1', ENV, { name: 'Fire Trail' });
    expect(f['mode']).toBe('payment');
    expect(f['line_items[0][price_data][unit_amount]']).toBe('99');
    expect(f['line_items[0][price_data][currency]']).toBe('usd');
    expect(f['metadata[item_id]']).toBe('trail_fire');
    expect(f['payment_intent_data[metadata][kind]']).toBe('item');
    expect(f['customer_creation']).toBe('always');
    expect(f['success_url']).toBe('https://me.github.io/dx/?pro=success&item=trail_fire');
    expect(itemCheckoutParams('trail_fire', 'u1', ENV, { customer: 'cus_9' }).customer_creation).toBeUndefined();
  });

  it('refuses things that are not for sale, a missing member or a bad site address', () => {
    expect(() => itemCheckoutParams('trail_ekg', 'u1', ENV)).toThrow(/not for sale/);
    expect(() => itemCheckoutParams('trail_fire', '', ENV)).toThrow(/Sign in/);
    expect(() => itemCheckoutParams('trail_fire', 'u1', { SITE_URL: 'http://x' })).toThrow(/site address/);
  });

  it('a paid item is granted (and a repeat of the event is harmless)', async () => {
    const { calls, deps } = fake();
    expect(await handleEvent(itemSession(), deps)).toEqual({ handled: true, action: 'item' });
    await handleEvent(itemSession(), deps);
    expect(calls.filter((c) => c[0] === 'pro_grant_item').map((c) => c[1])).toEqual([
      { p_user: 'u1', p_item: 'trail_fire', p_source: 'stripe', p_ref: null }, { p_user: 'u1', p_item: 'trail_fire', p_source: 'stripe', p_ref: null }
    ]);
    expect(calls[0]).toEqual(['pro_link_customer', { p_customer: 'cus_1', p_user: 'u1' }]);
  });

  it('paying twice for the same item returns the second payment, and its refund cannot take the item the first one paid for', async () => {
    const refunded = [];
    const t = fake({ refundPayment: async (pi) => { refunded.push(pi); }, rpc: async (n) => (n === 'pro_grant_item' ? 'duplicate' : null) });
    const out = await handleEvent(itemSession({ payment_intent: 'pi_second' }), t.deps);
    expect(out.action).toBe('item_duplicate_refunded');
    expect(refunded).toEqual(['pi_second']);
    // the refund event for that second payment names its own payment, so the database leaves the first one's item alone
    const u = fake({ getCharge: async () => ({ id: 'ch_2', refunded: true, payment_intent: 'pi_second', metadata: { kind: 'item', item_id: 'trail_fire', user_id: 'u1' } }) });
    await handleEvent({ type: 'charge.refunded', data: { object: { id: 'ch_2', refunded: true } } }, u.deps);
    expect(u.calls).toEqual([['pro_revoke_item', { p_user: 'u1', p_item: 'trail_fire', p_ref: 'pi_second' }]]);
    // a normal repeat of the same event (same payment) is not a duplicate and refunds nothing
    const again = [];
    const v = fake({ refundPayment: async (pi) => { again.push(pi); }, rpc: async (n) => (n === 'pro_grant_item' ? 'already' : null) });
    expect((await handleEvent(itemSession({ payment_intent: 'pi_first' }), v.deps)).action).toBe('item');
    expect(again).toEqual([]);
  });

  it('an unpaid session, or one with no member, grants nothing', async () => {
    const { calls, deps } = fake();
    expect((await handleEvent(itemSession({ payment_status: 'unpaid' }), deps)).handled).toBe(false);
    expect((await handleEvent(itemSession({ client_reference_id: '', metadata: { kind: 'item', item_id: 'trail_fire' } }), deps)).handled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('someone who paid always gets the item, even if the catalog changed since', async () => {
    const { calls, deps } = fake();
    await handleEvent(itemSession({ metadata: { kind: 'item', item_id: 'trail_retired', user_id: 'u1' } }), deps);
    expect(calls.some((c) => c[0] === 'pro_grant_item' && c[1].p_item === 'trail_retired')).toBe(true);
  });

  it('a full refund takes back that item only; a partial one takes nothing; a subscription is untouched', async () => {
    const { calls, deps } = fake();
    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: true, metadata: { kind: 'item', item_id: 'trail_fire', user_id: 'u1' } } } }, deps);
    expect(calls).toEqual([['pro_revoke_item', { p_user: 'u1', p_item: 'trail_fire', p_ref: null }]]);
    const t = fake();
    await handleEvent({ type: 'charge.refunded', data: { object: { refunded: false, metadata: { kind: 'item', item_id: 'trail_fire', user_id: 'u1' } } } }, t.deps);
    expect(t.calls).toEqual([]);
  });
});

describe('which charges count as given back', () => {
  it('a refund does; an open or lost chargeback does; a won one or a closed inquiry does not', () => {
    expect(chargeReturned({ refunded: true })).toBe(true);
    expect(chargeReturned({ disputed: true, dispute: { status: 'needs_response' } })).toBe(true);
    expect(chargeReturned({ disputed: true, dispute: { status: 'under_review' } })).toBe(true);
    expect(chargeReturned({ disputed: true, dispute: { status: 'lost' } })).toBe(true);
    expect(chargeReturned({ disputed: true, dispute: 'dp_1' })).toBe(true);      // (not expanded: err on the side of caution)
    expect(chargeReturned({ disputed: true, dispute: { status: 'won' } })).toBe(false);
    expect(chargeReturned({ disputed: true, dispute: { status: 'warning_closed' } })).toBe(false);
    expect(chargeReturned({ refunded: false, disputed: false })).toBe(false);
    expect(chargeReturned(null)).toBe(false);
    expect(chargeReturned('ch_1')).toBe(false);
  });
});
