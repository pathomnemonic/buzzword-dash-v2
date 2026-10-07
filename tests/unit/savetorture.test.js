/**
 * Save-data torture tests (section 47 of the QA plan).
 *
 * A save can be damaged by an interrupted write, an old bug, a bad cloud merge, a hand-edited backup or a full disk.
 * None of those may stop the game from starting or lose the rest of the player's progress. Every test here loads a
 * damaged save and then uses the game's own functions on it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkDataSanity } from '../../js/sanity.js';
import { makeRng } from '../../tools/soak.mjs';
import { mutate } from '../../tools/savemutate.mjs';

const KEY = 'buzzword_dash_v1';
let storage;
let DEFAULTS;

afterEach(() => { vi.unstubAllGlobals(); });

/** A stand-in for localStorage that can be full or blocked (jsdom's own cannot be made to fail). */
function fakeStorage(state) {
  const map = new Map(Object.entries(state.initial || {}));
  return {
    getItem: (k) => { if (state.blocked) throw new Error('SecurityError'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => {
      if (state.blocked) throw new Error('SecurityError');
      if (state.full) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; }
  };
}

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  const mod = await import('../../js/storage.js');
  storage = mod.storage;
  DEFAULTS = mod.STORAGE_DEFAULTS;
  storage.load();
});

const SUBJECTS = ['Cardiology', 'Neurology', 'Nephrology', 'Pulmonology', 'Surgery'];

function summary(i, extra) {
  const enc = [];
  for (let k = 0; k < 6; k++) enc.push({ cardId: 'c' + ((i * 6 + k) % 40), correct: (i + k) % 3 !== 0, subject: SUBJECTS[(i + k) % SUBJECTS.length] });
  return Object.assign({
    runId: 'run_' + i, mode: i % 4 === 0 ? 'daily' : 'endless', endReason: 'out_of_lives', completed: true,
    startedAt: Date.now() - 60000, endedAt: Date.now(), durationMs: 60000, score: 300 + i * 10, coinsEarned: 12, coinsCollected: 5,
    encountersCompleted: 6, correct: 4, wrong: 2, bestStreak: 3, fastestDecisionMs: 900, continued: false, continuesUsed: 0,
    subjectsSeen: SUBJECTS.slice(0, 3), rushesUsed: 1, powerupsCollected: 1, obstaclesJumped: 2, obstaclesSlid: 1,
    dailyCompleted: i % 4 === 0, encounters: enc, multiplayer: { matchId: null, result: 'none' }
  }, extra);
}

/** A save with a lot in it, made the way a player makes one. */
function richSave() {
  localStorage.clear();
  storage.load();
  for (let i = 0; i < 12; i++) storage.finalizeRun(summary(i));
  storage.finalizeFlashcardSession({ sessionId: 'f1', total: 8, correct: 5, cardResults: [] });
  storage.finalizeExamSession({ examId: 'e1', date: '2026-10-01', total: 10, correct: 7, wrong: 3, accuracy: 70, durationSec: 600, bySubject: {}, cardResults: [{ answered: true, cardId: 'c3', correct: true, subject: 'Cardiology' }] });
  storage.addCoins(900);
  storage.addCardReport('c1', 'wrong_answer', 'text');
  storage.toggleCardDisabled('c5');
  storage.set('profileName', 'Ada');
  storage.set('dailyGoal', 30);
  storage.set('examDate', '2027-03-01');
  return JSON.parse(JSON.stringify(storage.data));
}

/** The first NaN, infinite number or undefined held anywhere in the data (a string that says "NaN" is fine). */
function findBadValue(node, path) {
  path = path || '';
  if (typeof node === 'number' && !isFinite(node)) return path + ' = ' + node;
  if (node === undefined) return path + ' is undefined';
  if (node !== null && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const bad = findBadValue(node[k], path + '.' + k);
      if (bad) return bad;
    }
  }
  return '';
}

