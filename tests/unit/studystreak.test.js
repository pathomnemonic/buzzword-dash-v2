import { describe, it, expect } from 'vitest';
import { dayNumber, keyOfDay, daysBetween, advanceStudyStreak, liveStudyStreak, deriveStreakFromCounts, MAX_SHIELDS } from '../../js/studystreak.js';
import { makeRng } from '../../tools/soak.mjs';

const state = (o) => Object.assign({ streak: 0, last: null, shields: 0, best: 0 }, o);
const k = (n) => keyOfDay(20000 + n); // a run of consecutive keys

describe('day arithmetic', () => {
  it('reads real calendar dates and rejects everything else', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2028-02-29')).not.toBeNaN(); // a leap day
    ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '26-01-01', '0050-01-01', '', null, undefined, 20260101, {}, 'Sun Oct 04 2026'].forEach((bad) => {
      expect(dayNumber(bad), String(bad)).toBeNaN();
    });
  });

  it('round-trips through keyOfDay, month ends, year ends and leap years included', () => {
    for (let n = 0; n < 40000; n += 7) expect(dayNumber(keyOfDay(n))).toBe(n);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2026-10-04', '2026-10-01')).toBe(-3);
    expect(daysBetween('nope', '2026-10-01')).toBeNaN();
  });
});

describe('advanceStudyStreak', () => {
  it('the first study day starts a streak at 1', () => {
    const r = advanceStudyStreak(state(), '2026-10-04');
    expect(r).toMatchObject({ streak: 1, last: '2026-10-04', best: 1, counted: true, shieldUsed: false });
  });

  it('studying again the same day changes nothing', () => {
    const a = advanceStudyStreak(state({ streak: 3, last: '2026-10-04', best: 5 }), '2026-10-04');
    expect(a).toMatchObject({ streak: 3, last: '2026-10-04', best: 5, counted: false });
  });

  it('the next day adds one, even across a month and a year end', () => {
    expect(advanceStudyStreak(state({ streak: 3, last: '2026-09-30' }), '2026-10-01').streak).toBe(4);
    expect(advanceStudyStreak(state({ streak: 9, last: '2026-12-31' }), '2027-01-01').streak).toBe(10);
    expect(advanceStudyStreak(state({ streak: 2, last: '2028-02-28' }), '2028-02-29').streak).toBe(3);
  });

  it('a missed day is covered by a shield, which is spent', () => {
    const r = advanceStudyStreak(state({ streak: 4, last: '2026-10-02', shields: 2 }), '2026-10-04');
    expect(r).toMatchObject({ streak: 5, shields: 1, shieldUsed: true, last: '2026-10-04' });
  });

  it('two missed days are not covered, whatever the shields', () => {
    const r = advanceStudyStreak(state({ streak: 4, last: '2026-10-01', shields: 3 }), '2026-10-04');
    expect(r).toMatchObject({ streak: 1, shields: 3, shieldUsed: false });
  });

  it('a missed day without a shield ends the streak but keeps the best', () => {
    const r = advanceStudyStreak(state({ streak: 4, last: '2026-10-02', best: 6 }), '2026-10-04');
    expect(r).toMatchObject({ streak: 1, best: 6 });
  });

  it('earns a shield on every 7th day, up to three', () => {
    let s = state({ streak: 6, last: '2026-10-03' });
    let r = advanceStudyStreak(s, '2026-10-04');
    expect(r).toMatchObject({ streak: 7, shields: 1, shieldEarned: true });
    r = advanceStudyStreak(state({ streak: 13, last: '2026-10-03', shields: 2 }), '2026-10-04');
    expect(r).toMatchObject({ streak: 14, shields: 3, shieldEarned: true });
    r = advanceStudyStreak(state({ streak: 20, last: '2026-10-03', shields: MAX_SHIELDS }), '2026-10-04');
    expect(r).toMatchObject({ streak: 21, shields: MAX_SHIELDS, shieldEarned: false });
  });

  it('a clock that is behind the last counted day adds nothing and loses nothing', () => {
    const before = state({ streak: 8, last: '2026-10-10', shields: 1, best: 8 });
    [ '2026-10-09', '2026-10-05', '2025-01-01' ].forEach((today) => {
      const r = advanceStudyStreak(before, today);
      expect(r).toMatchObject({ streak: 8, last: '2026-10-10', shields: 1, counted: false });
    });
  });

  it('survives damaged saved values', () => {
    const r = advanceStudyStreak({ streak: NaN, last: 'garbage', shields: -4, best: 'x' }, '2026-10-04');
    expect(r).toMatchObject({ streak: 1, last: '2026-10-04', shields: 0, best: 1 });
    expect(advanceStudyStreak({ streak: 3, last: '2026-10-03', shields: 99 }, 'not a date')).toMatchObject({ streak: 3, last: '2026-10-03', counted: false, shields: MAX_SHIELDS });
    expect(() => advanceStudyStreak(undefined, '2026-10-04')).not.toThrow();
  });

  it('matches a simple day-by-day model over thousands of random histories', () => {
    const rng = makeRng(2026);
    for (let trial = 0; trial < 400; trial++) {
      let s = state();
      let model = { streak: 0, shields: 0, last: -99 };
      for (let day = 0; day < 120; day++) {
        // study on 70% of the days, with the occasional long break
        const studies = rng() < 0.7;
        if (!studies) continue;
        s = advanceStudyStreak(s, k(day));
        // the reference: walk the days one at a time
        const gap = day - model.last;
        if (model.last < 0 || gap > 2 || (gap === 2 && model.shields === 0)) model.streak = 1;
        else if (gap === 2) { model.shields--; model.streak++; }
        else if (gap === 1) model.streak++;
        if (gap > 0 || model.last < 0) {
          if (model.streak % 7 === 0 && model.shields < 3) model.shields++;
          model.last = day;
        }
        expect(s.streak).toBe(model.streak);
        expect(s.shields).toBe(model.shields);
        expect(s.shields).toBeGreaterThanOrEqual(0);
        expect(s.shields).toBeLessThanOrEqual(3);
        expect(s.best).toBeGreaterThanOrEqual(s.streak);
        expect(s.streak).toBeLessThanOrEqual(day + 1);
      }
    }
  });
});

