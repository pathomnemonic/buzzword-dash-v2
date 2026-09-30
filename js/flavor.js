/**
 * flavor.js — the small lines of copy that give Dx Dash its voice
 * (streak callouts, the verdict on the results screen, loading lines).
 * Pure functions: pass `rand` (a 0..1 function) for predictable tests.
 */

var STREAK_LINES = {
  5: 'High-yield!',
  10: 'Clean differential!',
  15: 'Classic presentation!',
  20: 'Zebra spotted!',
  30: 'Attending level!'
};

var LOADING_LINES = [
  'Taking a history…',
  'Ordering the labs…',
  'Ruling out zebras…',
  'Checking the list…',
  'Paging the attending…'
];

function pick(list, rand) {
  var r = typeof rand === 'function' ? rand() : Math.random();
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

/** A callout for a streak milestone, or '' when there is none for that streak. */
export function streakCallout(streak) {
  var keys = Object.keys(STREAK_LINES).map(Number).sort(function (a, b) { return b - a; });
  for (var i = 0; i < keys.length; i++) {
    if (streak === keys[i]) return STREAK_LINES[keys[i]];
  }
  return '';
}

/** A short verdict for the results screen from accuracy and how many were answered. */
export function runVerdict(correct, wrong) {
  var total = (correct || 0) + (wrong || 0);
  if (total === 0) return 'Flatlined.';
  var acc = Math.round((correct / total) * 100);
  if (total >= 5 && acc === 100) return 'Clean list.';
  if (acc >= 85) return 'Strong differential.';
  if (acc >= 65) return 'Stable. Keep running.';
  if (acc >= 40) return 'Missed a few Dx.';
  return 'Code blue. Review the list.';
}

/** A light loading line. */
export function loadingLine(rand) {
  return pick(LOADING_LINES, rand);
}
