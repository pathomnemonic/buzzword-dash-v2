// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { reconcile, returned } from '../../tools/reconcile-lib.mjs';

const NOW = 1_800_000_000;
const ok = { status: 'complete', payment_status: 'paid', mode: 'payment' };
const item = (id, user, charge, extra) => ({ ...ok, id: 'cs_' + id, client_reference_id: user, metadata: { kind: 'item', item_id: id, user_id: user }, payment_intent: { latest_charge: charge || { refunded: false } }, ...extra });
const life = (user, charge) => ({ ...ok, id: 'cs_life', client_reference_id: user, metadata: { plan: 'lifetime', user_id: user }, payment_intent: { latest_charge: charge || { refunded: false } } });
const future = new Date((NOW + 86400 * 100) * 1000).toISOString();
const empty = { items: [], entitlements: [] };

describe('comparing Stripe with the database', () => {
  it('is quiet when everything matches', () => {
    const db = { items: [{ user_id: 'u1', item_id: 'trail_fire' }], entitlements: [{ user_id: 'u2', plan: 'lifetime', until: future }] };
    expect(reconcile([item('trail_fire', 'u1'), life('u2')], db, NOW)).toEqual([]);
  });

  it('finds a payment that was never delivered', () => {
    const out = reconcile([item('trail_fire', 'u1'), life('u2')], empty, NOW);
    expect(out.map((o) => o.problem + ':' + o.what)).toEqual(['paid, not delivered:item trail_fire', 'paid, not delivered:lifetime']);
    expect(out[0]).toMatchObject({ user: 'u1', session: 'cs_trail_fire' });
  });

  it('finds a refunded or lost chargeback that is still held, and ignores a won one', () => {
    const db = { items: [{ user_id: 'u1', item_id: 'trail_fire' }], entitlements: [{ user_id: 'u2', plan: 'lifetime', until: future }] };
    const out = reconcile([item('trail_fire', 'u1', { refunded: true }), life('u2', { disputed: true, dispute: { status: 'lost' } })], db, NOW);
    expect(out.map((o) => o.problem)).toEqual(['given back, still held', 'given back, still held']);
    expect(reconcile([item('trail_fire', 'u1', { disputed: true, dispute: { status: 'won' } })], db, NOW)).toEqual([]);
  });

  it('a refunded purchase that is already gone is fine', () => {
    expect(reconcile([item('trail_fire', 'u1', { refunded: true })], empty, NOW)).toEqual([]);
  });

  it('finds a live subscription whose member has no Pro, but not an ended one', () => {
    const sub = (status) => ({ status: 'complete', payment_status: 'paid', mode: 'subscription', id: 'cs_sub', client_reference_id: 'u3', metadata: { plan: 'monthly', user_id: 'u3' }, subscription: { status } });
    expect(reconcile([sub('active')], empty, NOW).map((o) => o.problem)).toEqual(['subscription live, no Pro']);
    expect(reconcile([sub('canceled')], empty, NOW)).toEqual([]);
    expect(reconcile([sub('active')], { items: [], entitlements: [{ user_id: 'u3', plan: 'monthly', until: future }] }, NOW)).toEqual([]);
  });

  it('skips unpaid or incomplete sessions and ones with no member', () => {
    expect(reconcile([{ ...item('trail_fire', 'u1'), payment_status: 'unpaid' }, { ...item('trail_fire', 'u1'), status: 'open' }, { ...item('trail_fire', ''), client_reference_id: '', metadata: { kind: 'item', item_id: 'trail_fire' } }], empty, NOW)).toEqual([]);
  });

  it('knows what counts as returned', () => {
    expect(returned({ refunded: true })).toBe(true);
    expect(returned({ disputed: true, dispute: 'dp_1' })).toBe(true);
    expect(returned({ disputed: true, dispute: { status: 'warning_closed' } })).toBe(false);
    expect(returned(null)).toBe(false);
  });
});
