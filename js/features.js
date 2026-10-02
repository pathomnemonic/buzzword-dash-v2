/**
 * features.js — switches for features that are built but not released.
 *
 * cohorts: teams, schools and weekly cohort wars. The code and database
 * (database/cohorts.sql) are finished and tested, but the feature stays hidden
 * until there are enough players for it to be fun. To release it, build with
 * VITE_FEATURE_COHORTS=1 (see docs/COHORTS.md).
 *
 * globalLeaderboard: the board of every player's best scores. Scores are still sent and kept, but the board
 * itself stays hidden until there are enough players for it to be worth looking at. Friends, the feed and
 * groups are not affected. To release it, build with VITE_FEATURE_GLOBAL_LEADERBOARD=1.
 *
 * characterVoices: the runner's synthesized cheers and groans (js/charactervoices.js). They sounded too robotic,
 * so for now a right answer plays a short rising musical chime and a wrong one a soft falling two-note sigh
 * instead. The code is kept; build with VITE_FEATURE_CHARACTER_VOICES=1 to bring the voices (and their Settings
 * switch) back.
 */

function flag(value) {
  return value === '1' || value === 'true';
}

export var FEATURES = {
  cohorts: flag(import.meta.env && import.meta.env.VITE_FEATURE_COHORTS),
  globalLeaderboard: flag(import.meta.env && import.meta.env.VITE_FEATURE_GLOBAL_LEADERBOARD),
  characterVoices: flag(import.meta.env && import.meta.env.VITE_FEATURE_CHARACTER_VOICES)
};
