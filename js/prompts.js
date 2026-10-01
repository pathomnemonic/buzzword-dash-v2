/**
 * prompts.js — when to gently ask the player to share the game, rate it, or make an account.
 *
 * The rules are about being welcome, not about squeezing every last tap out of someone:
 *  - Only on the results screen after a good moment (a strong run, a new best score), never during a
 *    run or an exam, never on the first runs.
 *  - One ask at a time, and not twice in a row: a few days apart, and each kind backs off further every
 *    time it is skipped (14, 28, 56 days) and stops after three asks.
 *  - "Don't ask again" is per kind and respected for good. Doing the thing (sharing, rating, signing in)
 *    ends that kind of ask too.
 *  - Each ask only appears when it can actually work: no "rate us" without a store link, no "make an
 *    account" when the player already has one or accounts are not set up.
 *  - Choosing among eligible asks favors the one asked least recently (never-asked first), so the same
 *    request does not keep coming back.
 *
 * Pure functions; the card that shows the ask is in promptui.js.
 */

export var PROMPT_KINDS = ['account', 'share', 'review'];

var DAY = 24 * 60 * 60 * 1000;
export var GLOBAL_COOLDOWN_MS = 3 * DAY;
export var MAX_ASKS = 3;
var BASE_BACKOFF_MS = 14 * DAY;

/** @returns {number} how long a kind must wait after being asked `count` times */
export function backoffMs(count) {
  return BASE_BACKOFF_MS * Math.pow(2, Math.max(0, count - 1));
}

/**
 * @param {object} i
 * @param {number} i.now
 * @param {number} i.totalRuns            runs finished so far (including this one)
 * @param {number} i.firstRunAt           ms timestamp of the first run (0 if unknown)
 * @param {number} i.correct              correct answers in the run just finished
 * @param {number} i.accuracy             0..100 for that run
 * @param {boolean} i.newBest             the run set a new best score
 * @param {number} i.streak               daily streak
 * @param {boolean} i.signedIn            has an email account
 * @param {boolean} i.accountsAvailable   sign-in is set up in this build
 * @param {boolean} i.canShare            Web Share or the clipboard is available
 * @param {string}  i.reviewUrl           where to rate the app ('' if there is nowhere to)
 * @param {{lastAt?: number, kinds?: Object<string, {at?: number, count?: number, off?: boolean, done?: boolean}>}} i.state
 * @returns {string|null} 'account' | 'share' | 'review' | null
 */
export function choosePrompt(i) {
  var state = i.state || {};
  var kinds = state.kinds || {};
  if (i.now - (state.lastAt || 0) < GLOBAL_COOLDOWN_MS) return null;
  // Only after a good moment
  var good = (i.correct >= 5 && i.accuracy >= 60) || i.newBest;
  if (!good) return null;

  var eligible = [];
  PROMPT_KINDS.forEach(function (kind) {
    var k = kinds[kind] || {};
    if (k.off || k.done) return;
    var count = k.count || 0;
    if (count >= MAX_ASKS) return;
    if (k.at && i.now - k.at < backoffMs(count)) return;
    var ok = false;
    if (kind === 'account') ok = !i.signedIn && i.accountsAvailable && i.totalRuns >= 3;
    if (kind === 'share') ok = i.canShare && i.totalRuns >= 5 && (i.newBest || i.accuracy >= 80 || i.streak >= 3);
    if (kind === 'review') ok = !!i.reviewUrl && i.totalRuns >= 10 && i.firstRunAt > 0 && i.now - i.firstRunAt >= 3 * DAY && (i.newBest || i.accuracy >= 75);
    if (ok) eligible.push({ kind: kind, at: k.at || 0 });
  });
  if (!eligible.length) return null;
  // Least recently asked first (never asked = 0); ties keep the order in PROMPT_KINDS
  eligible.sort(function (a, b) { return a.at - b.at; });
  return eligible[0].kind;
}

/**
 * The state after an ask was shown or answered.
 * @param {object} state
 * @param {string} kind
 * @param {'shown'|'done'|'never'} event
 * @param {number} now
 * @returns {object} a new state (the input is not changed)
 */
export function recordPrompt(state, kind, event, now) {
  var next = { lastAt: (state && state.lastAt) || 0, kinds: Object.assign({}, (state && state.kinds) || {}) };
  var k = Object.assign({ at: 0, count: 0, off: false, done: false }, next.kinds[kind] || {});
  if (event === 'shown') { k.at = now; k.count += 1; next.lastAt = now; }
  if (event === 'done') k.done = true;
  if (event === 'never') k.off = true;
  next.kinds[kind] = k;
  return next;
}
