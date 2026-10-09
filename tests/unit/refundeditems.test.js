import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setProConfigForTest } from '../../js/remoteconfig.js';
import { refreshPro, resetProForTest, setSellableForTest } from '../../js/pro.js';
import { setIapForTest, createIap } from '../../js/iap.js';
import { storage } from '../../js/storage.js';

// A refunded or charged-back item is taken back, but never on one odd answer, never for something bought another way,
// and never for another account's list.

const ITEM = 'trail_fire';
let answer;
let uid;
function lb() {
  return { isAuthenticated: () => true, isGuest: () => false, getUserId: () => uid, getMyPro: async () => answer() };
}
const listed = (items) => () => ({ active: false, library: false, items, signed_in: true });

beforeEach(() => {
  localStorage.clear();
  resetProForTest();
  setProConfigForTest(null);
  setIapForTest(createIap({ plugin: null, platform: 'web' }));
  setSellableForTest(false);
  vi.stubEnv('VITE_PRO_WEB_CHECKOUT', '1');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  storage.reset('all_local');
  uid = 'alice';
});
afterEach(() => { vi.unstubAllEnvs(); setIapForTest(null); });

describe('taking back a refunded item', () => {
  it('keeps it while the server lists it, and takes it back (and unequips it) after two checks that do not', async () => {
    answer = listed([ITEM]);
    await refreshPro({ lb: lb() });
    expect(storage.ownsItem(ITEM)).toBe(true);
    storage.equipItem(ITEM, 'trail');
    const heard = [];
    document.addEventListener('dx:items-revoked', (e) => heard.push(e.detail.items));

    answer = listed([]);
    await refreshPro({ lb: lb() });
    expect(storage.ownsItem(ITEM)).toBe(true);            // (one check is not enough)
    await refreshPro({ lb: lb() });
    expect(storage.ownsItem(ITEM)).toBe(false);
    expect(storage.get('equipped').trail).toBe('trail_none');
    expect(heard).toEqual([[ITEM]]);
  });

  it('a single missing answer followed by the item reappearing changes nothing', async () => {
    answer = listed([ITEM]);
    await refreshPro({ lb: lb() });
    answer = listed([]);
    await refreshPro({ lb: lb() });
    answer = listed([ITEM]);
    await refreshPro({ lb: lb() });
    answer = listed([]);
    await refreshPro({ lb: lb() });
    expect(storage.ownsItem(ITEM)).toBe(true);            // (the count started again)
  });

  it('an answer that does not say it was for a signed-in account, or an error, never takes anything back', async () => {
    answer = listed([ITEM]);
    await refreshPro({ lb: lb() });
    for (const bad of [() => ({ active: false, items: [] }), () => ({ active: false, items: [], signed_in: false }), () => ({ error: 'boom' })]) {
      answer = bad;
      await refreshPro({ lb: lb() });
      await refreshPro({ lb: lb() });
      await refreshPro({ lb: lb() });
    }
    expect(storage.ownsItem(ITEM)).toBe(true);
  });

  it('never touches an item bought with coins, gifted, or listed for a different account', async () => {
    storage.data.progression.ownedItems.push('trail_rainbow');
    answer = listed([ITEM]);
    await refreshPro({ lb: lb() });
    answer = listed([]);
    await refreshPro({ lb: lb() });
    await refreshPro({ lb: lb() });
    expect(storage.ownsItem('trail_rainbow')).toBe(true);  // (never listed by the server, so never the server's to take)

    // a different account signs in on this device: the last account's list means nothing for it
    storage.data.progression.ownedItems.push(ITEM);
    storage.notePaidItems('alice', [ITEM]);
    uid = 'bob';
    answer = listed([]);
    await refreshPro({ lb: lb() });
    await refreshPro({ lb: lb() });
    await refreshPro({ lb: lb() });
    expect(storage.ownsItem(ITEM)).toBe(true);
  });

  it('keeps an item that is also owned through the phone\'s store', () => {
    storage.data.progression.ownedItems.push(ITEM);
    storage.notePaidItems('alice', [ITEM]);
    expect(storage.reconcilePaidItems('alice', [], [ITEM])).toEqual([]);
    expect(storage.reconcilePaidItems('alice', [], [ITEM])).toEqual([]);
    expect(storage.ownsItem(ITEM)).toBe(true);
  });
});
