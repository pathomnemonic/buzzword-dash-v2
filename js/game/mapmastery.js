/**
 * mapmastery.js — a reason to love a map: run enough questions on it and its Locker card turns silver, then gold.
 * Pure rules; storage keeps the counts and ui draws the frame.
 */

export var MASTERY = { silver: 100, gold: 250 };
/** Coins for the first time a map goes gold (once per map, ever). */
export var GOLD_REWARD_COINS = 500;

/** 'none' | 'silver' | 'gold' for a number of questions answered on a map. */
export function masteryTier(answered) {
  var n = Math.max(0, Math.floor(Number(answered) || 0));
  return n >= MASTERY.gold ? 'gold' : n >= MASTERY.silver ? 'silver' : 'none';
}

/** Where the player is: how many answered, the tier, and how far to the next one. */
export function masteryProgress(answered) {
  var n = Math.max(0, Math.floor(Number(answered) || 0));
  var tier = masteryTier(n);
  var goal = tier === 'none' ? MASTERY.silver : MASTERY.gold;
  return { answered: n, tier: tier, goal: goal, fraction: tier === 'gold' ? 1 : Math.min(1, n / goal), left: Math.max(0, goal - n) };
}

/** Clean a per-run { mapName: count } object from the engine. */
export function cleanMapAnswers(raw) {
  var out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).slice(0, 60).forEach(function (name) {
    var n = Math.floor(Number(raw[name]));
    if (typeof name === 'string' && name.length > 0 && name.length < 60 && isFinite(n) && n > 0 && n < 5000) out[name] = n;
  });
  return out;
}
