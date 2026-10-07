import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setProConfigForTest } from '../../js/remoteconfig.js';
import { cancelSubscription, checkCancelFollowThrough, subscriptionState, canCancel, resetProForTest, setSellableForTest, webCheckoutEnabled, webPlans, webBuy, webManage, waitForWebPayment, probeSellable, proLive, libraryUnlocked, isPro, refreshPro } from '../../js/pro.js';
import { setIapForTest, createIap } from '../../js/iap.js';
import { openPaywall, setProUiDeps } from '../../js/proui.js';

const PRICES = [
  { id: 'dxdash_pro_monthly', price: '$3.49', micros: 3490000, currency: 'USD', period: 'P1M', trialDays: 0 },
  { id: 'dxdash_pro_yearly', price: '$19.99', micros: 19990000, currency: 'USD', period: 'P1Y', trialDays: 0 }
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

  it('lists the plans best value first, and offers no Full Library', async () => {
    const r = await webPlans(fakeLb({ proFunction: async () => ({ plans: [...PRICES, { id: 'dxdash_library', price: '$7.49', micros: 7490000, currency: 'USD', period: '', trialDays: 0 }] }) }));
    expect(r.plans.map((p) => p.id)).toEqual(['dxdash_pro_yearly', 'dxdash_pro_monthly']);
    expect(r.plans[0]).toMatchObject({ label: 'Yearly', blurb: 'BEST VALUE', price: '$19.99' });
    expect(r.library).toBeNull();
    expect((await webPlans(null)).plans).toEqual([]);
  });

  it('sends a signed-in player to Stripe, and says why when it cannot', async () => {
    const lb = fakeLb();
    const go = vi.fn();
    expect(await webBuy('dxdash_pro_yearly', lb, go)).toEqual({ ok: true, redirected: true });
    expect(go).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay_1');
    expect(lb.calls.pop()).toEqual(['checkout', { plan: 'dxdash_pro_yearly' }]);
    expect((await webBuy('x', fakeLb({ isAuthenticated: () => false }), go)).error).toMatch(/Signing in/);
    expect(await webBuy('x', fakeLb({ isGuest: () => true }), go)).toMatchObject({ ok: false, needsAccount: true }); // a guest cannot buy
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

  it('gives every signed-in account the free trial once, and nothing to a guest or someone who had it', async () => {
    await probeSellable();
    let started = 0;
    let used = false;
    const lb = fakeLb({
      getMyPro: async () => (started ? { active: true, until: new Date(Date.now() + 7 * 86400000).toISOString(), plan: 'trial', source: 'trial', trial: true, trial_available: false } : { active: false, library: false, trial_available: !used }),
      startProTrial: async () => { started++; return { ok: true, days: 7 }; }
    });
    const events = [];
    document.addEventListener('dx:pro-trial-started', () => events.push(1), { once: true });
    const st = await refreshPro({ lb });
    expect(started).toBe(1);
    expect(st).toMatchObject({ active: true, trial: true });
    expect(events.length).toBe(1);
    // already used: it is not started again
    resetProForTest();
    started = 0; used = true;
    const lb2 = fakeLb({ getMyPro: async () => ({ active: false, library: false, trial_available: false }), startProTrial: async () => { started++; return { ok: true }; } });
    expect((await refreshPro({ lb: lb2 })).active).toBe(false);
    expect(started).toBe(0);
  });

  it('does not start the trial before Pro is live (nothing to buy yet), so it is not used up unseen', async () => {
    vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '');
    await probeSellable();
    let started = 0;
    await refreshPro({ lb: fakeLb({ getMyPro: async () => ({ active: false, trial_available: true }), startProTrial: async () => { started++; return { ok: true }; } }) });
    expect(started).toBe(0);
  });

  it('a library-only buyer opens every card but gets no Pro', async () => {
    await probeSellable();
    expect(libraryUnlocked()).toBe(false);
    await refreshPro({ lb: fakeLb({ getMyPro: async () => ({ active: false, library: true }) }) });
    expect(libraryUnlocked()).toBe(true);
    expect(isPro()).toBe(false);
  });
});

