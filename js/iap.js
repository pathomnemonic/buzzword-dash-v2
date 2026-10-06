/**
 * iap.js — the one connection to the store's in-app purchases (Google Play Billing / Apple StoreKit) for the phone
 * apps, through capacitor-plugin-cdv-purchase. The tip jar (consumable tips) and Dx Dash Pro (subscriptions) share it,
 * because the plugin keeps one store: every product is registered together, once, before it starts.
 *
 * Everything that touches the plugin goes through `createIap`, which a test can drive with a fake plugin.
 */

import { isNative, getNativePlatform } from './native.js';

/**
 * @typedef {{id: string, kind: 'consumable'|'subscription'|'nonconsumable'}} ProductDef
 * @param {{loadPlugin: function(): Promise<any>, platform: string}} deps
 *   loadPlugin resolves the plugin module ({ store, ProductType, Platform, ErrorCode }), or null when there is none
 */
export function createIap(deps) {
  var plugin = null;
  var started = null;
  var defs = [];
  var waiting = {}; // product id -> resolve of the open purchase
  var listeners = [];

  function platformId(mod) {
    return deps.platform === 'ios' ? mod.Platform.APPLE_APPSTORE : deps.platform === 'android' ? mod.Platform.GOOGLE_PLAY : null;
  }

  var self = {
    /** Add products to register. Must happen before the first start(); later additions are ignored. */
    add: function (list) {
      if (started) return;
      list.forEach(function (d) { if (!defs.some(function (x) { return x.id === d.id; })) defs.push(d); });
    },

    /** Connect to the store (once). Resolves true when the store answered. */
    start: function () {
      if (started) return started;
      started = Promise.resolve().then(function () { return deps.loadPlugin(); }).then(function (mod) {
        if (!mod || !mod.store) return false;
        var platform = platformId(mod);
        if (!platform || !defs.length) return false;
        plugin = mod;
        mod.store.register(defs.map(function (d) {
          return { id: d.id, type: d.kind === 'subscription' ? mod.ProductType.PAID_SUBSCRIPTION : d.kind === 'nonconsumable' ? mod.ProductType.NON_CONSUMABLE : mod.ProductType.CONSUMABLE, platform: platform };
        }));
        // Approved: acknowledge (finish) it at once, so a tip can be given again and a subscription is confirmed to the store
        mod.store.when().approved(function (t) { t.finish(); }).finished(function (t) {
          var ids = (t && t.products ? t.products : []).map(function (p) { return p.id; });
          ids.forEach(function (id) { var w = waiting[id]; if (w) { delete waiting[id]; w({ ok: true }); } });
          listeners.forEach(function (fn) { try { fn(ids); } catch (e) { /* ignore */ } });
        });
        return mod.store.initialize([platform]).then(function (errors) {
          return defs.some(function (d) { return !!self.product(d.id); }) || !(errors && errors.length);
        });
      }).catch(function () { return false; });
      return started;
    },

    /** The store's product, or null. */
    product: function (id) {
      try { return (plugin && plugin.store.get(id, platformId(plugin))) || null; } catch (e) { return null; }
    },

    /** Local price details of a product: {price, micros, currency, trialDays, period}. null when the store lacks it. */
    price: function (id) {
      var prod = self.product(id);
      var offer = prod && bestOffer(prod);
      if (!offer || !offer.pricingPhases || !offer.pricingPhases.length) return null;
      var phases = offer.pricingPhases;
      var paid = phases.filter(function (p) { return p.paymentMode !== 'FreeTrial'; })[0] || phases[phases.length - 1];
      var trial = phases.filter(function (p) { return p.paymentMode === 'FreeTrial'; })[0];
      return { price: paid.price || '', micros: paid.priceMicros || 0, currency: paid.currency || '', period: paid.billingPeriod || '', trialDays: trial ? isoDays(trial.billingPeriod) : 0 };
    },

    /** True when the player owns it now (an active subscription). */
    owned: function (id) {
      try { return !!(plugin && plugin.store.owned(id)); } catch (e) { return false; }
    },

    /** Open the store's payment sheet. @returns {Promise<{ok: boolean, cancelled?: boolean, error?: string}>} */
    order: function (id) {
      return self.start().then(function (ok) {
        var prod = ok ? self.product(id) : null;
        var offer = prod && bestOffer(prod);
        if (!offer) return { ok: false, error: 'unavailable' };
        if (waiting[id]) return { ok: false, error: 'busy' };
        return new Promise(function (resolve) {
          waiting[id] = resolve;
          Promise.resolve(plugin.store.order(offer)).then(function (err) {
            if (!err) return; // the sheet is open: the result comes through finished()
            delete waiting[id];
            var cancelled = !!(plugin.ErrorCode && err.code === plugin.ErrorCode.PAYMENT_CANCELLED);
            resolve({ ok: false, cancelled: cancelled, error: cancelled ? 'cancelled' : String(err.message || 'failed').slice(0, 80) });
          }, function () { delete waiting[id]; resolve({ ok: false, error: 'failed' }); });
        });
      });
    },

    /** Ask the store for purchases made before (a new phone, a reinstall). */
    restore: function () {
      return self.start().then(function (ok) {
        if (!ok || !plugin) return { ok: false, error: 'unavailable' };
        return Promise.resolve(plugin.store.restorePurchases()).then(function (err) { return err ? { ok: false, error: String(err.message || 'failed').slice(0, 80) } : { ok: true }; }, function () { return { ok: false, error: 'failed' }; });
      });
    },

    /** Open the store's own screen for changing or cancelling a subscription. */
    manage: function () {
      return self.start().then(function (ok) {
        if (!ok || !plugin) return false;
        return Promise.resolve(plugin.store.manageSubscriptions()).then(function () { return true; }, function () { return false; });
      });
    },

    /** Called with the product ids whenever a purchase finishes. */
    onFinished: function (fn) { listeners.push(fn); }
  };

  /** The offer with a free trial if there is one, otherwise the first. */
  function bestOffer(prod) {
    var offers = prod.offers || [];
    var withTrial = offers.filter(function (o) { return (o.pricingPhases || []).some(function (p) { return p.paymentMode === 'FreeTrial'; }); })[0];
    return withTrial || (prod.getOffer && prod.getOffer()) || offers[0] || null;
  }

  return self;
}

/** Days in an ISO 8601 duration such as P7D, P1W, P1M (a month counted as 30). */
export function isoDays(iso) {
  var m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(String(iso || ''));
  if (!m) return 0;
  return (Number(m[1] || 0) * 365) + (Number(m[2] || 0) * 30) + (Number(m[3] || 0) * 7) + Number(m[4] || 0);
}

var _iap = null;
/** The app's single store connection. */
export function getIap() {
  if (!_iap) {
    _iap = createIap({
      platform: getNativePlatform(),
      loadPlugin: function () { return isNative() ? import('capacitor-plugin-cdv-purchase') : Promise.resolve(null); }
    });
  }
  return _iap;
}

/** Tests: use a fake connection (null restores the real one). */
export function setIapForTest(iap) { _iap = iap; }
