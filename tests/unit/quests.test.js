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
const REWARD_STREAK8 = QUESTS.find((q) => q.id === 'q_streak8').reward;
const done = (id) => storage.getQuestProgress(id) >= QUESTS.find((q) => q.id === id).target;

describe('daily quests', () => {
  it('a strong run completes the per-run quests', () => {
    storage.finalizeRun(run({ bestStreak: 9, coinsCollected: 320, powerupsCollected: 3, rushesUsed: 4, obstaclesJumped: 6, obstaclesSlid: 5 }));
    for (const id of ['q_streak8', 'q_perfect5', 'q_50coins', 'q_3powerups', 'q_rush3', 'q_jump5', 'q_slide5']) expect(done(id), id).toBe(true);
  });

  it('per-run quests take the best run, not the total of several runs', () => {
    storage.finalizeRun(run({ coinsCollected: 180 }));
    storage.finalizeRun(run({ coinsCollected: 180 }));
    expect(storage.getQuestProgress('q_50coins')).toBe(180); // two 180-coin runs are not one 300-coin run
    storage.finalizeRun(run({ coinsCollected: 300 }));
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

  it('every quest in the pool is measured by something a run (or flashcard session) really reports', () => {
    const produced = new Set([...Object.keys(storage._questMetrics(run())), 'flashcards', 'flashcardsKnown', 'flashcardSessions']);
    expect(QUESTS.filter((q) => !produced.has(q.metric)).map((q) => q.id + ':' + q.metric)).toEqual([]);
  });

  it('one rich run completes a quest from every run-based category', () => {
    storage.finalizeRun(run({
      bestStreak: 21, coinsCollected: 750, powerupsCollected: 6, rushesUsed: 7, obstaclesJumped: 14, obstaclesSlid: 14,
      encountersCompleted: 52, correct: 52, wrong: 0, score: 3500, dailyCompleted: true, mode: 'study',
      encounters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((x) => enc(x, true, 700)).concat(Array.from({ length: 10 }, () => enc('A', true, 1500)))
    }));
    ['q_streak20', 'q_clean15', 'q_acc90', 'q_50enc', 'q_50correct', 'q_score3000', 'q_200coins', 'q_5powerups', 'q_jump12', 'q_slide12',
      'q_rush6', 'q_dodge20', 'q_subjects8', 'q_modestudy', 'q_daily', 'q_speed15', 'q_blink3', 'q_nocontinue15', 'q_quickstreak']
      .forEach((id) => expect(done(id), id).toBe(true));
    expect(done('q_modeweakness')).toBe(false); // a Study run is not a Weakness run
  });

  it('flashcard sessions count towards the flashcard quests', () => {
    storage.data.progression.questPicks[new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0')] = ['q_flash10', 'q_flash30', 'q_streak8', 'q_25enc', 'q_daily', 'q_speed3'];
    const r = storage.finalizeFlashcardSession({ sessionId: 's1', total: 12, correct: 9, wrong: 3, durationMs: 60000, cardResults: [] });
    expect(r.completedQuestIds).toContain('q_flash10');
    expect(storage.getQuestProgress('q_flashrecall15')).toBe(9);
    storage.finalizeFlashcardSession({ sessionId: 's2', total: 20, correct: 10, wrong: 10, durationMs: 60000, cardResults: [] });
    expect(done('q_flash30')).toBe(true);
    expect(done('q_flashrecall15')).toBe(true);
    expect(done('q_flash2sessions')).toBe(true);
  });
});

describe('quest completion is reported', () => {
  it('lists the quests a run just completed (only ones on offer today), once', () => {
    const { todayKey } = { todayKey: () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); } };
    storage.data.progression.questPicks[todayKey()] = ['q_streak8', 'q_perfect5', 'q_25enc', 'q_50coins', 'q_daily', 'q_speed3'];
    const first = storage.finalizeRun(run({ bestStreak: 9, coinsCollected: 500, powerupsCollected: 9 }));
    expect(first.completedQuestIds.sort()).toEqual(['q_50coins', 'q_perfect5', 'q_streak8']); // q_3powerups is done too, but is not on offer today
    const second = storage.finalizeRun(run({ bestStreak: 9 }));
    expect(second.completedQuestIds).toEqual([]);
  });
});

describe('a different set of quests every day', () => {
  const days = Array.from({ length: 60 }, (_, i) => { const d = new Date(2026, 9, 1 + i, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });

  it('the pool is large and every category has plenty to rotate through', async () => {
    const { QUEST_CATEGORIES } = await import('../../js/game/shopdata.js');
    expect(QUESTS.length).toBeGreaterThanOrEqual(40);
    QUEST_CATEGORIES.forEach((c) => expect(QUESTS.filter((q) => q.category === c).length, c).toBeGreaterThanOrEqual(5));
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    expect(new Set(QUESTS.map((q) => q.title)).size).toBe(QUESTS.length);
  });

  it('each day offers six quests, one from every category, the same for every player', async () => {
    const { questIdsForDate } = await import('../../js/game/shopdata.js');
    days.forEach((d) => {
      const ids = questIdsForDate(d);
      expect(ids.length).toBe(6);
      expect(new Set(ids.map((id) => QUESTS.find((q) => q.id === id).category)).size).toBe(6);
      expect(questIdsForDate(d)).toEqual(ids);
    });
  });

  it('never repeats yesterday, and over two months shows most of the pool', async () => {
    const { questIdsForDate } = await import('../../js/game/shopdata.js');
    const seen = new Set();
    let prev = [];
    days.forEach((d) => {
      const ids = questIdsForDate(d);
      expect(ids.filter((id) => prev.includes(id)), d).toEqual([]);
      ids.forEach((id) => seen.add(id));
      prev = ids;
    });
    expect(seen.size).toBeGreaterThanOrEqual(Math.floor(QUESTS.length * 0.85));
  });

  it("the quest list the player sees is today's rotation, and the calendar star needs all of them", () => {
    const ids = storage.getDailyQuestIds();
    expect(storage.getDailyQuests().map((q) => q.id)).toEqual(ids);
    expect(Object.keys(storage.get('questCompletionDates'))).toEqual([]);
  });
});
