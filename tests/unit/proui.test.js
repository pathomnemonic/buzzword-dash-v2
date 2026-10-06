import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../js/native.js', () => ({ isNative: () => true, getNativePlatform: () => 'android' }));

import { setProConfigForTest } from '../../js/remoteconfig.js';
import { resetProForTest, setSellableForTest } from '../../js/pro.js';
import { setIapForTest, createIap } from '../../js/iap.js';
import { openPaywall, renderProSettings, installProUi, setProUiDeps } from '../../js/proui.js';

function fakePlugin(owned = []) {
  const handlers = {}; const products = {}; const own = new Set(owned);
  const plugin = {
    Platform: { GOOGLE_PLAY: 'p', APPLE_APPSTORE: 'a' }, ProductType: { CONSUMABLE: 'c', PAID_SUBSCRIPTION: 's', NON_CONSUMABLE: 'n' }, ErrorCode: { PAYMENT_CANCELLED: 1 }, registered: [],
    store: {
      register(l) { plugin.registered.push(...l); },
      when() { const w = { approved(cb) { handlers.approved = cb; return w; }, finished(cb) { handlers.finished = cb; return w; } }; return w; },
      initialize() { plugin.registered.forEach((d, i) => { products[d.id] = { id: d.id, offers: [{ id: 'o' + d.id, pricingPhases: [{ price: '$' + (i + 3) + '.99', priceMicros: (i + 3) * 1e6, currency: 'USD', billingPeriod: 'P1M', paymentMode: 'PayAsYouGo' }] }], getOffer() { return this.offers[0]; } }; }); return Promise.resolve([]); },
      get(id) { return products[id]; }, owned(id) { return own.has(id); }, restorePurchases() { return Promise.resolve(); }, manageSubscriptions() { return Promise.resolve(); },
      order(offer) { const id = offer.id.slice(1); const t = { products: [{ id }], finish() { own.add(id); setTimeout(() => handlers.finished(t), 0); } }; setTimeout(() => handlers.approved(t), 0); return Promise.resolve(); }
    }
  };
  return plugin;
}
const tick = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  resetProForTest();
  setProConfigForTest(null);
  setIapForTest(null);
  setSellableForTest(false);
});

describe('Pro screens while there is nothing to buy (or Pro is off)', () => {
  it('open nothing and add nothing', () => {
    expect(openPaywall({ trigger: 'settings' })).toBeNull();
    const box = document.createElement('div');
    renderProSettings(box);
    expect(box.children.length).toBe(0);
    expect(document.getElementById('proPaywall')).toBeNull();
  });
  it('a gate event opens nothing while dormant', () => {
    installProUi({});
    document.dispatchEvent(new CustomEvent('dx:pro-gate', { detail: { feature: 'offline_pack' } }));
    expect(document.getElementById('proPaywall')).toBeNull();
  });
});

describe('Pro screens once switched on', () => {
  beforeEach(() => {
    setSellableForTest(true);
    setProConfigForTest({ enabled: true, gates: { offline_pack: 'locked' } });
    setProUiDeps({ toast: () => {} });
  });

  it('the paywall shows the benefits, the store prices and a way out', async () => {
    const iap = createIap({ platform: 'android', loadPlugin: () => Promise.resolve(fakePlugin()) });
    iap.add(['dxdash_pro_yearly', 'dxdash_pro_monthly', 'dxdash_pro_pass3m'].map((id) => ({ id, kind: 'subscription' })));
    setIapForTest(iap);
    const o = openPaywall({ trigger: 'settings' });
    expect(o).toBeTruthy();
    await tick();
    const buttons = [...o.querySelectorAll('button[data-plan]')];
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toMatch(/Yearly/);
    expect(buttons[0].textContent).toMatch(/\$\d+\.99/);
    expect(o.textContent).toMatch(/All 3,010 cards |Free gives you/);
    expect(o.querySelector('input[aria-label="Promo code"]')).toBeTruthy();
    expect(o.textContent).toMatch(/Restore purchases/);
    o.querySelector('#proPaywallClose').click();
    expect(document.getElementById('proPaywall')).toBeNull();
  });

  it('a gate being hit opens the paywall for that feature', async () => {
    const iap = createIap({ platform: 'android', loadPlugin: () => Promise.resolve(fakePlugin()) });
    iap.add([{ id: 'dxdash_pro_yearly', kind: 'subscription' }]);
    setIapForTest(iap);
    installProUi({});
    document.dispatchEvent(new CustomEvent('dx:pro-gate', { detail: { feature: 'offline_pack', trigger: 'offline_pack' } }));
    expect(document.getElementById('proPaywall')).toBeTruthy();
  });

  it('buying a plan from the paywall turns Pro on and says so', async () => {
    const iap = createIap({ platform: 'android', loadPlugin: () => Promise.resolve(fakePlugin()) });
    iap.add([{ id: 'dxdash_pro_monthly', kind: 'subscription' }]);
    setIapForTest(iap);
    const o = openPaywall({ trigger: 'settings' });
    await tick();
    o.querySelector('button[data-plan]').click();
    await tick(); await tick();
    expect(o.textContent).toMatch(/Welcome to Pro/);
  });

  it('with Pro, the paywall becomes a thank-you with a way to manage it, and Settings shows Active', async () => {
    const iap = createIap({ platform: 'android', loadPlugin: () => Promise.resolve(fakePlugin()) });
    iap.add([{ id: 'dxdash_pro_monthly', kind: 'subscription' }]);
    setIapForTest(iap);
    localStorage.setItem('dx_pro_debug', '1');
    const o = openPaywall({ trigger: 'settings' });
    expect(o.textContent).toMatch(/You have Pro/);
    expect(o.textContent).toMatch(/Manage subscription/);
    const box = document.createElement('div');
    renderProSettings(box);
    expect(box.textContent).toMatch(/Active/);
  });

  it('Settings shows the row to a free player', () => {
    const box = document.createElement('div');
    renderProSettings(box);
    expect(box.querySelector('[data-setting="pro"]')).toBeTruthy();
    expect(box.textContent).toMatch(/See Pro/);
  });
});
