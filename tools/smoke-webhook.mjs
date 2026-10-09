#!/usr/bin/env node
/**
 * smoke-webhook.mjs — "is my deployed payment webhook really wired up?" in a few seconds, with no real payment.
 *
 *   WEBHOOK_URL=https://xxxx.supabase.co/functions/v1/stripe-webhook STRIPE_WEBHOOK_SECRET=whsec_... \
 *     node tools/smoke-webhook.mjs
 *
 * It checks that the webhook refuses what it should (no signature, a wrong signature, an old one) and accepts a correctly
 * signed event it does not care about. With --grant-test it also sends a correctly signed, made-up purchase of a Locker
 * item for the member you name, then asks the database whether it arrived (needs SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY). That proves the whole chain: signature check, secrets, database functions. It leaves the
 * test item behind; the last line prints the one SQL statement that removes it.
 *
 *   node tools/smoke-webhook.mjs --grant-test <member user id> [--item trail_fire]
 *
 * Use it against a TEST project or a member you control: a "purchase" it makes is real as far as the database knows.
 */
import { createHmac } from 'node:crypto';

var URL_ = process.env.WEBHOOK_URL;
var SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!URL_ || !SECRET) { console.error('Set WEBHOOK_URL and STRIPE_WEBHOOK_SECRET (see the top of this file).'); process.exit(2); }

function sign(body, secret, t) { return createHmac('sha256', secret).update(t + '.' + body).digest('hex'); }
async function send(body, headers) { var r = await fetch(URL_, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: body }); return r.status; }

var failures = 0;
function check(name, got, want) { var ok = got === want; if (!ok) failures++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ' (got ' + got + ', wanted ' + want + ')'); }

var now = Math.floor(Date.now() / 1000);
var event = JSON.stringify({ id: 'evt_smoke_' + now, type: 'customer.created', data: { object: { id: 'cus_smoke' } } });
check('no signature is refused', await send(event), 400);
check('a wrong signature is refused', await send(event, { 'stripe-signature': 't=' + now + ',v1=' + sign(event, 'whsec_wrong', now) }), 400);
check('an old signature is refused', await send(event, { 'stripe-signature': 't=' + (now - 3600) + ',v1=' + sign(event, SECRET, now - 3600) }), 400);
check('a correctly signed event nobody needs is accepted', await send(event, { 'stripe-signature': 't=' + now + ',v1=' + sign(event, SECRET, now) }), 200);

var at = process.argv.indexOf('--grant-test');
if (at > 0) {
  var user = process.argv[at + 1];
  var itemAt = process.argv.indexOf('--item');
  var item = itemAt > 0 ? process.argv[itemAt + 1] : 'trail_fire';
  var DB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!user || !DB || !KEY) { console.error('--grant-test needs a user id, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(2); }
  var purchase = JSON.stringify({ id: 'evt_smoke_buy_' + now, type: 'checkout.session.completed', data: { object: { id: 'cs_smoke_' + now, mode: 'payment', client_reference_id: user, payment_status: 'paid', metadata: { kind: 'item', item_id: item, user_id: user } } } });
  check('a signed purchase is accepted', await send(purchase, { 'stripe-signature': 't=' + now + ',v1=' + sign(purchase, SECRET, now) }), 200);
  var res = await fetch(DB + '/rest/v1/pro_items?select=item_id&user_id=eq.' + encodeURIComponent(user) + '&item_id=eq.' + encodeURIComponent(item), { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  var rows = res.ok ? await res.json() : [];
  check('the item reached the database', rows.length, 1);
  console.log("\nTo remove the test item:  SELECT pro_revoke_item('" + user + "', '" + item + "');");
}
process.exit(failures ? 1 : 0);
