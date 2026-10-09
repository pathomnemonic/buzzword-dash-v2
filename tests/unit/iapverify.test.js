import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setProConfigForTest } from '../../js/remoteconfig.js';
import { resetProForTest } from '../../js/pro.js';
import { createIap } from '../../js/iap.js';

let native;
vi.mock('../../js/native.js', async (orig) => {
  const real = await orig();
  return { ...real, isNative: () => native, getNativePlatform: () => 'android' };
});

async function load() {
  vi.resetModules();
  return import('../../js/pro.js');
}

const fakeIap = (owned, tokens) => ({ start: async () => true, owned: (id) => owned.includes(id), receipt: (id) => tokens[id] || null });
const fakeLb = (calls, reply) => ({
  isAuthenticated: () => true, isGuest: () => false, getUserId: () => 'u1',
  iapVerify: async (platform, id, token) => { calls.push([platform, id, token]); return reply ? reply() : { ok: true, valid: true }; }
});

beforeEach(() => { localStorage.clear(); native = true; setProConfigForTest(null); vi.stubEnv('VITE_IAP_VERIFY', '1'); vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('having the server check phone-store purchases', () => {
  it('is only on in a phone app built with the switch, for a real account', async () => {
    const pro = await load();
    expect(pro.iapVerifyEnabled()).toBe(true);
    native = false;
    expect(pro.iapVerifyEnabled()).toBe(false);
    native = true; vi.stubEnv('VITE_IAP_VERIFY', '');
    expect(pro.iapVerifyEnabled()).toBe(false);
  });

  it('sends each owned product with its proof, once, and again only after twelve hours', async () => {
    const pro = await load();
    const calls = [];
    const iap = fakeIap(['dxdash_pro_monthly', 'dxdash_item_trail_fire'], { dxdash_pro_monthly: 'token-aaaaaa', dxdash_item_trail_fire: 'token-bbbbbb' });
    const t0 = Date.now();
    expect(await pro.verifyStorePurchases(fakeLb(calls), iap, { now: t0 })).toBe(2);
    expect(calls).toEqual([['android', 'dxdash_pro_monthly', 'token-aaaaaa'], ['android', 'dxdash_item_trail_fire', 'token-bbbbbb']]);
    expect(await pro.verifyStorePurchases(fakeLb(calls), iap, { now: t0 + 60000 })).toBe(0);
    expect(await pro.verifyStorePurchases(fakeLb(calls), iap, { now: t0 + 13 * 3600000 })).toBe(2);
  });

  it('skips what is not owned or has no proof, and does nothing for a guest', async () => {
    const pro = await load();
    const calls = [];
    expect(await pro.verifyStorePurchases(fakeLb(calls), fakeIap(['dxdash_pro_monthly'], {}))).toBe(0);
    expect(await pro.verifyStorePurchases(fakeLb(calls), fakeIap([], { dxdash_pro_monthly: 'token-aaaaaa' }))).toBe(0);
    const guest = { ...fakeLb(calls), isGuest: () => true };
    expect(await pro.verifyStorePurchases(guest, fakeIap(['dxdash_pro_monthly'], { dxdash_pro_monthly: 'token-aaaaaa' }))).toBe(0);
    expect(calls).toEqual([]);
  });

  it('an error from the server is tried again next time, and never throws', async () => {
    const pro = await load();
    const calls = [];
    const iap = fakeIap(['dxdash_pro_monthly'], { dxdash_pro_monthly: 'token-aaaaaa' });
    const bad = fakeLb(calls, () => ({ error: 'down' }));
    await pro.verifyStorePurchases(bad, iap, { now: 1000 });
    await pro.verifyStorePurchases(fakeLb(calls), iap, { now: 2000 });
    expect(calls).toHaveLength(2);
    const throwing = { ...fakeLb(calls), iapVerify: async () => { throw new Error('offline'); } };
    await expect(pro.verifyStorePurchases(throwing, iap, { now: 900000000 })).resolves.toBeTypeOf('number');
  });
});

describe('the proof of a purchase from the store plugin', () => {
  const plugin = (tr) => ({ store: { register() {}, when: () => ({ approved: () => ({ finished() {} }) }), initialize: async () => [], get: () => ({ id: 'p' }), findInLocalReceipts: () => tr }, ProductType: {}, Platform: { GOOGLE_PLAY: 'g', APPLE_APPSTORE: 'a' } });
  const ready = async (platform, tr) => { const iap = createIap({ loadPlugin: async () => plugin(tr), platform }); iap.add([{ id: 'p', kind: 'subscription' }]); await iap.start(); return iap; };

  it('is the purchase token on Android and the transaction id on iOS', async () => {
    expect((await ready('android', { nativePurchase: { purchaseToken: 'goog-token-123' } })).receipt('p')).toBe('goog-token-123');
    expect((await ready('ios', { transactionId: '2000000999' })).receipt('p')).toBe('2000000999');
  });

  it('is nothing when the plugin has none, or offers nothing', async () => {
    expect((await ready('android', undefined)).receipt('p')).toBeNull();
    expect((await ready('android', { nativePurchase: {} })).receipt('p')).toBeNull();
    expect(createIap({ loadPlugin: async () => null, platform: 'android' }).receipt('p')).toBeNull();
  });
});
