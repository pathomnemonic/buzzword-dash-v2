import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setProConfigForTest } from '../../js/remoteconfig.js';
import { resetProForTest, setSellableForTest, webCheckoutEnabled, webPlans, webBuy, webManage, waitForWebPayment, probeSellable, proLive, libraryUnlocked, isPro, refreshPro } from '../../js/pro.js';
import { setIapForTest, createIap } from '../../js/iap.js';
import { openPaywall, setProUiDeps } from '../../js/proui.js';

const PRICES = [
  { id: 'dxdash_pro_monthly', price: '$6.99', micros: 6990000, currency: 'USD', period: 'P1M', trialDays: 0 },
  { id: 'dxdash_pro_yearly', price: '$39.99', micros: 39990000, currency: 'USD', period: 'P1Y', trialDays: 7 },
  { id: 'dxdash_library', price: '$14.99', micros: 14990000, currency: 'USD', period: '', trialDays: 0 }
];
const tick = () => new Promise((r) => setTimeout(r, 10));

function fakeLb(over) {
  const calls = [];
  const lb = Object.assign({
    calls,
    isAuthenticated: () => true,
    isGuest: () => false,
    getUserId: () => 'u1',
    getMyPro: async () => ({ active: false, library: false }),
    proFunction: async (action, extra) => {
      calls.push([action, extra]);
      if (action === 'prices') return { plans: PRICES };
      if (action === 'checkout') return { url: 'https://checkout.stripe.com/c/pay_1' };
      if (action === 'portal') return { url: 'https://billing.stripe.com/p/session_1' };
      return { error: 'no' };
    }
  }, over || {});
  return lb;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  resetProForTest();
  setProConfigForTest(null);
  setIapForTest(createIap({ plugin: null, platform: 'web' }));
  setSellableForTest(false);
  vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '1');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
});
afterEach(() => { vi.unstubAllEnvs(); setIapForTest(null); setProUiDeps({ lb: null }); });

describe('Pro on the website', () => {
  it('is switched on only with the checkout switch and a server', async () => {
    expect(webCheckoutEnabled()).toBe(true);
    vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '');
    expect(webCheckoutEnabled()).toBe(false);
    vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '1');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(webCheckoutEnabled()).toBe(false);
  });

  it('makes Pro live (limits and screens) once the site can sell, and not before', async () => {
    vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '');
    await probeSellable();
    expect(proLive()).toBe(false);
    expect(libraryUnlocked()).toBe(true);
    vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '1');
    await probeSellable();
    expect(proLive()).toBe(true);
    expect(libraryUnlocked()).toBe(false);
  });

  it('lists the plans best value first, with the library offer apart', async () => {
    const r = await webPlans(fakeLb());
    expect(r.plans.map((p) => p.id)).toEqual(['dxdash_pro_yearly', 'dxdash_pro_monthly']);
    expect(r.plans[0]).toMatchObject({ label: 'Yearly', blurb: 'BEST VALUE', price: '$39.99' });
    expect(r.library.id).toBe('dxdash_library');
    expect((await webPlans(null)).plans).toEqual([]);
  });

  it('sends a signed-in player to Stripe, and says why when it cannot', async () => {
    const lb = fakeLb();
    const go = vi.fn();
    expect(await webBuy('dxdash_pro_yearly', lb, go)).toEqual({ ok: true, redirected: true });
    expect(go).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay_1');
    expect(lb.calls.pop()).toEqual(['checkout', { plan: 'dxdash_pro_yearly' }]);
    expect((await webBuy('x', fakeLb({ isAuthenticated: () => false }), go)).error).toMatch(/Signing in/);
    expect((await webBuy('x', fakeLb({ proFunction: async () => ({ error: 'Nope' }) }), go))).toEqual({ ok: false, error: 'Nope' });
    expect((await webBuy('x', fakeLb({ proFunction: async () => ({ url: 'http://evil' }) }), go)).ok).toBe(false); // only https pages
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('opens the billing page to manage a subscription', async () => {
    const go = vi.fn();
    expect((await webManage(fakeLb(), go)).ok).toBe(true);
    expect(go).toHaveBeenCalledWith('https://billing.stripe.com/p/session_1');
    expect((await webManage(fakeLb({ proFunction: async () => ({ error: 'No web subscription found for this account.' }) }), go)).error).toMatch(/No web subscription/);
  });

  it('picks up the payment when the server learns of it a little later, and the library unlock too', async () => {
    let n = 0;
    const lb = fakeLb({ getMyPro: async () => (++n < 3 ? { active: false, library: false } : { active: true, until: new Date(Date.now() + 86400000).toISOString(), plan: 'yearly', source: 'stripe', library: false }) });
    const r = await waitForWebPayment(lb, { wait: async () => {}, tries: 6 });
    expect(r.active).toBe(true);
    expect(isPro()).toBe(true);
    expect(n).toBe(3);

    resetProForTest();
    let m = 0;
    const libOnly = fakeLb({ getMyPro: async () => (++m < 2 ? { active: false, library: false } : { active: false, library: true }) });
    const r2 = await waitForWebPayment(libOnly, { wait: async () => {}, tries: 5 });
    expect(r2.library).toBe(true);
    expect(libraryUnlocked()).toBe(true);

    resetProForTest();
    const none = await waitForWebPayment(fakeLb(), { wait: async () => {}, tries: 3 });
    expect(none.active).toBe(false);
    expect(none.tries).toBe(3);
  });

  it('a library-only buyer opens every card but gets no Pro', async () => {
    await probeSellable();
    expect(libraryUnlocked()).toBe(false);
    await refreshPro({ lb: fakeLb({ getMyPro: async () => ({ active: false, library: true }) }) });
    expect(libraryUnlocked()).toBe(true);
    expect(isPro()).toBe(false);
  });
});

describe('the website paywall', () => {
  it('shows real prices, a trial note, the library offer and a sign-up tip for a guest, and starts checkout on tap', async () => {
    await probeSellable();
    const lb = fakeLb({ isGuest: () => true });
    setProUiDeps({ lb });
    const go = vi.fn();
    const orig = window.location;
    openPaywall({ trigger: 'test' });
    await tick(); await tick();
    const plans = [...document.querySelectorAll('#proPaywall .pro-plan')].map((b) => b.getAttribute('data-plan'));
    expect(plans).toEqual(['dxdash_pro_yearly', 'dxdash_pro_monthly', 'library']);
    const text = document.getElementById('proPaywall').textContent;
    expect(text).toMatch(/\$39\.99 \/ year/);
    expect(text).toMatch(/7-DAY FREE TRIAL/);
    expect(text).toMatch(/Stripe/);
    expect(text).toMatch(/create an account/i);
    expect(text).toMatch(/Cancel any time/i);
    expect(window.location).toBe(orig);
    document.querySelector('#proPaywall [data-plan="library"]').click();
    await tick();
    expect(lb.calls.pop()).toEqual(['checkout', { plan: 'dxdash_library' }]);
    void go;
  });

  it('says so plainly when the payment service is not answering', async () => {
    await probeSellable();
    setProUiDeps({ lb: fakeLb({ proFunction: async () => ({ error: 'Web payments are not set up yet.' }) }) });
    openPaywall({ trigger: 'test' });
    await tick(); await tick();
    expect(document.getElementById('proPaywall').textContent).toMatch(/not available right now/);
    expect(document.querySelectorAll('#proPaywall .pro-plan').length).toBe(0);
  });
});
