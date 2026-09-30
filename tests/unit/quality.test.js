import { describe, it, expect } from 'vitest';
import { resolveQuality } from '../../js/game/quality.js';

describe('graphics tier', () => {
  it('honours an explicit choice over device hints', () => {
    expect(resolveQuality('low', { deviceMemory: 16, cores: 16 })).toBe('low');
    expect(resolveQuality('high', { deviceMemory: 1, cores: 1, saveData: true, perfHint: 'low', software: true })).toBe('high');
  });

  it('auto picks high on a capable device', () => {
    expect(resolveQuality('auto', { deviceMemory: 8, cores: 8 })).toBe('high');
    expect(resolveQuality('auto', {})).toBe('high');
  });

  it('auto drops to low on weak devices, data saver, or after slow frames', () => {
    expect(resolveQuality('auto', { deviceMemory: 2 })).toBe('low');
    expect(resolveQuality('auto', { cores: 2 })).toBe('low');
    expect(resolveQuality('auto', { saveData: true })).toBe('low');
    expect(resolveQuality('auto', { perfHint: 'low' })).toBe('low');
    expect(resolveQuality('auto', { software: true, deviceMemory: 8, cores: 8 })).toBe('low');
  });
});
