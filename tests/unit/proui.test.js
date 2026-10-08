import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../js/native.js', () => ({ isNative: () => true, getNativePlatform: () => 'android' }));

import { setProConfigForTest } from '../../js/remoteconfig.js';
import { resetProForTest, setSellableForTest } from '../../js/pro.js';
import { setIapForTest, createIap } from '../../js/iap.js';
import { openPaywall, renderProSettings, installProUi, setProUiDeps, mountProButton, applyProLock, renderRedeemRow } from '../../js/proui.js';

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
    setProUiDeps({ toast: () => {}, lb: { isAuthenticated: () => true, isGuest: () => false } });
  });

  it('someone without an account is asked to create one, and sees no plans to buy', async () => {
    setProUiDeps({ lb: { isAuthenticated: () => true, isGuest: () => true } });
    const iap = createIap({ platform: 'android', loadPlugin: () => Promise.resolve(fakePlugin()) });
    iap.add(['dxdash_pro_yearly'].map((id) => ({ id, kind: 'subscription' })));
    setIapForTest(iap);
    const o = openPaywall({ trigger: 'home_button', pricing: true });
    await tick();
    expect(o.querySelectorAll('button[data-plan]').length).toBe(0);
    expect(o.querySelector('#proCreateAccount')).toBeTruthy();
    expect(o.textContent).toMatch(/Create a free account to start/);
  });

  it('a paying subscriber gets a Cancel subscription button; a trial or a lifetime owner does not', () => {
    const put = (o) => localStorage.setItem('dx_pro', JSON.stringify(Object.assign({ active: true, source: 'server', until: Date.now() + 86400000 * 200, provenAt: Date.now(), since: Date.now() - 1000 }, o)));
    put({ plan: 'yearly', trial: false });
    expect(openPaywall({ trigger: 'settings' }).querySelector('#proCancel')).toBeTruthy();
    put({ plan: 'trial', trial: true });
    expect(openPaywall({ trigger: 'settings' }).querySelector('#proCancel')).toBeNull();
    put({ plan: 'lifetime', trial: false });
    expect(openPaywall({ trigger: 'settings' }).querySelector('#proCancel')).toBeNull();
  });

  it('clicking Go Pro shows what Pro gets you first, with the free trial as a button, then the pricing', async () => {
    setProUiDeps({ toast: () => {}, lb: { isAuthenticated: () => true, isGuest: () => true }, openAccount: vi.fn() });
    const o = openPaywall({ trigger: 'home_button' });
    expect(o.querySelectorAll('.pro-feature').length).toBeGreaterThan(8);
    expect(o.querySelector('#proTrialBtn').textContent).toMatch(/7-DAY FREE TRIAL/);
    expect(o.querySelector('#proSeePricing')).toBeTruthy();
    expect(o.querySelectorAll('button[data-plan]').length).toBe(0); // no prices yet
    o.querySelector('#proSeePricing').click();
    const p2 = document.getElementById('proPaywall');
    expect(p2.querySelectorAll('.pro-feature').length).toBe(0);
    expect(p2.querySelector('#proBack')).toBeTruthy();
    p2.querySelector('#proBack').click();
    expect(document.getElementById('proPaywall').querySelector('#proTrialBtn')).toBeTruthy();
  });

  it('every Pro screen has a Back button at the top: it returns from the plans, and closes from the first screen', async () => {
    setProUiDeps({ toast: () => {}, lb: { isAuthenticated: () => true, isGuest: () => true }, openAccount: vi.fn() });
    const first = openPaywall({ trigger: 'home_button' });
    expect(first.querySelector('.report-box').firstElementChild.id).toBe('proTopBack'); // the very first thing in the box
    expect(first.querySelector('#proTopBack').textContent).toMatch(/Back/);
    first.querySelector('#proSeePricing').click();
    const plans = document.getElementById('proPaywall');
    expect(plans.querySelector('.report-box').firstElementChild.id).toBe('proBack');
    plans.querySelector('#proBack').click();
    document.getElementById('proPaywall').querySelector('#proTopBack').click();
    expect(document.getElementById('proPaywall')).toBeNull(); // closed
  });

  it('the trial button sends someone without an account to create one', async () => {
    const openAccount = vi.fn();
    setProUiDeps({ toast: () => {}, lb: { isAuthenticated: () => true, isGuest: () => true }, openAccount });
    openPaywall({ trigger: 'home_button' }).querySelector('#proTrialBtn').click();
    expect(openAccount).toHaveBeenCalled();
    expect(document.getElementById('proPaywall')).toBeNull();
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

  it('a paying Pro member can take one free item, once, and never during the free trial', async () => {
    const { storage } = await import('../../js/storage.js');
    const { proGiftState } = await import('../../js/pro.js');
    storage.load();
    expect(proGiftState().eligible).toBe(false);
    const put = (o) => localStorage.setItem('dx_pro', JSON.stringify(Object.assign({ active: true, source: 'server', plan: 'yearly', trial: false, until: Date.now() + 86400000 * 200, provenAt: Date.now(), since: Date.now() - 1000 }, o)));
    put({ plan: 'trial', trial: true });
    expect(proGiftState().eligible).toBe(false); // not during the trial
    put({});
    expect(proGiftState().available).toBe(true);
    expect(storage.claimProGift('trail_pills')).toBe(true);
    expect(storage.ownsItem('trail_pills')).toBe(true);
    expect(proGiftState()).toMatchObject({ eligible: true, available: false, used: true, item: 'trail_pills' });
    expect(storage.claimProGift('trail_fire')).toBe(false); // spent for good, not "next month"
    expect(storage.ownsItem('trail_fire')).toBe(false);
    const later = Date.now() + 400 * 86400000;
    expect(proGiftState(later).available).toBe(false);
  });

  it('the redeem-code box is folded away in Settings, asks for an account, and never shows on the pricing screens', async () => {
    const box = document.createElement('div');
    setProUiDeps({ lb: { isAuthenticated: () => true, isGuest: () => true, redeemProCode: vi.fn() }, openAccount: vi.fn() });
    renderRedeemRow(box);
    const fold = box.querySelector('details.redeem-fold');
    expect(fold).toBeTruthy();
    expect(fold.open).toBe(false);
    expect(fold.textContent).toMatch(/one account with a login/);
    document.body.appendChild(box);
    box.querySelector('#redeemInput').value = 'DX-TEST-CODE-0001';
    box.querySelector('#redeemBtn').click();
    await tick();
    expect(box.textContent).toMatch(/Create a free account first/);
    expect(openPaywall({ trigger: 'x', pricing: true }).textContent).not.toMatch(/redeem|promo/i);
    setProConfigForTest({ enabled: false });
    const none = document.createElement('div');
    renderRedeemRow(none);
    expect(none.children.length).toBe(0); // nothing while Pro is off
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
    const o = openPaywall({ trigger: 'settings', pricing: true });
    expect(o).toBeTruthy();
    await tick();
    const buttons = [...o.querySelectorAll('button[data-plan]')];
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toMatch(/Yearly/);
    expect(buttons[0].textContent).toMatch(/\$\d+\.99/);
    expect(o.querySelector('input[aria-label="Promo code"], input[aria-label="Redeem code"]')).toBeNull(); // codes are not on the pricing screen
    expect(o.textContent).toMatch(/Restore purchases/);
    o.querySelector('#proPaywallClose').click();
    expect(document.getElementById('proPaywall')).toBeNull();
  });

  it('someone on the free trial still sees the plans, with how long the trial has left', async () => {
    localStorage.setItem('dx_pro', JSON.stringify({ active: true, source: 'server', plan: 'trial', trial: true, until: Date.now() + 3 * 86400000, provenAt: Date.now() }));
    const iap = createIap({ platform: 'android', loadPlugin: () => Promise.resolve(fakePlugin()) });
    iap.add(['dxdash_pro_yearly', 'dxdash_pro_monthly'].map((id) => ({ id, kind: 'subscription' })));
    setIapForTest(iap);
    const first = openPaywall({ trigger: 'home_button' });
    expect(first.textContent).toMatch(/free trial is on: 3 days left/);
    expect(first.querySelector('#proSeePricing')).toBeTruthy();
    first.querySelector('#proSeePricing').click();
    await tick();
    const o = document.getElementById('proPaywall');
    expect(o.querySelectorAll('button[data-plan]').length).toBe(2);
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
    const o = openPaywall({ trigger: 'settings', pricing: true });
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
