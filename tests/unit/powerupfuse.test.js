import { describe, it, expect } from 'vitest';
import { fuseWith, listFusions, FUSE_WINDOW, FUSIBLE } from '../../js/game/powerupfuse.js';

describe('power-up fusions', () => {
  it('every pair of different fusible power-ups has a fusion, and each is unique', () => {
    const pairs = [];
    FUSIBLE.forEach((a, i) => FUSIBLE.slice(i + 1).forEach((b) => pairs.push([a, b].sort().join('+'))));
    expect(listFusions().map((f) => f.pair).sort()).toEqual(pairs.sort());
    expect(new Set(listFusions().map((f) => f.id)).size).toBe(pairs.length);
  });

  it('fuse two different power-ups picked up close together, either way round', () => {
    expect(fuseWith({ type: 'magnet', at: 10 }, 'double', 12).id).toBe('goldRush');
    expect(fuseWith({ type: 'double', at: 10 }, 'magnet', 12).id).toBe('goldRush');
  });

  it('do not fuse the same one twice, too late, auto-pilot, or with nothing before', () => {
    expect(fuseWith({ type: 'magnet', at: 10 }, 'magnet', 11)).toBeNull();
    expect(fuseWith({ type: 'magnet', at: 10 }, 'double', 10 + FUSE_WINDOW + 0.5)).toBeNull();
    expect(fuseWith({ type: 'magnet', at: 10 }, 'autoPilot', 11)).toBeNull();
    expect(fuseWith(null, 'magnet', 11)).toBeNull();
    expect(fuseWith({ type: 'magnet', at: 20 }, 'double', 10)).toBeNull();
  });

  it('only ever pay out coins and score, never an easier answer', () => {
    listFusions().forEach((f) => Object.keys(f.timers).forEach((k) => expect(['goldRush', 'magnet', 'double', 'jackpot', 'scoreFrenzy']).toContain(k)));
  });
});
