import { describe, it, expect } from 'vitest';
import {
  resolveQuality, lowerTier, maxPixelRatio, createAdaptiveResolution, stepAdaptiveResolution
} from '../../js/game/quality.js';

describe('graphics tier', () => {
  it('honours an explicit choice over device hints', () => {
    expect(resolveQuality('low', { deviceMemory: 16, cores: 16 })).toBe('low');
    expect(resolveQuality('medium', { deviceMemory: 16, cores: 16 })).toBe('medium');
    expect(resolveQuality('high', { deviceMemory: 1, cores: 1, saveData: true, perfHint: 'low', software: true })).toBe('high');
  });

  it('auto picks high on a capable desktop or laptop', () => {
    expect(resolveQuality('auto', { deviceMemory: 8, cores: 8 })).toBe('high');
    expect(resolveQuality('auto', {})).toBe('high');
  });

  it('auto picks medium for modest devices and phones', () => {
    expect(resolveQuality('auto', { deviceMemory: 4, cores: 8 })).toBe('medium');
    expect(resolveQuality('auto', { deviceMemory: 8, cores: 4 })).toBe('medium');
    expect(resolveQuality('auto', { deviceMemory: 8, cores: 8, touchFirst: true })).toBe('medium');
  });

  it('auto picks low for very weak devices, data saver and software rendering', () => {
    expect(resolveQuality('auto', { deviceMemory: 2 })).toBe('low');
    expect(resolveQuality('auto', { cores: 2 })).toBe('low');
    expect(resolveQuality('auto', { saveData: true })).toBe('low');
    expect(resolveQuality('auto', { software: true, deviceMemory: 8, cores: 8 })).toBe('low');
  });

  it('a performance hint only ever lowers the tier', () => {
    expect(resolveQuality('auto', { deviceMemory: 8, cores: 8, perfHint: 'medium' })).toBe('medium');
    expect(resolveQuality('auto', { deviceMemory: 8, cores: 8, perfHint: 'low' })).toBe('low');
    expect(resolveQuality('auto', { deviceMemory: 2, perfHint: 'high' })).toBe('low');
  });

  it('steps down one tier at a time', () => {
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBe('low');
  });

  it('caps the render resolution by tier', () => {
    expect(maxPixelRatio('high', 3)).toBe(2);
    expect(maxPixelRatio('medium', 3)).toBe(1.5);
    expect(maxPixelRatio('low', 3)).toBe(1);
    expect(maxPixelRatio('high', 1)).toBe(1);
  });
});

describe('adaptive resolution', () => {
  const run = (state, ms, frames, start = 10000) => {
    let out = null;
    for (let i = 0; i < frames; i++) {
      const r = stepAdaptiveResolution(state, ms, start + i * ms);
      if (r !== null) out = r;
    }
    return out;
  };

  it('steps the resolution down when frames are slow, and back up when fast', () => {
    const st = createAdaptiveResolution();
    expect(run(st, 40, 100)).toBe(0.85);
    expect(run(st, 40, 100, 20000)).toBe(0.7);
    // Fast frames step it back up, one level per decision (windows overlap, so allow a few rounds)
    const ups = [];
    for (let k = 0; k < 6; k++) {
      const r = run(st, 8, 100, 40000 + k * 20000);
      if (r !== null) ups.push(r);
    }
    expect(ups).toEqual([0.85, 1]);
    expect(st.level).toBe(0);
    expect(run(st, 8, 100, 200000)).toBeNull(); // already at full
  });

  it('holds steady in the comfortable middle and ignores stalls', () => {
    const st = createAdaptiveResolution();
    expect(run(st, 16, 300)).toBeNull();
    expect(run(st, 900, 300, 30000)).toBeNull(); // tab-switch stalls are not "slow"
  });

  it('never goes below the lowest level and waits between changes', () => {
    const st = createAdaptiveResolution();
    let last = null;
    for (let round = 0; round < 8; round++) {
      const r = run(st, 60, 100, 10000 + round * 20000);
      if (r !== null) last = r;
    }
    expect(last).toBe(0.6);
    const quick = createAdaptiveResolution();
    expect(run(quick, 40, 90, 10000)).toBe(0.85);
    expect(run(quick, 40, 90, 10100)).toBeNull(); // inside the cooldown
  });
});
