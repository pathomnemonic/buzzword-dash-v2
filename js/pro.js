/**
 * pro.js — Dx Dash Pro, the optional subscription: who has it, what is limited without it, and how it is bought.
 *
 * DORMANT BY DEFAULT. Until Pro is switched on (FEATURES.pro in the build, or "pro.enabled" in the remote config,
 * see proconfig.js) every function here says "yes, allowed", no screen shows anything, and the store is not asked.
 * That is the point: it can be shipped and tested long before it is launched, and launched without a release.
 *
 * Where Pro comes from:
 *   - the store (phone apps): an active Google Play / App Store subscription, read from the store itself;
 *   - the server (database/pro.sql): a web payment, a promo code, a school seat, granted to the player's account.
 * The result is kept on the device so Pro keeps working offline (a store or server answer is trusted for 3 days
 * without a fresh check).
 *
 * What it limits is chosen in the remote config ("gates"), so launch day is a config change. `requireGate` is what
 * features call before they do something that may be Pro-only.
 */

import { FEATURES } from './features.js';
import { proConfig } from './remoteconfig.js';
import { GATE_FEATURES } from './proconfig.js';
import { getIap } from './iap.js';
import { storage } from './storage.js';
import { track } from './analytics/index.js';

var CACHE_KEY = 'dx_pro';
var USE_KEY = 'dx_pro_use';
var DEBUG_KEY = 'dx_pro_debug';
var GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export var PRO_PLAN_INFO = {
  dxdash_pro_yearly: { label: 'Yearly', blurb: 'Best value', rank: 1 },
  dxdash_pro_monthly: { label: 'Monthly', blurb: 'Cancel any time', rank: 2 },
  dxdash_pro_pass3m: { label: '3-month Dedicated Pass', blurb: 'For your exam window', rank: 3 }
};

/** What Pro gives (shown on the paywall). Keep in step with the gates in proconfig.js. */
export var PRO_BENEFITS = [
  'Unlimited custom cards and Anki imports',
  'Every "why" explanation for the cards you miss',
  'Unlimited exam-sim blocks, with full reports',
  'Play with no connection (offline pack)',
  'Support a solo developer who keeps the game free'
];

