import { describe, it, expect } from 'vitest';
import { parseArgs, makeRng, keepsClimbing } from '../../tools/soak.mjs';

describe('soak bot helpers', () => {
  it('reads options from the command line and the environment', () => {
    expect(parseArgs(['--minutes', '45', '--seed', '7', '--url', 'http://x'], {})).toMatchObject({ minutes: 45, seed: 7, url: 'http://x' });
    expect(parseArgs([], { SOAK_MINUTES: '5' }).minutes).toBe(5);
    expect(parseArgs([], {}).minutes).toBe(30);
  });

  it('plays the same inputs for the same seed', () => {
    const a = makeRng(42); const b = makeRng(42); const c = makeRng(43);
    const seq = (r) => Array.from({ length: 5 }, () => r());
    expect(seq(a)).toEqual(seq(b));
    expect(seq(makeRng(42))).not.toEqual(seq(c));
    seq(makeRng(1)).forEach((x) => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); });
  });

  it('flags a steady climb but not noise or a flat line', () => {
    const climbing = Array.from({ length: 30 }, (_, i) => 100 + i * 20);
    const flat = Array.from({ length: 30 }, (_, i) => 200 + (i % 3));
    const noisy = Array.from({ length: 30 }, (_, i) => 200 + (i % 2 ? 30 : -30));
    const small = Array.from({ length: 30 }, (_, i) => 2 + i * 0.2); // doubles, but only by a few
    expect(keepsClimbing(climbing)).toBe(true);
    expect(keepsClimbing(flat)).toBe(false);
    expect(keepsClimbing(noisy)).toBe(false);
    expect(keepsClimbing(small)).toBe(false);
    expect(keepsClimbing([1, 2, 3])).toBe(false); // too few samples to say
  });
});
