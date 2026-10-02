import { describe, it, expect, beforeEach } from 'vitest';
import * as fsrs from '../../js/fsrs.js';
import { estimateReadiness, examPace, daysUntil } from '../../js/readiness.js';
import { storage } from '../../js/storage.js';

const DAY = fsrs.DAY_MS;

describe('FSRS model', () => {
  it('has the 19 published default weights', () => {
    expect(fsrs.DEFAULT_WEIGHTS.length).toBe(19);
  });

  it('forgetting curve: stability is the time to fall to 90%', () => {
    expect(fsrs.retrievability(0, 5)).toBeCloseTo(1, 10);
    expect(fsrs.retrievability(5, 5)).toBeCloseTo(0.9, 6);
    expect(fsrs.retrievability(50, 5)).toBeLessThan(fsrs.retrievability(10, 5));
  });

  it('interval at 90% retention equals the stability', () => {
    expect(fsrs.intervalFor(3.173, 0.9)).toBeCloseTo(3.173, 3);
    expect(fsrs.intervalFor(10, 0.8)).toBeGreaterThan(fsrs.intervalFor(10, 0.95));
  });

  it('first review values match the published model', () => {
    expect(fsrs.initialStability(3)).toBeCloseTo(3.173, 4);
    expect(fsrs.initialStability(1)).toBeCloseTo(0.40255, 4);
    expect(fsrs.initialDifficulty(3)).toBeCloseTo(5.28, 1);
    expect(fsrs.initialDifficulty(1)).toBeGreaterThan(fsrs.initialDifficulty(3));
  });

  it('a right answer pushes the next review out, a miss brings it back within minutes', () => {
    const t0 = 1_700_000_000_000;
    const a = fsrs.review(null, true, t0);
    expect(a.intervalDays).toBe(3);
    expect(a.due).toBe(t0 + 3 * DAY);
    const b = fsrs.review(a, true, a.due);
    expect(b.stability).toBeGreaterThan(a.stability);
    expect(b.intervalDays).toBeGreaterThan(a.intervalDays);
    const c = fsrs.review(b, false, b.due);
    expect(c.stability).toBeLessThan(b.stability);
    expect(c.due - b.due).toBe(fsrs.RELEARN_MINUTES * 60 * 1000);
    expect(c.difficulty).toBeGreaterThan(b.difficulty);
  });

  it('answering right on every due date grows the interval the way FSRS-5 does (3, 11, 35 days...)', () => {
    let m = fsrs.review(null, true, 0);
    const days = [m.intervalDays];
    for (let i = 0; i < 2; i++) { m = fsrs.review(m, true, m.due); days.push(m.intervalDays); }
    expect(days).toEqual([3, 11, 35]);
  });

  it('reviewing early adds less stability than reviewing on time', () => {
    const t0 = 1_700_000_000_000;
    const m = fsrs.review(fsrs.review(null, true, t0), true, t0 + 3 * DAY);
    const early = fsrs.review(m, true, m.lastReview + 1.2 * DAY);
    const late = fsrs.review(m, true, m.lastReview + m.intervalDays * DAY);
    expect(late.stability).toBeGreaterThan(early.stability);
  });

  it('difficulty stays between 1 and 10', () => {
    let m = fsrs.review(null, false, 0);
    let t = 0;
    for (let i = 0; i < 60; i++) { t += 2 * DAY; m = fsrs.review(m, false, t); expect(m.difficulty).toBeLessThanOrEqual(10); expect(m.difficulty).toBeGreaterThanOrEqual(1); }
    for (let i = 0; i < 60; i++) { t += 2 * DAY; m = fsrs.review(m, true, t); expect(m.difficulty).toBeGreaterThanOrEqual(1); }
  });

  it('a second look on the same day changes stability only a little', () => {
    const t0 = 1_700_000_000_000;
    const a = fsrs.review(null, true, t0);
    const b = fsrs.review(a, true, t0 + 60 * 1000);
    expect(b.stability / a.stability).toBeLessThan(2);
    expect(b.stability / a.stability).toBeGreaterThan(0.5);
  });

  it('converts an old SM-2 card without losing its interval', () => {
    const m = fsrs.fromLegacy({ seen: 8, correct: 7, wrong: 1, interval: 21, ease: 2.5, lastSeen: 5 });
    expect(m.stability).toBe(21);
    expect(m.difficulty).toBeGreaterThanOrEqual(1);
    expect(m.difficulty).toBeLessThanOrEqual(10);
    expect(fsrs.fromLegacy({ seen: 0 })).toBeNull();
  });
});

