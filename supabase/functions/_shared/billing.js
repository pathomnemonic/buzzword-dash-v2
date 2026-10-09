/**
 * billing.js — the rules for web payments, with no network and no framework in it so they can be tested.
 *
 * The two Supabase Edge Functions (pro-checkout, stripe-webhook) are thin: they fetch from Stripe and call the database,
 * and hand everything else to this file. It runs in Deno (the functions) and in Node (the unit tests).
 */

/**
 * The products, in the same ids the phone apps use. `env` is the secret holding that product's Stripe Price id.
 * (There is no trial here: every signed-in account gets a free 7-day trial from the database, with no card; see start_my_trial.
 *  The one-time Full Library unlock is no longer sold; it stays listed so an old purchase or refund is still understood.)
 */
import { premiumCents } from './premium.js';

export var PRODUCTS = {
  dxdash_pro_yearly: { plan: 'yearly', kind: 'subscription', env: 'STRIPE_PRICE_YEARLY' },
  dxdash_pro_pass3m: { plan: 'pass3m', kind: 'subscription', env: 'STRIPE_PRICE_PASS3M' },
  dxdash_pro_monthly: { plan: 'monthly', kind: 'subscription', env: 'STRIPE_PRICE_MONTHLY' },
  dxdash_pro_lifetime: { plan: 'lifetime', kind: 'payment', env: 'STRIPE_PRICE_LIFETIME' }
};
var LEGACY = { dxdash_library: { plan: 'library', kind: 'payment', env: 'STRIPE_PRICE_LIBRARY' } };

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

/** Like productFor, but also knows the withdrawn Full Library (so an old library purchase or refund is still handled). */
export function anyProductFor(planOrId) {
  var p = productFor(planOrId);
  if (p) return p;
  var key = String(planOrId || '');
  return key === 'library' || key === 'dxdash_library' ? { id: 'dxdash_library', def: LEGACY.dxdash_library } : null;
}

/**
 * Has this charge been given back? A refund, or a chargeback that is open or lost. A dispute that was won (or an inquiry
 * that closed) leaves the charge marked "disputed" in Stripe for good, but the customer did pay, so it does not count.
 * Expect `dispute` expanded (an object); when it is only an id, a disputed charge is treated as given back.
 */
