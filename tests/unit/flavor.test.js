import { describe, it, expect } from 'vitest';
import { streakCallout, runVerdict, loadingLine } from '../../js/flavor.js';

describe('flavor copy', () => {
  it('gives callouts only on milestone streaks', () => {
    expect(streakCallout(5)).toBe('High-yield!');
    expect(streakCallout(6)).toBe('');
    expect(streakCallout(20)).toBe('Zebra spotted!');
  });

  it('gives a verdict for every accuracy band', () => {
    expect(runVerdict(0, 0)).toBe('Flatlined.');
    expect(runVerdict(8, 0)).toBe('Clean list.');
    expect(runVerdict(2, 0)).toBe('Strong differential.');
    expect(runVerdict(9, 1)).toBe('Strong differential.');
    expect(runVerdict(7, 3)).toBe('Stable. Keep running.');
    expect(runVerdict(5, 5)).toBe('Missed a few Dx.');
    expect(runVerdict(1, 9)).toBe('Code blue. Review the list.');
  });

  it('picks a loading line in range', () => {
    expect(loadingLine(() => 0)).toBe('Taking a history…');
    expect(loadingLine(() => 0.999999)).toBe('Paging the attending…');
    expect(typeof loadingLine()).toBe('string');
  });
});
