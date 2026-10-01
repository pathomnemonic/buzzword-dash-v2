/**
 * progress.js — player level and XP, and the daily reward track.
 *
 * Every run earns XP, XP fills a level bar, and the bar is always visible, so
 * there is always a next small goal. Rewards that are fixed and rewards that
 * are a surprise are mixed: days 1 to 6 of the daily track pay a known amount
 * and day 7 is a chest with a random payout (never smaller than day 6).
 */

/** XP for one finished run. Answers are worth the most; a long streak adds a bonus. */
export function xpForRun(summary) {
  var correct = Math.max(0, (summary && summary.correct) || 0);
  var wrong = Math.max(0, (summary && summary.wrong) || 0);
  var streak = Math.max(0, (summary && summary.bestStreak) || 0);
  if (correct + wrong === 0) return 0;
  return correct * 10 + streak * 3 + 5;
}

/** XP needed to go from `level` to the next one. */
export function xpForLevel(level) {
  return 100 + 40 * (level - 1);
}

/** Total XP at which `level` starts (level 1 starts at 0). */
export function xpAtLevel(level) {
  var total = 0;
  for (var l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

/** @returns {{level: number, into: number, needed: number, fraction: number}} */
export function levelFromXp(xp) {
  var rest = Math.max(0, Math.floor(Number(xp) || 0));
  var level = 1;
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  var needed = xpForLevel(level);
  return { level: level, into: rest, needed: needed, fraction: rest / needed };
}

/** A friendly line about how close the player is to something. */
export function nearMissLine(score, best) {
  if (!(best > 0) || !(score >= 0) || score >= best) return '';
  var gap = best - score;
  if (score / best < 0.7) return '';
  return 'So close! ' + gap + ' point' + (gap === 1 ? '' : 's') + ' from your best.';
}

// ---------- daily reward track ----------

var DAILY_COINS = [10, 20, 30, 50, 75, 100];
var CHEST_MIN = 150;
var CHEST_MAX = 300;

/**
 * The reward for a login streak. The track repeats every 7 days.
 * @param {number} streak consecutive days (1 = first day)
 * @param {function(): number} [rand] returns 0..1 (only the chest uses it)
 * @returns {{day: number, coins: number, chest: boolean}} day is 1..7
 */
export function dailyReward(streak, rand) {
  var day = ((Math.max(1, Math.floor(streak || 1)) - 1) % 7) + 1;
  if (day < 7) return { day: day, coins: DAILY_COINS[day - 1], chest: false };
  var r = typeof rand === 'function' ? rand() : Math.random();
  var coins = CHEST_MIN + Math.floor(Math.min(0.999999, Math.max(0, r)) * (CHEST_MAX - CHEST_MIN + 1));
  return { day: 7, coins: coins, chest: true };
}

/** What each day of the track pays, for drawing it (the chest is shown as null). */
export function dailyTrack() {
  return DAILY_COINS.concat([null]);
}
