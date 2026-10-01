import { describe, it, expect } from 'vitest';
import { xpForRun, xpForLevel, xpAtLevel, levelFromXp, nearMissLine, dailyReward, dailyTrack } from '../../js/progress.js';

describe('xp and levels', () => {
  it('pays for answers, with a bonus for a long streak', () => {
    expect(xpForRun({ correct: 0, wrong: 0, bestStreak: 0 })).toBe(0);
    expect(xpForRun({ correct: 5, wrong: 2, bestStreak: 3 })).toBe(5 * 10 + 3 * 3 + 5);
    expect(xpForRun({ correct: 0, wrong: 3, bestStreak: 0 })).toBe(5); // trying still counts
    expect(xpForRun(null)).toBe(0);
  });

  it('gets steadily harder to level up, without a wall', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(140);
    expect(xpForLevel(10)).toBeLessThan(500);
    expect(xpAtLevel(1)).toBe(0);
    expect(xpAtLevel(3)).toBe(240);
  });

  it('turns total xp into a level and progress', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: 100, fraction: 0 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toMatchObject({ level: 2, into: 0 });
    expect(levelFromXp(170)).toMatchObject({ level: 2, into: 70, needed: 140 });
    expect(levelFromXp(-5).level).toBe(1);
    // the level and the xp that starts it always agree
    for (let lv = 1; lv < 30; lv++) expect(levelFromXp(xpAtLevel(lv)).level).toBe(lv);
  });

  it('nudges only when the player was close to their best', () => {
    expect(nearMissLine(900, 1000)).toBe('So close! 100 points from your best.');
    expect(nearMissLine(999, 1000)).toBe('So close! 1 point from your best.');
    expect(nearMissLine(500, 1000)).toBe('');
    expect(nearMissLine(1200, 1000)).toBe('');
    expect(nearMissLine(50, 0)).toBe('');
  });
});

describe('daily reward track', () => {
  it('pays a known amount on days 1 to 6, rising each day', () => {
    const coins = [1, 2, 3, 4, 5, 6].map((s) => dailyReward(s).coins);
    expect(coins).toEqual([10, 20, 30, 50, 75, 100]);
    expect(dailyReward(3).chest).toBe(false);
  });

  it('makes day 7 a chest that never pays less than day 6', () => {
    for (const r of [0, 0.3, 0.999, 1]) {
      const d = dailyReward(7, () => r);
      expect(d).toMatchObject({ day: 7, chest: true });
      expect(d.coins).toBeGreaterThanOrEqual(150);
      expect(d.coins).toBeLessThanOrEqual(300);
    }
    expect(dailyReward(7, () => 0).coins).toBe(150);
    expect(dailyReward(7, () => 1).coins).toBe(300);
  });

  it('repeats every seven days and shows the whole track', () => {
    expect(dailyReward(8).day).toBe(1);
    expect(dailyReward(14, () => 0.5).chest).toBe(true);
    expect(dailyReward(0).day).toBe(1);
    expect(dailyTrack()).toEqual([10, 20, 30, 50, 75, 100, null]);
  });
});
