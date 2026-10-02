import { describe, it, expect, beforeEach } from 'vitest';
import { pickCard } from '../../js/game/gates.js';

let storage;

beforeEach(async () => {
  localStorage.clear();
  storage = (await import('../../js/storage.js')).storage;
  storage.load();
});

function card(id, ans, extra) {
  return Object.assign({
    id, subj: 'Neurology', bw: ['a', 'b'], ans, d: ['x', 'y'], tp: 't', ww: {},
    questionType: 'buzzword_dx', baseDifficulty: 2, yr: 2, exams: [], source: 'clinical_medicine'
  }, extra);
}

describe('spaced repetition schedule', () => {
  it('pushes correct answers further out and brings misses back within minutes', () => {
    const DAY = 24 * 60 * 60 * 1000;
    storage.updateCardStat('c1', true);
    let s = storage.getCardStat('c1');
    expect(s.interval).toBe(3); // FSRS: the first "Good" is about three days
    expect(s.due - s.lastSeen).toBe(3 * DAY);

    // later reviews, on the day each is due, keep stretching the interval
    let last = { interval: s.interval };
    for (let i = 0; i < 2; i++) {
      s = storage.data.cards.cardStats.c1;
      s.lastReview -= s.interval * DAY; s.lastSeen -= s.interval * DAY;
      storage.updateCardStat('c1', true);
      expect(storage.getCardStat('c1').interval).toBeGreaterThan(last.interval);
      last = { interval: storage.getCardStat('c1').interval };
    }

    storage.updateCardStat('c1', false);
    s = storage.getCardStat('c1');
    expect(s.interval).toBe(0);
    expect(s.due - s.lastSeen).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('counts only previously studied cards whose review is due', () => {
    storage.updateCardStat('due', false);
    storage.data.cards.cardStats.due.due = Date.now() - 1000;
    storage.updateCardStat('later', true);
    expect(storage.getDueCount()).toBe(1);
    expect(storage.getDueCount(['later'])).toBe(0);
  });
});

describe('card selection', () => {
  it('returns a missed card that is queued for retry', () => {
    const pool = [card('a', 'A'), card('b', 'B'), card('c', 'C')];
    const result = pickCard({ pool, recentIds: [], mode: 'endless', encounterIndex: 5, retryIds: ['b'], rng: () => 0 });
    expect(result.card.id).toBe('b');
    expect(result.wasRetry).toBe(true);
  });

  it('does not apply retries to the fixed daily challenge', () => {
    const pool = [card('a', 'A'), card('b', 'B')];
    const result = pickCard({ pool, recentIds: [], mode: 'daily', encounterIndex: 0, retryIds: ['b'], rng: () => 0 });
    expect(result.wasRetry).toBeUndefined();
  });

  it('avoids repeating the same diagnosis back to back', () => {
    // Two cards share an answer; after one was shown, the other should be rare.
    const pool = [card('a1', 'Stroke'), card('a2', 'Stroke'), card('z', 'Migraine')];
    let sameAnswer = 0;
    for (let i = 0; i < 300; i++) {
      const r = pickCard({ pool, recentIds: ['a1'], mode: 'endless', encounterIndex: 5, rng: Math.random });
      if (r.card.ans === 'Stroke') sameAnswer++;
    }
    expect(sameAnswer).toBeLessThan(60);
  });
});

describe('daily study goal', () => {
  it('accumulates cards studied today', () => {
    expect(storage.getStudiedToday()).toBe(0);
    storage.addStudiedToday(7);
    storage.addStudiedToday(3);
    expect(storage.getStudiedToday()).toBe(10);
  });
});

describe('weekly seasons', () => {
  it('uses ISO week keys', async () => {
    const { leaderboard } = await import('../../js/leaderboard.js');
    expect(leaderboard.getSeasonKey(new Date(Date.UTC(2026, 8, 29)))).toBe('2026-W40');
    expect(leaderboard.getSeasonKey(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01');
    // ISO edge case: Jan 1 2027 belongs to week 53 of 2026
    expect(leaderboard.getSeasonKey(new Date(Date.UTC(2027, 0, 1)))).toBe('2026-W53');
  });
});
