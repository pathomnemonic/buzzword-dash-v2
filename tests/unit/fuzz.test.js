import { describe, it, expect, beforeEach } from 'vitest';
import { ankiImport } from '../../js/ankiimport.js';
import { parseAiReply } from '../../js/importguide.js';
import { checkDataSanity } from '../../js/sanity.js';
import { storage, STORAGE_DEFAULTS } from '../../js/storage.js';

/** Throw garbage at everything that reads outside data: nothing may throw, hang, or corrupt the saved data. */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ALPHABET = ['a', 'Z', ' ', '\t', '\n', '\r', '"', "'", ',', ';', '{', '}', '[', ']', ':', '<', '>', '&', '#', '\\', '\u0000', '‮', '😀', 'é', '{{c1::', '}}', '::', '<br>', '[sound:x.mp3]', '#separator:tab\n', '-1', '1e999', 'null', 'NaN'];
function garbage(r, len) { let s = ''; for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)]; return s; }

describe('importers survive garbage', () => {
  it('parseDelimitedText never throws and always returns clean cards', () => {
    const r = rng(1);
    for (let i = 0; i < 400; i++) {
      const text = garbage(r, Math.floor(r() * 300));
      let out;
      expect(() => { out = ankiImport.parseDelimitedText(text); }, JSON.stringify(text)).not.toThrow();
      expect(Array.isArray(out.cards)).toBe(true);
      out.cards.forEach((c) => { expect(typeof c.front).toBe('string'); expect(typeof c.back).toBe('string'); expect(c.front.trim() && c.back.trim()).toBeTruthy(); });
    }
  });

  it('parseAiReply never throws on anything an AI (or a prankster) might send', () => {
    const r = rng(2);
    const weird = ['[]', '{}', 'null', '[null]', '[1,2,3]', '[{"bw":"x","ans":{"a":1},"d":["a","b"]}]', '{"cards":"nope"}', '[{"bw":["x"],"ans":"y","d":["z","z"]}]', '[{"__proto__":{"x":1},"bw":["x"],"ans":"y","d":["a","b"]}]', '"text"', '[[]]'];
    for (let i = 0; i < 300; i++) {
      const text = i < weird.length ? weird[i] : garbage(r, Math.floor(r() * 200));
      expect(() => parseAiReply(text), text).not.toThrow();
    }
    expect(({}).x).toBeUndefined(); // no prototype pollution from "__proto__"
  });

  it('a one-megabyte line or a quote that never closes is handled', () => {
    const t0 = performance.now();
    expect(() => ankiImport.parseDelimitedText('"' + 'a,b\n'.repeat(100000))).not.toThrow();
    expect(() => ankiImport.parseDelimitedText('x\t' + 'y'.repeat(1000000))).not.toThrow();
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe('saved data survives hostile storage', () => {
  beforeEach(() => localStorage.clear());

  it('loading random junk or a mangled save never throws and ends in a clean state', () => {
    const r = rng(3);
    const real = (() => { storage.load(); return JSON.stringify(storage.data); })();
    for (let i = 0; i < 80; i++) {
      localStorage.clear();
      let text;
      const mode = i % 4;
      if (mode === 0) text = garbage(r, 120);
      else if (mode === 1) text = real.slice(0, Math.floor(r() * real.length)); // cut off
      else if (mode === 2) { const o = JSON.parse(real); const keys = Object.keys(o.progression); o.progression[keys[Math.floor(r() * keys.length)]] = [null, 'x', -5, NaN, {}, [], 1e99][Math.floor(r() * 7)]; text = JSON.stringify(o); }
      else { const o = JSON.parse(real); delete o[Object.keys(o)[Math.floor(r() * Object.keys(o).length)]]; text = JSON.stringify(o); }
      localStorage.setItem('buzzword_dash_v1', text);
      expect(() => storage.load(), text.slice(0, 80)).not.toThrow();
      // the game must still be playable afterwards
      expect(() => { storage.finalizeRun({ runId: 'f' + i, mode: 'endless', completed: true, score: 10, encountersCompleted: 1, correct: 1, wrong: 0, bestStreak: 1, durationMs: 1000, encounters: [], subjectsSeen: [] }); storage.getDailyQuests(); storage.checkAchievements(null); }).not.toThrow();
      const problems = checkDataSanity(storage.data, STORAGE_DEFAULTS).filter((p) => !/questPicks|questState/.test(p));
      expect(problems, 'after: ' + text.slice(0, 60) + ' => ' + problems.join(' | ')).toEqual([]);
    }
  });

  it('a backup file full of nonsense is refused or cleaned, never half-applied', () => {
    storage.load();
    const coins = storage.get('coins');
    const bad = ['{"app":"buzzword-dash","data":null}', '{"app":"buzzword-dash","data":[]}', '{"app":"buzzword-dash","data":{"schemaVersion":"2"}}', 'not json', '{"app":"other"}', '[]'];
    bad.forEach((t) => { expect(storage.importBackup(t).ok).toBe(false); });
    expect(storage.get('coins')).toBe(coins);
  });
});

describe('absurd numbers do not break the maths', () => {
  it('the scheduler, quests and badges cope with extreme inputs', async () => {
    storage.load();
    const huge = { runId: 'h', mode: 'endless', completed: true, score: 1e15, coinsEarned: 1e12, coinsCollected: 1e9, encountersCompleted: 1e6, correct: 1e6, wrong: 0, bestStreak: 1e6, durationMs: 1e12, subjectsSeen: ['x'], rushesUsed: 1e6, powerupsCollected: 1e6, obstaclesJumped: 1e6, obstaclesSlid: 1e6, fastestDecisionMs: 1, encounters: [] };
    expect(() => storage.finalizeRun(huge)).not.toThrow();
    const zero = { ...huge, runId: 'z', score: -5, coinsEarned: -100, encountersCompleted: -1, correct: -3, wrong: -2, bestStreak: -1, durationMs: -5, fastestDecisionMs: -1, encounters: [{ cardId: undefined, correct: true }, null] };
    expect(() => storage.finalizeRun(zero)).not.toThrow();
    expect(storage.get('coins')).toBeGreaterThanOrEqual(0);
    expect(checkDataSanity(storage.data, STORAGE_DEFAULTS)).toEqual([]);
  });
});
