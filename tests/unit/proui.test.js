import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../js/native.js', () => ({ isNative: () => true, getNativePlatform: () => 'android' }));

import { setProConfigForTest } from '../../js/remoteconfig.js';
import { resetProForTest, setSellableForTest } from '../../js/pro.js';
import { setIapForTest, createIap } from '../../js/iap.js';
import { openPaywall, renderProSettings, installProUi, setProUiDeps, mountProButton, applyProLock } from '../../js/proui.js';

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

  it('the paywall lists every Pro feature and puts the one just tapped first', () => {
    const o = openPaywall({ trigger: 'gate_offline_pack', feature: 'offline_pack' });
    const items = [...o.querySelectorAll('.pro-feature')];
    expect(items.length).toBe(11);
    expect(items[0].textContent).toMatch(/Play with no connection/);
    expect(items[0].classList.contains('pro-feature-hit')).toBe(true);
    expect(o.textContent).toMatch(/Free: 300 cards/);
  });

  it('a button for a locked feature carries a PRO tag, and loses it once Pro is on', () => {
    document.body.innerHTML = '<button id="b">Exam</button>';
    const b = document.getElementById('b');
    applyProLock(b, 'offline_pack');
    expect(b.querySelector('.pro-lock').textContent).toMatch(/PRO/);
    expect(b.classList.contains('pro-locked')).toBe(true);
    setProConfigForTest({ enabled: false });
    applyProLock(b, 'offline_pack');
    expect(b.querySelector('.pro-lock')).toBeNull();
  });

  it('a Pro member can take one free item a month, then has to wait for the next', async () => {
    const { storage } = await import('../../js/storage.js');
    const { proGiftState, giftMonthKey } = await import('../../js/pro.js');
    storage.load();
    expect(proGiftState().eligible).toBe(false);
    document.body.innerHTML = '';
    const { setProStatusForTest } = await import('../../js/pro.js').then((m) => ({ setProStatusForTest: m.setProDebug }));
    setProStatusForTest(true);
    const now = new Date(2026, 5, 15).getTime();
    expect(proGiftState(now).available).toBe(true);
    expect(storage.claimProGift('trail_ekg', giftMonthKey(now))).toBe(true);
    expect(storage.ownsItem('trail_ekg')).toBe(true);
    expect(proGiftState(now).available).toBe(false);
    expect(storage.claimProGift('trail_fire', giftMonthKey(now))).toBe(false);
    const july = new Date(2026, 6, 2).getTime();
    expect(proGiftState(july).available).toBe(true);
    expect(proGiftState(now).nextAt).toBe(new Date(2026, 6, 1).getTime());
    setProStatusForTest(null);
  });

  it('the Home button shows while Pro is on sale and opens the paywall', () => {
    document.body.innerHTML = '<button id="homeProBanner" hidden><strong id="homeProTitle"></strong><span id="homeProSub"></span></button>';
    const btn = mountProButton();
    expect(btn.hidden).toBe(false);
    expect(btn.textContent).toMatch(/GO PRO/);
    expect(btn.textContent).toMatch(/10× more cards/);
    btn.click();
    expect(document.getElementById('proPaywall')).toBeTruthy();
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
