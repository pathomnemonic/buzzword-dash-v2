/**
 * lockerdots.js — which Locker items should wear a red dot.
 *
 * An item gets a dot the first time the player can afford it. The dot stays
 * while they look at the Locker and goes away once they leave it, so each
 * item only asks for attention once.
 */

/**
 * @param {Array<{id: string, price: number, hidden?: boolean}>} items everything for sale
 * @param {number} coins what the player has
 * @param {string[]} ownedIds items already bought
 * @param {string[]} seenIds items the player has already been shown a dot for
 * @returns {string[]} ids that are newly affordable
 */
export function newlyAffordable(items, coins, ownedIds, seenIds) {
  var owned = {};
  (ownedIds || []).forEach(function (id) { owned[id] = true; });
  var seen = {};
  (seenIds || []).forEach(function (id) { seen[id] = true; });
  return (items || []).filter(function (item) {
    return item && !item.hidden && item.price > 0 && item.price <= coins && !owned[item.id] && !seen[item.id];
  }).map(function (item) { return item.id; });
}

/** The seen list after the player has looked at `shownIds`. */
export function markSeen(seenIds, shownIds) {
  var out = (seenIds || []).slice();
  (shownIds || []).forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
  return out;
}
