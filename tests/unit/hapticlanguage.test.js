import { describe, it, expect } from 'vitest';
import { HAPTIC_PATTERNS } from '../../js/audio.js';

describe('the haptic language', () => {
  const flat = [];
  Object.keys(HAPTIC_PATTERNS).forEach((k) => {
    const v = HAPTIC_PATTERNS[k];
    if (Array.isArray(v[0])) v.forEach((p, i) => flat.push([k + i, p])); else flat.push([k, v]);
  });

  it('gives every moment its own pattern, no two alike', () => {
    const seen = {};
    flat.forEach(([name, p]) => {
      const key = p.join(',');
      expect(seen[key], name + ' feels the same as ' + seen[key]).toBeUndefined();
      seen[key] = name;
    });
  });

  it('keeps every pattern short and safe to feel (under a second and a half)', () => {
    flat.forEach(([name, p]) => {
      expect(p.every((n) => Number.isFinite(n) && n > 0), name).toBe(true);
      expect(p.reduce((a, b) => a + b, 0), name).toBeLessThan(1500);
    });
  });

  it('makes wrong feel heavier and longer than right, and bigger streaks longer than small ones', () => {
    const total = (p) => p.reduce((a, b) => a + b, 0);
    expect(total(HAPTIC_PATTERNS.wrong)).toBeGreaterThan(total(HAPTIC_PATTERNS.correct) * 3);
    const [a, b, c] = HAPTIC_PATTERNS.streak.map(total);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(total(HAPTIC_PATTERNS.promotion)).toBeGreaterThan(total(HAPTIC_PATTERNS.level_up));
  });
});
