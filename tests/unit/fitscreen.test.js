import { describe, it, expect } from 'vitest';
import { zoomFor, MAX_ZOOM } from '../../js/fitscreen.js';

describe('scaling a one-page screen to the room it has', () => {
  it('grows by the room available, never below 1 and never past the cap', () => {
    expect(zoomFor(500, 600)).toBeCloseTo(1.2, 5);
    expect(zoomFor(500, 480)).toBe(1);          // does not fit: stays normal (and scrolls)
    expect(zoomFor(300, 2000)).toBe(MAX_ZOOM);  // huge screen: capped
    expect(zoomFor(0, 600)).toBe(1);
    expect(zoomFor(500, 0)).toBe(1);
    expect(zoomFor(NaN, 600)).toBe(1);
    expect(zoomFor(100, 1000, 2)).toBe(2);
  });
});
