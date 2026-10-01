/**
 * scorebest.js — only send a run to the leaderboard when it beats the player's best for that mode and season.
 *
 * The server keeps one row per player, mode and season too (database/schema.sql), but not sending the
 * lower runs at all saves a request per run and keeps the table small.
 */

function keyOf(mode, season) {
  return mode + '|' + season;
}

/** @param {Object<string, number>} bests  best score already sent, by "mode|season" */
export function beatsBest(bests, mode, season, score) {
  var best = (bests || {})[keyOf(mode, season)];
  return !(typeof best === 'number') || score > best;
}

/** @returns {Object<string, number>} a new map with the score recorded (old seasons are dropped, so it stays small) */
export function recordBest(bests, mode, season, score) {
  var next = {};
  Object.keys(bests || {}).forEach(function (k) {
    if (k.slice(k.indexOf('|') + 1) === season) next[k] = bests[k];
  });
  var k = keyOf(mode, season);
  if (typeof next[k] !== 'number' || score > next[k]) next[k] = score;
  return next;
}
