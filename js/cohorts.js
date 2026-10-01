/**
 * cohorts.js — client for cohorts and cohort wars (NOT RELEASED: see features.js).
 *
 * Wrappers around the functions in database/cohorts.sql. Each call returns
 * { ok, error, ... } and never throws.
 */

import { call } from './ranked.js';

function plain(r, map) {
  if (!r.ok) return r;
  return Object.assign({ ok: true }, map(r.data));
}

export var cohorts = {
  /** @returns {Promise<{ok, cohort}>} cohort is null when the player has none */
  mine: function () {
    return call('my_cohort').then(function (r) {
      return plain(r, function (d) { return { cohort: d || null }; });
    });
  },

  search: function (query) {
    return call('cohort_search', { p_query: query || '', p_limit: 20 }).then(function (r) {
      return plain(r, function (rows) { return { results: rows || [] }; });
    });
  },

  create: function (name, school, description) {
    return call('cohort_create', { p_name: name, p_school: school || null, p_description: description || '' }).then(function (r) {
      return plain(r, function (d) { return { cohort: d }; });
    });
  },

  join: function (tag) {
    return call('cohort_join', { p_tag: tag }).then(function (r) {
      return plain(r, function (d) { return { cohort: d }; });
    });
  },

  leave: function () {
    return call('cohort_leave').then(function (r) { return r.ok ? { ok: true } : r; });
  },

  setRole: function (userId, role) {
    return call('cohort_set_role', { p_user: userId, p_role: role }).then(function (r) { return r.ok ? { ok: true } : r; });
  },

  kick: function (userId) {
    return call('cohort_kick', { p_user: userId }).then(function (r) { return r.ok ? { ok: true } : r; });
  },

  warStandings: function () {
    return call('cohort_war_standings', { p_limit: 50 }).then(function (r) {
      return plain(r, function (rows) { return { rows: rows || [] }; });
    });
  },

  schoolStandings: function () {
    return call('school_standings', { p_limit: 50 }).then(function (r) {
      return plain(r, function (rows) { return { rows: rows || [] }; });
    });
  }
};
