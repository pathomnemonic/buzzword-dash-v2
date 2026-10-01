/**
 * ranked.js — client for ranked multiplayer (random opponents, trophies, leagues).
 *
 * Thin wrappers around the database functions in database/schema.sql. Every
 * call returns { ok, error, ...data } and never throws, so the UI can show a
 * friendly message when the player is offline or not signed in.
 *
 * Flow:
 *   1. open a PeerJS room (multiplayer.hostGame) and call findMatch(code)
 *   2. role 'guest'  -> an opponent was waiting: join their room
 *      role 'host'   -> keep the room open and call pollMatch() every few seconds
 *   3. play the match, then report('win' | 'loss' | 'draw'); trophies change
 *      once both players' reports agree.
 */

import { leaderboard } from './leaderboard.js';

var CACHE_KEY = 'dxdash_ranked_cache';

var _testClient = null;

/** For tests: use this client (and treat the player as signed in) instead of the real backend. */
export function useTestClient(client) {
  _testClient = client;
}

function getClient() {
  return _testClient || leaderboard.getClient();
}

/** Call a database function as the signed-in player. Never throws: { ok, data } or { ok: false, error }. */
export function call(name, args) {
  var client = getClient();
  if (!client || (!_testClient && !leaderboard.isAuthenticated())) {
    return Promise.resolve({ ok: false, error: 'Sign in (or go online) to play ranked matches.' });
  }
  return client.rpc(name, args || {}).then(function (res) {
    if (res.error) return { ok: false, error: res.error.message || String(res.error) };
    return { ok: true, data: res.data };
  }).catch(function (e) {
    return { ok: false, error: (e && e.message) || 'Network error' };
  });
}

/** Last trophy count seen on this device (shown before the network answers). */
export function getCachedTrophies() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    var n = raw ? JSON.parse(raw).trophies : 0;
    return typeof n === 'number' && n >= 0 ? n : 0;
  } catch (e) {
    return 0;
  }
}

function cache(trophies) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ trophies: trophies })); } catch (e) { /* storage unavailable */ }
}

export var ranked = {
  /** Whether online features are set up on this build. */
  isAvailable: function () {
    return !!getClient();
  },

  /** @returns {Promise<{ok, error, trophies, wins, losses, draws}>} */
  myStats: function () {
    return call('ranked_my_stats').then(function (r) {
      if (!r.ok) return r;
      var d = r.data || {};
      cache(d.trophies || 0);
      return { ok: true, trophies: d.trophies || 0, best: d.best_trophies || 0, wins: d.wins || 0, losses: d.losses || 0, draws: d.draws || 0 };
    });
  },

  /** Join the queue with an open room. @returns {Promise<{ok, role, matchId, roomCode, ownTrophies, opponentTrophies}>} */
  findMatch: function (roomCode) {
    return call('ranked_find_match', { p_room_code: roomCode }).then(function (r) {
      if (!r.ok) return r;
      var d = r.data || {};
      return { ok: true, role: d.role, matchId: d.match_id || null, roomCode: d.room_code || roomCode, ownTrophies: d.own_trophies || 0, opponentTrophies: d.opponent_trophies };
    });
  },

  /** For the waiting host. @returns {Promise<{ok, matched, matchId, roomCode, ownTrophies, opponentTrophies}>} */
  pollMatch: function () {
    return call('ranked_poll_match').then(function (r) {
      if (!r.ok) return r;
      var d = r.data || {};
      if (!d.matched) return { ok: true, matched: false };
      return { ok: true, matched: true, matchId: d.match_id, roomCode: d.room_code, ownTrophies: d.own_trophies, opponentTrophies: d.opponent_trophies };
    });
  },

  cancel: function () {
    return call('ranked_cancel');
  },

  /** @param {'win'|'loss'|'draw'} outcome @returns {Promise<{ok, settled, delta, trophies}>} */
  report: function (matchId, outcome) {
    return call('ranked_report', { p_match: matchId, p_outcome: outcome }).then(function (r) {
      if (!r.ok) return r;
      var d = r.data || {};
      if (d.settled) cache(d.trophies || 0);
      return { ok: true, settled: !!d.settled, delta: d.delta || 0, trophies: d.trophies || 0 };
    });
  },

  /** Finish matches whose other side never reported. Safe to call any time. */
  settleStale: function () {
    return call('ranked_settle_stale');
  },

  /** @returns {Promise<{ok, players: Array<{name, avatar, trophies, wins, losses}>}>} */
  top: function (limit) {
    return call('ranked_top', { p_limit: limit || 50 }).then(function (r) {
      if (!r.ok) return r;
      return {
        ok: true,
        players: (r.data || []).map(function (p) {
          return { userId: p.user_id, name: p.player_name, avatar: p.avatar, trophies: p.trophies, wins: p.wins, losses: p.losses };
        })
      };
    });
  }
};
