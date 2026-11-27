/**
 * premium.js — the Locker items sold for real money, and what they cost (the app's copy).
 *
 * The app and the payment edge functions each own a copy of this list: the app copy lives here, the
 * functions' copy in supabase/functions/_shared/premium.js. They used to be one shared module, which
 * meant a partial deploy (app shipped without the functions, or the other way round) could leave the
 * two sides disagreeing about what is premium. The charge itself is always created by the functions
 * from their own copy, so the price charged is whatever the server list says at purchase time; this
 * copy only drives what the Locker shows. Keep the two lists in step when items or prices change.
 *
 * Prices are in US cents. No Stripe setup is needed per item: the checkout is created with the amount
 * from the server list.
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