/** Use everything a screen or a run would. None of it may throw. */
function exercise() {
  const quests = storage.getDailyQuests ? storage.getDailyQuests() : [];
  storage.getStreakStatus();
  storage.getWeeklyProgress();
  storage.getWeeklyCards();
  storage.getProfile();
  storage.getStudiedToday();
  storage.getDueCount();
  storage.getFlashcardStats();
  storage.getMultiplayerStats();
  storage.getNewAchievementIds();
  storage.getUnclaimedPastQuests();
  storage.getClaimableQuestIds(quests);
  storage.get('cardStats');
  storage.getCardStat('c1');
  storage.getSubjectStat('Cardiology');
  storage.getCardReports();
  storage.exportBackup();
  storage.checkAchievements(null);
  storage.markAchievementsSeen();
  storage.addStudiedToday(3, 2);
  storage.updateCardStat('c1', true);
  storage.updateCardStat('c1', false);
  storage.updateSubjectStat('Cardiology', true);
  storage.addCoins(5);
  storage.incrementQuest('quest_x', 1);
  storage.finalizeRun(summary(Math.floor(Math.random() * 1e9) + 100));
  storage.finalizeFlashcardSession({ sessionId: 'z' + Math.random(), total: 3, correct: 2, cardResults: [] });
  storage.toggleCardDisabled('c9');
  storage.claimWeeklyGoal();
  storage.recordFlashcardSession(2, 1);
}

describe('a damaged save never stops the game starting', () => {
  it('survives text that is not a save at all', () => {
    ['', '{', '}', 'null', '[]', '123', '"text"', 'true', '{"schemaVersion":2', '\u0000\u0000', '{"schemaVersion":"2"}', '{"schemaVersion":99}', 'undefined', '<html></html>', '{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{"polluted":true}}}'].forEach((junk) => {
      localStorage.setItem(KEY, junk);
      expect(() => storage.load(), JSON.stringify(junk)).not.toThrow();
      expect(checkDataSanity(storage.data, DEFAULTS), JSON.stringify(junk)).toEqual([]);
      expect(() => exercise(), JSON.stringify(junk)).not.toThrow();
      expect({}.polluted).toBeUndefined();
    });
  });

  it('keeps a copy of the damaged text, so it can still be recovered by hand', () => {
    localStorage.setItem(KEY, '{"schemaVersion":2,"progression":{"coins":5');
    storage.load();
    expect(localStorage.getItem(KEY + '_damaged')).toContain('"coins":5');
  });

  it('survives 1000 randomly mutated saves, repairs every field and keeps working', () => {
    const base = richSave();
    const rng = makeRng(20261004);
    let worst = '';
    for (let i = 0; i < 1000; i++) {
      const copy = JSON.parse(JSON.stringify(base));
      const n = 1 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) mutate(copy, rng);
      let text;
      try { text = JSON.stringify(copy); } catch { continue; }
      localStorage.setItem(KEY, text);
      try {
        storage.load();
        const problems = checkDataSanity(storage.data, DEFAULTS);
        expect(problems, 'after load #' + i).toEqual([]);
        exercise();
        expect(checkDataSanity(storage.data, DEFAULTS), 'after use #' + i).toEqual([]);
        expect(findBadValue(storage.data), 'after use #' + i).toBe('');
      } catch (e) {
        worst = 'save #' + i + ' (' + text.slice(0, 200) + '...): ' + (e && e.message);
        throw new Error(worst);
      }
      expect({}.polluted).toBeUndefined();
    }
  }, 120000);
});

