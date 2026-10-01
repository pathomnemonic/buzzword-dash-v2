/**
 * leagues.js — trophies, leagues, divisions, and how the game gets harder as you climb.
 *
 * Ranked multiplayer works like most ladder games: win a match, gain trophies;
 * lose, drop some. Trophies place you in one of 7 leagues, and each league has
 * 3 divisions (III is the lowest, I the highest), so there are 21 steps to climb.
 *
 * Every step is a little harder than the one before:
 *   - helpers disappear one by one: Auto-pilot (step 1), Shield (3), Magnet (4),
 *     2x Score (6), Frenzy (8). From step 8 (the top of Fellow) there are no power-ups.
 *   - heart pickups, which win back a life, get rarer from step 4 and are gone from
 *     step 9 (the start of Attending, about halfway up).
 *   - the track gets faster: a little each step at first, then a good bit each step
 *     once the helpers are gone (+12% at step 8, +60% at the top).
 *
 * The trophy math is mirrored in database/schema.sql (ranked_delta); the unit
 * tests check both sides agree on the same examples.
 */

export var LEAGUES = [
  { id: 'intern', name: 'Intern', icon: '🩺', min: 0 },
  { id: 'resident', name: 'Resident', icon: '📋', min: 300 },
  { id: 'fellow', name: 'Fellow', icon: '🔬', min: 700 },
  { id: 'attending', name: 'Attending', icon: '🥼', min: 1200 },
  { id: 'chief', name: 'Chief', icon: '🏥', min: 1900 },
  { id: 'dean', name: 'Dean', icon: '🎓', min: 2700 },
  { id: 'legend', name: 'Legend', icon: '👑', min: 3600 }
];

var DIVISIONS = 3;
var TOP_SPAN = 900;            // trophies spanned by Legend's three divisions
var ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

/** The step at which each power-up is gone for good. */
var POWERUP_GONE_AT = { autoPilot: 1, shield: 3, magnet: 4, double: 6, scoreFrenzy: 8 };
var ALL_POWERUPS = ['autoPilot', 'shield', 'magnet', 'double', 'scoreFrenzy'];
var LAST_STEP = LEAGUES.length * DIVISIONS - 1;   // 20

var K = 40;          // how much one match can move the trophies
var MIN_WIN = 10;
var MIN_LOSS = 8;

/** Index of the league for a trophy count. */
export function leagueIndex(trophies) {
  var t = Math.max(0, Math.floor(Number(trophies) || 0));
  var idx = 0;
  for (var i = 0; i < LEAGUES.length; i++) if (t >= LEAGUES[i].min) idx = i;
  return idx;
}

export function getLeague(trophies) {
  return LEAGUES[leagueIndex(trophies)];
}

function leagueSpan(i) {
  return LEAGUES[i + 1] ? LEAGUES[i + 1].min - LEAGUES[i].min : TOP_SPAN;
}

/** 3 (lowest) to 1 (highest) within the player's league. */
export function divisionOf(trophies) {
  var t = Math.max(0, Math.floor(Number(trophies) || 0));
  var i = leagueIndex(t);
  var part = Math.floor(((t - LEAGUES[i].min) / leagueSpan(i)) * DIVISIONS);
  part = Math.max(0, Math.min(DIVISIONS - 1, part));
  return DIVISIONS - part;
}

/** 0 to 20: how far up the ladder the player is. */
export function tierStep(trophies) {
  var i = leagueIndex(trophies);
  return Math.min(LAST_STEP, i * DIVISIONS + (DIVISIONS - divisionOf(trophies)));
}

/** e.g. "Resident II". */
export function tierName(trophies) {
  return getLeague(trophies).name + ' ' + ROMAN[divisionOf(trophies)];
}

/** First trophy count of a given step (the inverse of tierStep). */
export function stepStart(step) {
  var i = Math.floor(step / DIVISIONS);
  var part = step % DIVISIONS;
  return LEAGUES[i].min + Math.ceil((leagueSpan(i) * part) / DIVISIONS);
}

