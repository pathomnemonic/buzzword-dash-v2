import { describe, it, expect } from 'vitest';
import { rankForLevel, RANKS, bonusSubjectFor, bonusCoinsFor, BONUS_COINS_CAP, nextGoalLine, levelFromXp } from '../../js/progress.js';

describe('ranks and prestige', () => {
  it('climbs the medical ladder and then adds stars', () => {
    expect(rankForLevel(1).title).toBe('Intern');
    expect(rankForLevel(4).title).toBe('Intern');
    expect(rankForLevel(5).title).toBe('Resident');
    expect(rankForLevel(20).title).toBe('Attending');
    expect(rankForLevel(49).title).toBe('Chief');
    expect(rankForLevel(50)).toMatchObject({ title: 'Dean', stars: 1, label: 'Dean ★' });
    expect(rankForLevel(74).stars).toBe(1);
    expect(rankForLevel(75).label).toBe('Dean ★★');
    expect(rankForLevel(0).title).toBe('Intern');
    expect(rankForLevel(NaN).title).toBe('Intern');
    expect(RANKS.map((r) => r.level)).toEqual([...RANKS.map((r) => r.level)].sort((a, b) => a - b));
  });
});

describe('the subject of the day', () => {
  const subjects = ['Cardiology', 'Neurology', 'Renal', 'Pulm', 'GI'];
  it('is the same for everyone on a date, and never the same two days running', () => {
    expect(bonusSubjectFor('2026-10-03', subjects)).toBe(bonusSubjectFor('2026-10-03', subjects));
    for (let d = 1; d < 29; d++) {
      const a = bonusSubjectFor('2026-02-' + String(d).padStart(2, '0'), subjects);
      const b = bonusSubjectFor('2026-02-' + String(d + 1).padStart(2, '0'), subjects);
      expect(a).not.toBe(b);
      expect(subjects).toContain(a);
    }
    expect(bonusSubjectFor('2026-10-03', [])).toBe('');
  });
  it('pays a little for each right answer and stops at the daily cap', () => {
    expect(bonusCoinsFor(5, 0)).toBe(20);
    expect(bonusCoinsFor(100, 0)).toBe(BONUS_COINS_CAP);
    expect(bonusCoinsFor(10, BONUS_COINS_CAP - 8)).toBe(8);
    expect(bonusCoinsFor(10, BONUS_COINS_CAP)).toBe(0);
    expect(bonusCoinsFor(-3, 0)).toBe(0);
  });
});

describe('the next small goal after a run', () => {
  const base = { score: 500, best: 520, xp: 0, coins: 100, dailyDone: 18, dailyGoal: 20, cheapestWanted: { name: 'EKG Line', price: 500 } };
  it('names the closest goal', () => {
    expect(nextGoalLine(base)).toMatch(/20 points from your best score|2 more cards/);
    expect(nextGoalLine({ ...base, score: 100, best: 5000 })).toMatch(/2 more cards to reach today/);
  });
  it('talks about coins when that is closest', () => {
    const line = nextGoalLine({ ...base, score: 100, best: 5000, dailyDone: 0, xp: 0, coins: 480 });
    expect(line).toMatch(/20 🪙 from the EKG Line/);
  });
  it('uses the level when it is close, and says nothing when nothing is near', () => {
    expect(nextGoalLine({ score: 0, best: 0, xp: 95, coins: 0, dailyDone: 0, dailyGoal: 0 })).toMatch(/5 XP to level 2/);
    expect(typeof nextGoalLine({ score: 0, best: 0, xp: 0, coins: 0, dailyDone: 20, dailyGoal: 20 })).toBe('string');
    expect(levelFromXp(95).level).toBe(1);
  });
});
