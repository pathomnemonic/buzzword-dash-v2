/**
 * fsrs.js — the Free Spaced Repetition Scheduler (FSRS), the open algorithm Anki offers as its newer option.
 *
 * Each card keeps two numbers: stability S (the days it takes for the chance of remembering to fall to 90%)
 * and difficulty D (1 easy to 10 hard). The chance of remembering right now (retrievability R) follows a
 * forgetting curve of the days since the last review, and the next review is set for when R is expected to
 * reach the player's target retention. This is the FSRS-5 model with its published default weights.
 *
 * Here a run answer is only "right" or "wrong", so a right answer counts as Good (3) and a wrong one as Again (1).
 * The functions are pure (no storage, no clock) so they can be tested against known values.
 */

export var DAY_MS = 24 * 60 * 60 * 1000;

/** The default weights (w0 to w18) of FSRS-5. */
export var DEFAULT_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621
];

export var DECAY = -0.5;
export var FACTOR = 19 / 81;

export var AGAIN = 1;
export var HARD = 2;
export var GOOD = 3;
export var EASY = 4;

export var MIN_STABILITY = 0.01;
export var MAX_INTERVAL_DAYS = 36500;
export var DEFAULT_RETENTION = 0.9;
/** A missed card comes back after this long (minutes), as it did before. */
export var RELEARN_MINUTES = 10;

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

/** The chance of remembering a card with stability s after t days (0 to 1). */
export function retrievability(elapsedDays, stability) {
  if (!(stability > 0)) return 0;
  var t = Math.max(0, elapsedDays);
  return Math.pow(1 + FACTOR * t / stability, DECAY);
}

/** Days until the chance of remembering has fallen to `retention`. */
export function intervalFor(stability, retention) {
  var r = clamp(retention || DEFAULT_RETENTION, 0.7, 0.97);
  return stability / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
}

export function initialStability(grade, w) {
  w = w || DEFAULT_WEIGHTS;
  return Math.max(MIN_STABILITY, w[grade - 1]);
}

export function initialDifficulty(grade, w) {
  w = w || DEFAULT_WEIGHTS;
  return clamp(w[4] - Math.exp(w[5] * (grade - 1)) + 1, 1, 10);
}

export function nextDifficulty(d, grade, w) {
  w = w || DEFAULT_WEIGHTS;
  var delta = -w[6] * (grade - 3);
  var damped = d + delta * (10 - d) / 9;
  // pulled gently back toward the difficulty of a first "Easy", so it never sticks at an extreme
  return clamp(w[7] * initialDifficulty(EASY, w) + (1 - w[7]) * damped, 1, 10);
}

export function stabilityAfterRecall(d, s, r, grade, w) {
  w = w || DEFAULT_WEIGHTS;
  var hardPenalty = grade === HARD ? w[15] : 1;
  var easyBonus = grade === EASY ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hardPenalty * easyBonus);
}

export function stabilityAfterForgetting(d, s, r, w) {
  w = w || DEFAULT_WEIGHTS;
  var next = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.max(MIN_STABILITY, Math.min(next, s));
}

export function stabilityAfterSameDay(s, grade, w) {
  w = w || DEFAULT_WEIGHTS;
  return Math.max(MIN_STABILITY, s * Math.exp(w[17] * (grade - 3 + w[18])));
}

/**
 * Review a card.
 * @param {{stability: number, difficulty: number, lastReview: number}|null} memory null for a card never reviewed
 * @param {boolean} correct
 * @param {number} now ms
 * @param {{retention?: number, weights?: number[]}} [opts]
 * @returns {{stability: number, difficulty: number, lastReview: number, due: number, intervalDays: number}}
 */
export function review(memory, correct, now, opts) {
  opts = opts || {};
  var w = opts.weights || DEFAULT_WEIGHTS;
  var grade = correct ? GOOD : AGAIN;
  var s;
  var d;
  if (!memory || !(memory.stability > 0)) {
    s = initialStability(grade, w);
    d = initialDifficulty(grade, w);
  } else {
    var elapsed = Math.max(0, (now - memory.lastReview) / DAY_MS);
    d = nextDifficulty(memory.difficulty, grade, w);
    if (elapsed < 1) {
      // a second look the same day: only a small change (the memory has not had time to fade)
      s = stabilityAfterSameDay(memory.stability, grade, w);
    } else {
      var r = retrievability(elapsed, memory.stability);
      s = correct ? stabilityAfterRecall(memory.difficulty, memory.stability, r, grade, w)
        : stabilityAfterForgetting(memory.difficulty, memory.stability, r, w);
    }
  }
  var days = clamp(Math.round(intervalFor(s, opts.retention)), 1, MAX_INTERVAL_DAYS);
  // a missed card is shown again soon, then the longer interval takes over
  var due = correct ? now + days * DAY_MS : now + RELEARN_MINUTES * 60 * 1000;
  return { stability: s, difficulty: d, lastReview: now, due: due, intervalDays: correct ? days : 0 };
}

/**
 * Turn the old schedule (an interval in days and an ease) into a starting memory, so nobody loses their history.
 * A card that was last seen `interval` days ago and is due now is, by definition, at the target retention.
 */
export function fromLegacy(stat, retention) {
  if (!stat || !stat.seen) return null;
  var interval = Math.max(0, stat.interval || 0);
  var ease = typeof stat.ease === 'number' ? stat.ease : 2.5;
  var s = interval >= 1 ? interval : (stat.correct > stat.wrong ? 1 : 0.4);
  // the old ease ran from 1.3 (hard) to 3 (easy); FSRS difficulty runs the other way, from 1 to 10
  var d = clamp(10 - (ease - 1.3) / 1.7 * 8, 1, 10);
  return { stability: Math.max(MIN_STABILITY, s), difficulty: d, lastReview: stat.lastSeen || Date.now() };
}

/** The chance of remembering a card right now from its stored fields (0 if never reviewed). */
export function currentRetrievability(stat, now) {
  if (!stat || !(stat.stability > 0) || !stat.lastReview) return 0;
  return retrievability(((now || Date.now()) - stat.lastReview) / DAY_MS, stat.stability);
}