/**
 * Progress toward the next division (or the next league from division I).
 * @returns {{next: {name: string, icon: string, min: number, promotion: boolean}|null, needed: number, fraction: number}}
 */
export function tierProgress(trophies) {
  var t = Math.max(0, Math.floor(Number(trophies) || 0));
  var step = tierStep(t);
  if (step >= LAST_STEP && t >= stepStart(LAST_STEP)) return { next: null, needed: 0, fraction: 1 };
  var nextStep = Math.min(LAST_STEP, step + 1);
  var nextMin = stepStart(nextStep);
  var curMin = stepStart(step);
  var nextLeague = LEAGUES[Math.floor(nextStep / DIVISIONS)];
  return {
    next: {
      name: nextLeague.name + ' ' + ROMAN[DIVISIONS - (nextStep % DIVISIONS)],
      icon: nextLeague.icon,
      min: nextMin,
      promotion: Math.floor(nextStep / DIVISIONS) > Math.floor(step / DIVISIONS)
    },
    needed: Math.max(0, nextMin - t),
    fraction: Math.max(0, Math.min(1, (t - curMin) / (nextMin - curMin)))
  };
}

/** The rules of play at a step (0 to 20). */
export function rulesForStep(step) {
  var s = Math.max(0, Math.min(LAST_STEP, Math.floor(step) || 0));
  var disabled = ALL_POWERUPS.filter(function (id) { return s >= POWERUP_GONE_AT[id]; });
  var heartEvery = s <= 3 ? 3 : s <= 6 ? 5 : s <= 8 ? 8 : 0;
  var speed = 1 + 0.015 * Math.min(s, 8) + 0.04 * Math.max(0, s - 8);
  return {
    step: s,
    disabledPowerups: disabled,
    heartEvery: heartEvery,                  // a heart can appear every this many gates; 0 = no hearts
    speedMultiplier: Math.round(speed * 1000) / 1000
  };
}

/**
 * What a ranked match plays like. Both players get the same rules: they come
 * from the average of the two players' trophies.
 */
export function leagueRules(trophies) {
  var rules = rulesForStep(tierStep(trophies));
  rules.league = getLeague(trophies);
  rules.division = divisionOf(trophies);
  rules.name = tierName(trophies);
  return rules;
}

/**
 * Trophy change after a match (Elo style: beating a stronger player is worth
 * more, losing to a weaker one costs more). A player never drops below the
 * start of their current league ("no demotions"), so league progress is kept.
 * @param {number} mine your trophies before the match
 * @param {number} theirs the opponent's trophies
 * @param {'win'|'loss'|'draw'} outcome
 * @returns {number} the change (can be negative); trophies after = mine + change
 */
export function trophyDelta(mine, theirs, outcome) {
  if (outcome === 'draw') return 0;
  var expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  var delta;
  if (outcome === 'win') delta = Math.max(MIN_WIN, Math.round(K * (1 - expected)));
  else delta = -Math.max(MIN_LOSS, Math.round(K * expected));
  var floor = getLeague(mine).min;
  if (mine + delta < floor) delta = floor - mine;
  return delta;
}

var NAMES = { autoPilot: 'Auto-pilot', shield: 'Shield', magnet: 'Magnet', double: '2× Score', scoreFrenzy: 'Frenzy' };

/** One line for a trophy count, e.g. "No Auto-pilot, Shield · rarer hearts · track +12% faster". */
export function describeLeagueRules(trophies) {
  var rules = leagueRules(trophies);
  var parts = [];
  if (rules.disabledPowerups.length === ALL_POWERUPS.length) parts.push('No power-ups');
  else if (rules.disabledPowerups.length) parts.push('No ' + rules.disabledPowerups.map(function (id) { return NAMES[id]; }).join(', '));
  else parts.push('All power-ups');
  if (rules.heartEvery === 0) parts.push('no hearts');
  else if (rules.heartEvery > 3) parts.push('rarer hearts');
  if (rules.speedMultiplier > 1) parts.push('track +' + Math.round((rules.speedMultiplier - 1) * 100) + '% faster');
  return parts.join(' · ');
}
