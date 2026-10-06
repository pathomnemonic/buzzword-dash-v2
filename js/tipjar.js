/**
 * tipjar.js — the in-app tip jar for the Android and iOS apps.
 *
 * The stores do not allow an external payment link inside an app, so on the phone a tip is a small consumable
 * in-app purchase (Google Play Billing / Apple StoreKit) through the capacitor-plugin-cdv-purchase plugin. A tip
 * unlocks nothing and gives no coins: it is only a thank-you. Because it is consumed straight away, the same
 * amount can be tipped again, and there is nothing to restore. On the web the tip is the plain link (tips.js).
 *
 * The three products must exist in both stores with exactly these ids (see docs/TIP-JAR.md).
 * Everything that touches the plugin goes through `createTipJar`, which a test can drive with a fake plugin.
 */

import { isNative } from './native.js';
import { createIap, getIap } from './iap.js';
import { track } from './analytics/index.js';

export var TIP_PRODUCTS = [
  { id: 'dxdash_tip_small', label: '☕ Small coffee', fallback: '' },
  { id: 'dxdash_tip_medium', label: '🥐 Coffee and a pastry', fallback: '' },
  { id: 'dxdash_tip_large', label: '🍕 A whole lunch', fallback: '' }
];

/**
 * @param {{loadPlugin?: function(): Promise<any>, platform?: string, iap?: any, report?: function(string, object): void}} deps
 *   either a ready `iap` connection (the app shares one), or loadPlugin + platform to make a private one (tests)
 */
export function createTipJar(deps) {
  var report = deps.report || function () {};
  var iap = deps.iap || createIap({ loadPlugin: deps.loadPlugin, platform: deps.platform || 'web' });
  iap.add(TIP_PRODUCTS.map(function (p) { return { id: p.id, kind: 'consumable' }; }));
  var results = {}; // product id -> price details, once the store has answered

  return {
    /** True when the store answered and has at least one of the tip products. */
    available: function () {
      return iap.start().then(function (ok) { return !!ok && TIP_PRODUCTS.some(function (p) { return !!iap.product(p.id); }); });
    },
    /** The products the store knows, with their local price: [{id, label, price, micros, currency}] */
    products: function () {
      return iap.start().then(function (ok) {
        if (!ok) return [];
        return TIP_PRODUCTS.map(function (p) {
          var pr = iap.price(p.id);
          if (!iap.product(p.id)) return null;
          var out = { id: p.id, label: p.label, price: (pr && pr.price) || '', micros: (pr && pr.micros) || 0, currency: (pr && pr.currency) || '' };
          results[p.id] = out;
          return out;
        }).filter(Boolean);
      });
    },
    /** Open the store's payment sheet. @returns {Promise<{ok: boolean, cancelled?: boolean, error?: string}>} */
    buy: function (id) {
      var info = results[id] || {};
      return iap.start().then(function (ok) {
        if (!ok || !iap.product(id)) return { ok: false, error: 'unavailable' };
        report('started', { product: id, price: info.price, micros: info.micros, currency: info.currency });
        return iap.order(id).then(function (res) {
          report(res.ok ? 'completed' : res.cancelled ? 'cancelled' : 'failed', { product: id, price: info.price, micros: info.micros, currency: info.currency });
          return res;
        });
      });
    }
  };
}

var _jar = null;
function theJar() {
  if (!_jar) {
    _jar = createTipJar({
      iap: getIap(),
      report: function (outcome, d) { track('tip_purchase', { outcome: outcome, product: d.product, price: d.price, micros: d.micros, currency: d.currency }); }
    });
  }
  return _jar;
}

/** Tests: use a fake jar (null restores the real one). */
export function setTipJarForTest(jar) { _jar = jar; }

var _ready = false;
/** Ask the store once at start-up, so screens can decide synchronously whether to offer the jar. */
export function probeTipJar() {
  if (!isNative()) return Promise.resolve(false);
  return theJar().available().then(function (ok) { _ready = ok; return ok; }, function () { return false; });
}
/** True inside the store apps once the store has answered and has the tip products. */
export function tipJarReady() { return _ready; }
export function tipJarAvailable() { return isNative() ? theJar().available() : Promise.resolve(false); }
export function tipProducts() { return theJar().products(); }
export function buyTip(id) { return theJar().buy(id); }
