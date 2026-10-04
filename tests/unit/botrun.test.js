import { describe, it, expect } from 'vitest';
import { parseBotArgs, pickConfig, maxScoreFor, checkRunEnd } from '../../tools/botrun.mjs';
import { makeRng } from '../../tools/soak.mjs';

describe('play bot helpers', () => {
  it('reads options', () => {
    const o = parseBotArgs(['--runs', '7', '--seed', '9', '--modes', 'endless,daily', '--url', 'http://x'], {});
    expect(o).toMatchObject({ runs: 7, seed: 9, modes: ['endless', 'daily'], url: 'http://x' });
  });
  it('the same seed makes the same runs', () => {
    const a = pickConfig(makeRng(5), ['endless', 'study']);
    const b = pickConfig(makeRng(5), ['endless', 'study']);
    expect(a).toEqual(b);
    expect(['endless', 'study']).toContain(a.mode);
    expect(a.skill).toBeGreaterThan(0);
  });
  it('the score ceiling grows with right answers and is generous', () => {
    expect(maxScoreFor(0)).toBeLessThan(100);
    expect(maxScoreFor(10)).toBeGreaterThan(10 * 16 * 12);
    expect(maxScoreFor(50)).toBeGreaterThan(maxScoreFor(10));
  });
  it('flags impossible results only', () => {
    expect(checkRunEnd({ score: 500, correct: 6, wrong: 2, encounters: 8 })).toEqual([]);
    expect(checkRunEnd({ score: 9e9, correct: 6, wrong: 2, encounters: 8 }).join()).toMatch(/earn/);
    expect(checkRunEnd({ score: -1, correct: 0, wrong: 0, encounters: 0 }).join()).toMatch(/final score/);
    expect(checkRunEnd({ score: 1, correct: 5, wrong: 5, encounters: 3 }).join()).toMatch(/exceed/);
    expect(checkRunEnd({ score: 1, correct: 1, wrong: 0, encounters: 3, encountersSaved: 2 }).join()).toMatch(/save counted/);
  });
});
