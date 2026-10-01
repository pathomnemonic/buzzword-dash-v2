import { describe, it, expect } from 'vitest';
import { SKINS, isIndoorSkin, getStartSkin, getNextSkin } from '../../js/game/skins.js';

describe('map order within a run', () => {
  it('splits the maps into indoor and outdoor, with both kinds present', () => {
    const indoor = SKINS.filter(isIndoorSkin);
    expect(indoor.length).toBeGreaterThanOrEqual(5);
    expect(indoor.length).toBeLessThan(SKINS.length);
    ['Hospital Hallway', 'Operating Room', 'Research Lab', 'Ambulance Bay'].forEach((n) => {
      expect(indoor.map((s) => s.name)).toContain(n);
    });
  });

  it('a run always opens on an indoor map, and every indoor map can come up', () => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      const s = getStartSkin();
      expect(isIndoorSkin(s)).toBe(true);
      seen.add(s.id);
    }
    expect(seen.size).toBe(SKINS.filter(isIndoorSkin).length);
  });

  it('the first change goes outdoors, never back to the same map', () => {
    for (let i = 0; i < 300; i++) {
      const start = getStartSkin();
      const next = getNextSkin(start, 0);
      expect(isIndoorSkin(next)).toBe(false);
      expect(next.id).not.toBe(start.id);
    }
  });

  it('after that any map can come up (indoor included), but not the current one', () => {
    const seenIndoor = new Set();
    const current = SKINS.find((s) => s.name === 'Neural Highway');
    for (let i = 0; i < 400; i++) {
      const next = getNextSkin(current, 1);
      expect(next.id).not.toBe(current.id);
      if (isIndoorSkin(next)) seenIndoor.add(next.id);
    }
    expect(seenIndoor.size).toBeGreaterThan(0);
  });
});
