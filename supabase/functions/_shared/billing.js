/**
 * billing.js — the rules for web payments, with no network and no framework in it so they can be tested.
 *
 * The two Supabase Edge Functions (pro-checkout, stripe-webhook) are thin: they fetch from Stripe and call the database,
 * and hand everything else to this file. It runs in Deno (the functions) and in Node (the unit tests).
 */

/** The products, in the same ids the phone apps use. `env` is the secret holding that product's Stripe Price id. */
export var PRODUCTS = {
  dxdash_pro_yearly: { plan: 'yearly', kind: 'subscription', env: 'STRIPE_PRICE_YEARLY', trial: true },
  dxdash_pro_pass3m: { plan: 'pass3m', kind: 'subscription', env: 'STRIPE_PRICE_PASS3M' },
  dxdash_pro_monthly: { plan: 'monthly', kind: 'subscription', env: 'STRIPE_PRICE_MONTHLY' },
  dxdash_pro_lifetime: { plan: 'lifetime', kind: 'payment', env: 'STRIPE_PRICE_LIFETIME' },
  dxdash_library: { plan: 'library', kind: 'payment', env: 'STRIPE_PRICE_LIBRARY' }
};

/** A subscription stays on this long past its paid period, so a late renewal does not lock anyone out for a day. */
export var GRACE_SECONDS = 2 * 24 * 60 * 60;
/** "Lifetime" in the database: ten years (the most a grant may be). */
export var LIFETIME_DAYS = 3650;
var DAY = 86400;

/** The products that have a Price id set, in display order. */
export function configuredProducts(env) {
  return Object.keys(PRODUCTS).filter(function (id) { return !!(env && env[PRODUCTS[id].env]); });
}

/** Find the product for a plan name or id ('yearly' or 'dxdash_pro_yearly'). */
export function productFor(planOrId) {
  var key = String(planOrId || '');
  if (PRODUCTS[key]) return { id: key, def: PRODUCTS[key] };
  var id = Object.keys(PRODUCTS).filter(function (k) { return PRODUCTS[k].plan === key; })[0];
  return id ? { id: id, def: PRODUCTS[id] } : null;
}

/** ISO period for a Stripe recurring price: P1Y, P1M, P3M, or '' for a one-time price. */
export function periodOf(price) {
  var r = price && price.recurring;
  if (!r) return '';
  var n = Number(r.interval_count) || 1;
  if (r.interval === 'year') return 'P' + n + 'Y';
  if (r.interval === 'month') return 'P' + n + 'M';
  if (r.interval === 'week') return 'P' + n + 'W';
  if (r.interval === 'day') return 'P' + n + 'D';
  return '';
}

/** What the app shows for a product: the same shape the phone paywall gets from the store. */
export function describePrice(id, price, env) {
  var def = PRODUCTS[id];
  var cents = Number(price && price.unit_amount) || 0;
  var currency = String((price && price.currency) || 'usd').toUpperCase();
  var money;
  try { money = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(cents / 100); } catch { money = (cents / 100).toFixed(2) + ' ' + currency; }
  var trial = def.trial ? Number((env && env.STRIPE_TRIAL_DAYS) === undefined ? 7 : env.STRIPE_TRIAL_DAYS) || 0 : 0;
  return { id: id, price: money, micros: cents * 10000, currency: currency, period: periodOf(price), trialDays: trial };
}

/** The unix time a subscription's current paid period ends (Stripe moved this onto the items in newer API versions). */
export function periodEnd(sub) {
  if (!sub) return 0;
  if (sub.current_period_end) return Number(sub.current_period_end);
  var items = sub.items && sub.items.data;
  var ends = (items || []).map(function (i) { return Number(i.current_period_end) || 0; });
  return ends.length ? Math.max.apply(null, ends) : 0;
}

/** Until when Pro should run for a subscription, as an ISO string, or '' when it has nothing to give. */
export function subscriptionUntil(sub, nowSec) {
  var end = periodEnd(sub);
  if (!end || end + GRACE_SECONDS <= nowSec) return '';
  return new Date((end + GRACE_SECONDS) * 1000).toISOString();
}

/** The Stripe Checkout Session to create for a plan, as form fields. Throws a readable message for a bad request. */
export function checkoutParams(planOrId, userId, env, opts) {
  var p = productFor(planOrId);
  if (!p) throw new Error('Unknown plan.');
  var priceId = env && env[p.def.env];
  if (!priceId) throw new Error('That plan is not for sale yet.');
  if (!userId) throw new Error('Sign in first.');
  var site = String((env && env.SITE_URL) || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(site)) throw new Error('The site address is not set up.');
  var f = {};
  f['mode'] = p.def.kind === 'subscription' ? 'subscription' : 'payment';
  f['client_reference_id'] = userId;
  f['line_items[0][price]'] = priceId;
  f['line_items[0][quantity]'] = '1';
  f['success_url'] = site + '/?pro=success';
  f['cancel_url'] = site + '/?pro=cancelled';
  f['allow_promotion_codes'] = 'true';
  f['metadata[user_id]'] = userId;
  f['metadata[plan]'] = p.def.plan;
  if (p.def.kind === 'subscription') {
    f['subscription_data[metadata][user_id]'] = userId;
    f['subscription_data[metadata][plan]'] = p.def.plan;
    var trial = p.def.trial ? Number((env && env.STRIPE_TRIAL_DAYS) === undefined ? 7 : env.STRIPE_TRIAL_DAYS) || 0 : 0;
    if (trial > 0 && !(opts && opts.hadTrial)) f['subscription_data[trial_period_days]'] = String(trial);
  } else {
    // (carried onto the charge, so a refund can be matched back to the purchase)
    f['payment_intent_data[metadata][user_id]'] = userId;
    f['payment_intent_data[metadata][plan]'] = p.def.plan;
  }
  if (opts && opts.customer) f['customer'] = opts.customer;
  return f;
}