describe('trying to break it: a member who has paid keeps Pro through hiccups', () => {
  const putPaid = (extra) => localStorage.setItem('dx_pro', JSON.stringify(Object.assign({ active: true, source: 'server', plan: 'yearly', trial: false, until: Date.now() + 200 * 86400000, provenAt: Date.now() - 3600000, since: Date.now() - 86400000 }, extra)));

  it('a server error is not read as "no Pro"', async () => {
    putPaid();
    await probeSellable();
    expect(isPro()).toBe(true);
    await refreshPro({ lb: fakeLb({ getMyPro: async () => ({ error: true }) }) });
    expect(isPro()).toBe(true);
  });

  it('a call that fails outright, or the network being down, keeps Pro too', async () => {
    putPaid();
    await refreshPro({ lb: fakeLb({ getMyPro: async () => { throw new Error('offline'); } }) });
    expect(isPro()).toBe(true);
  });

  it('only a real answer of "no" (a refund, or the end of the period) takes Pro away', async () => {
    putPaid();
    await refreshPro({ lb: fakeLb({ getMyPro: async () => ({ active: false, library: false }) }) });
    expect(isPro()).toBe(false);
  });

  it('a store purchase survives one wrong "not owned" answer from the store', async () => {
    putPaid({ source: 'store', plan: 'monthly', provenAt: Date.now() - 600000 });
    const iap = { start: async () => true, owned: () => false, product: () => null, add() {} };
    await refreshPro({ iap });
    expect(isPro()).toBe(true);
    putPaid({ source: 'store', plan: 'monthly', provenAt: Date.now() - 7 * 3600000 });
    await refreshPro({ iap });
    expect(isPro()).toBe(false); // it keeps saying so for hours, and the paid period is over: now it goes
  });

  it('a member whose payment event never arrived is put right by asking Stripe', async () => {
    await probeSellable();
    let synced = 0;
    let granted = false;
    const lb = fakeLb({
      getMyPro: async () => (granted ? { active: true, until: new Date(Date.now() + 86400000 * 300).toISOString(), plan: 'yearly', source: 'stripe', since: new Date().toISOString() } : { active: false, library: false }),
      proFunction: async (action) => { if (action === 'sync') { synced++; granted = true; return { ok: true, granted: ['yearly'] }; } return { error: 'no' }; }
    });
    await refreshPro({ lb });
    expect(synced).toBe(1);
    expect(isPro()).toBe(true);
  });

  it('that check runs at most twice a day, and never for a guest', async () => {
    await probeSellable();
    let synced = 0;
    const mk = (over) => fakeLb(Object.assign({ proFunction: async (a) => { if (a === 'sync') { synced++; return { ok: true, granted: [] }; } return { error: 'no' }; } }, over || {}));
    await refreshPro({ lb: mk() });
    await refreshPro({ lb: mk() });
    expect(synced).toBe(1);
    localStorage.removeItem('dx_pro_synced');
    await refreshPro({ lb: mk({ isGuest: () => true }) });
    expect(synced).toBe(1);
  });

  it('a failed check is tried again next time', async () => {
    await probeSellable();
    let synced = 0;
    const lb = fakeLb({ proFunction: async (a) => { if (a === 'sync') { synced++; return { ok: false, error: 'down' }; } return { error: 'no' }; } });
    await refreshPro({ lb });
    await refreshPro({ lb });
    expect(synced).toBe(2);
  });
});

