/**
 * pro.js — Dx Dash Pro: who has it, what is limited without it, and how it is bought.
 *
 * Pro ships ON (see proconfig.js for what it limits and how the remote file changes that). Free players get 300
 * hand-spread cards plus the game; Pro (a subscription, or a one-time Lifetime purchase) unlocks the whole library and
 * the study tools; a one-time "Full Library" purchase unlocks just the cards.
 *
 * It only limits things when there is a way to pay: in the phone apps once the store answered with the products, on the
 * web when a payment link is set (VITE_PRO_WEB_URL). A build with no way to pay (a local build, a store with the
 * products not set up yet) limits nothing and shows no Pro screens, so nobody is ever locked out of something they
 * cannot buy. `proLive()` is that test; everything below uses it.
 *
 * Where Pro comes from:
 *   - the store (phone apps): an active subscription or the Lifetime purchase, read from the store itself;
 *   - the server (database/pro.sql): a web payment, a promo code, a school seat, granted to the player's account.
 * The result is kept on the device so Pro keeps working offline (a store or server answer is trusted for 3 days
 * without a fresh check; Lifetime does not expire).
 */

import { FEATURES } from './features.js';
import { proConfig } from './remoteconfig.js';
import { GATE_FEATURES } from './proconfig.js';
import { getIap } from './iap.js';
import { storage } from './storage.js';
import { isNative } from './native.js';
import { track } from './analytics/index.js';

var CACHE_KEY = 'dx_pro';
var USE_KEY = 'dx_pro_use';
var DEBUG_KEY = 'dx_pro_debug';
var SELL_KEY = 'dx_pro_sell';
var LIB_KEY = 'dx_pro_lib';
var FOREVER = 100 * 365 * 24 * 60 * 60 * 1000;
var GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export var PRO_PLAN_INFO = {
  dxdash_pro_yearly: { label: 'Yearly', blurb: 'BEST VALUE', rank: 1 },
  dxdash_pro_pass3m: { label: '3-Month Dedicated Pass', blurb: 'For your exam window', rank: 2 },
  dxdash_pro_monthly: { label: 'Monthly', blurb: 'Cancel any time', rank: 3 },
  dxdash_pro_lifetime: { label: 'Lifetime', blurb: 'Pay once, keep it', rank: 4 }
};

/** What Pro gives (shown on the paywall). Keep in step with the gates in proconfig.js. */
export var PRO_BENEFITS = [
  'All 3,010 cards (free is 300)',
  'Detailed stats: subjects, weak spots, exam pacing, export',
  'Anki import and unlimited custom cards',
  'Every "why" explanation, unlimited exam-sim blocks',
  'Play with no connection (offline pack)',
  'Keeps a solo developer making the game'
];

/**
 * What Pro gives, one entry per gate in proconfig.js (id = the gate), for the detail list in the Pro popup.
 * `free` says what a free player has, so the difference is clear.
 */
export var PRO_FEATURES = [
  { id: 'monthly_gift', icon: '🎁', title: 'A free Locker item every month', detail: 'Pick any one hero, trail, monster or map in the shop, on the house. A new pick opens each month.', free: 'Free: buy with coins' },
  { id: 'card_library', icon: '🗂', title: '10× more cards: the whole bank', detail: 'All 3,010 cards across every subject and system, not just 300.', free: 'Free: 300 cards' },
  { id: 'explanations', icon: '💡', title: 'Every "why" explanation', detail: 'See why the answer is right and why the others are not, after every miss.', free: 'Free: 8 a day' },
  { id: 'exam_sim', icon: '⏱', title: 'Unlimited exam simulations', detail: 'Timed blocks with pacing, flagged questions and a score report.', free: 'Free: 1 a week' },
  { id: 'analytics_detail', icon: '📊', title: 'Detailed stats', detail: 'Subject and system breakdowns, weak spots, exam pacing, and export to a file.', free: 'Free: the basics' },
  { id: 'custom_cards', icon: '✏️', title: 'Unlimited custom cards', detail: 'Write your own cards for anything your course throws at you.', free: 'Free: 25 cards' },
  { id: 'anki_import', icon: '📥', title: 'Anki import', detail: 'Bring in your existing Anki decks and play them in the game.', free: 'Free: not included' },
  { id: 'missed_cards', icon: '🩹', title: 'Cards I miss', detail: 'A flashcard deck built from the cards you get wrong most, until they stick.', free: 'Free: not included' },
  { id: 'browse_cards', icon: '🔎', title: 'Browse every card', detail: 'Search the whole library by subject or text, flag mistakes and see your stats per card.', free: 'Free: not included' },
  { id: 'my_cards', icon: '📝', title: 'My cards', detail: 'Your own cards, your Anki decks and saved decks, all in one place.', free: 'Free: not included' },
  { id: 'offline_pack', icon: '✈️', title: 'Play with no connection', detail: 'Download your subjects once and study on a plane, a train or bad hospital wifi.', free: 'Free: online only' }
];

