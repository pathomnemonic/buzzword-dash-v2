import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACHIEVEMENT_IDS, ACHIEVEMENTS } from '../../js/game/shopdata.js';

const storageSrc = readFileSync('js/storage.js', 'utf8');
const evaluator = storageSrc.slice(storageSrc.indexOf('_evaluateAchievements(runData) {'), storageSrc.indexOf('checkAchievements(runData) {'));
const src = evaluator;

describe('every badge can actually be earned', () => {
  it('each badge in the list has a unique id that exists in ACHIEVEMENT_IDS', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const all = new Set(Object.values(ACHIEVEMENT_IDS));
    ids.forEach((id) => expect(all.has(id), id).toBe(true));
  });
  it('the evaluator has an award path for every badge (by name, or the mastery table)', () => {
    const table = storageSrc.slice(storageSrc.indexOf('var SUBJECT_MASTERY_KEYS'), storageSrc.indexOf('// ===== QUEST EVENT MAPPING'));
    const unreferenced = Object.keys(ACHIEVEMENT_IDS).filter((k) => !new RegExp("award\\('" + k + "'").test(src) && !table.includes("'" + k + "'"));
    expect(unreferenced).toEqual([]);
  });
  it('the evaluator never names a badge that does not exist', () => {
    const named = [...src.matchAll(/award\('([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(named.filter((k) => !(k in ACHIEVEMENT_IDS))).toEqual([]);
  });
  it('every badge name is shown with a description and an icon', () => {
    ACHIEVEMENTS.forEach((a) => { expect(a.name && a.desc && a.icon, a.id).toBeTruthy(); });
  });
});


describe('badges are actually awarded by real play', () => {
  async function fresh() {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    return storage;
  }
  it('Speed Demon needs a completed run at speed 10 (and not at 9)', async () => {
    const storage = await fresh();
    expect(storage.checkAchievements({ score: 10, completed: true, correct: 1, wrong: 1, userSpeed: 9 })).not.toContain(ACHIEVEMENT_IDS.SPEED_MAX);
    expect(storage.checkAchievements({ score: 10, completed: true, correct: 1, wrong: 1, userSpeed: 10 })).toContain(ACHIEVEMENT_IDS.SPEED_MAX);
  });
  it('the first purchase earns Shopper', async () => {
    const storage = await fresh();
    storage.set('coins', 5000);
    expect(storage.buyItem('hat_headlamp', 1200)).toBe(true);
    expect(storage.afterPurchase()).toContain(ACHIEVEMENT_IDS.BUY_FIRST);
  });
  it('creating a custom card earns Card Creator', async () => {
    const storage = await fresh();
    expect(storage.afterCustomCardCreated()).toContain(ACHIEVEMENT_IDS.CUSTOM_CARD);
  });
  it('80% over 50 answers in a subject earns that subject badge and the mastery-count badge', async () => {
    const storage = await fresh();
    storage.data.cards.subjectStats.Neurology = { correct: 45, wrong: 10 };
    const got = storage.checkAchievements(null);
    expect(got).toContain(ACHIEVEMENT_IDS.MASTER_NEURO);
    expect(got).toContain(ACHIEVEMENT_IDS.MASTER_1_SUBJECT);
    storage.data.cards.subjectStats.Cardiology = { correct: 30, wrong: 30 };
    expect(storage.checkAchievements(null)).not.toContain(ACHIEVEMENT_IDS.MASTER_CARDIO);
  });
  it('play time and studied-card badges use the real ids', async () => {
    const storage = await fresh();
    storage.data.progression.totalPlayTimeMs = 3700000;
    storage.data.progression.totalCardsStudied = 1200;
    storage.data.progression.ownedItems = Array.from({ length: 50 }, (_, i) => 'x' + i);
    const got = storage.checkAchievements(null);
    [ACHIEVEMENT_IDS.PLAYTIME_30MIN, ACHIEVEMENT_IDS.PLAYTIME_1HR, ACHIEVEMENT_IDS.STUDIED_500, ACHIEVEMENT_IDS.STUDIED_1000, ACHIEVEMENT_IDS.COLLECT_50]
      .forEach((id) => expect(got).toContain(id));
  });
});