// ---------- webhook signatures ----------

/** "t=123,v1=abc,v1=def" -> { t, v1: [...] } */
export function parseSignatureHeader(header) {
  var out = { t: 0, v1: [] };
  String(header || '').split(',').forEach(function (part) {
    var kv = part.trim().split('=');
    if (kv[0] === 't') out.t = Number(kv[1]) || 0;
    else if (kv[0] === 'v1' && kv[1]) out.v1.push(kv[1]);
  });
  return out;
}

function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }

function sameString(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** The signature Stripe would send for this body (used by the tests, and to check incoming ones). */
export async function signPayload(rawBody, secret, t) {
  var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + rawBody)));
}

/** Is this body really from Stripe, and recent? (Five minutes of clock difference is allowed.) */
export async function verifyStripeSignature(rawBody, header, secret, nowSec, toleranceSec) {
  if (!secret || !header) return false;
  var sig = parseSignatureHeader(header);
  if (!sig.t || !sig.v1.length) return false;
  if (Math.abs(nowSec - sig.t) > (toleranceSec === undefined ? 300 : toleranceSec)) return false;
  var expected = await signPayload(rawBody, secret, sig.t);
  return sig.v1.some(function (v) { return sameString(v, expected); });
}

// ---------- the webhook's decisions ----------

/**
 * Do what a Stripe event means for the database.
 * @param {any} event the verified Stripe event
 * @param {{rpc: function(string, object): Promise<any>, getSubscription: function(string): Promise<any>, now: number}} deps
 *   rpc calls a database function as the service; getSubscription reads a subscription from Stripe; now is unix seconds
 * @returns {Promise<{handled: boolean, action?: string}>}
 */
export async function handleEvent(event, deps) {
  var obj = event && event.data && event.data.object;
  if (!obj) return { handled: false };
  var rpc = deps.rpc;

  if (event.type === 'checkout.session.completed') {
    var userId = obj.client_reference_id || (obj.metadata && obj.metadata.user_id);
    var p = productFor(obj.metadata && obj.metadata.plan);
    if (!userId || !p) return { handled: false };
    if (obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') return { handled: false };
    if (obj.customer) await rpc('pro_link_customer', { p_customer: obj.customer, p_user: userId });
    if (p.def.plan === 'library') { await rpc('pro_grant_library', { p_user: userId, p_source: 'stripe' }); return { handled: true, action: 'library' }; }
    if (p.def.plan === 'lifetime') {
      await rpc('pro_grant_until', { p_user: userId, p_until: new Date((deps.now + LIFETIME_DAYS * DAY - DAY) * 1000).toISOString(), p_plan: 'lifetime', p_source: 'stripe', p_trial: false });
      return { handled: true, action: 'lifetime' };
    }
    var sub = obj.subscription ? await deps.getSubscription(obj.subscription) : null;
    var until = subscriptionUntil(sub, deps.now);
    if (!until) return { handled: false };
    await rpc('pro_grant_until', { p_user: userId, p_until: until, p_plan: p.def.plan, p_source: 'stripe', p_trial: !!sub && sub.status === 'trialing' });
    return { handled: true, action: 'subscription' };
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    if (!obj.subscription || !(Number(obj.amount_paid) > 0)) return { handled: false }; // a free trial's $0 invoice grants nothing extra
    var sub2 = await deps.getSubscription(obj.subscription);
    var plan = productFor(sub2 && sub2.metadata && sub2.metadata.plan);
    var user2 = (sub2 && sub2.metadata && sub2.metadata.user_id) || (obj.customer ? await rpc('pro_customer_user', { p_customer: obj.customer }) : null);
    var until2 = subscriptionUntil(sub2, deps.now);
    if (!user2 || !plan || !until2) return { handled: false };
    await rpc('pro_grant_until', { p_user: user2, p_until: until2, p_plan: plan.def.plan, p_source: 'stripe', p_trial: false });
    return { handled: true, action: 'renewal' };
  }

  if (event.type === 'charge.refunded') {
    var m = obj.metadata || {};
    if (!obj.refunded || !m.user_id) return { handled: false }; // only a full refund takes anything back
    if (m.plan === 'library') { await rpc('pro_revoke_library', { p_user: m.user_id }); return { handled: true, action: 'library_refunded' }; }
    if (m.plan === 'lifetime') { await rpc('pro_revoke', { p_user: m.user_id }); return { handled: true, action: 'lifetime_refunded' }; }
    return { handled: false };
  }

  return { handled: false };
}
