/**
 * studystreak.js — the study streak: how many days in a row the player answered at least one card.
 *
 * One number, used everywhere (the flame on Home, the Today sheet, the Profile, the calendar, the share image),
 * so the screens can never disagree. Pure functions on plain values, so the rules (and the awkward cases: the
 * clock going backwards, a trip across time zones, a daylight-saving change) are tested directly.
 *
 * Days are local calendar dates written 'YYYY-MM-DD'. They are compared as whole day numbers (UTC midnight of the
 * written date), never by subtracting timestamps, so a 23 or 25 hour day cannot make "yesterday" look like two days ago.
 *
 * Shields: one is earned at every 7th day of a streak (up to 3 are kept); a shield is spent automatically to cover
 * exactly one missed day.
 */

var DAY_MS = 24 * 60 * 60 * 1000;
export var MAX_SHIELDS = 3;
export var SHIELD_EVERY = 7;

/** 'YYYY-MM-DD' as a number of days since 1970-01-01, or NaN if it is not a real calendar date. */
export function dayNumber(key) {
  if (typeof key !== 'string') return NaN;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return NaN;
  var y = +m[1];
  var mo = +m[2];
  var d = +m[3];
  var t = Date.UTC(y, mo - 1, d);
  var back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN; // 2026-02-30
  return Math.round(t / DAY_MS);
}

/** The key of a day number (the inverse of dayNumber). */
export function keyOfDay(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from one key to another (positive when `toKey` is later); NaN if either is not a date. */
export function daysBetween(fromKey, toKey) {
  return dayNumber(toKey) - dayNumber(fromKey);
}

function whole(v) {
  var n = Math.floor(Number(v));
  return isFinite(n) && n > 0 ? n : 0;
}

/**
 * Count `today` as a study day.
 * @param {{streak?:number, last?:(string|null), shields?:number, best?:number}} state what is saved now (a missing field counts as nothing)
 * @param {string} today the local date key of today
 * @returns {{streak:number, last:(string|null), shields:number, best:number, counted:boolean, shieldUsed:boolean, shieldEarned:boolean}}
 */
export function advanceStudyStreak(state, today) {
  state = state || {};
  var out = {
    streak: whole(state.streak),
    last: isNaN(dayNumber(state.last)) ? null : state.last,
    shields: Math.min(MAX_SHIELDS, whole(state.shields)),
    best: whole(state.best),
    counted: false,
    shieldUsed: false,
    shieldEarned: false
  };
  if (isNaN(dayNumber(today))) return out;
  if (out.last === null) {
    out.streak = 1; // nothing counted yet (or the saved date was unreadable): today starts a streak
  } else {
    var gap = daysBetween(out.last, today);
    // 0 = today is already counted. Below 0 the clock is behind the last counted day (a trip west, a wrong clock): add
    // nothing and keep what the player has earned; it carries on from the later date.
    if (gap <= 0) return out;
    if (gap === 1) {
      out.streak += 1;
    } else if (gap === 2 && out.shields > 0 && out.streak > 0) {
      out.shields -= 1;
      out.streak += 1;
      out.shieldUsed = true;
    } else {
      out.streak = 1;
    }
  }
  if (out.streak % SHIELD_EVERY === 0 && out.shields < MAX_SHIELDS) {
    out.shields += 1;
    out.shieldEarned = true;
  }
  out.last = today;
  out.best = Math.max(out.best, out.streak);
  out.counted = true;
  return out;
}

/**
 * The streak as the player should see it right now: a streak that lapsed (and no shield can cover the gap) reads as 0.
 * @param {{streak?:number, last?:(string|null), shields?:number}} state
 * @param {string} today
 * @returns {{streak:number, playedToday:boolean, atRisk:boolean}} atRisk: still alive, but today has no study yet
 */
export function liveStudyStreak(state, today) {
  state = state || {};
  var streak = whole(state.streak);
  var gap = daysBetween(state.last, today);
  if (!streak || isNaN(gap)) return { streak: 0, playedToday: false, atRisk: false };
  var covered = gap === 2 && whole(state.shields) > 0;
  var live = gap <= 1 || covered;
  return { streak: live ? streak : 0, playedToday: gap <= 0, atRisk: live && gap >= 1 };
}

/**
 * Work the streak out from the saved per-day counts: the run of days with at least one card answered that ends
 * today (or yesterday while today is still empty). Used once for a save made before the streak was stored, and
 * to repair a damaged one.
 * @param {Object<string, number>} counts date key -> cards answered
 * @param {string} today
 * @returns {{streak:number, last:(string|null), best:number}}
 */
export function deriveStreakFromCounts(counts, today) {
  var active = {};
  var days = [];
  Object.keys(counts || {}).forEach(function (k) {
    var n = dayNumber(k);
    if (!isNaN(n) && counts[k] > 0 && !active[n]) { active[n] = true; days.push(n); }
  });
  days.sort(function (a, b) { return a - b; });
  var best = 0;
  var run = 0;
  for (var i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  var t = dayNumber(today);
  if (isNaN(t)) return { streak: 0, last: null, best: best };
  var cursor = active[t] ? t : (active[t - 1] ? t - 1 : NaN);
  if (isNaN(cursor)) return { streak: 0, last: null, best: best };
  var last = keyOfDay(cursor);
  var streak = 0;
  while (active[cursor]) { streak++; cursor--; }
  return { streak: streak, last: last, best: best };
}