describe('liveStudyStreak', () => {
  const today = '2026-10-04';
  it('is live on the day, and at risk the day after', () => {
    expect(liveStudyStreak(state({ streak: 5, last: '2026-10-04' }), today)).toEqual({ streak: 5, playedToday: true, atRisk: false });
    expect(liveStudyStreak(state({ streak: 5, last: '2026-10-03' }), today)).toEqual({ streak: 5, playedToday: false, atRisk: true });
  });
  it('a shield keeps a one-day gap alive; two days is over', () => {
    expect(liveStudyStreak(state({ streak: 5, last: '2026-10-02', shields: 1 }), today).streak).toBe(5);
    expect(liveStudyStreak(state({ streak: 5, last: '2026-10-02', shields: 0 }), today).streak).toBe(0);
    expect(liveStudyStreak(state({ streak: 5, last: '2026-10-01', shields: 3 }), today).streak).toBe(0);
  });
  it('a last day in the future (the clock moved back) still shows the streak', () => {
    expect(liveStudyStreak(state({ streak: 5, last: '2026-10-09' }), today)).toEqual({ streak: 5, playedToday: true, atRisk: false });
  });
  it('reads nothing as zero', () => {
    expect(liveStudyStreak(state(), today).streak).toBe(0);
    expect(liveStudyStreak(state({ streak: 4, last: 'bad' }), today).streak).toBe(0);
    expect(liveStudyStreak(undefined, today).streak).toBe(0);
  });
});

describe('deriveStreakFromCounts', () => {
  const today = '2026-10-04';
  it('counts the run that ends today or yesterday', () => {
    expect(deriveStreakFromCounts({ '2026-10-04': 1, '2026-10-03': 5, '2026-10-02': 2, '2026-09-30': 9 }, today)).toEqual({ streak: 3, last: '2026-10-04', best: 3 });
    expect(deriveStreakFromCounts({ '2026-10-03': 5, '2026-10-02': 2 }, today)).toEqual({ streak: 2, last: '2026-10-03', best: 2 });
  });
  it('a run that ended before yesterday is not a streak, but is the best', () => {
    expect(deriveStreakFromCounts({ '2026-10-01': 4, '2026-09-30': 4, '2026-09-29': 4 }, today)).toEqual({ streak: 0, last: null, best: 3 });
  });
  it('ignores zero counts, bad keys and days in the future', () => {
    const r = deriveStreakFromCounts({ '2026-10-04': 0, '2026-10-03': 2, 'junk': 5, '2026-10-09': 7, '2026-02-30': 3 }, today);
    expect(r).toMatchObject({ streak: 1, last: '2026-10-03' });
  });
  it('copes with nothing at all', () => {
    expect(deriveStreakFromCounts({}, today)).toEqual({ streak: 0, last: null, best: 0 });
    expect(deriveStreakFromCounts(null, today)).toEqual({ streak: 0, last: null, best: 0 });
    expect(deriveStreakFromCounts({ '2026-10-04': 1 }, 'bad').streak).toBe(0);
  });
});
