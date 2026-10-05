import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { SKINS, isIndoorSkin, isMapUnlocked, mapItemId, getNextSkin, getStartSkin } from '../../js/game/skins.js';
import { LOCKER_ITEMS } from '../../js/game/shopdata.js';

const maps = LOCKER_ITEMS.filter((i) => i.type === 'map');

describe('maps in the Locker', () => {
  it('every map that is not an indoor hospital map is for sale, and nothing else is', () => {
    const outdoor = SKINS.filter((s) => !isIndoorSkin(s));
    expect(maps.map((m) => m.skinId).sort()).toEqual(outdoor.map((s) => s.id).sort());
    maps.forEach((m) => {
      expect(m.id).toBe(mapItemId(SKINS.find((s) => s.id === m.skinId)));
      expect(m.price).toBeGreaterThan(0);
      expect(m.name).toBe(SKINS.find((s) => s.id === m.skinId).name);
    });
    expect(SKINS.filter(isIndoorSkin).length).toBeGreaterThanOrEqual(4);
  });

  it('exactly four hospital rooms are free; every other map is a reward or has to be bought', () => {
    const free = SKINS.filter(isIndoorSkin).map((s) => s.name).sort();
    expect(free).toEqual(['Ambulance Bay', 'Hospital Hallway', 'Operating Room', 'Research Lab']);
    ['Neon ER', 'Prescription Sunset', 'Surgical Theater', 'Candy Lab'].forEach((name) => {
      const skin = SKINS.find((s) => s.name === name);
      expect(isMapUnlocked(skin, () => false), name).toBe(false);
      expect(maps.some((m) => m.skinId === skin.id), name + ' is for sale').toBe(true);
    });
    // a new player's runs only ever open on a free map
    for (let i = 0; i < 100; i++) expect(isIndoorSkin(getStartSkin())).toBe(true);
  });

  it('only the indoor maps are free', () => {
    const owns = () => false;
    SKINS.forEach((s) => expect(isMapUnlocked(s, owns), s.id).toBe(isIndoorSkin(s)));
    expect(isMapUnlocked(SKINS.find((s) => s.id === 'skin_cardiac_pulse'), (id) => id === 'map_cardiac_pulse')).toBe(true);
  });

  it('a new player never rotates into a map they have not bought', () => {
    const owns = () => false;
    for (let i = 0; i < 200; i++) {
      let skin = getStartSkin();
      expect(isIndoorSkin(skin)).toBe(true);
      for (let c = 0; c < 6; c++) {
        skin = getNextSkin(skin, c, Math.random, owns);
        expect(isIndoorSkin(skin), skin.id).toBe(true);
      }
    }
  });

  it('after buying one, the first change of a run goes to it, and others stay out', () => {
    const owns = (id) => id === 'map_cardiac_pulse';
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(getNextSkin(getStartSkin(), 0, Math.random, owns).id);
    expect([...seen]).toEqual(['skin_cardiac_pulse']);
    const later = new Set();
    for (let i = 0; i < 300; i++) later.add(getNextSkin(SKINS[0], 3, Math.random, owns).id);
    later.forEach((id) => expect(isIndoorSkin(SKINS.find((s) => s.id === id)) || id === 'skin_cardiac_pulse', id).toBe(true));
  });
});

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('buying and choosing maps', () => {
  let storage, ui;
  beforeEach(async () => {
    localStorage.clear();
    loadPage();
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
    ({ ui } = await import('../../js/ui.js'));
  });

  it('the Locker has a Maps tab where a map can be bought and made the favorite', () => {
    storage.set('coins', 20000);
    ui._lockerTab = 'maps';
    ui.renderShop();
    const rows = document.querySelectorAll('#shopItems [data-map]');
    expect(rows.length).toBe(22);
    const row = document.querySelector('[data-map="map_cardiac_pulse"]');
    row.querySelector('.btn-gold').click();
    expect(storage.ownsItem('map_cardiac_pulse')).toBe(true);
    const cost = LOCKER_ITEMS.find((i) => i.id === 'map_cardiac_pulse').price;
    expect(storage.get('coins')).toBe(20000 - cost);
    const fav = document.querySelector('[data-map="map_cardiac_pulse"] button[aria-pressed]');
    expect(fav.textContent).toMatch(/Favorite/);
    fav.click();
    expect(storage.get('preferredMap')).toBe('Cardiac Pulse');
  });

  it('cannot buy without coins', () => {
    storage.set('coins', 10);
    ui._lockerTab = 'maps';
    ui.renderShop();
    document.querySelector('[data-map="map_cardiac_pulse"] .btn-gold').click();
    expect(storage.ownsItem('map_cardiac_pulse')).toBe(false);
  });

  it('the Favorite map setting lists only maps the player can use', () => {
    ui._settingsSection = 'rules';
    ui.renderSettings();
    const opts = [...document.querySelectorAll('select[aria-label="Favorite map"] option')].map((o) => o.textContent);
    expect(opts).not.toContain('Cardiac Pulse');
    expect(opts).toContain('Hospital Hallway');
  });

  it('someone who already had an outdoor map as their favorite keeps it', () => {
    storage.data.settings.preferredMap = 'Neural Highway';
    storage._ensureInvariants();
    expect(storage.ownsItem('map_neural_highway')).toBe(true);
  });

  it('every Locker list runs from the cheapest to the dearest (maps run in the order they unlock)', () => {
    storage.set('coins', 0);
    const price = (id) => LOCKER_ITEMS.find((i) => i.id === id).price;
    ['heroes', 'trails', 'maps', 'monsters'].forEach((tab) => {
      if (tab === 'maps') return; // maps are listed by the level they unlock at (tested below)
      ui._lockerTab = tab;
      ui.renderShop();
      const groups = [...document.querySelectorAll('#shopItems h3')].map((h) => h.parentElement);
      const rows = [...document.querySelectorAll('#shopItems .shop-item')];
      expect(rows.length, tab).toBeGreaterThan(3);
      const idsOf = (root) => [...root.querySelectorAll('.shop-item')].map((r) => (r.querySelector('[data-preview]') && r.querySelector('[data-preview]').dataset.preview) || r.dataset.map);
      const lists = groups.length > 1 && groups.some((g) => g.querySelectorAll('.shop-item').length) ? groups : [document.getElementById('shopItems')];
      lists.forEach((g) => {
        const prices = idsOf(g).filter(Boolean).map(price);
        expect(prices, tab).toEqual([...prices].sort((a, b) => a - b));
      });
    });
  });
});

