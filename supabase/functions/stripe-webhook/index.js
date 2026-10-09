// stripe-webhook — Stripe tells us a payment happened; this turns it into Pro in the database.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Supabase sets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY itself)
// In Stripe: Developers -> Webhooks -> add https://<project>.supabase.co/functions/v1/stripe-webhook and send
//   checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, charge.refunded,
//   charge.dispute.created, charge.dispute.updated and charge.dispute.closed.
// Every request is checked against the webhook signing secret first; anything unsigned is refused.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyStripeSignature, handleEvent, chargeReturned } from '../_shared/billing.js';

var STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
var SIGNING_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
var db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });

async function getSubscription(id) {
  var res = await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + STRIPE_KEY } });
  if (!res.ok) throw new Error('Stripe said ' + res.status + ' for the subscription');
  return res.json();
}

async function stripeGet(path) {
  var res = await fetch('https://api.stripe.com/v1/' + path, { headers: { Authorization: 'Bearer ' + STRIPE_KEY } });
  if (!res.ok) throw new Error('Stripe said ' + res.status + ' for ' + path.split('?')[0]);
  return res.json();
}
function getCharge(id) { return stripeGet('charges/' + encodeURIComponent(id) + '?expand[]=dispute'); }
async function listSubscriptions(customer) { var r = await stripeGet('subscriptions?customer=' + encodeURIComponent(customer) + '&status=all&limit=10'); return (r && r.data) || []; }
function getInvoice(id) { return stripeGet('invoices/' + encodeURIComponent(id)); }
/** Has this payment already been refunded, or is it in dispute? (A late "completed" event must not hand it back.) */
async function isPaymentReturned(paymentIntentId) {
  var pi = await stripeGet('payment_intents/' + encodeURIComponent(paymentIntentId) + '?expand[]=latest_charge.dispute');
  return chargeReturned(pi && pi.latest_charge);
}

/** Return a payment in full. The idempotency key makes a repeated call (Stripe retries) refund it once. */
async function refundPayment(paymentIntentId) {
  var res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': 'dxdash-duplicate-' + paymentIntentId },
    body: new URLSearchParams({ payment_intent: paymentIntentId, reason: 'duplicate', 'metadata[why]': 'paid twice for the same Locker item' }).toString()
  });
  if (!res.ok) throw new Error('Stripe said ' + res.status + ' for the refund');
}

async function rpc(name, args) {
  var r = await db.rpc(name, args);
  if (r.error) throw new Error(name + ': ' + r.error.message);
  return r.data;
}

Deno.serve(async function (req) {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  var raw = await req.text();
  var now = Math.floor(Date.now() / 1000);
  if (!(await verifyStripeSignature(raw, req.headers.get('stripe-signature'), SIGNING_SECRET, now))) return new Response('bad signature', { status: 400 });
  var event;
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  try {
    var out = await handleEvent(event, { rpc: rpc, getSubscription: getSubscription, getCharge: getCharge, getInvoice: getInvoice, listSubscriptions: listSubscriptions, isPaymentReturned: isPaymentReturned, refundPayment: refundPayment, now: now });
    if (out.handled) await rpc('pro_event_once', { p_event: event.id, p_kind: event.type }); // (a record for the owner; repeats are harmless)
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('stripe-webhook failed', event && event.type, e && e.message);
    return new Response('failed', { status: 500 }); // Stripe tries again later
  }
});
