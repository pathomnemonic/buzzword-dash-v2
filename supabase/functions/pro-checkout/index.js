// pro-checkout — the website's way to buy Dx Dash Pro.
//
// The page calls this with the player's sign-in (a Supabase session) and one of:
//   { action: 'prices' }                 -> the plans for sale, with real prices from Stripe
//   { action: 'checkout', plan: 'yearly' } -> { url } of a Stripe Checkout page to send the player to
//   { action: 'portal' }                 -> { url } of the Stripe page where they cancel or change a subscription
//
// Deploy:  supabase functions deploy pro-checkout
// Secrets: STRIPE_SECRET_KEY, SITE_URL (https://yourname.github.io/buzzword-dash-v2), and one Price id per product:
//   STRIPE_PRICE_YEARLY, STRIPE_PRICE_PASS3M, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_LIFETIME (any you do not sell can be left out)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PRODUCTS, LIFETIME_DAYS, chargeReturned, configuredProducts, describePrice, checkoutParams, itemCheckoutParams, portalConfig, productFor, grantsFromSubscriptions, periodEnd } from '../_shared/billing.js';
import { isPremiumItem } from '../_shared/premium.js';
import { appleConfigured, appleRevokeForm, revokeSucceeded, hasAppleLogin } from '../_shared/applesignin.js';

var STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
var env = {};
Object.keys(PRODUCTS).forEach(function (id) { env[PRODUCTS[id].env] = Deno.env.get(PRODUCTS[id].env) || ''; });
env.SITE_URL = Deno.env.get('SITE_URL') || '';
var appleEnv = {};
['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_CLIENT_ID'].forEach(function (k) { appleEnv[k] = Deno.env.get(k) || ''; });
var admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
function json(body, status) { return new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) }); }

async function stripe(path, form, method) {
  var res = await fetch('https://api.stripe.com/v1/' + path, {
    method: method || (form ? 'POST' : 'GET'),
    headers: Object.assign({ Authorization: 'Bearer ' + STRIPE_KEY }, form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    body: form ? new URLSearchParams(form).toString() : undefined
  });
  var data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || 'Stripe said ' + res.status);
  return data;
}

var _prices = { at: 0, list: [] };
async function prices() {
  if (Date.now() - _prices.at < 5 * 60 * 1000) return _prices.list;
  var list = [];
  for (var id of configuredProducts(env)) {
    try { list.push(describePrice(id, await stripe('prices/' + encodeURIComponent(env[PRODUCTS[id].env])))); } catch (e) { console.error('price for ' + id + ' failed', e && e.message); } // (one bad Price id must not hide the others)
  }
  if (!list.length) throw new Error('No plan could be loaded. Check the STRIPE_PRICE_* secrets are Price ids (price_...) from the same Stripe mode as the secret key.');
  _prices = { at: Date.now(), list: list };
  return list;
}

