import { describe, it, expect, vi, beforeEach } from 'vitest';

// The first release sells Dx Dash Pro only: the real-money Locker items stay "Soon" until VITE_FEATURE_LOCKER_ITEMS is on.
describe('Locker items switched off (the default build)', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_FEATURE_LOCKER_ITEMS', ''); });

  it('never reports items as available, whatever the backend says', async () => {
    const pro = await import('../../js/pro.js');
    expect(pro.itemsAvailable()).toBe(false);
  });

  it('does not even ask the backend', async () => {
    const pro = await import('../../js/pro.js');
    const lb = { proFunction: vi.fn(() => Promise.resolve({ ok: true, items: true })), getStatus: () => ({ signedIn: true, provider: 'email' }) };
    await pro.probeItems(lb);
    expect(lb.proFunction).not.toHaveBeenCalled();
  });

  it('refuses a purchase without charging anything', async () => {
    const pro = await import('../../js/pro.js');
    const lb = { proFunction: vi.fn() };
    const r = await pro.buyPremiumItem({ id: 'avatar_m_king', name: 'Attending Arthur', premium: true }, lb);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/coming soon/i);
    expect(lb.proFunction).not.toHaveBeenCalled();
  });
});

describe('Locker items switched on', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_FEATURE_LOCKER_ITEMS', '1'); });
  it('are available until the backend says it cannot sell them', async () => {
    const pro = await import('../../js/pro.js');
    pro.resetItemsForTest();
    expect(pro.itemsAvailable()).toBe(true);
  });
});
