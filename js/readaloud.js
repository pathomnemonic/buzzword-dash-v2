/**
 * readaloud.js — reading a question out loud while you run.
 *
 * A question reaches the answer lock a few seconds after it appears (about 14 s at 1x, down to 3 s at the top
 * speed), and it must be finished before then: speech that is still going when the gates lock is useless, and
 * speech cut off halfway is worse. So the reading is planned from the time that is actually available:
 *
 *   1. Everything (the clues, then "Left: ..., Middle: ..., Right: ...") at a natural pace if there is time.
 *   2. Otherwise the same words faster, up to a rate that is still easy to follow.
 *   3. If even that is too slow, the answers are left for the eyes and only the clues are read,
 *      and if the clues alone do not fit, as many whole clues as do (never half a clue).
 *   4. If not even the first clue fits, nothing is read.
 *
 * How fast a device's voice really talks is measured (it varies a lot) and remembered, so the plan gets more
 * accurate as you play. These are pure functions, so they are tested without a speech engine.
 */

/** Words a typical voice speaks per second at rate 1 (until a real voice has been measured). */
export var DEFAULT_WPS = 2.6;
/** The fastest rate that is still clear. */
export var MAX_RATE = 2.0;
/** The slowest the reading is ever stretched to (it is never made slower than natural when there is time to spare). */
export var NATURAL_RATE = 1.0;
/** Seconds kept free before the lock so the voice is finished a moment before the gates close. */
export var SAFETY_SECONDS = 0.7;
/** Seconds a pause between clues or answers takes. */
export var PAUSE_SECONDS = 0.28;

var LANE_WORDS = ['Left', 'Middle', 'Right'];

export function countWords(text) {
  return String(text || '').split(/[\s.,:;!?]+/).filter(function (w) { return w.length > 0; }).length;
}

/** Seconds a piece of text takes to say at rate 1, pauses included. */
export function estimateSeconds(parts, wps) {
  var words = 0;
  parts.forEach(function (p) { words += countWords(p); });
  return words / Math.max(0.5, wps || DEFAULT_WPS) + parts.length * PAUSE_SECONDS;
}

/**
 * Decide what to say, and how fast, for a question that locks in `secondsToLock` seconds.
 * @param {object} q
 * @param {string[]} q.clues the clues, in order
 * @param {string[]} q.answers the three gate labels, left to right
 * @param {number} q.secondsToLock time until the answer locks
 * @param {number} [q.wps] measured speaking speed at rate 1
 * @returns {{text: string, rate: number, parts: string[], withAnswers: boolean, clueCount: number}|null}
 */
export function planReading(q) {
  var clues = (q.clues || []).map(function (c) { return String(c).trim(); }).filter(Boolean);
  var answers = q.answers || [];
  var budget = (q.secondsToLock || 0) - SAFETY_SECONDS;
  if (clues.length === 0 || !(budget > 0)) return null;
  var wps = q.wps || DEFAULT_WPS;

  var answerParts = answers.map(function (a, i) { return LANE_WORDS[i] + ': ' + a; });

  // Candidates, best first: everything, then the clues alone, then fewer and fewer whole clues
  var candidates = [{ parts: clues.concat(answerParts), withAnswers: answerParts.length > 0, clueCount: clues.length }];
  for (var n = clues.length; n >= 1; n--) {
    candidates.push({ parts: clues.slice(0, n), withAnswers: false, clueCount: n });
  }

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var natural = estimateSeconds(c.parts, wps);
    var rate = Math.max(NATURAL_RATE, natural / budget);
    if (rate <= MAX_RATE) {
      return {
        text: c.parts.join('. ') + '.',
        rate: Math.ceil(rate * 100) / 100, // (rounded up: never a hair too slow to finish)
        parts: c.parts,
        withAnswers: c.withAnswers,
        clueCount: c.clueCount
      };
    }
  }
  return null;
}

/** Blend a new measurement into the running estimate of the voice's speed (kept within sensible limits). */
export function updateWps(current, words, seconds, rate) {
  if (!(words >= 4) || !(seconds > 0.5) || !(rate > 0)) return current || DEFAULT_WPS;
  var measured = words / (seconds * rate);
  var blended = (current || DEFAULT_WPS) * 0.6 + measured * 0.4;
  return Math.max(1.4, Math.min(4.5, blended));
}
