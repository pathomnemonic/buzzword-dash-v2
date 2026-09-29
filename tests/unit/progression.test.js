import { describe, it, expect, beforeEach } from 'vitest';
import { FlashcardMode } from '../../js/game/flashcardmode.js';

let storage;

beforeEach(async () => {
  localStorage.clear();
  storage = (await import('../../js/storage.js')).storage;
  storage.load();
});

function runSummary(overrides) {
  return Object.assign({
    runId: 'run-1', mode: 'endless', completed: true,
    score: 500, coinsEarned: 40, coinsCollected: 30,
    encountersCompleted: 3, correct: 2, wrong: 1, bestStreak: 2,
    durationMs: 30000, encounters: [
      { cardId: 'n001', subject: 'Neurology', correct: true },
      { cardId: 'n002', subject: 'Neurology', correct: true },
      { cardId: 'n003', subject: 'Neurology', correct: false }
    ]
  }, overrides);
}

describe('storage.finalizeRun', () => {
  it('counts a run exactly once and does not double-count pickup coins', () => {
    const before = storage.get('coins');
    const first = storage.finalizeRun(runSummary());
    expect(first.applied).toBe(true);
    expect(storage.get('coins')).toBe(before + 40);
    expect(storage.get('totalCorrect')).toBe(2);
    expect(storage.get('totalEncounters')).toBe(3);

    const again = storage.finalizeRun(runSummary());
    expect(again.duplicate).toBe(true);
    expect(storage.get('coins')).toBe(before + 40);
    expect(storage.get('totalCorrect')).toBe(2);
  });
});

describe('flashcard sessions', () => {
  it('walks reveal → rate → complete and persists once', () => {
    const fm = new FlashcardMode();
    expect(fm.start({ subjects: ['Neurology'], cardCount: 3 }).success).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(fm.getCurrentCard().buzzwords.length).toBeGreaterThan(0);
      expect(fm.reveal().answer).toBeTruthy();
      expect(fm.rate(i === 0 ? 'incorrect' : 'correct')).toBe(true);
    }
    expect(fm.isComplete()).toBe(true);
    const done = fm.complete();
    expect(done.success).toBe(true);
    expect(done.summary.correct).toBe(2);
    expect(done.summary.wrong).toBe(1);

    const first = storage.finalizeFlashcardSession(done.summary);
    expect(first.applied).toBe(true);
    expect(storage.finalizeFlashcardSession(done.summary).duplicate).toBe(true);

    const review = fm.startMissedReview();
    expect(review.success).toBe(true);
    expect(fm.kind).toBe('missed_review');
  });
});

describe('quests', () => {
  it('claims a completed quest once via the atomic API', () => {
    storage.incrementQuest('q_25enc', 25);
    const before = storage.get('coins');
    expect(storage.isQuestClaimed('q_25enc')).toBe(false);
    const claim = storage.claimQuest('q_25enc');
    expect(claim.success).toBe(true);
    expect(storage.get('coins')).toBe(before + claim.reward);
    expect(storage.claimQuest('q_25enc').alreadyClaimed).toBe(true);
    expect(storage.isQuestClaimed('q_25enc')).toBe(true);
  });
});