describe('old and odd saves', () => {
  it('a version-1 flat save (no schemaVersion) becomes a current one without losing coins, scores or items', () => {
    localStorage.setItem(KEY, JSON.stringify({ coins: 777, bestScore: 4321, totalEncounters: 99, ownedItems: ['avatar_intern', 'trail_fire'], dailyStreak: 4, lastDaily: '2026-01-01', nightMode: true }));
    storage.load();
    expect(storage.get('coins')).toBe(777);
    expect(storage.get('bestScore')).toBe(4321);
    expect(storage.get('ownedItems')).toContain('trail_fire');
    expect(storage.get('nightMode')).toBe(true);
    expect(checkDataSanity(storage.data, DEFAULTS)).toEqual([]);
  });

  it('a save missing whole sections gets them back with their defaults, and keeps what it has', () => {
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 2, progression: { coins: 321 } }));
    storage.load();
    expect(storage.get('coins')).toBe(321);
    expect(storage.data.cards.cardStats).toEqual({});
    expect(storage.data.history.dailyCounts).toEqual({});
    expect(checkDataSanity(storage.data, DEFAULTS)).toEqual([]);
    expect(() => exercise()).not.toThrow();
  });

  it('a save from a newer version is not overwritten (the data is kept for a downgrade)', () => {
    const future = JSON.stringify({ schemaVersion: 99, progression: { coins: 12345 } });
    localStorage.setItem(KEY, future);
    storage.load();
    expect(localStorage.getItem(KEY)).toBe(future);
    expect(checkDataSanity(storage.data, DEFAULTS)).toEqual([]);
  });

  it('a backup import with a damaged body is refused or repaired, never half-applied', () => {
    const before = JSON.stringify(storage.data);
    ['{', '{"app":"other"}', '{"app":"buzzword-dash","data":[]}', '{"app":"buzzword-dash","data":{"schemaVersion":99}}', '{"app":"buzzword-dash","data":null}'].forEach((text) => {
      expect(storage.importBackup(text).ok, text).toBe(false);
    });
    expect(JSON.stringify(storage.data)).toBe(before);
    const ok = storage.importBackup(JSON.stringify({ app: 'buzzword-dash', data: { schemaVersion: 2, progression: { coins: 'lots', xp: -5, ownedItems: 'all' } } }));
    expect(ok.ok).toBe(true);
    expect(checkDataSanity(storage.data, DEFAULTS)).toEqual([]);
  });
});

describe('big saves', () => {
  it('a save with thousands of cards, days and results loads quickly and keeps working', () => {
    const data = richSave();
    for (let i = 0; i < 6000; i++) data.cards.cardStats['card_' + i] = { seen: 5, correct: 3, wrong: 2, lastSeen: Date.now(), stability: 4.2, difficulty: 5, lastReview: Date.now(), interval: 3, due: Date.now() + 86400000 };
    for (let i = 0; i < 3000; i++) data.history.dailyCounts[new Date(2010, 0, 1 + i).toISOString().slice(0, 10)] = 20;
    for (let i = 0; i < 1500; i++) data.history.completedRunIds.push('old_run_' + i);
    const text = JSON.stringify(data);
    expect(text.length).toBeGreaterThan(900000);
    localStorage.setItem(KEY, text);
    const t0 = performance.now();
    storage.load();
    const loadMs = performance.now() - t0;
    expect(loadMs).toBeLessThan(1500);
    expect(() => exercise()).not.toThrow();
    expect(checkDataSanity(storage.data, DEFAULTS)).toEqual([]);
  });

  it('a full disk loses nothing in memory, and saves again when there is room', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = { full: true };
    const fake = fakeStorage(state);
    vi.stubGlobal('localStorage', fake);
    expect(() => { storage.addCoins(100); storage.finalizeRun(summary(500)); }).not.toThrow();
    expect(storage.get('coins')).toBeGreaterThanOrEqual(400);
    expect(warn).toHaveBeenCalled();
    state.full = false;
    storage.addCoins(1);
    expect(JSON.parse(fake.getItem(KEY)).progression.coins).toBeGreaterThanOrEqual(401);
  });
});

