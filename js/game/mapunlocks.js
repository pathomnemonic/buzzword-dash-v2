/**
 * mapunlocks.js — when each map becomes a reward.
 *
 * Everyone starts with the four hospital rooms. Every other map unlocks at a player level, one more every five levels
 * (5, 10, 15, ...), in the order below. A player who does not want to wait can buy any map early in the Locker.
 */

export var UNLOCK_EVERY = 5;

/** Map item ids in the order they unlock: the cheaper maps first, the most elaborate last. Every one is a bright, animated world. */
export var MAP_ORDER = [
  'map_pediatric_playland', 'map_sunshine_rehab_garden', 'map_vet_and_farm_clinic', 'map_holiday_wards',
  'map_cafeteria_carnival', 'map_neonatal_cloud_nursery', 'map_anatomy_amusement_park', 'map_pharmacy_pop_factory',
  'map_aquarium_imaging_center', 'map_rooftop_helipad_resort',
  'map_neural_highway', 'map_vascular_rush', 'map_neon_er', 'map_surgical_theater', 'map_candy_lab',
  'map_prescription_sunset', 'map_skeletal_corridor', 'map_cellular_matrix', 'map_dna_helix_tunnel',
  'map_cardiac_pulse', 'map_xray_vision', 'map_defibrillator_shock'
];

/** The level a map unlocks at, or 0 for a map that is not part of the rewards (the four free ones). */
export function mapUnlockLevel(itemId) {
  var i = MAP_ORDER.indexOf(itemId);
  return i < 0 ? 0 : (i + 1) * UNLOCK_EVERY;
}

/** The maps that unlock on reaching levels after `from` up to and including `to`. */
export function mapsUnlockedBetween(from, to) {
  return MAP_ORDER.filter(function (id) { var lv = mapUnlockLevel(id); return lv > from && lv <= to; });
}
