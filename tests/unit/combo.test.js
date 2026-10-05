import { describe, it, expect } from 'vitest';
import { comboTier, ComboTracker, musicMood, trackGlow, isFlourish } from '../../js/game/combo.js';

describe('streak combos', () => {
  it('climb the ladder at 5, 10 and 20 in a row', () => {
    expect([0, 4, 5, 9, 10, 19, 20, 99].map(comboTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(comboTier(undefined)).toBe(0);
    expect(comboTier(-3)).toBe(0);
  });

  it('a miss takes away one layer at a time, and a new run starts clean', () => {
    const c = new ComboTracker();
    expect(c.update(22)).toBe(3);
    expect(c.update(0)).toBe(3); // the streak itself reset, but the music holds until the miss is registered
    expect(c.miss()).toBe(2);
    expect(c.miss()).toBe(1);
    expect(c.miss()).toBe(0);
    expect(c.miss()).toBe(0);
    c.update(12);
    c.reset();
    expect(c.held).toBe(0);
  });

  it('builds the music up by layers, speeds it a touch with the run and darkens it on the last life', () => {
    const m0 = musicMood({ tier: 0 });
    const m3 = musicMood({ tier: 3, speedRatio: 2.5, lives: 1, ducked: true });
    expect(m0.layers).toEqual({ sparkle: false, clap: false, octave: false });
    expect(musicMood({ tier: 1 }).layers).toEqual({ sparkle: true, clap: false, octave: false });
    expect(m3.layers).toEqual({ sparkle: true, clap: true, octave: true });
    expect(m3.intensity).toBeGreaterThan(m0.intensity);
    expect(m3.tempo).toBeGreaterThan(1);
    expect(m3.tempo).toBeLessThanOrEqual(1.1);
    expect(m0.tempo).toBe(1);
    expect(m3.danger).toBeGreaterThan(0);
    expect(m3.duck).toBeLessThan(1);
    expect(m0.duck).toBe(1);
    expect(m3.intensity).toBeLessThanOrEqual(1);
  });

  it('lights the track from 10 and flourishes at 20, 30, 40', () => {
    expect([0, 9, 10, 19, 20].map(trackGlow)).toEqual([0, 0, 0.7, 0.7, 1]);
    expect([5, 10, 15, 20, 25, 30, 40].filter(isFlourish)).toEqual([20, 30, 40]);
  });
});
