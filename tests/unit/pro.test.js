import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizeProConfig, defaultProConfig, GATE_FEATURES, DEFAULT_GATES } from '../../js/proconfig.js';
import { setProConfigForTest, proConfig, sanitizeConfig } from '../../js/remoteconfig.js';
import {
  combineStatus, isPro, proStatus, checkGate, recordUse, requireGate, refreshPro, proPlans, buyPlan, restorePro, redeemCode,
  proEnabled, proLive, setSellableForTest, setProDebug, resetProForTest, proWebUrl, libraryUnlocked, buyLibrary, libraryOffer, ownsLibrary, registerProProducts
} from '../../js/pro.js';
import { createIap, isoDays } from '../../js/iap.js';
import { cleanEvent } from '../../js/analytics/catalog.js';

const DAY = 86400000;
const NOW = new Date('2026-11-10T12:00:00').getTime(); // a Tuesday

beforeEach(() => { resetProForTest(); setProConfigForTest(null); localStorage.clear(); setSellableForTest(true); });

/** A fake store plugin shaped like capacitor-plugin-cdv-purchase, with subscriptions. */
function fakePlugin(o) {
  o = o || {};
  const handlers = {};
  const owned = new Set(o.owned || []);
  const products = {};
  const plugin = {
    Platform: { GOOGLE_PLAY: 'android-playstore', APPLE_APPSTORE: 'ios-appstore' },
    ProductType: { CONSUMABLE: 'consumable', PAID_SUBSCRIPTION: 'paid subscription', NON_CONSUMABLE: 'non consumable' },
    ErrorCode: { PAYMENT_CANCELLED: 6777006 },
    registered: [],
    restored: 0,
    store: {
      register(list) { plugin.registered.push(...list); },
      when() { const w = { approved(cb) { handlers.approved = cb; return w; }, finished(cb) { handlers.finished = cb; return w; } }; return w; },
      initialize() {
        plugin.registered.forEach((d, i) => {
          if (o.missing && o.missing.includes(d.id)) return;
          const trial = o.trial && d.id.includes('yearly');
          products[d.id] = { id: d.id, offers: [{ id: 'o' + d.id, pricingPhases: (trial ? [{ price: '$0.00', priceMicros: 0, currency: 'USD', billingPeriod: 'P7D', paymentMode: 'FreeTrial' }] : []).concat([{ price: '$' + (i + 1) * 10 + '.00', priceMicros: (i + 1) * 10e6, currency: 'USD', billingPeriod: d.id.includes('yearly') ? 'P1Y' : 'P1M', paymentMode: 'PayAsYouGo' }]) }], getOffer() { return this.offers[0]; } };
        });
        return Promise.resolve([]);
      },
      get(id) { return products[id]; },
      owned(id) { return owned.has(id); },
      restorePurchases() { plugin.restored++; return Promise.resolve(undefined); },
      manageSubscriptions() { return Promise.resolve(undefined); },
      order(offer) {
        if (o.orderError) return Promise.resolve(o.orderError);
        const id = offer.id.slice(1);
        const t = { products: [{ id }], finish() { owned.add(id); setTimeout(() => handlers.finished(t), 0); } };
        setTimeout(() => handlers.approved(t), 0);
        return Promise.resolve(undefined);
      }
    }
  };
  return plugin;
}
const iapFor = (plugin, platform = 'android') => createIap({ platform, loadPlugin: () => Promise.resolve(plugin) });
function withPlans(iap) { iap.add(proConfig().plans.map((id) => ({ id, kind: 'subscription' }))); return iap; }

describe('pro config (remote file)', () => {
  it('ships on, with the default free-vs-Pro gates', () => {
    const d = defaultProConfig();
    expect(d.enabled).toBe(true);
    expect(d.gates).toEqual(DEFAULT_GATES);
    expect(d.gates.card_library).toBe('locked');
    expect(d.plans).toContain('dxdash_pro_lifetime');
    expect(d.library).toBe('dxdash_library');
  });
  it('survives any shape of file by keeping the defaults', () => {
    [null, undefined, 5, 'x', [], {}, { enabled: 'yes' }, { gates: 3 }].forEach((bad) => expect(sanitizeProConfig(bad)).toEqual(defaultProConfig()));
  });
  it('the file can switch Pro off, open a gate, change a limit and keep only valid ids', () => {
    const c = sanitizeProConfig({ enabled: false, plans: ['dxdash_pro_yearly', 'BAD ID', 7], library: 'my_library', gates: { custom_cards: { limit: 50, per: 'total' }, offline_pack: 'open', explanations: { limit: 5, per: 'day' }, bogus: 'locked', exam_sim: { limit: -1 } }, launchAt: 1790000000000, grandfather: ['custom_cards', 'nope'] });
    expect(c.enabled).toBe(false);
    expect(c.plans).toEqual(['dxdash_pro_yearly']);
    expect(c.library).toBe('my_library');
    expect(c.gates.custom_cards).toEqual({ limit: 50, per: 'total' });
    expect(c.gates.offline_pack).toBeUndefined();
    expect(c.gates.explanations).toEqual({ limit: 5, per: 'day' });
    expect(c.gates.exam_sim).toEqual(DEFAULT_GATES.exam_sim); // an invalid entry keeps the default
    expect(c.grandfather).toEqual(['custom_cards']);
    expect(Object.keys(c.gates).every((k) => GATE_FEATURES.includes(k))).toBe(true);
  });
  it('rides in the same file as the kill switches and analytics', () => {
    expect(sanitizeConfig({ killed: ['hazards'], pro: { enabled: false } }).pro.enabled).toBe(false);
    expect(sanitizeConfig({ killed: [] }).pro.enabled).toBe(true);
  });
});

