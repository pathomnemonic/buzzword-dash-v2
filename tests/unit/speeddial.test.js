import { describe, it, expect } from 'vitest';
import { SPEED_STEPS, speedIndex } from '../../js/ui.js';

describe('the speed dial', () => {
  it('keeps 1x as the default and adds slower settings below it', () => {
    expect(SPEED_STEPS[speedIndex(1)]).toBe(1);
    expect(SPEED_STEPS[0]).toBeLessThan(1);
    expect(SPEED_STEPS.slice(3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(SPEED_STEPS).toEqual([...SPEED_STEPS].sort((a, b) => a - b));
  });
  it('maps any saved speed to the nearest setting', () => {
    expect(speedIndex(undefined)).toBe(3);
    expect(speedIndex(0.5)).toBe(1);
    expect(speedIndex(0.6)).toBe(1);
    expect(speedIndex(7)).toBe(9);
    expect(speedIndex(99)).toBe(12);
  });
});
