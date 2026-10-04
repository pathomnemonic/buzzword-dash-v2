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

export var KILLABLE = ['hazards', 'monster', 'powerups', 'mapChanges', 'rush', 'onlineFeatures'];
var CACHE_KEY = 'dx_remote_config';
var _killed = [];

/** Only known names survive; anything else in the file is ignored. */
export function sanitizeConfig(raw) {
  var list = raw && typeof raw === 'object' && Array.isArray(raw.killed) ? raw.killed : [];
  return { killed: KILLABLE.filter(function (n) { return list.indexOf(n) >= 0; }) };
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
  try { return sanitizeConfig(JSON.parse(store.getItem(CACHE_KEY))); } catch (e) { return { killed: [] }; }
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
  _killed = readCache(store).killed;
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
      try { store.setItem(CACHE_KEY, JSON.stringify(cfg)); } catch (e) { /* storage full: this session still has it */ }
    }
    return _killed;
  });
}
