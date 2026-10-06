// stripe-webhook — Stripe tells us a payment happened; this turns it into Pro in the database.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Supabase sets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY itself)
// In Stripe: Developers -> Webhooks -> add https://<project>.supabase.co/functions/v1/stripe-webhook and send
//   checkout.session.completed, invoice.paid and charge.refunded.
// Every request is checked against the webhook signing secret first; anything unsigned is refused.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyStripeSignature, handleEvent } from '../_shared/billing.js';

var STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
var SIGNING_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
var db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });

async function getSubscription(id) {
  var res = await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + STRIPE_KEY } });
  if (!res.ok) throw new Error('Stripe said ' + res.status + ' for the subscription');
  return res.json();
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
    var out = await handleEvent(event, { rpc: rpc, getSubscription: getSubscription, now: now });
    if (out.handled) await rpc('pro_event_once', { p_event: event.id, p_kind: event.type }); // (a record for the owner; repeats are harmless)
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('stripe-webhook failed', event && event.type, e && e.message);
    return new Response('failed', { status: 500 }); // Stripe tries again later
  }
});
