import { describe, it, expect } from 'vitest';
import { createTipJar, TIP_PRODUCTS } from '../../js/tipjar.js';
import { shouldShowTipPrompt } from '../../js/tips.js';
import { cleanEvent } from '../../js/analytics/catalog.js';

/** A fake store plugin shaped like capacitor-plugin-cdv-purchase. */
function fakePlugin(opts) {
  opts = opts || {};
  var handlers = {};
  var registered = [];
  var products = {};
  var orders = [];
  var plugin = {
    Platform: { GOOGLE_PLAY: 'android-playstore', APPLE_APPSTORE: 'ios-appstore' },
    ProductType: { CONSUMABLE: 'consumable' },
    ErrorCode: { PAYMENT_CANCELLED: 6777006 },
    orders: orders,
    registered: registered,
    store: {
      register: function (list) { registered.push.apply(registered, list); },
      when: function () {
        var w = { approved: function (cb) { handlers.approved = cb; return w; }, finished: function (cb) { handlers.finished = cb; return w; } };
        return w;
      },
      initialize: function () {
        (opts.have || TIP_PRODUCTS.map(function (p) { return p.id; })).forEach(function (id, i) {
          products[id] = { id: id, offers: [{ id: 'o' + id, pricingPhases: [{ price: '$' + (i + 1) + '.99', priceMicros: (i + 1) * 1990000, currency: 'USD' }] }], getOffer: function () { return this.offers[0]; } };
        });
        return Promise.resolve([]);
      },
      get: function (id) { return products[id]; },
      order: function (offer) {
        orders.push(offer.id);
        if (opts.orderError) return Promise.resolve(opts.orderError);
        // the store approves, the app finishes, then it is finished
        var t = { products: [{ id: offer.id.replace(/^o/, '') }], finish: function () { setTimeout(function () { handlers.finished(t); }, 0); } };
        setTimeout(function () { handlers.approved(t); }, 0);
        return Promise.resolve(undefined);
      }
    }
  };
  return plugin;
}

function jar(plugin, platform, reports) {
  return createTipJar({ platform: platform || 'android', loadPlugin: function () { return Promise.resolve(plugin); }, report: function (o, d) { reports.push([o, d]); } });
}

describe('tip jar', function () {
  it('registers the three tips as consumables for the right store and lists local prices', async function () {
    var p = fakePlugin(); var r = [];
    var j = jar(p, 'android', r);
    expect(await j.available()).toBe(true);
    expect(p.registered.map(function (x) { return x.platform; })).toEqual(['android-playstore', 'android-playstore', 'android-playstore']);
    expect(p.registered.every(function (x) { return x.type === 'consumable'; })).toBe(true);
    var list = await j.products();
    expect(list.map(function (x) { return x.id; })).toEqual(TIP_PRODUCTS.map(function (x) { return x.id; }));
    expect(list[0].price).toBe('$1.99');
    var ios = fakePlugin();
    await jar(ios, 'ios', []).available();
    expect(ios.registered[0].platform).toBe('ios-appstore');
  });

  it('is unavailable with no plugin, on the web, or when the store has none of the products', async function () {
    expect(await createTipJar({ platform: 'android', loadPlugin: function () { return Promise.resolve(null); } }).available()).toBe(false);
    expect(await jar(fakePlugin(), 'web', []).available()).toBe(false);
    expect(await jar(fakePlugin({ have: [] }), 'android', []).available()).toBe(false);
    var broken = createTipJar({ platform: 'android', loadPlugin: function () { return Promise.reject(new Error('boom')); } });
    expect(await broken.available()).toBe(false);
  });

  it('a completed tip is reported started then completed, with the price, and is consumed', async function () {
    var p = fakePlugin(); var r = [];
    var j = jar(p, 'android', r);
    await j.products();
    var res = await j.buy(TIP_PRODUCTS[1].id);
    expect(res.ok).toBe(true);
    expect(r.map(function (x) { return x[0]; })).toEqual(['started', 'completed']);
    expect(r[1][1]).toMatchObject({ product: TIP_PRODUCTS[1].id, currency: 'USD', micros: 3980000 });
    expect(p.orders.length).toBe(1);
    r.forEach(function (x) { expect(cleanEvent('tip_purchase', Object.assign({ outcome: x[0] }, x[1])).ok).toBe(true); });
  });

  it('a closed payment sheet is a cancel, not an error; other errors are failures', async function () {
    var r = [];
    var c = await jar(fakePlugin({ orderError: { code: 6777006, message: 'cancelled' } }), 'android', r).buy(TIP_PRODUCTS[0].id);
    expect(c).toMatchObject({ ok: false, cancelled: true });
    var r2 = [];
    var f = await jar(fakePlugin({ orderError: { code: 1, message: 'store down' } }), 'android', r2).buy(TIP_PRODUCTS[0].id);
    expect(f.ok).toBe(false);
    expect(f.cancelled).toBe(false);
    expect(r2.map(function (x) { return x[0]; })).toEqual(['started', 'failed']);
  });

  it('refuses an unknown product and a second purchase while one is open', async function () {
    var j = jar(fakePlugin(), 'android', []);
    expect((await j.buy('nope')).error).toBe('unavailable');
  });
});

describe('tip prompt with the in-app jar', function () {
  var base = { tipUrl: '', optedOut: false, totalRuns: 10, lastPromptAt: 0, now: 1e12, correct: 12, accuracy: 80 };
  it('shows with the jar and no link, still politely', function () {
    expect(shouldShowTipPrompt(Object.assign({}, base))).toBe(false);
    expect(shouldShowTipPrompt(Object.assign({}, base, { iap: true }))).toBe(true);
    expect(shouldShowTipPrompt(Object.assign({}, base, { iap: true, optedOut: true }))).toBe(false);
    expect(shouldShowTipPrompt(Object.assign({}, base, { iap: true, totalRuns: 2 }))).toBe(false);
  });
});