describe('cancelling: we check that they really did it, and never assume', () => {
  const subLb = (state) => fakeLb({ proFunction: async (a, extra) => { if (a === 'subscription') return state; if (a === 'portal') return { url: 'https://billing.stripe.com/p/x', cancelFlow: !!(extra && extra.cancel) }; return { error: 'no' }; } });

  it('tapping Cancel opens the cancel page and remembers that they went', async () => {
    const go = vi.fn();
    const r = await cancelSubscription(subLb({ ok: true, status: 'none' }), go);
    expect(r.ok).toBe(true);
    expect(go).toHaveBeenCalled();
    expect(localStorage.getItem('dx_pro_cancel_started')).toBeTruthy();
  });

  it('afterwards, a subscription set to end counts as cancelled, with the date Pro ends', async () => {
    localStorage.setItem('dx_pro_cancel_started', String(Date.now() - 60000));
    const ends = new Date(Date.now() + 20 * 86400000).toISOString();
    const r = await checkCancelFollowThrough(subLb({ ok: true, status: 'active', cancel_at_period_end: true, ends, plan: 'yearly' }));
    expect(r).toMatchObject({ cancelled: true });
    expect(r.endsAt).toBe(new Date(ends).getTime());
    expect(localStorage.getItem('dx_pro_cancel_started')).toBeNull();
  });

  it('but a subscription that is still renewing means they did NOT cancel, and they are told so', async () => {
    localStorage.setItem('dx_pro_cancel_started', String(Date.now() - 60000));
    const r = await checkCancelFollowThrough(subLb({ ok: true, status: 'active', cancel_at_period_end: false, ends: new Date(Date.now() + 5 * 86400000).toISOString() }));
    expect(r).toMatchObject({ cancelled: false });
  });

  it('when the billing system cannot be reached, nothing is assumed and it asks again next time', async () => {
    localStorage.setItem('dx_pro_cancel_started', String(Date.now() - 60000));
    expect(await checkCancelFollowThrough(subLb({ ok: false, error: 'down' }))).toBeNull();
    expect(localStorage.getItem('dx_pro_cancel_started')).toBeTruthy();
  });

  it('with nothing to check, or a stale note, it does nothing', async () => {
    expect(await checkCancelFollowThrough(subLb({ ok: true, status: 'none' }))).toBeNull();
    localStorage.setItem('dx_pro_cancel_started', String(Date.now() - 5 * 86400000));
    expect(await checkCancelFollowThrough(subLb({ ok: true, status: 'none' }))).toBeNull();
    expect(localStorage.getItem('dx_pro_cancel_started')).toBeNull();
  });

  it('what the billing system says about a live subscription: renewing or ending', async () => {
    const renewing = await subscriptionState(subLb({ ok: true, status: 'active', cancel_at_period_end: false, ends: new Date(Date.now() + 86400000).toISOString() }), { force: true });
    expect(renewing).toMatchObject({ known: true, renewing: true, cancelling: false });
    const ending = await subscriptionState(subLb({ ok: true, status: 'active', cancel_at_period_end: true, ends: new Date(Date.now() + 86400000).toISOString() }), { force: true });
    expect(ending).toMatchObject({ known: true, renewing: false, cancelling: true });
    expect((await subscriptionState(fakeLb({ isGuest: () => true }), { force: true })).known).toBe(false);
  });
});

describe('the website paywall', () => {
  it('a guest is asked to create an account first (with the free trial) and sees no plans', async () => {
    await probeSellable();
    const lb = fakeLb({ isGuest: () => true });
    setProUiDeps({ lb });
    openPaywall({ trigger: 'test', pricing: true });
    await tick(); await tick();
    expect(document.querySelectorAll('#proPaywall .pro-plan').length).toBe(0);
    const text = document.getElementById('proPaywall').textContent;
    expect(text).toMatch(/Create a free account to start/);
    expect(text).toMatch(/7-day trial/);
    expect(document.getElementById('proCreateAccount')).toBeTruthy();
    expect(lb.calls.filter((c) => c[0] === 'checkout')).toEqual([]);
  });

  it('shows real prices to someone with an account, no library offer, and starts checkout on tap', async () => {
    await probeSellable();
    const lb = fakeLb();
    setProUiDeps({ lb });
    openPaywall({ trigger: 'test', pricing: true });
    await tick(); await tick();
    const plans = [...document.querySelectorAll('#proPaywall .pro-plan')].map((b) => b.getAttribute('data-plan'));
    expect(plans).toEqual(['dxdash_pro_yearly', 'dxdash_pro_monthly']);
    const text = document.getElementById('proPaywall').textContent;
    expect(text).toMatch(/\$19\.99 \/ year/);
    expect(text).toMatch(/Stripe/);
    expect(text).toMatch(/Cancel any time/i);
    expect(text).not.toMatch(/Just the cards/);
    document.querySelector('#proPaywall [data-plan="dxdash_pro_yearly"]').click();
    await tick();
    expect(lb.calls.pop()).toEqual(['checkout', { plan: 'dxdash_pro_yearly' }]);
  });

  it('does not push the trial on someone who has an account', async () => {
    await probeSellable();
    setProUiDeps({ lb: fakeLb() });
    openPaywall({ trigger: 'test', pricing: true });
    await tick(); await tick();
    expect(document.getElementById('proPaywall').textContent).not.toMatch(/7-day Pro trial/);
  });

  it('says so plainly when the payment service is not answering', async () => {
    await probeSellable();
    setProUiDeps({ lb: fakeLb({ proFunction: async () => ({ error: 'Web payments are not set up yet.' }) }) });
    openPaywall({ trigger: 'test', pricing: true });
    await tick(); await tick();
    expect(document.getElementById('proPaywall').textContent).toMatch(/not available right now/);
    expect(document.querySelectorAll('#proPaywall .pro-plan').length).toBe(0);
  });
});