Deno.serve(async function (req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!STRIPE_KEY) return json({ error: 'Web payments are not set up yet.' }, 503);
  var body = {};
  try { body = await req.json(); } catch { body = {}; }
  try {
    if (body.action === 'prices') return json({ plans: await prices() });

    // everything else needs a signed-in player
    var jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    var who = jwt ? await admin.auth.getUser(jwt) : null;
    var user = who && who.data && who.data.user;
    if (!user) return json({ error: 'Sign in first.' }, 401);

    if (user.is_anonymous || !user.email) return json({ error: 'Create an account first (Friends → Account), so Pro stays with you.' }, 403);

    var customer = await admin.rpc('pro_user_customer', { p_user: user.id });
    var customerId = customer && customer.data ? customer.data : '';

    if (body.action === 'portal') {
      if (!customerId) return json({ error: 'No web subscription found for this account.' }, 404);
      var ret = { customer: customerId, return_url: env.SITE_URL + '/?pro=billing' };
      // "Cancel": open Stripe's page straight at the cancel step for their subscription (falls back to the normal page)
      var cancelFlow = null;
      if (body.cancel) {
        try {
          var subs = await stripe('subscriptions?customer=' + encodeURIComponent(customerId) + '&status=active&limit=1');
          var sub = subs && subs.data && subs.data[0];
          if (sub) cancelFlow = { 'flow_data[type]': 'subscription_cancel', 'flow_data[subscription_cancel][subscription]': sub.id };
        } catch { cancelFlow = null; }
      }
      var portal;
      var attempt = function (extra) { return stripe('billing_portal/sessions', Object.assign({}, ret, extra || {})); };
      try {
        try { portal = await attempt(cancelFlow); } catch (e1) { if (!cancelFlow) throw e1; portal = await attempt(); }
      } catch (e) {
        // no portal settings saved in the Stripe Dashboard yet: create ours (cancel at period end, update card, invoices), then retry
        if (!/configuration/i.test((e && e.message) || '')) throw e;
        var cfg = await stripe('billing_portal/configurations', portalConfig(env));
        try { portal = await attempt(Object.assign({ configuration: cfg.id }, cancelFlow || {})); } catch { portal = await attempt({ configuration: cfg.id }); }
      }
      return json({ url: portal.url });
    }

    // Keep the Sign in with Apple token so that deleting the account can revoke it (an App Store rule). Only Apple logins.
    if (body.action === 'apple_token') {
      var tok = String(body.refresh_token || '');
      if (!hasAppleLogin(user) || tok.length < 10 || tok.length > 4000) return json({ error: 'Nothing to keep.' }, 400);
      var saved = await admin.rpc('apple_token_save', { p_user: user.id, p_token: tok });
      if (saved && saved.error) { console.error('pro-checkout apple_token failed', saved.error.message); return json({ error: 'Could not save.' }, 500); }
      return json({ ok: true });
    }

    // Delete the account for good. A subscription that is still billing is cancelled first (immediately, no further
    // charge), and if that cannot be done the account is NOT deleted, so nobody keeps paying for an account that is gone.
    if (body.action === 'delete_account') {
      if (customerId) {
        var mine;
        try { mine = await stripe('subscriptions?customer=' + encodeURIComponent(customerId) + '&status=all&limit=20'); } catch (e) {
          if (!/no such customer/i.test((e && e.message) || '')) { console.error('pro-checkout delete: could not list subscriptions', e && e.message); return json({ error: 'Could not check your subscription just now, so nothing was deleted. Please try again.' }, 502); }
          mine = { data: [] };
        }
        var billing = ((mine && mine.data) || []).filter(function (x) { return ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].indexOf(x.status) >= 0; });
        for (var sb of billing) {
          try { await stripe('subscriptions/' + encodeURIComponent(sb.id), null, 'DELETE'); } catch (e) {
            console.error('pro-checkout delete: could not cancel', sb.id, e && e.message);
            return json({ error: 'Could not cancel your subscription, so nothing was deleted. Please try again, or cancel it under Manage subscription first.' }, 502);
          }
        }
      }
      // Apple requires that deleting an account also revokes its Sign in with Apple login. If Apple cannot be reached, nothing is deleted.
      if (hasAppleLogin(user)) {
        var appleTok = await admin.rpc('apple_token_get', { p_user: user.id });
        if (appleTok && appleTok.data && appleConfigured(appleEnv)) {
          try {
            var ares = await fetch('https://appleid.apple.com/auth/revoke', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams(await appleRevokeForm(appleEnv, appleTok.data, Math.floor(Date.now() / 1000))).toString()
            });
            if (!revokeSucceeded({ status: ares.status, body: await ares.text().catch(function () { return ''; }) })) throw new Error('Apple said ' + ares.status);
          } catch (e) {
            console.error('pro-checkout delete: could not revoke Apple login', e && e.message);
            return json({ error: 'Could not sign you out of Apple just now, so nothing was deleted. Please try again.' }, 502);
          }
        } else {
          console.warn('pro-checkout delete: Apple login has no stored token or the APPLE_* secrets are not set; deleting without revoking');
        }
      }
      var forgot = await admin.rpc('pro_forget_user', { p_user: user.id });
      if (forgot && forgot.error) { console.error('pro-checkout delete: could not clear payment records', forgot.error.message); return json({ error: 'Could not delete the account. Please try again.' }, 500); }
      var gone = await admin.auth.admin.deleteUser(user.id);
      if (gone && gone.error) { console.error('pro-checkout delete: could not delete user', gone.error.message); return json({ error: 'Could not delete the account. Please try again.' }, 500); }
      return json({ ok: true, cancelled: customerId ? true : false });
    }

    // What Stripe says about this member's subscription right now: is it renewing, or set to end? (The app never assumes
    // that tapping Cancel meant cancelling: it asks, and tells the member what is actually true.)
    if (body.action === 'subscription') {
      if (!customerId) return json({ ok: true, status: 'none' });
      var found;
      try { found = await stripe('subscriptions?customer=' + encodeURIComponent(customerId) + '&status=all&limit=10'); } catch (e) { console.error('pro-checkout subscription failed', e && e.message); return json({ ok: false, error: 'Could not check with Stripe just now.' }, 502); }
      var liveSub = ((found && found.data) || []).filter(function (x) { return ['active', 'trialing', 'past_due'].indexOf(x.status) >= 0; })[0];
      if (!liveSub) return json({ ok: true, status: 'none' });
      var endSec = periodEnd(liveSub);
      return json({ ok: true, status: liveSub.status, cancel_at_period_end: !!liveSub.cancel_at_period_end || !!liveSub.cancel_at, ends: endSec ? new Date(endSec * 1000).toISOString() : '', plan: (liveSub.metadata && liveSub.metadata.plan) || '' });
    }

    // Put right a member whose payment event never reached us: ask Stripe what this customer holds and grant it.
    // (Safe to repeat: a grant never shortens what someone already has.)
    if (body.action === 'sync') {
      if (!customerId) return json({ ok: true, granted: [] });
      var granted = [];
      try {
        var all = await stripe('subscriptions?customer=' + encodeURIComponent(customerId) + '&status=all&limit=10');
        var now = Math.floor(Date.now() / 1000);
        var grants = grantsFromSubscriptions(all && all.data, now);
        for (var g of grants) {
          var r = await admin.rpc('pro_grant_until', { p_user: user.id, p_until: g.until, p_plan: g.plan, p_source: 'stripe', p_trial: g.trial });
          if (r.error) throw new Error(r.error.message);
          granted.push(g.plan);
        }
        // a lifetime purchase (and not refunded)
        var sessions = await stripe('checkout/sessions?customer=' + encodeURIComponent(customerId) + '&limit=100&expand[]=data.payment_intent.latest_charge.dispute');
        var life = ((sessions && sessions.data) || []).filter(function (x) {
          var ch = x.payment_intent && x.payment_intent.latest_charge;
          return x.status === 'complete' && x.payment_status === 'paid' && x.metadata && x.metadata.plan === 'lifetime' && ch && typeof ch === 'object' && !chargeReturned(ch);
        })[0];
        // premium items bought with this customer (and not refunded)
        var bought = ((sessions && sessions.data) || []).filter(function (x) {
          var ch = x.payment_intent && x.payment_intent.latest_charge;
          return x.status === 'complete' && x.payment_status === 'paid' && x.metadata && x.metadata.kind === 'item' && x.metadata.item_id && ch && typeof ch === 'object' && !chargeReturned(ch);
        });
        for (var it of bought) {
          var ir = await admin.rpc('pro_grant_item', { p_user: user.id, p_item: it.metadata.item_id, p_source: 'stripe', p_ref: typeof it.payment_intent === 'string' ? it.payment_intent : (it.payment_intent && it.payment_intent.id) || null });
          if (ir.error) throw new Error(ir.error.message);
          granted.push('item:' + it.metadata.item_id);
        }
        if (life) {
          var lr = await admin.rpc('pro_grant_until', { p_user: user.id, p_until: new Date((now + LIFETIME_DAYS * 86400 - 86400) * 1000).toISOString(), p_plan: 'lifetime', p_source: 'stripe', p_trial: false });
          if (lr.error) throw new Error(lr.error.message);
          granted.push('lifetime');
        }
      } catch (e) {
        console.error('pro-checkout sync failed', e && e.message);
        return json({ ok: false, error: 'Could not check with Stripe just now.' }, 502);
      }
      return json({ ok: true, granted: granted });
    }

    // What this deployment can do. The app asks first, so it never offers something the backend cannot deliver.
    if (body.action === 'capabilities') {
      var probe = await admin.rpc('pro_has_item', { p_user: user.id, p_item: 'probe' });
      return json({ ok: true, items: !probe.error });
    }

    // A premium Locker item (a one-time purchase, priced from premium.js)
    if (body.action === 'item') {
      var itemId = String(body.item || '');
      if (!isPremiumItem(itemId)) return json({ error: 'That item is not for sale.' }, 400);
      // Never take money the backend cannot turn into the item: if its database is not ready, stop before Stripe is touched.
      var owns = await admin.rpc('pro_has_item', { p_user: user.id, p_item: itemId });
      if (owns.error) { console.error('pro-checkout item: database not ready', owns.error.message); return json({ error: 'Locker items are not switched on just yet. You have not been charged.' }, 503); }
      if (owns.data === true) return json({ error: 'You already own this item.' }, 409);
      var staleCust = function (e) { return /no such customer/i.test((e && e.message) || ''); };
      var buildItem = function (cust) {
        var pr = itemCheckoutParams(itemId, user.id, env, { customer: cust || undefined, name: String(body.name || '') });
        if (!pr.customer) pr.customer_email = user.email || undefined;
        Object.keys(pr).forEach(function (k) { if (pr[k] === undefined) delete pr[k]; });
        return pr;
      };
      var itemSession;
      try { itemSession = await stripe('checkout/sessions', buildItem(customerId)); } catch (e) {
        if (customerId && staleCust(e)) itemSession = await stripe('checkout/sessions', buildItem('')); else throw e;
      }
      return json({ url: itemSession.url });
    }

    if (body.action === 'checkout') {
      var wanted = productFor(body.plan);
      if (!wanted) return json({ error: 'Unknown plan.' }, 400);
      // someone who holds Pro for life has nothing left to buy: stop before Stripe is touched
      var held = await admin.from('pro_entitlements').select('plan, until').eq('user_id', user.id).maybeSingle();
      if (held && held.data && held.data.plan === 'lifetime' && new Date(held.data.until).getTime() > Date.now()) return json({ error: 'You already have Pro for life.' }, 409);
      // a customer saved while Stripe was in test mode does not exist in live mode: start fresh rather than fail to sell
      var staleCustomer = function (e) { return /no such customer/i.test((e && e.message) || ''); };
      if (customerId && wanted && wanted.def.kind === 'subscription') {
        try {
          var live = await stripe('subscriptions?customer=' + encodeURIComponent(customerId) + '&status=all&limit=10');
          var running = ((live && live.data) || []).filter(function (x) { return ['active', 'trialing', 'past_due'].indexOf(x.status) >= 0; });
          if (running.length) return json({ error: 'You already have an active subscription. Use Manage subscription in Settings → Dx Dash Pro.' }, 409);
        } catch (e) { if (staleCustomer(e)) customerId = ''; else throw e; }
      }
      var build = function (cust) {
        var params = checkoutParams(body.plan, user.id, env, { customer: cust || undefined });
        if (!params.customer) params.customer_email = user.email || undefined;
        Object.keys(params).forEach(function (k) { if (params[k] === undefined) delete params[k]; });
        return params;
      };
      var session;
      try { session = await stripe('checkout/sessions', build(customerId)); } catch (e) {
        if (customerId && staleCustomer(e)) session = await stripe('checkout/sessions', build('')); else throw e;
      }
      return json({ url: session.url });
    }
    return json({ error: 'Unknown request.' }, 400);
  } catch (e) {
    console.error('pro-checkout failed', e && e.message);
    return json({ error: (e && e.message) || 'Something went wrong.' }, 400);
  }
});