export function chargeReturned(ch) {
  if (!ch || typeof ch !== 'object') return false;
  if (ch.refunded) return true;
  if (!ch.disputed) return false;
  var d = ch.dispute;
  if (d && typeof d === 'object' && (d.status === 'won' || d.status === 'warning_closed')) return false;
  return true;
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
export function describePrice(id, price) {
  var cents = Number(price && price.unit_amount) || 0;
  var currency = String((price && price.currency) || 'usd').toUpperCase();
  var money;
  try { money = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(cents / 100); } catch { money = (cents / 100).toFixed(2) + ' ' + currency; }
  return { id: id, price: money, micros: cents * 10000, currency: currency, period: periodOf(price), trialDays: 0 };
}

/** The unix time a subscription's current paid period ends (Stripe moved this onto the items in newer API versions). */
export function periodEnd(sub) {
  if (!sub) return 0;
  if (sub.current_period_end) return Number(sub.current_period_end);
  var items = sub.items && sub.items.data;
  var ends = (items || []).map(function (i) { return Number(i.current_period_end) || 0; });
  return ends.length ? Math.max.apply(null, ends) : 0;
}

/** The subscription an invoice belongs to (newer Stripe API versions moved it from invoice.subscription to invoice.parent). */
export function invoiceSubscriptionId(inv) {
  if (!inv) return '';
  if (typeof inv.subscription === 'string' && inv.subscription) return inv.subscription;
  if (inv.subscription && inv.subscription.id) return inv.subscription.id;
  var d = inv.parent && inv.parent.subscription_details;
  var sub = d && d.subscription;
  if (typeof sub === 'string') return sub;
  return (sub && sub.id) || '';
}

/** How long a plan's paid period runs, in days, for the rare subscription that arrives without a period end. */
var PLAN_DAYS = { yearly: 366, pass3m: 93, monthly: 32 };
var LIVE_STATUSES = ['active', 'trialing', 'past_due'];

/**
 * Until when Pro should run for a subscription, as an ISO string, or '' when it has nothing to give.
 * Someone who has paid is never left without Pro because Stripe's answer was missing a field: when there is no period
 * end, a live subscription gets one paid period (the next renewal event then sets the exact end).
 */
export function subscriptionUntil(sub, nowSec) {
  if (!sub) return '';
  var end = periodEnd(sub);
  if (!end) {
    var plan = sub.metadata && sub.metadata.plan;
    if (LIVE_STATUSES.indexOf(sub.status) < 0 || !PLAN_DAYS[plan]) return '';
    end = nowSec + PLAN_DAYS[plan] * DAY;
  }
  if (end + GRACE_SECONDS <= nowSec) return '';
  return new Date((end + GRACE_SECONDS) * 1000).toISOString();
}

/**
 * What a customer's subscriptions in Stripe say they should have: one { plan, until, trial } per live subscription.
 * Used to put right a member whose payment event never reached us.
 */
export function grantsFromSubscriptions(subs, nowSec) {
  var out = [];
  (subs || []).forEach(function (sub) {
    if (!sub || LIVE_STATUSES.indexOf(sub.status) < 0) return;
    var plan = productFor(sub.metadata && sub.metadata.plan);
    var until = subscriptionUntil(sub, nowSec);
    if (plan && plan.def.kind === 'subscription' && until) out.push({ plan: plan.def.plan, until: until, trial: sub.status === 'trialing' });
  });
  return out;
}

/** The line shown above the Pay button: the terms, and that digital products are delivered at once (which ends a right to withdraw). */
function payNotice(site) {
  return 'By paying you agree to the Terms of Use (' + site + '/terms.html). Paid products are delivered to your account immediately; where the law gives a right to withdraw from a digital purchase, it ends once delivery starts.';
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
  f['custom_text[submit][message]'] = payNotice(site);
  f['metadata[user_id]'] = userId;
  f['metadata[plan]'] = p.def.plan;
  if (p.def.kind === 'subscription') {
    f['subscription_data[metadata][user_id]'] = userId;
    f['subscription_data[metadata][plan]'] = p.def.plan;
  } else {
    // (carried onto the charge, so a refund can be matched back to the purchase)
    f['payment_intent_data[metadata][user_id]'] = userId;
    f['payment_intent_data[metadata][plan]'] = p.def.plan;
    // a one-time purchase also gets a Stripe customer (when there is none yet), so it can be found again if an event is lost
    if (!(opts && opts.customer)) f['customer_creation'] = 'always';
  }
  if (opts && opts.customer) f['customer'] = opts.customer;
  return f;
}

/**
 * The Stripe Checkout Session for a premium Locker item (a one-time payment, priced from premium.js: no per-item setup in Stripe).
 * Throws a readable message for a bad request.
 */
export function itemCheckoutParams(itemId, userId, env, opts) {
  var cents = premiumCents(itemId);
  if (!cents) throw new Error('That item is not for sale.');
  if (!userId) throw new Error('Sign in first.');
  var site = String((env && env.SITE_URL) || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(site)) throw new Error('The site address is not set up.');
  var f = {};
  f['mode'] = 'payment';
  f['client_reference_id'] = userId;
  f['line_items[0][price_data][currency]'] = 'usd';
  f['line_items[0][price_data][unit_amount]'] = String(cents);
  f['line_items[0][price_data][product_data][name]'] = String((opts && opts.name) || itemId).slice(0, 80) + ' (Dx Dash Locker item)';
  f['line_items[0][quantity]'] = '1';
  f['success_url'] = site + '/?pro=success&item=' + encodeURIComponent(itemId);
  f['cancel_url'] = site + '/?pro=cancelled';
  f['custom_text[submit][message]'] = payNotice(site);
  f['metadata[kind]'] = 'item';
  f['metadata[item_id]'] = itemId;
  f['metadata[user_id]'] = userId;
  f['payment_intent_data[metadata][kind]'] = 'item';
  f['payment_intent_data[metadata][item_id]'] = itemId;
  f['payment_intent_data[metadata][user_id]'] = userId;
  if (opts && opts.customer) f['customer'] = opts.customer; else f['customer_creation'] = 'always';
  return f;
}

/** Settings for the Stripe billing portal, used when none are saved in the Dashboard: cancel at the end of the period, update the card, see invoices. */
export function portalConfig(env) {
  var site = String((env && env.SITE_URL) || '').replace(/\/+$/, '');
  var f = {
    'business_profile[headline]': 'Manage your Dx Dash Pro subscription',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
    'features[customer_update][enabled]': 'true',
    'features[customer_update][allowed_updates][0]': 'email'
  };
  if (/^https:\/\//.test(site)) {
    f['business_profile[privacy_policy_url]'] = site + '/privacy.html';
    f['business_profile[terms_of_service_url]'] = site + '/terms.html';
  }
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
  var type = event.type;

  // A payment that finished later (a bank debit, for instance) is the same purchase as one that finished at once.
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') return handleSession(obj, deps);

  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    var subId = invoiceSubscriptionId(obj);
    if (!subId) return { handled: false };
    var sub2 = await deps.getSubscription(subId);
    // (a renewal that cost nothing, because of a coupon, still renews: the subscription itself says how long)
    var plan = productFor(sub2 && sub2.metadata && sub2.metadata.plan);
    var user2 = (sub2 && sub2.metadata && sub2.metadata.user_id) || (obj.customer ? await rpc('pro_customer_user', { p_customer: obj.customer }) : null);
    var until2 = subscriptionUntil(sub2, deps.now);
    if (!user2 || !plan || !until2 || LIVE_STATUSES.indexOf(sub2.status) < 0) return { handled: false };
    await rpc('pro_grant_until', { p_user: user2, p_until: until2, p_plan: plan.def.plan, p_source: 'stripe', p_trial: false });
    return { handled: true, action: 'renewal' };
  }

  // Money returned (a refund, or a chargeback) takes the purchase back; a chargeback that was won gives it again. These
  // events can arrive late and out of order, so none of them is taken at its word: the charge is read fresh from Stripe
  // and the answer follows how it stands now. The same events in any order leave the same result.
  if (type === 'charge.refunded' || type === 'charge.dispute.created' || type === 'charge.dispute.closed' || type === 'charge.dispute.updated') {
    var seen = type === 'charge.refunded' ? obj : await chargeOf(obj, deps);
    if (!seen) return { handled: false };
    var ch = deps.getCharge && seen.id ? await deps.getCharge(seen.id) : seen;
    if (!ch) return { handled: false };
    if (chargeReturned(ch)) return takeBack(ch, deps, ch.refunded ? 'refunded' : 'disputed');
    if (type === 'charge.refunded') return { handled: false }; // (only part of it was refunded: the purchase stays)
    return giveBack(ch, deps);
  }

  return { handled: false };
}