describe('only limits things when there is a way to pay', () => {
  it('with nothing to buy (a local build, products not set up in the store) nothing is limited and nothing is shown', () => {
    setSellableForTest(false);
    expect(proEnabled()).toBe(true);
    expect(proLive()).toBe(false);
    GATE_FEATURES.forEach((f) => expect(checkGate(f, { used: 99999 })).toEqual({ allowed: true, mode: 'open' }));
    expect(libraryUnlocked()).toBe(true);
    const events = [];
    document.addEventListener('dx:pro-gate', (e) => events.push(e));
    expect(requireGate('offline_pack')).toBe(true);
    expect(events).toEqual([]);
  });
  it('once something can be bought the gates apply', () => {
    expect(proLive()).toBe(true);
    expect(checkGate('offline_pack').allowed).toBe(false);
    expect(libraryUnlocked()).toBe(false);
  });
  it('switched off in the config: nothing is limited even when something can be bought', () => {
    setProConfigForTest({ enabled: false });
    expect(proLive()).toBe(false);
    expect(checkGate('offline_pack')).toEqual({ allowed: true, mode: 'open' });
    expect(libraryUnlocked()).toBe(true);
  });
  it('does not ask the store while switched off', async () => {
    setProConfigForTest({ enabled: false });
    const plugin = fakePlugin({ owned: ['dxdash_pro_yearly'] });
    const st = await refreshPro({ iap: withPlans(iapFor(plugin)), now: NOW });
    expect(st.active).toBe(false);
    expect(plugin.registered.length).toBe(0);
  });
});

describe('who has Pro', () => {
  it('combines sources, preferring the one that lasts longest', () => {
    const r = combineStatus([{ source: 'store', active: true, plan: 'monthly' }, { source: 'server', active: true, until: NOW + 90 * DAY, plan: 'yearly' }], null, { now: NOW, fresh: true });
    expect(r).toMatchObject({ active: true, source: 'server', plan: 'yearly' });
  });
  it('says no when asked and nobody has it', () => {
    expect(combineStatus([], { source: 'store', until: NOW + DAY, provenAt: NOW - DAY, plan: 'x' }, { now: NOW, fresh: true }).active).toBe(false);
  });
  it('keeps the last good answer for three days when it could not ask (offline), then lets go', () => {
    const cached = { source: 'store', plan: 'monthly', until: NOW + 20 * DAY, provenAt: NOW - 2 * DAY };
    expect(combineStatus([], cached, { now: NOW, fresh: false }).active).toBe(true);
    expect(combineStatus([], { ...cached, provenAt: NOW - 4 * DAY }, { now: NOW, fresh: false }).active).toBe(false);
  });
  it('is on from the store (phone) once Pro is enabled, and is saved', async () => {
    setProConfigForTest({ enabled: true });
    const iap = withPlans(iapFor(fakePlugin({ owned: ['dxdash_pro_monthly'] })));
    const st = await refreshPro({ iap, now: NOW });
    expect(st).toMatchObject({ active: true, source: 'store', plan: 'monthly' });
    expect(isPro(NOW)).toBe(true);
    expect(proStatus().plan).toBe('monthly');
  });
  it('is on from the server (a web payment or a code) and the debug switch can force it', async () => {
    setProConfigForTest({ enabled: true });
    const lb = { isAuthenticated: () => true, getMyPro: () => Promise.resolve({ active: true, until: new Date(NOW + 30 * DAY).toISOString(), plan: 'yearly', source: 'stripe' }) };
    const st = await refreshPro({ lb, iap: withPlans(iapFor(fakePlugin())), now: NOW });
    expect(st).toMatchObject({ active: true, source: 'server' });
    resetProForTest();
    expect(isPro()).toBe(false);
    setProDebug(true);
    expect(isPro()).toBe(true);
    setProDebug(false);
    expect(isPro()).toBe(false);
  });
});

