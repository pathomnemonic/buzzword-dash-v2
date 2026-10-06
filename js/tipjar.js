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

import { isNative, getNativePlatform } from './native.js';
import { track } from './analytics/index.js';

export var TIP_PRODUCTS = [
  { id: 'dxdash_tip_small', label: '☕ Small coffee', fallback: '' },
  { id: 'dxdash_tip_medium', label: '🥐 Coffee and a pastry', fallback: '' },
  { id: 'dxdash_tip_large', label: '🍕 A whole lunch', fallback: '' }
];

/**
 * @param {{loadPlugin: function(): Promise<any>, platform: string, report?: function(string, object): void}} deps
 *   loadPlugin resolves the plugin module ({ store, ProductType, Platform, ErrorCode }), or null when there is none
 */
export function createTipJar(deps) {
  var report = deps.report || function () {};
  var ready = null;
  var plugin = null;
  var waiting = null; // { id, resolve } while a purchase is open
  var results = {};   // product id -> price details, once the store has answered

  function init() {
    if (ready) return ready;
    ready = Promise.resolve().then(function () { return deps.loadPlugin(); }).then(function (mod) {
      if (!mod || !mod.store) return false;
      var platform = deps.platform === 'ios' ? mod.Platform.APPLE_APPSTORE : deps.platform === 'android' ? mod.Platform.GOOGLE_PLAY : null;
      if (!platform) return false;
      plugin = mod;
      mod.store.register(TIP_PRODUCTS.map(function (p) { return { id: p.id, type: mod.ProductType.CONSUMABLE, platform: platform }; }));
      // A tip is finished (consumed) as soon as the store approves it, so it can be given again
      mod.store.when().approved(function (t) { t.finish(); }).finished(function (t) {
        var id = t && t.products && t.products[0] && t.products[0].id;
        if (waiting && (!id || id === waiting.id)) { var w = waiting; waiting = null; w.resolve({ ok: true }); }
      });
      return mod.store.initialize([platform]).then(function (errors) {
        var list = (TIP_PRODUCTS.map(function (p) { return mod.store.get(p.id, platform); }));
        return list.some(Boolean) || !(errors && errors.length);
      });
    }).catch(function () { return false; });
    return ready;
  }

  return {
    /** True when the store answered and has at least one of the tip products. */
    available: function () {
      return init().then(function (ok) {
        if (!ok || !plugin) return false;
        return TIP_PRODUCTS.some(function (p) { return !!currentProduct(p.id); });
      });
    },
    /** The products the store knows, with their local price: [{id, label, price, micros, currency}] */
    products: function () {
      return init().then(function (ok) {
        if (!ok || !plugin) return [];
        return TIP_PRODUCTS.map(function (p) {
          var prod = currentProduct(p.id);
          if (!prod) return null;
          var phase = prod.offers && prod.offers[0] && prod.offers[0].pricingPhases && prod.offers[0].pricingPhases[0];
          var out = { id: p.id, label: p.label, price: (phase && phase.price) || '', micros: (phase && phase.priceMicros) || 0, currency: (phase && phase.currency) || '' };
          results[p.id] = out;
          return out;
        }).filter(Boolean);
      });
    },
    /** Open the store's payment sheet. @returns {Promise<{ok: boolean, cancelled?: boolean, error?: string}>} */
    buy: function (id) {
      return init().then(function (ok) {
        var prod = ok && plugin ? currentProduct(id) : null;
        var offer = prod && prod.getOffer && prod.getOffer();
        if (!offer) return { ok: false, error: 'unavailable' };
        var info = results[id] || {};
        report('started', { product: id, price: info.price, micros: info.micros, currency: info.currency });
        if (waiting) return { ok: false, error: 'busy' };
        return new Promise(function (resolve) {
          waiting = { id: id, resolve: resolve };
          Promise.resolve(plugin.store.order(offer)).then(function (err) {
            if (!err) return; // the sheet is open: the result comes through finished()
            if (waiting && waiting.id === id) waiting = null;
            var cancelled = !!(plugin.ErrorCode && err.code === plugin.ErrorCode.PAYMENT_CANCELLED);
            resolve({ ok: false, cancelled: cancelled, error: cancelled ? 'cancelled' : String(err.message || 'failed').slice(0, 80) });
          }, function () { if (waiting && waiting.id === id) waiting = null; resolve({ ok: false, error: 'failed' }); });
        }).then(function (res) {
          report(res.ok ? 'completed' : res.cancelled ? 'cancelled' : 'failed', { product: id, price: info.price, micros: info.micros, currency: info.currency });
          return res;
        });
      });
    }
  };

  function currentProduct(id) {
    try { return plugin.store.get(id, deps.platform === 'ios' ? plugin.Platform.APPLE_APPSTORE : plugin.Platform.GOOGLE_PLAY) || null; } catch (e) { return null; }
  }
}

var _jar = null;
function theJar() {
  if (!_jar) {
    _jar = createTipJar({
      platform: getNativePlatform(),
      loadPlugin: function () { return isNative() ? import('capacitor-plugin-cdv-purchase') : Promise.resolve(null); },
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
