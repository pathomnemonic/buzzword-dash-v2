import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PREMIUM_ITEMS, isPremiumItem, premiumCents, formatUsd, itemProductId } from '../../supabase/functions/_shared/premium.js';
import { LOCKER_ITEMS } from '../../js/game/shopdata.js';
import { setProConfigForTest } from '../../js/remoteconfig.js';
import { resetProForTest, setSellableForTest, grantOwnedItems, buyPremiumItem, waitForWebItem, refreshPro, itemPriceLabel, probeSellable } from '../../js/pro.js';
import { setIapForTest, createIap } from '../../js/iap.js';

let storage;
const acct = (over) => Object.assign({ isAuthenticated: () => true, isGuest: () => false, getUserId: () => 'u1', getMyPro: async () => ({ active: false, items: [] }) }, over || {});

beforeEach(async () => {
  localStorage.clear();
  resetProForTest();
  setProConfigForTest(null);
  setIapForTest(createIap({ plugin: null, platform: 'web' }));
  setSellableForTest(true);
  ({ storage } = await import('../../js/storage.js'));
  storage.load();
});

describe('the premium catalog', () => {
  it('every premium item is a real Locker item, with a dollar price and no coin price', () => {
    Object.keys(PREMIUM_ITEMS).forEach((id) => {
      const item = LOCKER_ITEMS.find((i) => i.id === id);
      expect(item, id).toBeTruthy();
      expect(item.premium).toBe(true);
      expect(item.price).toBe(0);
      expect(item.coinValue).toBeGreaterThan(0);
      expect(item.usdCents).toBe(PREMIUM_ITEMS[id]);
      expect(PREMIUM_ITEMS[id]).toBeGreaterThanOrEqual(99);
      expect(PREMIUM_ITEMS[id]).toBeLessThanOrEqual(999);
    });
    expect(isPremiumItem('trail_ekg')).toBe(false);
    expect(isPremiumItem('constructor')).toBe(false);
    expect(premiumCents('trail_rainbow')).toBe(199);
    expect(formatUsd(299)).toBe('$2.99');
    expect(itemProductId('gear_wings')).toBe('dxdash_item_gear_wings');
  });

  it('cannot be bought with coins or taken as the Pro gift', () => {
    storage.data.progression.coins = 1e6;
    expect(storage.buyItem('trail_rainbow', 0)).toBe(false);
    expect(storage.buyItem('trail_rainbow', 5000)).toBe(false);
    expect(storage.ownsItem('trail_rainbow')).toBe(false);
    expect(storage.claimProGift('trail_rainbow')).toBe(false);
    expect(storage.get('proGiftItem')).toBe('');
  });
});

describe('what a member has paid for is theirs, and nothing takes it away', () => {
  it('grantOwnedItems only ever adds, and ignores anything odd', () => {
    expect(grantOwnedItems(['trail_rainbow', 'gear_wings'])).toBe(2);
    expect(grantOwnedItems(['trail_rainbow'])).toBe(0);
    expect(grantOwnedItems(['BAD ID', '', 7, null, '../x'])).toBe(0);
    expect(storage.ownsItem('trail_rainbow')).toBe(true);
    expect(storage.data.progression.ownedItems.filter((i) => i === 'trail_rainbow').length).toBe(1);
  });

  it('the server\'s list is merged on a refresh; a failed answer or an empty list never removes an item', async () => {
    await probeSellable();
    await refreshPro({ lb: acct({ getMyPro: async () => ({ active: false, items: ['avatar_m_king'] }) }) });
    expect(storage.ownsItem('avatar_m_king')).toBe(true);
    await refreshPro({ lb: acct({ getMyPro: async () => ({ error: true }) }) });
    await refreshPro({ lb: acct({ getMyPro: async () => { throw new Error('offline'); } }) });
    await refreshPro({ lb: acct({ getMyPro: async () => ({ active: false, items: [] }) }) });
    expect(storage.ownsItem('avatar_m_king')).toBe(true);
  });

  it('an item whose payment event was lost is put right by asking Stripe', async () => {
    vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    let synced = false;
    const lb = acct({
      getMyPro: async () => ({ active: false, items: synced ? ['gear_wings'] : [] }),
      proFunction: async (a) => { if (a === 'sync') { synced = true; return { ok: true, granted: ['item:gear_wings'] }; } return { error: 'no' }; }
    });
    await refreshPro({ lb });
    expect(storage.ownsItem('gear_wings')).toBe(true);
    vi.unstubAllEnvs();
  });

  it('a purchase through the store (phone app) is picked up too', async () => {
    const iap = { start: async () => true, owned: (id) => id === 'dxdash_item_pal_dragon', product: () => null, add() {}, price: () => null };
    await refreshPro({ iap });
    expect(storage.ownsItem('pal_dragon')).toBe(true);
  });
});

describe('buying one', () => {
  const item = LOCKER_ITEMS.find((i) => i.id === 'trail_rainbow');

  it('needs a real account, and not a guest', async () => {
    const go = vi.fn();
    expect(await buyPremiumItem(item, acct({ isGuest: () => true }), go)).toMatchObject({ ok: false, needsAccount: true });
    expect(await buyPremiumItem(item, acct({ isAuthenticated: () => false }), go)).toMatchObject({ ok: false, needsAccount: true });
    expect(await buyPremiumItem(item, null, go)).toMatchObject({ ok: false });
    expect(go).not.toHaveBeenCalled();
  });

  it('refuses an item that is not premium, or one already owned', async () => {
    const coin = LOCKER_ITEMS.find((i) => i.id === 'trail_ekg');
    expect((await buyPremiumItem(coin, acct(), vi.fn())).ok).toBe(false);
    grantOwnedItems(['trail_rainbow']);
    expect((await buyPremiumItem(item, acct(), vi.fn())).error).toMatch(/already own/);
  });

  it('on the website it asks the payment function and goes to Stripe only for a real https page', async () => {
    const go = vi.fn();
    const calls = [];
    const ok = acct({ proFunction: async (a, x) => { calls.push([a, x]); return { url: 'https://checkout.stripe.com/c/pay_9' }; } });
    expect(await buyPremiumItem(item, ok, go)).toEqual({ ok: true, redirected: true });
    expect(calls).toEqual([['item', { item: 'trail_rainbow', name: 'Rainbow' }]]);
    expect(go).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay_9');
    const evil = acct({ proFunction: async () => ({ url: 'http://evil' }) });
    expect((await buyPremiumItem(item, evil, vi.fn())).ok).toBe(false);
    const down = acct({ proFunction: async () => ({ error: 'You already own this item.' }) });
    expect((await buyPremiumItem(item, down, vi.fn())).error).toMatch(/already own/);
  });

  it('shows the dollar price on the website', () => {
    expect(itemPriceLabel(item)).toBe('$1.99');
    expect(itemPriceLabel({ id: 'x' })).toBe('');
  });

  it('back from paying, it waits for the item, asking Stripe directly if the event is slow', async () => {
    vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    let n = 0; let synced = 0;
    const lb = acct({
      getMyPro: async () => ({ active: false, items: ++n > 5 ? ['trail_rainbow'] : [] }),
      proFunction: async (a) => { if (a === 'sync') { synced++; return { ok: true, granted: [] }; } return { error: 'no' }; }
    });
    const r = await waitForWebItem(lb, 'trail_rainbow', { wait: async () => {}, tries: 8 });
    expect(r.owned).toBe(true);
    expect(synced).toBeGreaterThanOrEqual(1);
    vi.unstubAllEnvs();
  });
});
