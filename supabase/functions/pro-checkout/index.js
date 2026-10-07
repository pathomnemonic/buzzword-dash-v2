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
import { PRODUCTS, LIFETIME_DAYS, configuredProducts, describePrice, checkoutParams, portalConfig, productFor, grantsFromSubscriptions } from '../_shared/billing.js';

var STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
var env = {};
Object.keys(PRODUCTS).forEach(function (id) { env[PRODUCTS[id].env] = Deno.env.get(PRODUCTS[id].env) || ''; });
env.SITE_URL = Deno.env.get('SITE_URL') || '';
var admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
function json(body, status) { return new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) }); }

async function stripe(path, form) {
  var res = await fetch('https://api.stripe.com/v1/' + path, {
    method: form ? 'POST' : 'GET',
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
      var ret = { customer: customerId, return_url: env.SITE_URL + '/' };
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
        var sessions = await stripe('checkout/sessions?customer=' + encodeURIComponent(customerId) + '&limit=20&expand[]=data.payment_intent.latest_charge');
        var life = ((sessions && sessions.data) || []).filter(function (x) {
          var ch = x.payment_intent && x.payment_intent.latest_charge;
          return x.status === 'complete' && x.payment_status === 'paid' && x.metadata && x.metadata.plan === 'lifetime' && ch && typeof ch === 'object' && !ch.refunded;
        })[0];
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

    if (body.action === 'checkout') {
      var wanted = productFor(body.plan);
      // a customer saved while Stripe was in test mode does not exist in live mode: start fresh rather than fail to sell
      var staleCustomer = function (e) { return /no such customer/i.test((e && e.message) || ''); };
      if (customerId && wanted && wanted.def.kind === 'subscription') {
        try {
          var live = await stripe('subscriptions?customer=' + encodeURIComponent(customerId) + '&status=active&limit=1');
          if (live && live.data && live.data.length) return json({ error: 'You already have an active subscription. Use Manage subscription in Settings → Dx Dash Pro.' }, 409);
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
