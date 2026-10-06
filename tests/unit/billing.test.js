// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  PRODUCTS, configuredProducts, productFor, periodOf, describePrice, periodEnd, subscriptionUntil, checkoutParams,
  anyProductFor, portalConfig, parseSignatureHeader, signPayload, verifyStripeSignature, handleEvent, GRACE_SECONDS
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

  it('a renewal extends Pro; a free-trial invoice and unpaid sessions do nothing', async () => {
    let t = fake();
    const paid = { id: 'e2', type: 'invoice.paid', data: { object: { subscription: 'sub_1', customer: 'cus_1', amount_paid: 3999 } } };
    expect((await handleEvent(paid, t.deps)).action).toBe('renewal');
    expect(t.calls[0][0]).toBe('pro_grant_until');
    t = fake();
    expect((await handleEvent({ ...paid, data: { object: { ...paid.data.object, amount_paid: 0 } } }, t.deps)).handled).toBe(false);
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
    expect(t.calls[0][0]).toBe('pro_revoke');
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