describe('gates', () => {
  beforeEach(() => setProConfigForTest({ enabled: true, gates: { custom_cards: { limit: 50, per: 'total' }, offline_pack: 'locked', explanations: { limit: 3, per: 'day' }, exam_sim: { limit: 2, per: 'week' } }, launchAt: NOW, grandfather: ['custom_cards'] }));

  it('locked means locked; a total limit uses the count the feature knows', () => {
    expect(checkGate('offline_pack')).toMatchObject({ allowed: false, mode: 'locked' });
    expect(checkGate('custom_cards', { used: 49 })).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkGate('custom_cards', { used: 50 })).toMatchObject({ allowed: false, mode: 'limit', limit: 50 });
  });
  it('a per-day limit counts uses and starts again tomorrow', () => {
    for (let i = 0; i < 3; i++) { expect(checkGate('explanations', { now: NOW }).allowed).toBe(true); recordUse('explanations', NOW); }
    expect(checkGate('explanations', { now: NOW }).allowed).toBe(false);
    expect(checkGate('explanations', { now: NOW + DAY }).allowed).toBe(true);
  });
  it('a per-week limit runs Monday to Sunday', () => {
    recordUse('exam_sim', NOW); recordUse('exam_sim', NOW);
    expect(checkGate('exam_sim', { now: NOW + 2 * DAY }).allowed).toBe(false);
    expect(checkGate('exam_sim', { now: NOW + 6 * DAY }).allowed).toBe(true); // next Monday
  });
  it('Pro lifts every gate', async () => {
    const iap = withPlans(iapFor(fakePlugin({ owned: ['dxdash_pro_yearly'] })));
    await refreshPro({ iap, now: Date.now() });
    GATE_FEATURES.forEach((f) => expect(checkGate(f, { used: 1e6 }).allowed).toBe(true));
  });
  it('players from before launch keep the grandfathered features free', () => {
    expect(checkGate('custom_cards', { used: 500, firstRunAt: NOW - 30 * DAY }).allowed).toBe(true);
    expect(checkGate('custom_cards', { used: 500, firstRunAt: NOW + DAY }).allowed).toBe(false);
    expect(checkGate('offline_pack', { firstRunAt: NOW - 30 * DAY }).allowed).toBe(false); // not on the list
  });
  it('requireGate lets it through (counting it) or opens the paywall and reports the hit', () => {
    const seen = [];
    const on = (e) => seen.push(e.detail);
    document.addEventListener('dx:pro-gate', on);
    expect(requireGate('explanations', { record: true })).toBe(true);
    expect(requireGate('offline_pack')).toBe(false);
    expect(seen).toEqual([expect.objectContaining({ feature: 'offline_pack' })]);
    // a passive gate (a teaser) asks at most once in a while
    expect(requireGate('explanations', { used: 99, passive: true })).toBe(false);
    expect(requireGate('explanations', { used: 99, passive: true })).toBe(false);
    expect(seen.filter((d) => d.feature === 'explanations').length).toBe(1);
    document.removeEventListener('dx:pro-gate', on);
  });
});

describe('buying', () => {

  it('lists the store plans best value first, with local prices and any free trial', async () => {
    const iap = withPlans(iapFor(fakePlugin({ trial: true })));
    const plans = await proPlans(iap);
    expect(plans.map((p) => p.id)).toEqual(['dxdash_pro_yearly', 'dxdash_pro_pass3m', 'dxdash_pro_monthly', 'dxdash_pro_lifetime']);
    expect(plans[0]).toMatchObject({ currency: 'USD', trialDays: 7, period: 'P1Y' });
    expect(plans[1].trialDays).toBe(0);
  });
  it('leaves out plans the store does not have, and has none without the store', async () => {
    const some = await proPlans(withPlans(iapFor(fakePlugin({ missing: ['dxdash_pro_monthly'] }))));
    expect(some.map((p) => p.id)).not.toContain('dxdash_pro_monthly');
    expect(await proPlans(withPlans(iapFor(null)))).toEqual([]);
  });
  it('a completed purchase turns Pro on', async () => {
    const iap = withPlans(iapFor(fakePlugin()));
    await iap.start();
    const res = await buyPlan('dxdash_pro_monthly', { iap });
    expect(res.ok).toBe(true);
    expect(isPro()).toBe(true);
  });
  it('a closed sheet or a store error does not', async () => {
    const cancel = withPlans(iapFor(fakePlugin({ orderError: { code: 6777006, message: 'x' } })));
    expect(await buyPlan('dxdash_pro_monthly', { iap: cancel })).toMatchObject({ ok: false, cancelled: true });
    const fail = withPlans(iapFor(fakePlugin({ orderError: { code: 1, message: 'store down' } })));
    expect((await buyPlan('dxdash_pro_monthly', { iap: fail })).ok).toBe(false);
    expect(isPro()).toBe(false);
  });
  it('restores an earlier purchase', async () => {
    const plugin = fakePlugin({ owned: ['dxdash_pro_pass3m'] });
    const r = await restorePro({ iap: withPlans(iapFor(plugin)) });
    expect(plugin.restored).toBe(1);
    expect(r.active).toBe(true);
  });
  it('redeems a code through the server and refreshes', async () => {
    const lb = { isAuthenticated: () => true, redeemProCode: () => Promise.resolve({ ok: true, until: new Date(NOW + 30 * DAY).toISOString() }), getMyPro: () => Promise.resolve({ active: true, until: new Date(Date.now() + 30 * DAY).toISOString(), plan: 'pro', source: 'code' }) };
    expect((await redeemCode('LAUNCH30', lb)).ok).toBe(true);
    expect(isPro()).toBe(true);
    expect((await redeemCode('X', null)).ok).toBe(false);
  });
  it('the web payment link carries the account id and only https is accepted', () => {
    expect(proWebUrl('abc')).toBe('');
  });
});