/** The charge a dispute is about. */
async function chargeOf(dispute, deps) {
  var id = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge && dispute.charge.id;
  if (!id || !deps.getCharge) return null;
  return deps.getCharge(id);
}

/** Who bought what, from a charge: its own notes (a one-time purchase), or those of the subscription it paid for. */
async function purchaseOfCharge(ch, deps) {
  var m = ch.metadata || {};
  var ref = typeof ch.payment_intent === 'string' ? ch.payment_intent : (ch.payment_intent && ch.payment_intent.id) || null;
  if (m.user_id && (m.kind === 'item' || m.plan)) return { user: m.user_id, kind: m.kind === 'item' ? 'item' : 'plan', item: m.item_id, plan: m.plan, ref: ref };
  var invId = typeof ch.invoice === 'string' ? ch.invoice : ch.invoice && ch.invoice.id;
  if (!invId || !deps.getInvoice) return null;
  var inv = await deps.getInvoice(invId);
  var subId = invoiceSubscriptionId(inv);
  if (!subId) return null;
  var sub = await deps.getSubscription(subId);
  var sm = (sub && sub.metadata) || {};
  if (!sm.user_id || !sm.plan) return null;
  // only the invoice that paid for the period they hold now ends it; an old invoice being refunded must not
  if (sub.latest_invoice && String(sub.latest_invoice.id || sub.latest_invoice) !== invId) return null;
  return { user: sm.user_id, kind: 'plan', plan: sm.plan, subscription: sub };
}

