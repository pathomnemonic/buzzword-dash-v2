/**
 * progress.js — player level and XP, and the daily reward track.
 *
 * Every run earns XP, XP fills a level bar, and the bar is always visible, so
 * there is always a next small goal. Rewards that are fixed and rewards that
 * are a surprise are mixed: days 1 to 6 of the daily track pay a known amount
 * and day 7 is a chest with a random payout (never smaller than day 6).
 */

import { dayNumber, daysBetween } from './studystreak.js';

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

/**
 * A saved login date as a 'YYYY-MM-DD' key. Older versions saved the long text (Sun Oct 04 2026); both are read.
 * @returns {string|null} null when it is empty or not a date
 */
export function toDayKey(v) {
  if (typeof v !== 'string' || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return isNaN(dayNumber(v)) ? null : v;
  var d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Today's login: does the reward pay, and what is the login streak after it? Compares whole calendar days, so a
 * daylight-saving change cannot split a day, and a clock that was set back (or a trip west) pays nothing twice and
 * loses nothing: the next reward comes when the date passes the last paid day.
 * @param {string|null} last the last day a reward was paid (see toDayKey)
 * @param {number} streak the login streak so far
 * @param {string} today 'YYYY-MM-DD'
 * @returns {{claim: boolean, streak: number, last: string}}
 */
export function loginStep(last, streak, today) {
  var lastKey = toDayKey(last);
  var s = Math.max(0, Math.floor(Number(streak) || 0));
  if (lastKey) {
    var gap = daysBetween(lastKey, today);
    if (gap <= 0) return { claim: false, streak: s, last: lastKey };
    return { claim: true, streak: gap === 1 ? s + 1 : 1, last: today };
  }
  return { claim: true, streak: 1, last: today };
}

var DAILY_COINS = [30, 60, 90, 150, 225, 300];
var CHEST_MIN = 450;
var CHEST_MAX = 900;

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

// ---------- ranks and prestige ----------

/** The medical ladder. Each rank starts at its level. Past the last one the ranks start over with stars (prestige). */
export var RANKS = [
  { level: 1, title: 'Intern', icon: '🩺' },
  { level: 5, title: 'Resident', icon: '💉' },
  { level: 10, title: 'Fellow', icon: '🔬' },
  { level: 20, title: 'Attending', icon: '🥼' },
  { level: 35, title: 'Chief', icon: '🏥' },
  { level: 50, title: 'Dean', icon: '🎓' }
];
/** After the Dean, every this many levels is one more star. */
export var PRESTIGE_EVERY = 25;

/**
 * The rank for a level.
 * @returns {{title: string, icon: string, stars: number, index: number, label: string}}
 */
export function rankForLevel(level) {
  var lv = Math.max(1, Math.floor(Number(level) || 1));
  var index = 0;
  for (var i = 0; i < RANKS.length; i++) if (lv >= RANKS[i].level) index = i;
  var last = RANKS[RANKS.length - 1];
  var stars = lv >= last.level ? 1 + Math.floor((lv - last.level) / PRESTIGE_EVERY) : 0;
  var r = RANKS[index];
  return { title: r.title, icon: r.icon, stars: stars, index: index, label: r.title + (stars > 0 ? ' ' + new Array(stars + 1).join('★') : '') };
}

// ---------- the subject of the day ----------

/** Coins for each correct answer on the subject of the day. */
export var BONUS_COINS_PER_CORRECT = 4;
/** The most the bonus pays in one day, so it is a nudge toward a subject and not a farm. */
export var BONUS_COINS_CAP = 80;

/** A small stable number from text (the same everywhere, so everyone's subject of the day is the same). */
function hashText(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Today's bonus subject: the same for everyone on a given date. The subjects go round in a fixed shuffled order, one
 * a day, so it is never the same subject two days running and every subject gets its turn.
 */
export function bonusSubjectFor(dateKey, subjects) {
  if (!subjects || !subjects.length) return '';
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
  var day = d ? Math.floor(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) / 86400000) : 0;
  var order = subjects.slice().sort(function (a, b) { return hashText('dx-bonus:' + a) - hashText('dx-bonus:' + b) || (a < b ? -1 : 1); });
  return order[((day % order.length) + order.length) % order.length];
}

/** Coins earned today for correct answers in the bonus subject (never more than what is left of today's cap). */
export function bonusCoinsFor(correctInBonus, alreadyToday) {
  var left = Math.max(0, BONUS_COINS_CAP - Math.max(0, alreadyToday || 0));
  return Math.min(left, Math.max(0, correctInBonus || 0) * BONUS_COINS_PER_CORRECT);
}

// ---------- "what is next" after a run ----------

/**
 * The one small goal that is closest after a run, in words. Each candidate is priced in "cards" (about how many more
 * answers it takes), and the cheapest one wins, so the line is always something that feels one more run away.
 * @param {{score:number, best:number, xp:number, coins:number, dailyDone:number, dailyGoal:number, cheapestWanted?: {name:string, price:number}|null}} o
 * @returns {string} '' when there is nothing close
 */
export function nextGoalLine(o) {
  var options = [];
  var perCardPoints = 25;   // about what a right answer is worth in score
  var perCardXp = 10;
  var perCardCoins = 4;     // coins from a right answer (runs earn about this much per card, with pickups)
  if (o.best > 0 && o.score < o.best) {
    var gap = o.best - o.score;
    options.push({ cards: Math.ceil(gap / perCardPoints), text: gap + ' point' + (gap === 1 ? '' : 's') + ' from your best score' });
  }
  var lv = levelFromXp(o.xp);
  var xpLeft = lv.needed - lv.into;
  options.push({ cards: Math.ceil(xpLeft / perCardXp), text: xpLeft + ' XP to level ' + (lv.level + 1) });
  var rankNow = rankForLevel(lv.level);
  var rankNext = rankForLevel(lv.level + 1);
  if (rankNext.index !== rankNow.index || rankNext.stars !== rankNow.stars) {
    options.push({ cards: Math.ceil(xpLeft / perCardXp) - 1, text: xpLeft + ' XP to ' + rankNext.label });
  }
  if (o.dailyGoal > 0 && o.dailyDone < o.dailyGoal) {
    var left = o.dailyGoal - o.dailyDone;
    options.push({ cards: left, text: left + ' more card' + (left === 1 ? '' : 's') + ' to reach today\'s goal' });
  }
  if (o.cheapestWanted && o.cheapestWanted.price > o.coins) {
    var short = o.cheapestWanted.price - o.coins;
    options.push({ cards: Math.ceil(short / perCardCoins), text: short + ' 🪙 from the ' + o.cheapestWanted.name });
  }
  options = options.filter(function (x) { return x.cards >= 1; });
  if (!options.length) return '';
  options.sort(function (a, b) { return a.cards - b.cards; });
  return '🎯 ' + options[0].text;
}
