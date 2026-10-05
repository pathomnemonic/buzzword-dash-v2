// tests/unit/storage.test.js
// Storage tests per Section 33.1 of the architecture document

import { describe, it, expect, beforeEach } from 'vitest';
import { SHOP_ITEMS } from '../../js/game/shopdata.js';

// We need to import storage after setup has run
let storage;

beforeEach(async () => {
  localStorage.clear();
  // Re-import to get fresh module state
  const mod = await import('../../js/storage.js');
  storage = mod.storage;
  storage.load();
});

// A new player starts with enough coins for a first trail (the tutorial walks them through buying one)
const START = 500;

describe('Storage — fresh defaults', () => {
  it('loads with default coin balance', () => {
    expect(storage.get('coins')).toBe(START);
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
    expect(storage.get('coins')).toBe(START);
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
    expect(storage.get('coins')).toBe(START + 50);
    expect(storage.get('totalCoins')).toBe(initialTotal + 50);
  });

  it('spendCoins returns false when insufficient', () => {
    expect(storage.spendCoins(START + 9999)).toBe(false);
    expect(storage.get('coins')).toBe(START);
  });

  it('spendCoins deducts correctly', () => {
    expect(storage.spendCoins(30)).toBe(true);
    expect(storage.get('coins')).toBe(START - 30);
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
    expect(storage.get('coins')).toBe(START);
    expect(storage.hasAchievement('ach_first_run')).toBe(false);
  });
});

describe('Storage — backup and restore', () => {
  it('round-trips progress through exportBackup/importBackup', () => {
    storage.set('coins', 4321);
    const backup = storage.exportBackup();
    localStorage.clear();
    storage.load();
    expect(storage.get('coins')).toBe(START);
    expect(storage.importBackup(backup).ok).toBe(true);
    expect(storage.get('coins')).toBe(4321);
  });

  it('rejects invalid or foreign files without changing progress', () => {
    storage.set('coins', 555);
    expect(storage.importBackup('not json').ok).toBe(false);
    expect(storage.importBackup('{"app":"other","data":{}}').ok).toBe(false);
    expect(storage.importBackup('{"app":"buzzword-dash","data":{"schemaVersion":999}}').ok).toBe(false);
    expect(storage.get('coins')).toBe(555);
  });
});

describe('retired duplicate characters', () => {
  it('moves owners to the character they duplicated and refunds them', () => {
    storage.data.progression.coins = 100;
    storage.data.progression.ownedItems = ['avatar_intern', 'avatar_m_resident', 'avatar_m_surgeon', 'avatar_robopro'];
    storage.data.progression.equipped.skin = 'avatar_m_surgeon';
    storage._ensureInvariants();
    const owned = storage.data.progression.ownedItems;
    ['avatar_m_resident', 'avatar_m_surgeon', 'avatar_robopro'].forEach((id) => expect(owned).not.toContain(id));
    expect(owned).toContain('avatar_m_robot');                       // the robot they paid for, in its other form
    expect(storage.data.progression.equipped.skin).toBe('avatar_intern');
    // 400 + 1000 back (they already had Dr. Dash), and 9000 less the price of the robot they are given instead
    const robot = SHOP_ITEMS.find((i) => i.id === 'avatar_m_robot').price;
    expect(storage.data.progression.coins).toBe(100 + 400 + 1000 + (9000 - robot));
    // running it again changes nothing
    storage._ensureInvariants();
    expect(storage.data.progression.coins).toBe(100 + 400 + 1000 + (9000 - robot));
  });

  it('turns the old shared scrub color into the doctor\'s pants color', () => {
    storage.data.settings.scrubColor = 0x9a2f45;
    storage.data.settings.modelColors = {};
    storage._ensureInvariants();
    expect(storage.data.settings.scrubColor).toBeUndefined();
    expect(storage.data.settings.modelColors.avatar_intern).toEqual({ pants: 0x9a2f45 });
  });
});

describe('the Surprise me colors', () => {
  it('moves players left on the old Auto over once, and respects a later choice of Seasonal', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    storage.data.settings.uiTheme = 'auto';
    storage.data.settings.themeSurpriseSeen = false;
    storage._ensureInvariants();
    expect(storage.get('uiTheme')).toBe('surprise');
    storage.data.settings.uiTheme = 'auto';   // chosen on purpose afterwards
    storage._ensureInvariants();
    expect(storage.get('uiTheme')).toBe('auto');
  });
});
