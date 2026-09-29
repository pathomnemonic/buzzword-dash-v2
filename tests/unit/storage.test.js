// tests/unit/storage.test.js
// Storage tests per Section 33.1 of the architecture document

import { describe, it, expect, beforeEach } from 'vitest';

// We need to import storage after setup has run
let storage;

beforeEach(async () => {
  localStorage.clear();
  // Re-import to get fresh module state
  const mod = await import('../../js/storage.js');
  storage = mod.storage;
  storage.load();
});

describe('Storage — fresh defaults', () => {
  it('loads with default coin balance', () => {
    expect(storage.get('coins')).toBe(100);
  });

  it('loads with empty card stats', () => {
    expect(storage.get('cardStats')).toEqual({});
  });

  it('loads with default equipped items', () => {
    const eq = storage.get('equipped');
    expect(eq.skin).toBe('avatar_intern');
    expect(eq.hat).toBe('hat_none');
    expect(eq.trail).toBe('trail_none');
    expect(eq.gear).toBe('gear_none');
    expect(eq.clothing).toBe('cloth_none');
  });

  it('defaults musicOn to true', () => {
    expect(storage.get('musicOn')).toBe(true);
  });

  it('defaults firstRunComplete to false', () => {
    expect(storage.get('firstRunComplete')).toBe(false);
  });
});

describe('Storage — corrupt JSON recovery', () => {
  it('recovers from corrupt localStorage data', () => {
    localStorage.setItem('buzzword_dash_v1', '{{{invalid json');
    storage.load();
    expect(storage.get('coins')).toBe(100);
  });
});

describe('Storage — volume zero persistence', () => {
  it('preserves masterVolume of 0', () => {
    storage.set('masterVolume', 0);
    storage.save();
    storage.load();
    expect(storage.get('masterVolume')).toBe(0);
  });

  it('preserves musicVolume of 0', () => {
    storage.set('musicVolume', 0);
    storage.save();
    storage.load();
    expect(storage.get('musicVolume')).toBe(0);
  });

  it('preserves sfxVolume of 0', () => {
    storage.set('sfxVolume', 0);
    storage.save();
    storage.load();
    expect(storage.get('sfxVolume')).toBe(0);
  });
});

describe('Storage — card stats', () => {
  it('returns default stat for unseen card', () => {
    const stat = storage.getCardStat('n001');
    expect(stat.seen).toBe(0);
    expect(stat.correct).toBe(0);
    expect(stat.wrong).toBe(0);
    expect(stat.lastSeen).toBe(0);
  });

  it('updates card stat correctly for correct answer', () => {
    storage.updateCardStat('n001', true);
    const stat = storage.getCardStat('n001');
    expect(stat.seen).toBe(1);
    expect(stat.correct).toBe(1);
    expect(stat.wrong).toBe(0);
    expect(stat.lastSeen).toBeGreaterThan(0);
  });

  it('updates card stat correctly for wrong answer', () => {
    storage.updateCardStat('n001', false);
    const stat = storage.getCardStat('n001');
    expect(stat.seen).toBe(1);
    expect(stat.correct).toBe(0);
    expect(stat.wrong).toBe(1);
  });
});

describe('Storage — coins', () => {
  it('adds coins and tracks total', () => {
    const initialTotal = storage.get('totalCoins');
    storage.addCoins(50);
    expect(storage.get('coins')).toBe(150);
    expect(storage.get('totalCoins')).toBe(initialTotal + 50);
  });

  it('spendCoins returns false when insufficient', () => {
    expect(storage.spendCoins(9999)).toBe(false);
    expect(storage.get('coins')).toBe(100);
  });

  it('spendCoins deducts correctly', () => {
    expect(storage.spendCoins(30)).toBe(true);
    expect(storage.get('coins')).toBe(70);
  });
});

describe('Storage — achievements', () => {
  it('unlocks new achievement', () => {
    expect(storage.unlockAchievement('ach_first_run')).toBe(true);
    expect(storage.hasAchievement('ach_first_run')).toBe(true);
  });

  it('does not duplicate achievement', () => {
    storage.unlockAchievement('ach_first_run');
    expect(storage.unlockAchievement('ach_first_run')).toBe(false);
  });
});

describe('Storage — card management', () => {
  it('toggles card disabled state', () => {
    expect(storage.isCardDisabled('n001')).toBe(false);
    storage.toggleCardDisabled('n001');
    expect(storage.isCardDisabled('n001')).toBe(true);
    storage.toggleCardDisabled('n001');
    expect(storage.isCardDisabled('n001')).toBe(false);
  });
});

describe('Storage — profile', () => {
  it('sets and retrieves profile name', () => {
    storage.setProfileName('Dr. Test');
    expect(storage.get('profileName')).toBe('Dr. Test');
  });

  it('truncates profile name to 30 chars', () => {
    storage.setProfileName('A'.repeat(50));
    expect(storage.get('profileName').length).toBe(30);
  });
});

describe('Storage — play time tracking', () => {
  it('adds play time correctly', () => {
    storage.addPlayTime(120);
    expect(storage.get('totalPlayTime')).toBe(120);
    storage.addPlayTime(60);
    expect(storage.get('totalPlayTime')).toBe(180);
  });

  it('ignores negative play time', () => {
    storage.addPlayTime(-100);
    expect(storage.get('totalPlayTime')).toBe(0);
  });
});

describe('Storage — reset', () => {
  it('resets all data to defaults', () => {
    storage.addCoins(500);
    storage.unlockAchievement('ach_first_run');
    storage.reset();
    expect(storage.get('coins')).toBe(100);
    expect(storage.hasAchievement('ach_first_run')).toBe(false);
  });
});
