import { describe, it, expect, beforeEach } from 'vitest';
import { QUESTS } from '../../js/game/shopdata.js';

let storage;

beforeEach(async () => {
  localStorage.clear();
  storage = (await import('../../js/storage.js')).storage;
  storage.load();
});

const enc = (subject, correct, decisionMs) => ({ cardId: subject + Math.random(), subject, correct, decisionMs });

function run(overrides) {
  return Object.assign({
    runId: 'r' + Math.random(), mode: 'endless', completed: true, score: 900, coinsEarned: 10, coinsCollected: 0,
    encountersCompleted: 0, correct: 0, wrong: 0, bestStreak: 0, durationMs: 60000,
    subjectsSeen: [], rushesUsed: 0, powerupsCollected: 0, obstaclesJumped: 0, obstaclesSlid: 0, dailyCompleted: false, encounters: []
  }, overrides);
}
const done = (id) => storage.getQuestProgress(id) >= QUESTS.find((q) => q.id === id).target;

describe('daily quests', () => {
  it('a strong run completes the per-run quests', () => {
    storage.finalizeRun(run({ bestStreak: 9, coinsCollected: 120, powerupsCollected: 3, rushesUsed: 4, obstaclesJumped: 6, obstaclesSlid: 5 }));
    for (const id of ['q_streak8', 'q_perfect5', 'q_50coins', 'q_3powerups', 'q_rush3', 'q_jump5', 'q_slide5']) expect(done(id), id).toBe(true);
  });

  it('per-run quests take the best run, not the total of several runs', () => {
    storage.finalizeRun(run({ coinsCollected: 60 }));
    storage.finalizeRun(run({ coinsCollected: 60 }));
    expect(storage.getQuestProgress('q_50coins')).toBe(60); // two 60-coin runs are not one 100-coin run
    storage.finalizeRun(run({ coinsCollected: 100 }));
    expect(done('q_50coins')).toBe(true);
  });

  it('per-day quests add up across runs', () => {
    storage.finalizeRun(run({ encountersCompleted: 15, correct: 6 }));
    expect(done('q_25enc')).toBe(false);
    storage.finalizeRun(run({ encountersCompleted: 12, correct: 5 }));
    expect(done('q_25enc')).toBe(true);
    expect(done('q_10correct')).toBe(true);
  });

  it('counts quick right answers and different subjects, and the daily round', () => {
    storage.finalizeRun(run({
      encountersCompleted: 6, correct: 4, dailyCompleted: true,
      encounters: [enc('Neurology', true, 1500), enc('Renal', true, 900), enc('Cardiology', true, 1999), enc('Neurology', true, 4000), enc('Pediatrics', false, 500), enc('Psychiatry', true, 1000)]
    }));
    expect(storage.getQuestProgress('q_speed3')).toBe(4);
    expect(done('q_speed3')).toBe(true);
    expect(storage.getQuestProgress('q_allsubjects')).toBe(5);
    expect(done('q_allsubjects')).toBe(true);
    expect(done('q_daily')).toBe(true);
  });

  it('does not count the same subject twice', () => {
    storage.finalizeRun(run({ encounters: [enc('Renal', true, 5000), enc('Renal', true, 5000)], subjectsSeen: ['Renal'] }));
    storage.finalizeRun(run({ encounters: [enc('Renal', true, 5000)] }));
    expect(storage.getQuestProgress('q_allsubjects')).toBe(1);
  });

  it('a completed quest can be claimed for its coins', () => {
    storage.finalizeRun(run({ bestStreak: 8 }));
    const before = storage.get('coins');
    const claim = storage.claimQuest('q_streak8');
    expect(claim.success).toBe(true);
    expect(storage.get('coins')).toBe(before + QUESTS.find((q) => q.id === 'q_streak8').reward);
  });

  it('every quest can be completed by some run', () => {
    storage.finalizeRun(run({
      bestStreak: 12, coinsCollected: 150, powerupsCollected: 4, rushesUsed: 5, obstaclesJumped: 8, obstaclesSlid: 8,
      encountersCompleted: 30, correct: 25, dailyCompleted: true,
      encounters: ['A', 'B', 'C', 'D', 'E', 'F'].map((s) => enc(s, true, 800))
    }));
    expect(QUESTS.filter((q) => !done(q.id)).map((q) => q.id)).toEqual([]);
  });
});

describe('quest completion is reported', () => {
  it('lists the quests a run just completed, once', () => {
    const first = storage.finalizeRun(run({ bestStreak: 9 }));
    expect(first.completedQuestIds).toEqual(expect.arrayContaining(['q_streak8', 'q_perfect5']));
    const second = storage.finalizeRun(run({ bestStreak: 9 }));
    expect(second.completedQuestIds).toEqual([]);
  });
});