describe('maps as level rewards', () => {
  let storage;
  beforeEach(async () => {
    localStorage.clear();
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
  });

  it('every non-free map unlocks at a level, one more every five levels, and the four rooms never do', async () => {
    const { MAP_ORDER, mapUnlockLevel } = await import('../../js/game/mapunlocks.js');
    expect(MAP_ORDER.slice().sort()).toEqual(maps.map((m) => m.id).sort());
    MAP_ORDER.forEach((id, i) => expect(mapUnlockLevel(id)).toBe((i + 1) * 5));
    expect(mapUnlockLevel('map_hospital_hallway')).toBe(0);
  });

  it('reaching the level makes the map yours; before that it can still be bought', async () => {
    const { xpAtLevel } = await import('../../js/progress.js');
    expect(storage.ownsItem('map_pediatric_playland')).toBe(false);
    storage.set('xp', xpAtLevel(5));
    expect(storage.ownsItem('map_pediatric_playland')).toBe(true);
    expect(storage.ownsItem('map_sunshine_rehab_garden')).toBe(false);
    storage.set('coins', 5000);
    expect(storage.buyItem('map_sunshine_rehab_garden', 1500)).toBe(true);
    expect(storage.ownsItem('map_sunshine_rehab_garden')).toBe(true);
    expect(isMapUnlocked(SKINS.find((s) => s.id === 'skin_pediatric_playland'), (id) => storage.ownsItem(id))).toBe(true);
  });

  it('the level-up card names a map that has just unlocked', async () => {
    const { mapsUnlockedBetween } = await import('../../js/game/mapunlocks.js');
    expect(mapsUnlockedBetween(4, 5)).toEqual(['map_pediatric_playland']);
    expect(mapsUnlockedBetween(4, 12)).toHaveLength(2);
    expect(mapsUnlockedBetween(5, 9)).toEqual([]);
  });
});
