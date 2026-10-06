import { describe, it, expect, beforeAll } from 'vitest';
import { FREE_CARD_IDS, FREE_CARD_IDS_BY_SUBJECT } from '../../js/freecards.js';
import { CARDS, CARD_BY_ID, SUBJECTS, loadCards, setLibraryUnlocked, seededPool, libraryCounts, isFreeCard } from '../../js/cardhub.js';
import { pickFreeCards } from '../../tools/pick-free-cards.mjs';

beforeAll(async () => { await loadCards(); });

describe('the free library: 300 cards, evenly across the subjects', () => {
  it('is exactly 300 distinct cards that all exist', () => {
    expect(FREE_CARD_IDS.size).toBe(300);
    FREE_CARD_IDS.forEach((id) => expect(CARD_BY_ID.has(id)).toBe(true));
  });
  it('has 20 from each of the 15 subjects', () => {
    expect(Object.keys(FREE_CARD_IDS_BY_SUBJECT).sort()).toEqual(SUBJECTS.slice().sort());
    SUBJECTS.forEach((s) => {
      expect(FREE_CARD_IDS_BY_SUBJECT[s].length).toBe(20);
      FREE_CARD_IDS_BY_SUBJECT[s].forEach((id) => expect(CARD_BY_ID.get(id).subj).toBe(s));
    });
  });
  it('is a fair taste: all difficulty levels, several question types, no flashcard-only cards', () => {
    const levels = new Set(); const types = new Set();
    FREE_CARD_IDS.forEach((id) => { const c = CARD_BY_ID.get(id); levels.add(c.baseDifficulty); types.add(c.questionType); expect(c.enabledModes && c.enabledModes.length === 1 && c.enabledModes[0] === 'flashcard').toBeFalsy(); });
    expect(levels.size).toBeGreaterThanOrEqual(3);
    expect(types.size).toBeGreaterThanOrEqual(2);
  });
  it('is the list the picker produces (so it can be regenerated, but must not be after launch)', () => {
    const again = pickFreeCards(Array.from(CARD_BY_ID.values()), SUBJECTS, 20);
    expect(again).toEqual(FREE_CARD_IDS_BY_SUBJECT);
  });
});

describe('the card pool follows the library lock', () => {
  it('locked: only the free cards are playable, every card is still looked up by id', () => {
    setLibraryUnlocked(false);
    expect(CARDS.length).toBe(300);
    expect(CARDS.every((c) => isFreeCard(c.id))).toBe(true);
    expect(CARD_BY_ID.size).toBeGreaterThan(3000);
    expect(libraryCounts()).toMatchObject({ total: CARD_BY_ID.size, free: 300, playable: 300 });
  });
  it('unlocked: all of them, in the same array (so every module sees it)', () => {
    const ref = CARDS;
    setLibraryUnlocked(true);
    expect(CARDS).toBe(ref);
    expect(CARDS.length).toBe(CARD_BY_ID.size);
  });
  it('shared games are dealt from the free cards for everyone, locked or not', () => {
    setLibraryUnlocked(true);
    const a = seededPool().map((c) => c.id);
    setLibraryUnlocked(false);
    const b = seededPool().map((c) => c.id);
    expect(a).toEqual(b);
    expect(a.length).toBe(300);
  });
});