function store() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
function readJson(key, fallback) { try { var s = store(); var raw = s && s.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
function writeJson(key, value) { try { var s = store(); if (s) s.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full: this session still has it */ } }

/** True when Pro is switched on at all (build flag or remote config). Everything else is inert while this is false. */
export function proEnabled() { return !!FEATURES.pro || !!proConfig().enabled; }

/** Debug builds (?debug=1): force Pro on or off to try the screens. Never persists past the tab being cleared. */
export function setProDebug(on) { try { var s = store(); if (s) { if (on === null) s.removeItem(DEBUG_KEY); else s.setItem(DEBUG_KEY, on ? '1' : '0'); } } catch (e) { /* ignore */ } }

/**
 * Combine what the sources said into one answer. Pure.
 * @param {Array<{source: string, active: boolean, until?: number, plan?: string, trial?: boolean}>} found fresh answers
 * @param {{source?: string, plan?: string, trial?: boolean, until?: number, provenAt?: number}|null} cached the last good answer
 * @param {{now: number, fresh: boolean}} o fresh: the sources were actually asked this time
 */
export function combineStatus(found, cached, o) {
  var now = o.now;
  var best = null;
  (found || []).forEach(function (f) {
    if (!f || !f.active) return;
    var until = typeof f.until === 'number' ? f.until : now + 2 * 24 * 60 * 60 * 1000;
    if (!best || until > best.until) best = { source: f.source, plan: f.plan || 'pro', trial: !!f.trial, until: until, provenAt: now };
  });
  if (best) return { active: true, source: best.source, plan: best.plan, trial: best.trial, until: best.until, provenAt: now };
  if (o.fresh) return { active: false, source: '', plan: '', trial: false, until: 0, provenAt: now };
  // could not ask: keep the last good answer for a while
  if (cached && cached.until && cached.provenAt && (cached.until > now || cached.provenAt + GRACE_MS > now) && cached.provenAt + GRACE_MS > now) {
    return { active: true, source: cached.source || '', plan: cached.plan || 'pro', trial: !!cached.trial, until: cached.until, provenAt: cached.provenAt };
  }
  return { active: false, source: '', plan: '', trial: false, until: 0, provenAt: (cached && cached.provenAt) || 0 };
}

/** Does this player have Pro right now? (From the saved answer; always false while Pro is dormant.) */
export function isPro(now) {
  if (!proEnabled()) return false;
  var s = store();
  var dbg = s && s.getItem(DEBUG_KEY);
  if (dbg === '1') return true;
  if (dbg === '0') return false;
  var c = readJson(CACHE_KEY, null);
  if (!c || !c.active) return false;
  var t = typeof now === 'number' ? now : Date.now();
  return (c.until > t) || (c.provenAt + GRACE_MS > t);
}

/** The saved answer, for screens: {active, source, plan, trial, until}. */
export function proStatus() {
  var c = readJson(CACHE_KEY, null) || { active: false, source: '', plan: '', trial: false, until: 0 };
  return { active: isPro(), source: c.source || '', plan: c.plan || '', trial: !!c.trial, until: c.until || 0 };
}

function planName(productId) { return String(productId || '').replace(/^dxdash_pro_/, '') || 'pro'; }

/**
 * Ask the sources (the store, and the server when signed in) and save the answer.
 * @param {{lb?: any, now?: number}} [deps] lb: the leaderboard service, for the server answer
 */
export function refreshPro(deps) {
  deps = deps || {};
  if (!proEnabled()) return Promise.resolve(proStatus());
  var now = typeof deps.now === 'number' ? deps.now : Date.now();
  var iap = deps.iap || getIap();
  var asked = 0;
  var found = [];
  var jobs = [];
  jobs.push(iap.start().then(function (ok) {
    if (!ok) return;
    asked++;
    proConfig().plans.forEach(function (id) { if (iap.owned(id)) found.push({ source: 'store', active: true, plan: planName(id) }); });
  }).catch(function () { /* the store did not answer */ }));
  var lb = deps.lb;
  if (lb && lb.isAuthenticated && lb.isAuthenticated() && lb.getMyPro) {
    jobs.push(lb.getMyPro().then(function (r) {
      asked++;
      if (r && r.active) found.push({ source: r.source === 'code' ? 'code' : 'server', active: true, until: r.until ? new Date(r.until).getTime() : undefined, plan: r.plan, trial: !!r.trial });
    }).catch(function () { /* offline */ }));
  }
  return Promise.all(jobs).then(function () {
    var before = isPro(now);
    var next = combineStatus(found, readJson(CACHE_KEY, null), { now: now, fresh: asked > 0 });
    writeJson(CACHE_KEY, next);
    if (isPro(now) !== before && typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:pro-changed'));
    return proStatus();
  });
}

/** Register the Pro products with the store connection. Call before the store starts (see main.js). */
export function registerProProducts() {
  getIap().add(proConfig().plans.map(function (id) { return { id: id, kind: 'subscription' }; }));
}

/** The plans the store offers right now: [{id, label, blurb, price, micros, currency, trialDays, period}], best value first. */
export function proPlans(iap) {
  iap = iap || getIap();
  return iap.start().then(function (ok) {
    if (!ok) return [];
    return proConfig().plans.map(function (id) {
      var pr = iap.price(id);
      if (!pr || !iap.product(id)) return null;
      var info = PRO_PLAN_INFO[id] || { label: planName(id), blurb: '', rank: 9 };
      return { id: id, label: info.label, blurb: info.blurb, rank: info.rank, price: pr.price, micros: pr.micros, currency: pr.currency, trialDays: pr.trialDays, period: pr.period };
    }).filter(Boolean).sort(function (a, b) { return a.rank - b.rank; });
  });
}

/** Buy a plan. @returns {Promise<{ok: boolean, cancelled?: boolean, error?: string}>} */
export function buyPlan(id, deps) {
  deps = deps || {};
  var iap = deps.iap || getIap();
  return iap.order(id).then(function (res) {
    if (!res.ok) return res;
    // the store has confirmed: read it back (and wait a moment if the store is slow to show it)
    return refreshPro(Object.assign({}, deps, { iap: iap })).then(function (st) {
      if (!st.active) {
        // trust the purchase for now; the next check will confirm it
        writeJson(CACHE_KEY, { active: true, source: 'store', plan: planName(id), trial: false, until: Date.now() + 2 * 24 * 60 * 60 * 1000, provenAt: Date.now() });
        if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:pro-changed'));
      }
      return res;
    });
  });
}

/** Restore purchases made on another phone or before a reinstall. */
export function restorePro(deps) {
  deps = deps || {};
  var iap = deps.iap || getIap();
  return iap.restore().then(function (res) {
    return refreshPro(Object.assign({}, deps, { iap: iap })).then(function (st) { return { ok: res.ok, active: st.active, error: res.error }; });
  });
}

/** Redeem a promo / seat code on the server (needs an account). */
export function redeemCode(code, lb) {
  if (!lb || !lb.redeemProCode) return Promise.resolve({ ok: false, error: 'Codes need an account. Sign in first.' });
  return lb.redeemProCode(code).then(function (r) {
    return refreshPro({ lb: lb }).then(function () { return r; });
  });
}

/** Where to pay on the web (a Stripe payment link), with the player's account id so the payment can be matched. */
export function proWebUrl(userId) {
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  var base = String(env.VITE_PRO_WEB_URL || '');
  if (!/^https:\/\//.test(base)) return '';
  return userId ? base + (base.indexOf('?') >= 0 ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(userId) : base;
}

// ───────────── gates ─────────────

function periodKey(per, now) {
  var d = new Date(now);
  if (per === 'day') return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  if (per === 'week') { var start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); return 'w' + start.getFullYear() + '-' + (start.getMonth() + 1) + '-' + start.getDate(); }
  return 'all';
}

/**
 * What a feature may do right now. Pure apart from reading the saved counters.
 * @param {string} feature one of GATE_FEATURES
 * @param {{used?: number, now?: number, firstRunAt?: number}} [o] used: a count the caller knows (cards the player has);
 *   otherwise the saved counter for the period is used
 * @returns {{allowed: boolean, mode: 'open'|'limit'|'locked', limit?: number, used?: number, remaining?: number, per?: string}}
 */
export function checkGate(feature, o) {
  o = o || {};
  var open = { allowed: true, mode: 'open' };
  if (!proEnabled() || GATE_FEATURES.indexOf(feature) < 0) return open;
  var cfg = proConfig();
  var gate = cfg.gates[feature];
  if (!gate) return open;
  if (isPro(o.now)) return open;
  var first = o.firstRunAt || (storage && storage.data && storage.data.settings && storage.data.settings.firstRunAt) || 0;
  if (cfg.launchAt && first && first < cfg.launchAt && cfg.grandfather.indexOf(feature) >= 0) return open;
  if (gate === 'locked') return { allowed: false, mode: 'locked' };
  var now = typeof o.now === 'number' ? o.now : Date.now();
  var used = typeof o.used === 'number' ? o.used : ((readJson(USE_KEY, {})[feature] || {}).k === periodKey(gate.per, now) ? (readJson(USE_KEY, {})[feature] || {}).n || 0 : 0);
  return { allowed: used < gate.limit, mode: 'limit', limit: gate.limit, used: used, remaining: Math.max(0, gate.limit - used), per: gate.per };
}

/** Count one use of a feature (for "per day / per week" limits). */
export function recordUse(feature, now) {
  if (!proEnabled()) return;
  var gate = proConfig().gates[feature];
  if (!gate || gate === 'locked' || gate.per === 'total') return;
  var t = typeof now === 'number' ? now : Date.now();
  var all = readJson(USE_KEY, {});
  var k = periodKey(gate.per, t);
  var cur = all[feature] && all[feature].k === k ? all[feature].n : 0;
  all[feature] = { k: k, n: cur + 1 };
  writeJson(USE_KEY, all);
}

var _lastPassive = 0;

/**
 * Ask before doing something that may be Pro-only. Returns true when it may go ahead. When it may not, the paywall is
 * opened (through the "dx:pro-gate" event, which proui.js listens for) and the hit is counted for analytics.
 * @param {string} feature
 * @param {{used?: number, record?: boolean, passive?: boolean, trigger?: string, firstRunAt?: number}} [o]
 *   record: count this as a use when allowed. passive: a gate the player did not choose to hit (a teaser, not a wall):
 *   it reports the hit but opens the paywall at most once in 20 minutes.
 */
export function requireGate(feature, o) {
  o = o || {};
  var g = checkGate(feature, o);
  if (g.allowed) { if (o.record) recordUse(feature); return true; }
  try { track('pro_gate_hit', { feature: feature, mode: g.mode, used: g.used || 0, limit: g.limit || 0 }); } catch (e) { /* ignore */ }
  var now = Date.now();
  if (!o.passive || now - _lastPassive > 20 * 60 * 1000) {
    if (o.passive) _lastPassive = now;
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:pro-gate', { detail: { feature: feature, trigger: o.trigger || feature, gate: g } }));
  }
  return false;
}

/** Tests: forget saved counters. */
export function resetProForTest() { var s = store(); if (s) { s.removeItem(CACHE_KEY); s.removeItem(USE_KEY); s.removeItem(DEBUG_KEY); } _lastPassive = 0; }
