// iap-verify — checks a phone-store purchase (Google Play or the App Store) and attaches it to the signed-in account.
//
// The app sends { platform: 'android'|'ios', product_id, token } with the player's sign-in:
//   android: token is the purchase token; ios: token is the transaction id.
// The function asks Google / Apple whether the purchase is real, belongs it to this account (one purchase, one account),
// and grants or takes back Pro or the item in the database. It only ever trusts what Google or Apple answer.
//
// Deploy:  supabase functions deploy iap-verify
// Secrets (set the ones for the stores you sell in):
//   Google Play:  GOOGLE_PLAY_PACKAGE (com.pathomnemonic.dxdash), GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY
//                 (a service account added in Play Console → Users and permissions with "View financial data" and "Manage orders")
//   App Store:    APPLE_BUNDLE_ID (com.pathomnemonic.dxdash), APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY
//                 (an In-App Purchase key from App Store Connect → Users and Access → Integrations → In-App Purchase)
// The app only calls this when built with VITE_IAP_VERIFY=1.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  describeStoreProduct, tokenKey, googleConfigured, appleStoreConfigured, googleAssertion, googleUrl, parseGoogleSubscription, parseGoogleProduct,
  appleStoreJwt, appleTransactionUrls, decodeJwsPayload, parseAppleTransaction, grantFor
} from '../_shared/storeverify.js';

var env = {};
['GOOGLE_PLAY_PACKAGE', 'GOOGLE_SA_EMAIL', 'GOOGLE_SA_PRIVATE_KEY', 'APPLE_BUNDLE_ID', 'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_KEY_ID', 'APPLE_IAP_PRIVATE_KEY'].forEach(function (k) { env[k] = Deno.env.get(k) || ''; });
var admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
function json(body, status) { return new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) }); }

async function googleCheck(product, productId, token, nowSec) {
  var tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await googleAssertion(env, nowSec) }).toString()
  });
  var access = tokenRes.ok ? (await tokenRes.json()).access_token : '';
  if (!access) throw new Error('Google would not give access');
  var res = await fetch(googleUrl(product.kind === 'subscription' ? 'subscription' : 'product', env.GOOGLE_PLAY_PACKAGE, productId, token), { headers: { Authorization: 'Bearer ' + access } });
  if (res.status === 404 || res.status === 410) return { valid: false, revoked: false, expiresAt: 0, pending: false, unknown: true };
  if (!res.ok) throw new Error('Google said ' + res.status);
  var data = await res.json();
  return product.kind === 'subscription' ? parseGoogleSubscription(data, nowSec) : parseGoogleProduct(data);
}

async function appleCheck(transactionId, nowSec) {
  var jwt = await appleStoreJwt(env, nowSec);
  var urls = appleTransactionUrls(transactionId);
  for (var i = 0; i < urls.length; i++) {
    var res = await fetch(urls[i], { headers: { Authorization: 'Bearer ' + jwt } });
    if (res.status === 404) continue; // (not known here: a sandbox purchase is only known to the sandbox)
    if (!res.ok) throw new Error('Apple said ' + res.status);
    var data = await res.json();
    return parseAppleTransaction(decodeJwsPayload(data.signedTransactionInfo), env.APPLE_BUNDLE_ID, nowSec);
  }
  return null;
}

Deno.serve(async function (req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  var body = {};
  try { body = await req.json(); } catch { body = {}; }
  try {
    var jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    var who = jwt ? await admin.auth.getUser(jwt) : null;
    var user = who && who.data && who.data.user;
    if (!user) return json({ error: 'Sign in first.' }, 401);
    if (user.is_anonymous || !user.email) return json({ error: 'Create an account first, so what you bought stays with you.' }, 403);

    var platform = body.platform === 'ios' ? 'ios' : body.platform === 'android' ? 'android' : '';
    var productId = String(body.product_id || '');
    var token = String(body.token || '');
    var product = describeStoreProduct(productId);
    if (!platform || !product || token.length < 6 || token.length > 5000) return json({ error: 'That purchase could not be read.' }, 400);
    if (platform === 'android' ? !googleConfigured(env) : !appleStoreConfigured(env)) return json({ error: 'Purchase checking is not set up for this store yet.' }, 503);

    var nowSec = Math.floor(Date.now() / 1000);
    var check;
    var key;
    try {
      if (platform === 'android') { key = await tokenKey(token); check = await googleCheck(product, productId, token, nowSec); } else {
        check = await appleCheck(token, nowSec);
        key = check && check.key;
        if (check && check.productId && check.productId !== productId) return json({ error: 'That purchase is for a different product.' }, 400);
      }
    } catch (e) {
      console.error('iap-verify: store check failed', e && e.message);
      return json({ error: 'Could not check with the store just now. Please try again.' }, 502); // (nothing is taken away on an error)
    }
    if (!check || check.unknown || !key) return json({ ok: true, valid: false, granted: false }); // (the store does not know this purchase: nothing to give)

    var claim = await admin.rpc('pro_store_claim', { p_platform: platform, p_key: key, p_user: user.id, p_product: productId, p_expires: check.expiresAt ? new Date(check.expiresAt * 1000).toISOString() : null, p_revoked: !!check.revoked });
    if (claim.error) { console.error('iap-verify: claim failed', claim.error.message); return json({ error: 'Could not save the purchase.' }, 500); }
    if (claim.data === 'other_account') return json({ error: 'That purchase already belongs to another account.' }, 409);

    var action = grantFor(product, check, user.id, key, nowSec);
    if (action) {
      var done = await admin.rpc(action.rpc, action.args);
      if (done.error) { console.error('iap-verify: grant failed', action.rpc, done.error.message); return json({ error: 'Could not save the purchase.' }, 500); }
    }
    return json({ ok: true, valid: !!check.valid, revoked: !!check.revoked, pending: !!check.pending, granted: !!(action && !check.revoked && check.valid) });
  } catch (e) {
    console.error('iap-verify failed', e && e.message);
    return json({ error: 'Something went wrong.' }, 400);
  }
});
