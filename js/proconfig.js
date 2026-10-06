/**
 * proconfig.js — what Dx Dash Pro is and what it limits, with the remote config file (public/remote-config.json) able
 * to change any of it without a release.
 *
 * Pro ships ON. Free players get a taste of everything: 300 hand-spread cards (20 in each subject), the game, the
 * leaderboards and friends, the basic stats. Pro adds the whole 3,010-card library and the study tools. (If the build
 * has no way to take payment, nothing is limited: see pro.js proLive.)
 *
 * A gate is "open" (no limit), "locked" (Pro only) or { limit, per } where per is "day", "week" or "total" (for
 * custom_cards the limit is how many cards in total; for anki_import how many cards in one import). The file can change
 * them, add launchAt + grandfather to keep a feature free for people who installed earlier, or switch Pro off:
 *
 *   { "pro": { "enabled": true, "plans": ["dxdash_pro_yearly", "dxdash_pro_monthly", "dxdash_pro_pass3m", "dxdash_pro_lifetime"],
 *              "library": "dxdash_library",
 *              "gates": { "card_library": "locked", "custom_cards": { "limit": 25, "per": "total" }, "anki_import": "locked" },
 *              "launchAt": 0, "grandfather": [] } }
 */

export var GATE_FEATURES = ['card_library', 'analytics_detail', 'custom_cards', 'anki_import', 'offline_pack', 'explanations', 'exam_sim'];
export var DEFAULT_PLANS = ['dxdash_pro_yearly', 'dxdash_pro_monthly', 'dxdash_pro_pass3m', 'dxdash_pro_lifetime'];
/** The one-time purchase that unlocks only the full card library (not the study tools). */
export var DEFAULT_LIBRARY_PRODUCT = 'dxdash_library';
/** What free players get by default; the remote file can loosen or tighten each. */
export var DEFAULT_GATES = {
  card_library: 'locked',
  analytics_detail: 'locked',
  anki_import: 'locked',
  offline_pack: 'locked',
  custom_cards: { limit: 25, per: 'total' },
  explanations: { limit: 8, per: 'day' },
  exam_sim: { limit: 1, per: 'week' }
};

/** @typedef {{enabled: boolean, plans: string[], library: string, gates: Object<string, any>, launchAt: number, grandfather: string[]}} ProConfig */

/** @returns {ProConfig} */
export function defaultProConfig() {
  return { enabled: true, plans: DEFAULT_PLANS.slice(), library: DEFAULT_LIBRARY_PRODUCT, gates: JSON.parse(JSON.stringify(DEFAULT_GATES)), launchAt: 0, grandfather: [] };
}

/** @returns {ProConfig} */
export function sanitizeProConfig(raw) {
  var out = defaultProConfig();
  if (!raw || typeof raw !== 'object') return out;
  if (raw.enabled === false) out.enabled = false;
  if (typeof raw.library === 'string' && /^[a-z0-9_.]{3,64}$/.test(raw.library)) out.library = raw.library;
  if (Array.isArray(raw.plans)) {
    var plans = raw.plans.filter(function (p) { return typeof p === 'string' && /^[a-z0-9_.]{3,64}$/.test(p); }).slice(0, 4);
    if (plans.length) out.plans = plans;
  }
  if (raw.gates && typeof raw.gates === 'object') {
    GATE_FEATURES.forEach(function (f) {
      var g = raw.gates[f];
      if (g === 'open') delete out.gates[f];
      else if (g === 'locked') out.gates[f] = 'locked';
      else if (g && typeof g === 'object' && typeof g.limit === 'number' && isFinite(g.limit) && g.limit >= 0 && g.limit <= 100000) {
        out.gates[f] = { limit: Math.floor(g.limit), per: g.per === 'day' || g.per === 'week' ? g.per : 'total' };
      }
    });
  }
  if (typeof raw.launchAt === 'number' && isFinite(raw.launchAt) && raw.launchAt > 0) out.launchAt = Math.floor(raw.launchAt);
  if (Array.isArray(raw.grandfather)) out.grandfather = raw.grandfather.filter(function (f) { return GATE_FEATURES.indexOf(f) >= 0; });
  return out;
}
