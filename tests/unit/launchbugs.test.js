import { describe, it, expect, beforeEach } from 'vitest';
import { FlashcardMode } from '../../js/game/flashcardmode.js';
import { CARDS } from '../../js/cards.js';

let storage;
beforeEach(async () => {
  localStorage.clear();
  storage = (await import('../../js/storage.js')).storage;
  storage.load();
});

describe('flashcards: an explicit list keeps its order', () => {
  it('deals "most overdue first" exactly as given', () => {
    const ids = [];
    const seen = {};
    for (const c of CARDS) { if (!seen[c.ans]) { seen[c.ans] = 1; ids.push(c.id); } if (ids.length === 8) break; }
    const order = ids.slice().reverse();
    const fm = new FlashcardMode();
    const r = fm.start({ cardIds: order, cardCount: 5 });
    expect(r.success).toBe(true);
    expect(fm.cards.map((c) => c.id)).toEqual(order.slice(0, 5));
  });
});

describe('flashcards: revealedAt is the reveal time', () => {
  it('is stamped when the answer is shown, not when it is rated', () => {
    const fm = new FlashcardMode();
    fm.start({ cardCount: 2 });
    const t0 = Date.now();
    fm.reveal();
    const revealed = fm._revealedAt;
    expect(revealed).toBeGreaterThanOrEqual(t0);
    const spy = Date.now;
    Date.now = () => revealed + 5000;
    try { fm.rate('correct'); } finally { Date.now = spy; }
    expect(fm.results[0].revealedAt).toBe(revealed);
    expect(fm.results[0].ratedAt).toBe(revealed + 5000);
  });
});

describe('calendar day accuracy and cards studied', () => {
  it('day accuracy covers every run of the day, not the last one', () => {
    storage.addStudiedToday(10, 10);
    storage.addStudiedToday(10, 0);
    const key = storage.getTodayKey();
    expect(storage.data.history.calendarData[key]).toBe(50);
    expect(storage.data.history.dailyCorrect[key]).toBe(10);
  });
  it('a flashcard session adds its right answers to the calendar', () => {
    storage.finalizeFlashcardSession({ sessionId: 'f-1', total: 4, correct: 3, wrong: 1 });
    expect(storage.data.history.dailyCorrect[storage.getTodayKey()]).toBe(3);
  });
  it('exam answers count as cards studied', () => {
    const before = storage.data.progression.totalCardsStudied;
    storage.finalizeExamSession({ examId: 'e-1', date: '2026-11-23', total: 10, correct: 6, wrong: 4, accuracy: 60, durationSec: 60, bySubject: {}, cardResults: [] });
    expect(storage.data.progression.totalCardsStudied).toBe(before + 10);
  });
});
