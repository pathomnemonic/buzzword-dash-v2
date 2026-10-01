/**
 * leagues.js — trophies, leagues and how the game gets harder as you climb.
 *
 * Ranked multiplayer works like most ladder games: win a match, gain trophies;
 * lose, drop some. Trophies place you in a league. Higher leagues play with
 * fewer helpers, and once the helpers run out the track itself gets faster.
 *
 *   Intern     all five power-ups
 *   Resident   no Auto-pilot
 *   Fellow     no Auto-pilot or Shield (the two fail-safes)
 *   Attending  also no Magnet
 *   Chief      also no 2x Score (only Frenzy is left)
 *   Dean       no power-ups at all, track 5% faster
 *   Legend     no power-ups, track 10% faster
 *
 * The trophy math is mirrored in database/schema.sql (ranked_delta); the unit
 * tests check both sides agree on the same examples.
 */

export var LEAGUES = [
  { id: 'intern', name: 'Intern', icon: '🩺', min: 0, disabled: [], speed: 1 },
  { id: 'resident', name: 'Resident', icon: '📋', min: 300, disabled: ['autoPilot'], speed: 1 },
  { id: 'fellow', name: 'Fellow', icon: '🔬', min: 700, disabled: ['autoPilot', 'shield'], speed: 1 },
  { id: 'attending', name: 'Attending', icon: '🥼', min: 1200, disabled: ['autoPilot', 'shield', 'magnet'], speed: 1 },
  { id: 'chief', name: 'Chief', icon: '🏥', min: 1900, disabled: ['autoPilot', 'shield', 'magnet', 'double'], speed: 1 },
  { id: 'dean', name: 'Dean', icon: '🎓', min: 2700, disabled: ['autoPilot', 'shield', 'magnet', 'double', 'scoreFrenzy'], speed: 1.05 },
  { id: 'legend', name: 'Legend', icon: '👑', min: 3600, disabled: ['autoPilot', 'shield', 'magnet', 'double', 'scoreFrenzy'], speed: 1.1 }
];

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

/** Progress toward the next league: { next, needed, fraction } (next is null at the top). */
export function leagueProgress(trophies) {
  var i = leagueIndex(trophies);
  var cur = LEAGUES[i];
  var next = LEAGUES[i + 1] || null;
  if (!next) return { next: null, needed: 0, fraction: 1 };
  var t = Math.max(0, trophies);
  return { next: next, needed: next.min - t, fraction: (t - cur.min) / (next.min - cur.min) };
}

/**
 * What a ranked match plays like. Both players get the same rules: they come
 * from the average of the two players' trophies.
 * @returns {{league: object, disabledPowerups: string[], speedMultiplier: number}}
 */
export function leagueRules(trophies) {
  var league = getLeague(trophies);
  return { league: league, disabledPowerups: league.disabled.slice(), speedMultiplier: league.speed };
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

/** Short text for a rules line, e.g. "No Auto-pilot, Shield · track +5% faster". */
export function describeLeagueRules(trophies) {
  var rules = leagueRules(trophies);
  var names = { autoPilot: 'Auto-pilot', shield: 'Shield', magnet: 'Magnet', double: '2× Score', scoreFrenzy: 'Frenzy' };
  var parts = [];
  if (rules.disabledPowerups.length === 5) parts.push('No power-ups');
  else if (rules.disabledPowerups.length) parts.push('No ' + rules.disabledPowerups.map(function (id) { return names[id]; }).join(', '));
  else parts.push('All power-ups');
  if (rules.speedMultiplier > 1) parts.push('track +' + Math.round((rules.speedMultiplier - 1) * 100) + '% faster');
  return parts.join(' · ');
}