async function takeBack(ch, deps, why) {
  var rpc = deps.rpc;
  var buy = await purchaseOfCharge(ch, deps);
  if (!buy) return { handled: false };
  if (buy.kind === 'item') { await rpc('pro_revoke_item', { p_user: buy.user, p_item: buy.item, p_ref: buy.ref }); return { handled: true, action: 'item_' + why }; }
  if (buy.plan === 'library') { await rpc('pro_revoke_library', { p_user: buy.user }); return { handled: true, action: 'library_' + why }; }
  // (only the plan that was paid for: a lifetime refund must not end a subscription, or a trial, on the same account)
  await rpc('pro_revoke_plan', { p_user: buy.user, p_plan: buy.plan });
  await restoreHeldSubscriptions(buy.user, buy.plan, deps);
  return { handled: true, action: buy.plan + '_' + why };
}

/**
 * A member keeps one Pro record, so taking a plan back can also take away a subscription they still pay for (a refunded
 * lifetime sits on top of a monthly one). Ask Stripe what they still hold and put it back.
 */
async function restoreHeldSubscriptions(user, revokedPlan, deps) {
  if (!deps.listSubscriptions) return;
  var customer = await deps.rpc('pro_user_customer', { p_user: user });
  if (!customer) return;
  var subs = await deps.listSubscriptions(customer);
  var grants = grantsFromSubscriptions(subs, deps.now).filter(function (g) { return g.plan !== revokedPlan; });
  for (var i = 0; i < grants.length; i++) {
    await deps.rpc('pro_grant_until', { p_user: user, p_until: grants[i].until, p_plan: grants[i].plan, p_source: 'stripe', p_trial: grants[i].trial });
  }
}

async function giveBack(ch, deps) {
  var rpc = deps.rpc;
  var buy = await purchaseOfCharge(ch, deps);
  if (!buy) return { handled: false };
  if (buy.kind === 'item') { await rpc('pro_grant_item', { p_user: buy.user, p_item: buy.item, p_source: 'stripe', p_ref: buy.ref }); return { handled: true, action: 'item_restored' }; }
  if (buy.plan === 'library') { await rpc('pro_grant_library', { p_user: buy.user, p_source: 'stripe' }); return { handled: true, action: 'library_restored' }; }
  if (buy.plan === 'lifetime') {
    await rpc('pro_grant_until', { p_user: buy.user, p_until: new Date((deps.now + LIFETIME_DAYS * DAY - DAY) * 1000).toISOString(), p_plan: 'lifetime', p_source: 'stripe', p_trial: false });
    return { handled: true, action: 'lifetime_restored' };
  }
  var until = subscriptionUntil(buy.subscription, deps.now);
  if (!until) return { handled: false };
  await rpc('pro_grant_until', { p_user: buy.user, p_until: until, p_plan: buy.plan, p_source: 'stripe', p_trial: false });
  return { handled: true, action: buy.plan + '_restored' };
}

/** A finished Checkout: give what was bought. */
async function handleSession(obj, deps) {
  var rpc = deps.rpc;
  var isItem = !!(obj.metadata && obj.metadata.kind === 'item');
  var userId = obj.client_reference_id || (obj.metadata && obj.metadata.user_id);
  var p = isItem ? null : anyProductFor(obj.metadata && obj.metadata.plan);
  if (!userId || (isItem ? !obj.metadata.item_id : !p)) return { handled: false };
  if (obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') return { handled: false };
  // Events can arrive late and out of order. If this payment has already been refunded (or is in dispute), the refund
  // came first and must win: giving the purchase now would hand it back for free.
  if (obj.payment_intent && deps.isPaymentReturned && (isItem || p.def.kind === 'payment')) {
    if (await deps.isPaymentReturned(typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent.id)) return { handled: false, action: 'already_returned' };
  }
  if (obj.customer) await rpc('pro_link_customer', { p_customer: obj.customer, p_user: userId });
  if (isItem) {
    // (granted whatever the catalog says now: someone who paid for it always gets it)
    var pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : (obj.payment_intent && obj.payment_intent.id) || null;
    var got = await rpc('pro_grant_item', { p_user: userId, p_item: obj.metadata.item_id, p_source: 'stripe', p_ref: pi });
    // Paid twice for the same thing (two checkout pages open, both paid): the first payment keeps the item and the second
    // is returned in full, so nobody is charged for something they already have.
    if (got === 'duplicate' && pi && deps.refundPayment) {
      await deps.refundPayment(pi);
      return { handled: true, action: 'item_duplicate_refunded' };
    }
    return { handled: true, action: 'item' };
  }
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
