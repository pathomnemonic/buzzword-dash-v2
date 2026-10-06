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
    expect(items.length).toBe(14);
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

  it('a Pro member can take one free item per month counted from when Pro began, then waits for the next', async () => {
    const { storage } = await import('../../js/storage.js');
    const { proGiftState, giftPeriod, addMonths } = await import('../../js/pro.js');
    storage.load();
    expect(proGiftState().eligible).toBe(false);
    const since = new Date(2026, 0, 12, 9, 30).getTime(); // joined on the 12th
    localStorage.setItem('dx_pro', JSON.stringify({ active: true, source: 'server', plan: 'yearly', trial: false, until: new Date(2027, 0, 12).getTime(), provenAt: new Date(2026, 2, 20).getTime(), since }));
    const mar20 = new Date(2026, 2, 20).getTime();
    const g = proGiftState(mar20);
    expect(g.available).toBe(true);
    expect(g.nextAt).toBe(new Date(2026, 3, 12, 9, 30).getTime()); // next one opens April 12th, not April 1st
    expect(storage.claimProGift('trail_ekg', g.key)).toBe(true);
    expect(storage.ownsItem('trail_ekg')).toBe(true);
    expect(proGiftState(mar20).available).toBe(false);
    expect(storage.claimProGift('trail_fire', proGiftState(mar20).key)).toBe(false);
    expect(proGiftState(new Date(2026, 3, 11).getTime()).available).toBe(false); // the day before
    expect(proGiftState(new Date(2026, 3, 13).getTime()).available).toBe(true);  // after the 12th
    // a 31st start lands on the last day of a shorter month
    expect(new Date(addMonths(new Date(2026, 0, 31).getTime(), 1)).getDate()).toBe(28);
    expect(giftPeriod(since, since).key).toBe(giftPeriod(since, since + 86400000).key);
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

  it('someone on the free trial still sees the plans, with how long the trial has left', async () => {
    localStorage.setItem('dx_pro', JSON.stringify({ active: true, source: 'server', plan: 'trial', trial: true, until: Date.now() + 3 * 86400000, provenAt: Date.now() }));
    const iap = createIap({ platform: 'android', loadPlugin: () => Promise.resolve(fakePlugin()) });
    iap.add(['dxdash_pro_yearly', 'dxdash_pro_monthly'].map((id) => ({ id, kind: 'subscription' })));
    setIapForTest(iap);
    const o = openPaywall({ trigger: 'home_button' });
    await tick();
    expect(o.textContent).toMatch(/free trial is on: 3 days left/);
    expect(o.querySelectorAll('button[data-plan]').length).toBe(2);
    // the plans sit above the list of what Pro gets you
    const firstPlan = o.querySelector('button[data-plan]');
    const features = o.querySelector('.pro-features');
    expect(firstPlan.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('every mode but Versus High Score is a Pro gate, closed by default', async () => {
    const { defaultProConfig } = await import('../../js/proconfig.js');
    const g = defaultProConfig().gates;
    ['mode_study', 'mode_weakness', 'exam_sim', 'mp_suddendeath', 'mp_race'].forEach((f) => expect(g[f], f).toBe('locked'));
    expect(g.mp_highscore).toBeUndefined();
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
