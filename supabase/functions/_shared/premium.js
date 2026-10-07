/**
 * premium.js — the Locker items sold for real money, and what they cost.
 *
 * One list, shared by the app (what the Locker shows) and the payment function (what Stripe is asked to charge), so the
 * price on the button and the price charged can never differ. Prices are in US cents. No Stripe setup is needed per item:
 * the checkout is created with the amount from here.
 *
 * An item listed here cannot be bought with coins and cannot be taken as the Pro gift. Anyone who already owned one
 * before it became premium keeps it.
 */
export var PREMIUM_ITEMS = {
  avatar_m_king: 499,
  monster_m_dragon: 299,
  pal_dragon: 199,
  trail_rainbow: 199,
  cloth_cape_rainbow: 299,
  gear_wings: 299
};

/** Is this item sold for money only? */
export function isPremiumItem(id) {
  return Object.prototype.hasOwnProperty.call(PREMIUM_ITEMS, String(id));
}

/** The price in US cents, or 0 when the item is not premium. */
export function premiumCents(id) {
  return isPremiumItem(id) ? PREMIUM_ITEMS[id] : 0;
}

/** "$2.99" for 299. */
export function formatUsd(cents) {
  var n = Number(cents) || 0;
  return '$' + (n / 100).toFixed(2);
}

/** The store product id for an item (the phone apps sell each one as a one-time product). */
export function itemProductId(id) {
  return 'dxdash_item_' + String(id);
}
