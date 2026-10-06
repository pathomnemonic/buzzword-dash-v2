/**
 * experiments.js — A/B tests that need no server: an install is put in a variant by a stable hash of its id and the
 * experiment's name, so it gets the same variant every time and on every device launch, and the split follows the
 * weights. Experiments are switched on from the remote config file (see remoteconfig.js), so one can start, change or
 * stop without a store release.
 *
 *   { "analytics": { "experiments": { "swap_price": { "variants": { "control": 50, "cheap": 50 } } } } }
 *
 * The app asks getVariant("swap_price") where it would behave differently; the first time it asks, the exposure is
 * recorded (experiment_exposed) and every later event of the session carries the variant, so any metric can be
 * compared between variants.
 */

var KEY = 'dx_an_exp';

/** A number from 0 up to (not including) 1, the same for the same text. */
export function unitHash(text) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 13; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Only well-formed experiments survive: a name, at least two variants, positive weights. */
export function sanitizeExperiments(raw) {
  var out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).slice(0, 20).forEach(function (name) {
    var def = raw[name];
    if (!/^[a-z0-9_]{2,40}$/.test(name) || !def || typeof def !== 'object' || def.enabled === false) return;
    var variants = {};
    var count = 0;
    Object.keys(def.variants || {}).slice(0, 8).forEach(function (v) {
      var w = Number(def.variants[v]);
      if (/^[a-z0-9_]{1,24}$/.test(v) && isFinite(w) && w > 0) { variants[v] = w; count++; }
    });
    if (count >= 2) out[name] = { variants: variants };
  });
  return out;
}

/** The variant for an install, or '' when the experiment does not exist. */
export function assignVariant(installId, name, experiments) {
  var def = experiments && experiments[name];
  if (!def) return '';
  var names = Object.keys(def.variants);
  var total = names.reduce(function (s, v) { return s + def.variants[v]; }, 0);
  var point = unitHash(String(installId) + ':' + name) * total;
  var acc = 0;
  for (var i = 0; i < names.length; i++) {
    acc += def.variants[names[i]];
    if (point < acc) return names[i];
  }
  return names[names.length - 1];
}

/**
 * @param {{installId: function(): string, store: Storage, onExposure?: function(string, string): void}} deps
 */
export function createExperiments(deps) {
  var defs = {};
  var seen = {};
  try { seen = JSON.parse(deps.store.getItem(KEY)) || {}; } catch (e) { seen = {}; }
  return {
    setDefinitions: function (raw) { defs = sanitizeExperiments(raw); },
    definitions: function () { return defs; },
    /** The variant, recording the exposure the first time. A name that is not an experiment gives ''. */
    getVariant: function (name) {
      var v = assignVariant(deps.installId(), name, defs);
      if (!v) return '';
      if (seen[name] !== v) {
        seen[name] = v;
        try { deps.store.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* kept for this session */ }
        if (deps.onExposure) deps.onExposure(name, v);
      }
      return v;
    },
    /** Every variant this install has been put in, to ride along on events. */
    active: function () {
      var out = {};
      Object.keys(seen).forEach(function (k) { if (defs[k]) out[k] = seen[k]; });
      return out;
    }
  };
}
