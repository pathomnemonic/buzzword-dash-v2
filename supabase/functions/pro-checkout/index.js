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
import { PRODUCTS, configuredProducts, describePrice, checkoutParams } from '../_shared/billing.js';

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
  for (var id of configuredProducts(env)) list.push(describePrice(id, await stripe('prices/' + encodeURIComponent(env[PRODUCTS[id].env]))));
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

    var customer = await admin.rpc('pro_user_customer', { p_user: user.id });
    var customerId = customer && customer.data ? customer.data : '';

    if (body.action === 'portal') {
      if (!customerId) return json({ error: 'No web subscription found for this account.' }, 404);
      var portal = await stripe('billing_portal/sessions', { customer: customerId, return_url: env.SITE_URL + '/' });
      return json({ url: portal.url });
    }

    if (body.action === 'checkout') {
      var params = checkoutParams(body.plan, user.id, env, { customer: customerId || undefined });
      if (!params.customer) params.customer_email = user.email || undefined;
      Object.keys(params).forEach(function (k) { if (params[k] === undefined) delete params[k]; });
      var session = await stripe('checkout/sessions', params);
      return json({ url: session.url });
    }
    return json({ error: 'Unknown request.' }, 400);
  } catch (e) {
    console.error('pro-checkout failed', e && e.message);
    return json({ error: (e && e.message) || 'Something went wrong.' }, 400);
  }
});
