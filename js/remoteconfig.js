/**
 * remoteconfig.js — a kill switch for mechanics, without shipping an update.
 *
 * The app fetches /remote-config.json (a small file that is deployed with the site and can be edited on its own)
 * and keeps the last good copy in storage. If a mechanic turns out to be broken in the field, add its name to
 * "killed" and every player gets it turned off the next time the app opens, with no store review. The file is
 * data only: unknown names, wrong types and a missing file all mean "nothing is switched off".
 *
 *   { "killed": ["hazards"] }
 *
 * Names: hazards (map hazards), monster (the exam monster), powerups, mapChanges (the runner stays on one map),
 *        rush (the dash), onlineFeatures (friends, feed, Versus and cloud save are hidden and left alone).
 */

import { sanitizeExperiments } from './analytics/experiments.js';

export var KILLABLE = ['hazards', 'monster', 'powerups', 'mapChanges', 'rush', 'onlineFeatures'];
var CACHE_KEY = 'dx_remote_config';
var _killed = [];
var _analytics = { enabled: true, sample: 1, killed: [], rates: {}, flushMs: 15000, experiments: {} };

/**
 * The analytics part of the file: a master switch, the share of installs that report, events to switch off, how
 * often an event is kept (a rate below 1 samples it), how often to send, and A/B experiments.
 *   { "analytics": { "enabled": true, "sample": 1, "killed": ["perf_sample"], "rates": { "obstacle_outcome": 0.2 }, "experiments": {} } }
 */
export function sanitizeAnalyticsConfig(raw) {
  var out = { enabled: true, sample: 1, killed: [], rates: {}, flushMs: 15000, experiments: {} };
  if (!raw || typeof raw !== 'object') return out;
  if (raw.enabled === false) out.enabled = false;
  if (typeof raw.sample === 'number' && isFinite(raw.sample)) out.sample = Math.max(0, Math.min(1, raw.sample));
  if (Array.isArray(raw.killed)) out.killed = raw.killed.filter(function (n) { return typeof n === 'string' && /^[a-z0-9_]{2,48}$/.test(n); }).slice(0, 100);
  if (raw.rates && typeof raw.rates === 'object') {
    Object.keys(raw.rates).slice(0, 100).forEach(function (n) {
      var r = raw.rates[n];
      if (/^[a-z0-9_]{2,48}$/.test(n) && typeof r === 'number' && r >= 0 && r <= 1) out.rates[n] = r;
    });
  }
  if (typeof raw.flushMs === 'number' && raw.flushMs >= 2000 && raw.flushMs <= 300000) out.flushMs = raw.flushMs;
  out.experiments = sanitizeExperiments(raw.experiments);
  return out;
}

export function analyticsConfig() { return _analytics; }
export function setAnalyticsConfigForTest(raw) { _analytics = sanitizeAnalyticsConfig(raw); }

/** Only known names survive; anything else in the file is ignored. */
export function sanitizeConfig(raw) {
  var list = raw && typeof raw === 'object' && Array.isArray(raw.killed) ? raw.killed : [];
  return { killed: KILLABLE.filter(function (n) { return list.indexOf(n) >= 0; }), analytics: sanitizeAnalyticsConfig(raw && raw.analytics) };
}

export function isKilled(name) { return _killed.indexOf(name) >= 0; }
export function killedList() { return _killed.slice(); }
export function setKilledForTest(list) { _killed = sanitizeConfig({ killed: list }).killed; }

/**
 * Turn a mechanic's kill switch into the run rules. Does not mark the run as custom: a remote switch is the
 * game's own decision, so the run stays ranked.
 * @param {{disabledPowerups: string[], hazardsOff: boolean, monsterOff: boolean}} rules
 * @param {string[]} allPowerups every power-up id
 * @returns {{mapsPinned: boolean, rushOff: boolean}}
 */
export function applyKillSwitch(rules, allPowerups) {
  if (isKilled('hazards')) rules.hazardsOff = true;
  if (isKilled('monster')) rules.monsterOff = true;
  if (isKilled('powerups')) rules.disabledPowerups = (allPowerups || []).slice();
  return { mapsPinned: isKilled('mapChanges'), rushOff: isKilled('rush') };
}

function readCache(store) {
  try { return sanitizeConfig(JSON.parse(store.getItem(CACHE_KEY))); } catch (e) { return { killed: [], analytics: sanitizeAnalyticsConfig(null) }; }
}

/**
 * Use the saved copy at once, then try the network (4 seconds at most). Never throws.
 * @param {{fetchFn?: Function, store?: Storage, url?: string}} [deps]
 * @returns {Promise<string[]>} what is switched off
 */
export function loadRemoteConfig(deps) {
  deps = deps || {};
  var store = deps.store || (typeof localStorage !== 'undefined' ? localStorage : { getItem: function () { return null; }, setItem: function () {} });
  var fetchFn = deps.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  var cached = readCache(store);
  _killed = cached.killed;
  _analytics = cached.analytics;
  if (!fetchFn) return Promise.resolve(_killed);
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  var url = deps.url || env.VITE_REMOTE_CONFIG_URL || 'remote-config.json';
  var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 4000); });
  var request = Promise.resolve().then(function () { return fetchFn(url, { cache: 'no-cache' }); })
    .then(function (res) { return res && res.ok ? res.json() : null; })
    .catch(function () { return null; });
  return Promise.race([request, timeout]).then(function (raw) {
    if (raw && typeof raw === 'object') {
      var cfg = sanitizeConfig(raw);
      _killed = cfg.killed;
      _analytics = cfg.analytics;
      try { store.setItem(CACHE_KEY, JSON.stringify(cfg)); } catch (e) { /* storage full: this session still has it */ }
    }
    return _killed;
  });
}
