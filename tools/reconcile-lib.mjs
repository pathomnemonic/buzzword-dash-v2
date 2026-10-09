/**
 * reconcile-lib.mjs — compares what Stripe says people paid for with what the database gave them. Pure (no network), so it
 * can be tested; tools/reconcile-stripe.mjs does the fetching.
 */

/** Has a charge been given back? (a refund, or a chargeback that is open or lost; a won one does not count) */
export function returned(charge) {
  if (!charge || typeof charge !== 'object') return false;
  if (charge.refunded) return true;
  if (!charge.disputed) return false;
  var d = charge.dispute;
  return !(d && typeof d === 'object' && (d.status === 'won' || d.status === 'warning_closed'));
}

/**
 * @param {object[]} sessions Stripe Checkout Sessions (complete), each with payment_intent.latest_charge expanded
 * @param {{items: {user_id: string, item_id: string}[], entitlements: {user_id: string, plan: string, until: string}[]}} db
 * @param {number} nowSec
 * @returns {{problem: string, user: string, what: string, session: string}[]}
 */
export function reconcile(sessions, db, nowSec) {
  var out = [];
  var hasItem = function (u, i) { return db.items.some(function (x) { return x.user_id === u && x.item_id === i; }); };
  var ent = function (u) { return db.entitlements.filter(function (x) { return x.user_id === u; })[0] || null; };
  (sessions || []).forEach(function (s) {
    if (!s || s.status !== 'complete' || (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required')) return;
    var m = s.metadata || {};
    var user = s.client_reference_id || m.user_id;
    if (!user) return;
    var charge = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent.latest_charge : null;
    var gone = s.mode === 'payment' && returned(charge);
    if (m.kind === 'item' && m.item_id) {
      var has = hasItem(user, m.item_id);
      if (!gone && !has) out.push({ problem: 'paid, not delivered', user: user, what: 'item ' + m.item_id, session: s.id });
      if (gone && has) out.push({ problem: 'given back, still held', user: user, what: 'item ' + m.item_id, session: s.id });
    } else if (m.plan === 'lifetime') {
      var e = ent(user);
      var holds = !!(e && e.plan === 'lifetime' && Date.parse(e.until) / 1000 > nowSec);
      if (!gone && !holds) out.push({ problem: 'paid, not delivered', user: user, what: 'lifetime', session: s.id });
      if (gone && holds) out.push({ problem: 'given back, still held', user: user, what: 'lifetime', session: s.id });
    } else if (s.mode === 'subscription' && s.subscription && typeof s.subscription === 'object') {
      var sub = s.subscription;
      var live = ['active', 'trialing', 'past_due'].indexOf(sub.status) >= 0;
      var e2 = ent(user);
      var covered = !!(e2 && Date.parse(e2.until) / 1000 > nowSec);
      if (live && !covered) out.push({ problem: 'subscription live, no Pro', user: user, what: 'plan ' + (m.plan || '?'), session: s.id });
    }
  });
  return out;
}
