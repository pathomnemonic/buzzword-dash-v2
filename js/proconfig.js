/**
 * proconfig.js — the "pro" part of the remote config file (public/remote-config.json), read safely.
 *
 * Dx Dash Pro is built but dormant: nothing about it is visible and no feature is limited until it is switched on,
 * either in the build (VITE_FEATURE_PRO=1) or here, with no store release:
 *
 *   { "pro": {
 *       "enabled": true,
 *       "plans": ["dxdash_pro_yearly", "dxdash_pro_monthly", "dxdash_pro_pass3m"],
 *       "gates": { "custom_cards": { "limit": 50, "per": "total" }, "offline_pack": "locked",
 *                  "explanations": { "limit": 5, "per": "day" }, "exam_sim": { "limit": 2, "per": "week" },
 *                  "anki_import": { "limit": 200, "per": "total" } },
 *       "launchAt": 1790000000000,
 *       "grandfather": ["custom_cards"]
 *   } }
 *
 * A gate is "open" (the default: no limit), "locked" (Pro only), or { limit, per } where per is "day", "week" or
 * "total" (for custom_cards the limit is how many cards in total; for anki_import how many cards in one import).
 * Players who first opened the app before launchAt keep the features listed in grandfather free.
 */

export var GATE_FEATURES = ['custom_cards', 'anki_import', 'offline_pack', 'explanations', 'exam_sim'];
export var DEFAULT_PLANS = ['dxdash_pro_yearly', 'dxdash_pro_monthly', 'dxdash_pro_pass3m'];

/** @typedef {{enabled: boolean, plans: string[], gates: Object<string, any>, launchAt: number, grandfather: string[]}} ProConfig */

/** @returns {ProConfig} */
export function defaultProConfig() {
  return { enabled: false, plans: DEFAULT_PLANS.slice(), gates: {}, launchAt: 0, grandfather: [] };
}

/** @returns {ProConfig} */
export function sanitizeProConfig(raw) {
  var out = defaultProConfig();
  if (!raw || typeof raw !== 'object') return out;
  if (raw.enabled === true) out.enabled = true;
  if (Array.isArray(raw.plans)) {
    var plans = raw.plans.filter(function (p) { return typeof p === 'string' && /^[a-z0-9_.]{3,64}$/.test(p); }).slice(0, 4);
    if (plans.length) out.plans = plans;
  }
  if (raw.gates && typeof raw.gates === 'object') {
    GATE_FEATURES.forEach(function (f) {
      var g = raw.gates[f];
      if (g === 'locked') out.gates[f] = 'locked';
      else if (g && typeof g === 'object' && typeof g.limit === 'number' && isFinite(g.limit) && g.limit >= 0 && g.limit <= 100000) {
        out.gates[f] = { limit: Math.floor(g.limit), per: g.per === 'day' || g.per === 'week' ? g.per : 'total' };
      }
    });
  }
  if (typeof raw.launchAt === 'number' && isFinite(raw.launchAt) && raw.launchAt > 0) out.launchAt = Math.floor(raw.launchAt);
  if (Array.isArray(raw.grandfather)) out.grandfather = raw.grandfather.filter(function (f) { return GATE_FEATURES.indexOf(f) >= 0; });
  return out;
}
