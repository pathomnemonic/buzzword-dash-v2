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
  // heroes
  avatar_m_king: 299,      // Attending Arthur
  avatar_m_alien: 249,     // Anatomy Abby
  avatar_m_robot: 249,     // MRI Mo
  avatar_m_wizard: 199,    // Pharmacist Pip
  avatar_m_ninja: 199,     // Night-Shift Nico
  // the monster
  monster_m_dragon: 149,   // Dragon Lecturer
  // maps
  map_aquarium_imaging_center: 149,
  map_dna_helix_tunnel: 149,
  // trails
  trail_fire: 99,          // Fire Trail
  trail_neural: 99,        // Neural Sparks
  trail_blood: 99          // Blood Cells
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