describe('storage that is missing, cleared or shared', () => {
  it('works when localStorage is unavailable (private mode, blocked storage)', () => {
    vi.stubGlobal('localStorage', fakeStorage({ blocked: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => storage.load()).not.toThrow();
    expect(() => exercise()).not.toThrow();
    expect(checkDataSanity(storage.data, DEFAULTS)).toEqual([]);
  });

  it('keeps going when the save is cleared while the game is open, and writes it back on the next save', () => {
    storage.addCoins(250);
    const coins = storage.get('coins');
    localStorage.clear(); // site data cleared in the middle of a session
    expect(() => exercise()).not.toThrow();
    expect(storage.get('coins')).toBeGreaterThanOrEqual(coins);
    expect(JSON.parse(localStorage.getItem(KEY)).progression.coins).toBeGreaterThanOrEqual(coins);
  });

  it('takes the other tab\'s save when it changes, so the next save here does not wipe it', () => {
    storage.addCoins(100);
    const other = JSON.parse(localStorage.getItem(KEY));
    other.progression.coins = 98765;
    other.profile.name = 'FromOtherTab';
    const text = JSON.stringify(other);
    localStorage.setItem(KEY, text);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: text }));
    expect(storage.get('coins')).toBe(98765);
    expect(storage.get('profileName')).toBe('FromOtherTab');
    storage.addCoins(5);
    expect(JSON.parse(localStorage.getItem(KEY)).progression.coins).toBe(98770);
  });

  it('ignores another tab\'s damaged or foreign writes', () => {
    storage.addCoins(100);
    const coins = storage.get('coins');
    ['{', 'null', '{"schemaVersion":7}', '[]'].forEach((bad) => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: bad }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'other_key', newValue: '{"schemaVersion":2}' }));
    });
    expect(storage.get('coins')).toBe(coins);
    expect(checkDataSanity(storage.data, DEFAULTS)).toEqual([]);
  });
});

describe('the other things the app keeps in storage', () => {
  const JUNK = ['', '{', 'null', '[]', '{}', '123', '"text"', 'true', '[null,1,"x",{}]', '{"a":{"b":null}}', '\u0000', '{"__proto__":{"polluted":1}}'];

  it('custom cards: any stored text gives a list of usable cards, never something else', async () => {
    const { customCards } = await import('../../js/customcards.js');
    JUNK.forEach((junk) => {
      localStorage.setItem('buzzword_dash_custom_cards', junk);
      const all = customCards.getAll();
      expect(Array.isArray(all), JSON.stringify(junk)).toBe(true);
      all.forEach((c) => { expect(typeof c.id).toBe('string'); expect(Array.isArray(c.bw)).toBe(true); expect(typeof c.ans).toBe('string'); });
      expect(() => customCards.getById('x')).not.toThrow();
    });
    localStorage.setItem('buzzword_dash_custom_cards', JSON.stringify([{ id: 'ok', bw: ['clue'], ans: 'Answer', d: ['a', 'b'] }, { id: 5 }, null, { id: 'nobw', ans: 'x' }, { id: '__proto__', bw: ['x'], ans: 'y' }, 'text']));
    expect(customCards.getAll().map((c) => c.id)).toEqual(['ok']);
  });

  it('shared decks: a damaged entry never hides the good ones or breaks the list', async () => {
    const deck = await import('../../js/deckcache.js');
    JUNK.forEach((junk) => {
      localStorage.setItem('buzzword_decks_v1', junk);
      expect(() => deck.listDecks(), JSON.stringify(junk)).not.toThrow();
      expect(() => deck.getDeck('ABCDE')).not.toThrow();
    });
    localStorage.setItem('buzzword_decks_v1', JSON.stringify({ GOOD1: { name: 'Fine', cards: [{ id: 'a' }], savedAt: 5 }, BAD01: null, BAD02: { cards: 'no' }, BAD03: [], __proto__: { cards: [] } }));
    expect(deck.listDecks().map((d) => d.code)).toEqual(['GOOD1']);
  });
});
