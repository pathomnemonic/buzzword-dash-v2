/**
 * tips.js — optional "support the developer" link.
 *
 * The app is free. If a tip page URL is configured (VITE_TIP_URL at build
 * time, e.g. a Ko-fi, Buy Me a Coffee, GitHub Sponsors or Stripe Payment
 * Link), a small button appears in Settings and a rare, dismissible note
 * appears after a decent run. With no URL configured, nothing is shown.
 *
 * The prompt is deliberately polite: never during a run or exam, only after
 * the player has played a few times, at most once a week, and it can be
 * turned off for good.
 */

var MIN_RUNS = 5;
var MIN_ACCURACY = 60;
var MIN_CORRECT = 5;
var COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Only https links are accepted. @returns {boolean} */
export function isValidTipUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    var u = new URL(url);
    return u.protocol === 'https:' && u.hostname.indexOf('.') > 0;
  } catch (e) {
    return false;
  }
}

/** @returns {string} the configured tip URL, or '' if none/invalid */
export function getTipUrl() {
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  var url = env.VITE_TIP_URL || '';
  return isValidTipUrl(url) ? url : '';
}

/**
 * Decide whether to show the post-run tip note.
 * @param {object} input
 * @param {string} input.tipUrl
 * @param {boolean} input.optedOut - the player chose "don't ask again"
 * @param {number} input.totalRuns
 * @param {number} input.lastPromptAt - ms timestamp of the last prompt (0 if never)
 * @param {number} input.now
 * @param {number} input.correct - correct answers in the run just finished
 * @param {number} input.accuracy - 0..100 for that run
 * @returns {boolean}
 */
export function shouldShowTipPrompt(input) {
  if (!isValidTipUrl(input.tipUrl)) return false;
  if (input.optedOut) return false;
  if (input.totalRuns < MIN_RUNS) return false;
  if (input.now - (input.lastPromptAt || 0) < COOLDOWN_MS) return false;
  // Ask only after a run that went well, when the player is in a good mood.
  return input.correct >= MIN_CORRECT && input.accuracy >= MIN_ACCURACY;
}

/** Open the tip page in a new tab without leaking the referrer. */
export function openTipPage() {
  var url = getTipUrl();
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
