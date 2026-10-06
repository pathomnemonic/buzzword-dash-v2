/**
 * analytics/index.js — the app's analytics, put together: the engine (core.js) with this app's storage, backend,
 * device context, campaign attribution, experiments and remote switches. Everything else imports `track` from here.
 * Every function is safe to call at any time (before start-up, with analytics off, with no backend): it just does nothing.
 */

import { createAnalytics } from './core.js';
import { collectContext } from './context.js';
import { parseTouch, recordTouch, firstTouch, lastTouch, refCodeFor, decorateShareUrl } from './attribution.js';
import { createExperiments } from './experiments.js';
import { analyticsEndpoint, appVersion } from './backend.js';

// The pieces of the app that analytics reads are handed in by instrument.js, so this file stays free of the rest of the app
var hooks = {
  platform: function () { return 'web'; },
  tier: function () { return ''; },
  config: function () { return { enabled: true, sample: 1, killed: [], rates: {}, experiments: {} }; }
};
/** Give analytics the app's platform name, graphics level and remote config. */
export function setAppHooks(h) { Object.assign(hooks, h || {}); }
function getNativePlatform() { return hooks.platform(); }
function getQuality() { return hooks.tier(); }
function analyticsConfig() { return hooks.config(); }

/** @returns {Storage} */
function safeStore() {
  try {
    if (typeof localStorage !== 'undefined') { localStorage.getItem('dx_an_probe'); return localStorage; }
  } catch (e) { /* blocked */ }
  var mem = {};
  return /** @type {Storage} */ (/** @type {unknown} */ ({ getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } }));
}

var store = safeStore();

function privacySignals() {
  var nav = typeof navigator !== 'undefined' ? navigator : {};
  var win = typeof window !== 'undefined' ? window : {};
  return {
    doNotTrack: nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.msDoNotTrack === '1',
    gpc: nav.globalPrivacyControl === true
  };
}

var _ctx = null;
function getContext() {
  if (_ctx) { _ctx.tier = safeTier(); return _ctx; }
  var v = appVersion();
  var webgl2 = false;
  try { webgl2 = !!(typeof document !== 'undefined' && document.createElement('canvas').getContext('webgl2')); } catch (e) { webgl2 = false; }
  _ctx = collectContext({ platform: getNativePlatform(), version: v.version, build: v.build, tier: safeTier(), webgl2: webgl2 });
  return _ctx;
}
function safeTier() { try { return getQuality(); } catch (e) { return ''; } }

var installIdRef = function () { return analytics.installId(); };
export var experiments = createExperiments({
  installId: function () { return installIdRef(); },
  store: store,
  onExposure: function (name, variant) { analytics.track('experiment_exposed', { experiment: name, variant: variant }); }
});

export var analytics = createAnalytics({
  store: store,
  endpoint: analyticsEndpoint(),
  getContext: getContext,
  getAttribution: function () { return { first: firstTouch(store), last: lastTouch(store) }; },
  getConfig: function () { return analyticsConfig(); },
  getExperiments: function () { return experiments.active(); },
  refCode: refCodeFor,
  signals: privacySignals()
});

/** Record an event (does nothing unless the player has agreed to analytics). */
export function track(name, props, opts) { return analytics.track(name, props, opts); }
export function trackOnce(key, name, props) { return analytics.trackOnce(key, name, props); }

var started = false;

/**
 * Start analytics: read the saved consent, remember where this visit came from, and begin a session if agreed.
 * @returns {'granted'|'denied'|'unset'} the consent state
 */
export function startAnalytics() {
  if (started) return analytics.consentState();
  started = true;
  try {
    var loc = typeof location !== 'undefined' ? location : { search: '', pathname: '', host: '' };
    var touch = parseTouch(loc.search, typeof document !== 'undefined' ? document.referrer : '', { path: loc.pathname, ownHost: loc.host, platform: getNativePlatform() });
    recordTouch(store, touch, Date.now());
  } catch (e) { /* attribution is optional */ }
  var state = analytics.init();
  try { experiments.setDefinitions(analyticsConfig().experiments); } catch (e) { /* none */ }
  return /** @type {"unset"|"granted"|"denied"} */ (state);
}

/** The variant of an experiment for this install ('' when there is no such experiment or analytics is off). */
export function variant(name) {
  try { experiments.setDefinitions(analyticsConfig().experiments); } catch (e) { /* none */ }
  return analytics.consentState() === 'granted' ? experiments.getVariant(name) : '';
}

/** A share link with campaign tags and this install's referral code. */
export function shareLink(url, kind) {
  try { return decorateShareUrl(url, { kind: kind, refCode: refCodeFor(analytics.installId()) }); } catch (e) { return url; }
}

export { getContext };