describe('storage uses FSRS', () => {
  beforeEach(() => { localStorage.clear(); storage.data = null; storage.load(); });

  it('first correct answer: due in 3 days with memory fields stored', () => {
    storage.updateCardStat('x1', true);
    const s = storage.getCardStat('x1');
    expect(s.stability).toBeCloseTo(3.173, 3);
    expect(s.interval).toBe(3);
    expect(s.due - s.lastSeen).toBe(3 * DAY);
  });

  it('a miss makes the card due within minutes', () => {
    storage.updateCardStat('x2', false);
    const s = storage.getCardStat('x2');
    expect(s.due - s.lastSeen).toBe(10 * 60 * 1000);
  });

  it('an old-schedule card is converted on its next review', () => {
    storage.data.cards.cardStats.old = { seen: 6, correct: 6, wrong: 0, lastSeen: Date.now() - 20 * DAY, interval: 20, ease: 2.5, reps: 5, due: Date.now() - DAY };
    storage.updateCardStat('old', true);
    const s = storage.getCardStat('old');
    expect(s.stability).toBeGreaterThan(20);
    expect(s.seen).toBe(7);
  });

  it('target retention changes the interval', () => {
    storage.set('targetRetention', 0.8);
    storage.updateCardStat('r1', true);
    const a = storage.getCardStat('r1').interval;
    storage.set('targetRetention', 0.95);
    storage.updateCardStat('r2', true);
    expect(a).toBeGreaterThan(storage.getCardStat('r2').interval);
  });
});

describe('readiness and exam pace', () => {
  const cards = Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, subj: i < 20 ? 'Cardiology' : 'Renal' }));
  const now = 1_700_000_000_000;

  it('says nothing until enough is studied', () => {
    expect(estimateReadiness({ cardStats: {}, cards, now }).overall).toBeNull();
  });

  it('is high right after review and falls as time passes', () => {
    const stats = {};
    cards.forEach((c) => { stats[c.id] = { seen: 3, correct: 3, wrong: 0, stability: 10, difficulty: 5, lastReview: now }; });
    const fresh = estimateReadiness({ cardStats: stats, cards, now });
    const later = estimateReadiness({ cardStats: stats, cards, now: now + 60 * DAY });
    expect(fresh.overall).toBeGreaterThan(0.99);
    expect(later.overall).toBeLessThan(fresh.overall);
    expect(fresh.coverage).toBe(1);
    expect(fresh.subjects.map((s) => s.subject).sort()).toEqual(['Cardiology', 'Renal']);
  });

  it('counts days to a date and paces the new cards', () => {
    const d = new Date(now);
    const key = (n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    expect(daysUntil(key(10), now)).toBe(10);
    expect(daysUntil('nonsense', now)).toBeNull();
    const p = examPace({ examDate: key(12), unseen: 100, due: 0, dailyGoal: 20, now });
    expect(p.perDay).toBe(10);
    expect(examPace({ examDate: key(-1), unseen: 5, due: 0, now }).text).toMatch(/passed/);
    expect(examPace({ examDate: '', unseen: 5, due: 0, now })).toBeNull();
  });
});

describe('one-time migration to FSRS', () => {
  it('converts every old card on load, once, and keeps their due dates', () => {
    localStorage.clear(); storage.data = null; storage.load();
    storage.data.cards.cardStats.m1 = { seen: 6, correct: 6, wrong: 0, lastSeen: 1000, interval: 14, ease: 2.5, reps: 5, due: 5000 };
    storage.data.cards.cardStats.m2 = { seen: 0 };
    storage.data.settings.fsrsMigrated = false;
    storage._ensureInvariants();
    const s = storage.data.cards.cardStats;
    expect(s.m1.stability).toBe(14);
    expect(s.m1.due).toBe(5000);
    expect(s.m2.stability).toBeUndefined();
    expect(storage.data.settings.fsrsMigrated).toBe(true);
    s.m1.stability = 99; storage._ensureInvariants();
    expect(s.m1.stability).toBe(99); // not run again
  });
});
