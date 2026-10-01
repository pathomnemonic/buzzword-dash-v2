import { describe, it, expect } from 'vitest';
import { pickObstacleLane, getObstacleVariant } from '../../js/game/obstacles.js';

describe('obstacles never block the right answer', () => {
  it('never choose the correct lane, whatever the dice say', () => {
    for (const correct of [0, 1, 2]) {
      for (let i = 0; i < 100; i++) {
        const lane = pickObstacleLane(correct, () => i / 100);
        expect(lane).not.toBe(correct);
        expect([0, 1, 2]).toContain(lane);
      }
    }
  });

  it('use every other lane over time', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(pickObstacleLane(1, Math.random));
    expect([...seen].sort()).toEqual([0, 2]);
  });

  it('still work with no restriction', () => {
    expect([0, 1, 2]).toContain(pickObstacleLane(-1, () => 0.5));
  });
});

describe('staffed obstacles', () => {
  it('has an orderly pushing a gurney, a jump obstacle with animated staff models', () => {
    const v = getObstacleVariant('orderly_gurney');
    expect(v.id).toBe('orderly_gurney');
    expect(v.staff.length).toBeGreaterThan(0);
  });
});
