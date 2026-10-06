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
 * discovery: study-buddy and public-group discovery (database/discovery.sql, docs/DISCOVERY.md). Players can opt in to
 * be found, and find others to study with, in the Friends tab. The database and the screens are finished and
 * tested, but it stays hidden until there are enough players. Build with VITE_FEATURE_DISCOVERY=1 to release it.
 *
 * characterVoices: the runner's synthesized cheers and groans (js/charactervoices.js). They sounded too robotic,
 * so for now a right answer plays a short rising musical chime and a wrong one a soft falling two-note sigh
 * instead. The code is kept; build with VITE_FEATURE_CHARACTER_VOICES=1 to bring the voices (and their Settings
 * switch) back.
 *
 * studyBuddies: the Home-screen pet (js/companions.js, js/palui.js) and its Pals tab in the Locker. It is shelved for now: the
 * code, the buddy items and the saved choice are all kept, so it comes back untouched. Build with VITE_FEATURE_STUDY_BUDDIES=1.
 *
 * pro: Dx Dash Pro, the subscription (js/pro.js, docs/PRO.md). Built and tested but dormant: nothing is visible and no feature
 * is limited. Turn it on in the build with VITE_FEATURE_PRO=1, or without a release with "pro": {"enabled": true} in
 * public/remote-config.json (which also says what is gated).
 */

function flag(value) {
  return value === '1' || value === 'true';
}

export var FEATURES = {
  cohorts: flag(import.meta.env && import.meta.env.VITE_FEATURE_COHORTS),
  globalLeaderboard: flag(import.meta.env && import.meta.env.VITE_FEATURE_GLOBAL_LEADERBOARD),
  discovery: flag(import.meta.env && import.meta.env.VITE_FEATURE_DISCOVERY),
  characterVoices: flag(import.meta.env && import.meta.env.VITE_FEATURE_CHARACTER_VOICES),
  studyBuddies: flag(import.meta.env && import.meta.env.VITE_FEATURE_STUDY_BUDDIES),
  pro: flag(import.meta.env && import.meta.env.VITE_FEATURE_PRO)
};