describe('store connection', () => {
  it('registers subscriptions and tips together, once', async () => {
    const plugin = fakePlugin();
    const iap = iapFor(plugin);
    iap.add([{ id: 'tip', kind: 'consumable' }, { id: 'sub', kind: 'subscription' }]);
    await iap.start();
    iap.add([{ id: 'late', kind: 'consumable' }]); // too late: ignored
    await iap.start();
    expect(plugin.registered.map((d) => [d.id, d.type])).toEqual([['tip', 'consumable'], ['sub', 'paid subscription']]);
  });
  it('reads ISO durations', () => {
    expect(isoDays('P7D')).toBe(7);
    expect(isoDays('P1W')).toBe(7);
    expect(isoDays('P1M')).toBe(30);
    expect(isoDays('')).toBe(0);
  });
});

describe('analytics for Pro', () => {
  it('the paywall, action, gate and status events are in the catalog and clean', () => {
    expect(cleanEvent('paywall_viewed', { trigger: 'gate_custom_cards', feature: 'custom_cards', plans: ['dxdash_pro_yearly'], variant: 'a', pro: false }).ok).toBe(true);
    expect(cleanEvent('paywall_action', { action: 'purchased', plan: 'dxdash_pro_yearly', trigger: 'settings', price: '$29.99', micros: 29990000, currency: 'USD', trial_days: 7 }).props.micros).toBe(29990000);
    expect(cleanEvent('paywall_action', { action: 'made_up' }).props.action).toBe('other');
    expect(cleanEvent('pro_gate_hit', { feature: 'offline_pack', mode: 'locked' }).ok).toBe(true);
    expect(cleanEvent('pro_status', { active: true, source: 'store' }).ok).toBe(true);
    expect(cleanEvent('pro_status', {}).ok).toBe(false);
  });
});

vi.stubEnv('VITE_PRO_WEB_URL', '');

describe('the full library: lifetime, and the one-time cards unlock', () => {
  it('a free player has the free cards only; the Full Library purchase or Pro opens all', async () => {
    expect(libraryUnlocked()).toBe(false);
    const iap = withPlans(iapFor(fakePlugin()));
    registerProProducts(); // (registers on the app's own connection; not used here)
    iap.add([{ id: 'dxdash_library', kind: 'nonconsumable' }]);
    await iap.start();
    const offer = await libraryOffer(iap);
    expect(offer).toMatchObject({ id: 'dxdash_library', currency: 'USD' });
    const res = await buyLibrary({ iap });
    expect(res.ok).toBe(true);
    expect(ownsLibrary()).toBe(true);
    expect(libraryUnlocked()).toBe(true);
    expect(checkGate('card_library').allowed).toBe(true);
    // the library unlock does not unlock the study tools
    expect(checkGate('offline_pack').allowed).toBe(false);
  });
  it('Lifetime is Pro that does not run out', async () => {
    const plugin = fakePlugin({ owned: ['dxdash_pro_lifetime'] });
    const iap = withPlans(iapFor(plugin));
    const st = await refreshPro({ iap, now: NOW });
    expect(st).toMatchObject({ active: true, plan: 'lifetime' });
    expect(st.until).toBeGreaterThan(NOW + 50 * 365 * DAY);
    expect(libraryUnlocked()).toBe(true);
    expect(isPro(NOW + 10 * 365 * DAY)).toBe(true);
  });
  it('registers the lifetime and the library as one-time purchases and the rest as subscriptions', async () => {
    const plugin = fakePlugin();
    const iap = iapFor(plugin);
    iap.add([{ id: 'a', kind: 'subscription' }, { id: 'b', kind: 'nonconsumable' }]);
    await iap.start();
    expect(plugin.registered.map((d) => d.type)).toEqual(['paid subscription', 'non consumable']);
  });
});
