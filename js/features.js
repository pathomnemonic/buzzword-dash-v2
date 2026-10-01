/**
 * features.js — switches for features that are built but not released.
 *
 * cohorts: teams, schools and weekly cohort wars. The code and database
 * (database/cohorts.sql) are finished and tested, but the feature stays hidden
 * until there are enough players for it to be fun. To release it, build with
 * VITE_FEATURE_COHORTS=1 (see docs/COHORTS.md).
 */

function flag(value) {
  return value === '1' || value === 'true';
}

export var FEATURES = {
  cohorts: flag(import.meta.env && import.meta.env.VITE_FEATURE_COHORTS)
};
