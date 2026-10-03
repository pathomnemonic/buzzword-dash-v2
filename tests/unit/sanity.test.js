import { describe, it, expect, beforeEach } from 'vitest';
import { checkDataSanity } from '../../js/sanity.js';
import { storage, STORAGE_DEFAULTS } from '../../js/storage.js';

const run = (o) => Object.assign({
  runId: 'r' + Math.random(), mode: 'endless', completed: true, score: 900, coinsEarned: 40, coinsCollected: 30,
  encountersCompleted: 6, correct: 4, wrong: 2, bestStreak: 3, durationMs: 60000, subjectsSeen: ['Neurology'], rushesUsed: 1,
  powerupsCollected: 1, obstaclesJumped: 2, obstaclesSlid: 2, dailyCompleted: false, fastestDecisionMs: 900,
  encounters: [{ cardId: 'c001', subject: 'Cardiology', correct: true, decisionMs: 900 }, { cardId: 'c002', subject: 'Cardiology', correct: false, decisionMs: 3000 }]
}, o);

describe('saved data stays the right shape', () => {
  beforeEach(() => { localStorage.clear(); storage.load(); });

  it('a fresh save is clean', () => {
    expect(checkDataSanity(storage.data, STORAGE_DEFAULTS)).toEqual([]);
  });

  it('stays clean after runs, flashcards, purchases, quests and badges', () => {
    for (let i = 0; i < 5; i++) storage.finalizeRun(run({}));
    storage.finalizeRun(run({ mode: 'daily', dailyCompleted: true }));
    storage.finalizeFlashcardSession({ sessionId: 's1', total: 10, correct: 7, wrong: 3, durationMs: 5000, cardResults: [{ cardId: 'c001', rating: 'correct' }] });
    storage.set('coins', 5000);
    storage.buyItem('hat_headlamp', 1200);
    storage.checkAchievements(null);
    storage.getDailyQuests();
    expect(checkDataSanity(storage.data, STORAGE_DEFAULTS)).toEqual([]);
  });

  it('notices NaN, wrong types and negative counts', () => {
    storage.data.progression.coins = NaN;
    storage.data.progression.xp = '12';
    storage.data.progression.totalCorrect = -1;
    storage.data.settings.selectedSubjects = null;
    const problems = checkDataSanity(storage.data, STORAGE_DEFAULTS).join('\n');
    expect(problems).toMatch(/progression\.coins is not a finite number/);
    expect(problems).toMatch(/progression\.xp should be number/);
    expect(problems).toMatch(/progression\.totalCorrect is negative/);
    expect(problems).toMatch(/settings\.selectedSubjects should be array/);
  });
});