function store() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
function readJson(key, fallback) { try { var s = store(); var raw = s && s.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
function writeJson(key, value) { try { var s = store(); if (s) s.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full: this session still has it */ } }

/** True when Pro is switched on in the config (it is, by default; the remote file can switch it off). */
export function proEnabled() { return !!proConfig().enabled; }

var _sellable = false;
function savedSellable() { try { var s = store(); return !!(s && s.getItem(SELL_KEY) === '1'); } catch (e) { return false; } }

/** Is there a way to pay right now? Phone: the store has the products. Web: a payment link is set. */
export function proSellable() { return _sellable || savedSellable() || !!FEATURES.pro; }

/** Pro limits things and shows its screens only when it is on AND something can be bought (or Pro is already owned). */
export function proLive() { return proEnabled() && (proSellable() || cachedActive()); }

/** Tests: pretend the store has the products (or not). */
export function setSellableForTest(on) { _sellable = !!on; try { var s = store(); if (s) s.removeItem(SELL_KEY); } catch (e) { /* ignore */ } }

function setSellable(on) { _sellable = !!on; try { var s = store(); if (s) s.setItem(SELL_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } }

/**
 * Find out whether anything can be bought and remember the answer for the next launch. Phone: asks the store. Web: is a
 * payment link set. Safe to call any time.
 */
export function probeSellable(deps) {
  deps = deps || {};
  if (!proEnabled()) return Promise.resolve(false);
  var iap = deps.iap || getIap();
  if (!isNative()) {
    // (a debug page can pretend the web can sell, to try the screens)
    var forced = false;
    try { forced = /[?&]debug=1(&|$)/.test(location.search) && store().getItem('dx_pro_force_sell') === '1'; } catch (e) { forced = false; }
    var web = webCheckoutEnabled() || !!proWebUrl('x') || forced;
    setSellable(web);
    return Promise.resolve(web);
  }
  return proPlans(iap).then(function (plans) {
    var ok = plans.length > 0 || !!iap.product(proConfig().library);
    setSellable(ok);
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:pro-changed'));
    return ok;
  }).catch(function () { return false; });
}

function cachedActive() { var c = readJson(CACHE_KEY, null); return !!(c && c.active); }

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
  var libraryOwned = null;
  var trialStarted = false;
  var found = [];
  var jobs = [];
  jobs.push(iap.start().then(function (ok) {
    if (!ok) return;
    asked++;
    proConfig().plans.forEach(function (id) {
      if (iap.owned(id)) found.push({ source: 'store', active: true, plan: planName(id), until: /lifetime/.test(id) ? Date.now() + FOREVER : undefined });
    });
    libraryOwned = iap.owned(proConfig().library);
  }).catch(function () { /* the store did not answer */ }));
  var lb = deps.lb;
  if (lb && lb.isAuthenticated && lb.isAuthenticated() && lb.getMyPro) {
    jobs.push(lb.getMyPro().then(function (r) {
      // every account (not a guest) gets one free 7-day trial: start it the first time we see it is unused
      if (r && !r.active && r.trial_available && lb.startProTrial && proLive()) {
        return lb.startProTrial().then(function (t) {
          if (t && t.ok) {
            trialStarted = true;
            return lb.getMyPro();
          }
          return r;
        }).catch(function () { return r; });
      }
      return r;
    }).then(function (r) {
      asked++;
      if (r && r.library && !isNative()) libraryOwned = true;
      if (r && r.active) found.push({ source: r.source === 'code' ? 'code' : 'server', active: true, until: r.until ? new Date(r.until).getTime() : undefined, plan: r.plan, trial: !!r.trial });
    }).catch(function () { /* offline */ }));
  }
  return Promise.all(jobs).then(function () {
    var before = isPro(now);
    var next = combineStatus(found, readJson(CACHE_KEY, null), { now: now, fresh: asked > 0 });
    writeJson(CACHE_KEY, next);
    var libBefore = libraryUnlocked();
    if (libraryOwned !== null) writeJson(LIB_KEY, { owned: !!libraryOwned });
    if (libraryUnlocked() !== libBefore && typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:library-changed'));
    if (isPro(now) !== before && typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:pro-changed'));
    if (trialStarted && typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:pro-trial-started'));
    return proStatus();
  });
}

/** Register the Pro products with the store connection. Call before the store starts (see main.js). */
export function registerProProducts() {
  var cfg = proConfig();
  getIap().add(cfg.plans.map(function (id) { return { id: id, kind: /lifetime/.test(id) ? 'nonconsumable' : 'subscription' }; }));
}

/** Did this player buy the one-time Full Library unlock? */
export function ownsLibrary() { return !!readJson(LIB_KEY, { owned: false }).owned; }

/** May this player use every card? (Always yes while Pro is not live, with Pro, or after buying the Full Library.) */
export function libraryUnlocked() {
  if (!proLive()) return true;
  var cfg = proConfig();
  if (!cfg.gates.card_library) return true;
  return isPro() || ownsLibrary();
}

/** Buy the one-time Full Library unlock. */
export function buyLibrary(deps) {
  deps = deps || {};
  var iap = deps.iap || getIap();
  return iap.order(proConfig().library).then(function (res) {
    if (res.ok) {
      writeJson(LIB_KEY, { owned: true });
      if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:library-changed'));
    }
    return res;
  });
}

/** The Full Library offer from the store: {id, price, micros, currency}, or null. */
export function libraryOffer(iap) {
  iap = iap || getIap();
  return iap.start().then(function (ok) {
    if (!ok) return null;
    var id = proConfig().library;
    var pr = iap.price(id);
    return pr && iap.product(id) ? { id: id, price: pr.price, micros: pr.micros, currency: pr.currency } : null;
  });
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

/**
 * Can the website take payments through the checkout function? Needs a server (Supabase) and the switch
 * VITE_PRO_WEB_CHECKOUT=1 (set once the Stripe side and the functions in supabase/functions are live).
 */
export function webCheckoutEnabled() {
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return String(env.VITE_PRO_WEB_CHECKOUT || '') === '1' && !!env.VITE_SUPABASE_URL && !isNative();
}

/** The plans the website can sell now (real prices from Stripe), in the order the phone paywall shows them: [{id, label, blurb, price, micros, currency, trialDays, period}]. */
export function webPlans(lb) {
  if (!lb || !lb.proFunction) return Promise.resolve({ plans: [], library: null });
  return lb.proFunction('prices').then(function (r) {
    var all = (r && r.plans) || [];
    var cfg = proConfig();
    var plans = all.filter(function (p) { return cfg.plans.indexOf(p.id) >= 0; }).map(function (p) {
      var info = PRO_PLAN_INFO[p.id] || { label: planName(p.id), blurb: '', rank: 9 };
      return Object.assign({}, p, { label: info.label, blurb: info.blurb, rank: info.rank });
    }).sort(function (a, b) { return a.rank - b.rank; });
    return { plans: plans, library: null, error: r && r.error };
  });
}

/** Send the player to Stripe to pay for a plan (or the library). Resolves {ok: false, error} if it could not start; on success the page leaves. */
export function webBuy(productId, lb, nav) {
  if (!lb || !lb.proFunction) return Promise.resolve({ ok: false, error: 'Web payments are not available right now.' });
  if (!lb.isAuthenticated || !lb.isAuthenticated()) return Promise.resolve({ ok: false, error: 'Signing in is needed first. Open Friends → Account, then try again.' });
  return lb.proFunction('checkout', { plan: productId }).then(function (r) {
    if (r && r.url && /^https:\/\//.test(r.url)) { (nav || function (u) { window.location.assign(u); })(r.url); return { ok: true, redirected: true }; }
    return { ok: false, error: (r && r.error) || 'Could not start the payment.' };
  });
}

/** Open Stripe's page for cancelling or changing a web subscription. */
export function webManage(lb, nav) {
  if (!lb || !lb.proFunction) return Promise.resolve({ ok: false, error: 'Not available right now.' });
  return lb.proFunction('portal').then(function (r) {
    if (r && r.url && /^https:\/\//.test(r.url)) { (nav || function (u) { window.location.assign(u); })(r.url); return { ok: true }; }
    return { ok: false, error: (r && r.error) || 'Could not open the billing page.' };
  });
}

/**
 * The player just came back from paying (?pro=success). The payment reaches the server a moment later (Stripe tells it),
 * so ask a few times. Resolves the final status; stops as soon as Pro (or the library) shows up.
 */
export function waitForWebPayment(lb, o) {
  o = o || {};
  var tries = o.tries || 10;
  var every = o.every === undefined ? 2500 : o.every;
  var wait = o.wait || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var startedLib = libraryUnlocked();
  function once(n) {
    return refreshPro({ lb: lb }).then(function (st) {
      if (st.active || (libraryUnlocked() && !startedLib) || n <= 1) return { active: st.active, library: ownsLibrary(), tries: tries - n + 1 };
      return wait(every).then(function () { return once(n - 1); });
    });
  }
  return once(tries);
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
  if (!proLive() || GATE_FEATURES.indexOf(feature) < 0) return open;
  var cfg = proConfig();
  var gate = cfg.gates[feature];
  if (!gate) return open;
  if (isPro(o.now)) return open;
  if (feature === 'card_library' && ownsLibrary()) return open;
  var first = o.firstRunAt || (storage && storage.data && storage.data.settings && storage.data.settings.firstRunAt) || 0;
  if (cfg.launchAt && first && first < cfg.launchAt && cfg.grandfather.indexOf(feature) >= 0) return open;
  if (gate === 'locked') return { allowed: false, mode: 'locked' };
  var now = typeof o.now === 'number' ? o.now : Date.now();
  var used = typeof o.used === 'number' ? o.used : ((readJson(USE_KEY, {})[feature] || {}).k === periodKey(gate.per, now) ? (readJson(USE_KEY, {})[feature] || {}).n || 0 : 0);
  return { allowed: used < gate.limit, mode: 'limit', limit: gate.limit, used: used, remaining: Math.max(0, gate.limit - used), per: gate.per };
}

/** The calendar month a gift belongs to, as 'YYYY-MM' (local time). */
export function giftMonthKey(now) {
  var d = new Date(typeof now === 'number' ? now : Date.now());
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/**
 * The monthly Pro gift: one free item from the Locker, any one, each calendar month, for anyone with Pro (a trial too).
 * @returns {{eligible: boolean, available: boolean, nextAt: number, item: string}} nextAt: when the next gift opens (ms)
 */
export function proGiftState(now) {
  var t = typeof now === 'number' ? now : Date.now();
  var d = new Date(t);
  var nextAt = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  var p = (storage && storage.data && storage.data.progression) || {};
  var eligible = proLive() && isPro(t);
  return { eligible: eligible, available: eligible && p.proGiftMonth !== giftMonthKey(t), nextAt: nextAt, item: p.proGiftItem || '' };
}

/** Count one use of a feature (for "per day / per week" limits). */
export function recordUse(feature, now) {
  if (!proLive()) return;
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
