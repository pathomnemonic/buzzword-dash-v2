/**
 * obstaclepacing.js — how many obstacles come with each gate, and how that grows through a run.
 *
 * A run starts gently and gets busier: after every answered question there is a better chance of an obstacle, and from
 * a few questions in a second one (and later a third) can follow it. The numbers are capped so a long run stays fair.
 * Quests that count obstacles (jumps, slides) rely on this pace; see shopdata.js.
 */

/** Chance of at least one obstacle with a gate when the run starts, and the most it ever reaches. */
export var FIRST_OBSTACLE_START = 0.5;
export var FIRST_OBSTACLE_MAX = 0.95;
/** The chance rises by this much for every question answered. */
export var FIRST_OBSTACLE_STEP = 0.03;
/** A second obstacle can follow from this many answers on; its chance rises 3% a question to this cap. */
export var SECOND_AFTER = 6;
export var SECOND_MAX = 0.6;
/** A third can follow from this many answers on; its chance rises 2% a question to this cap. */
export var THIRD_AFTER = 20;
export var THIRD_MAX = 0.3;
/** Never more than this many obstacles with one gate. */
export var MAX_OBSTACLES_PER_GATE = 3;
/** Run units between two obstacles that come together. */
export var OBSTACLE_SPACING = 11;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** The chance, after `answered` questions, that the 1st, 2nd and 3rd obstacle appear. */
export function obstacleChances(answered) {
  var n = Math.max(0, Number(answered) || 0);
  return [
    clamp(FIRST_OBSTACLE_START + FIRST_OBSTACLE_STEP * n, 0, FIRST_OBSTACLE_MAX),
    clamp(0.03 * (n - SECOND_AFTER), 0, SECOND_MAX),
    clamp(0.02 * (n - THIRD_AFTER), 0, THIRD_MAX)
  ];
}

/** How many obstacles come with the next gate. @param {number} answered @param {function(): number} [rand] */
export function obstaclesForGate(answered, rand) {
  var r = typeof rand === 'function' ? rand : Math.random;
  var chances = obstacleChances(answered);
  var count = 0;
  for (var i = 0; i < chances.length && i < MAX_OBSTACLES_PER_GATE; i++) {
    if (r() < chances[i]) count++; else break; // (a second needs a first, a third needs a second)
  }
  return count;
}

/** The average number of obstacles per gate after `answered` questions (for planning quests). */
export function expectedObstacles(answered) {
  var c = obstacleChances(answered);
  return c[0] + c[0] * c[1] + c[0] * c[1] * c[2];
}
