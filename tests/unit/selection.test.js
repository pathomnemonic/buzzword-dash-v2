// tests/unit/selection.test.js
// Selection tests per Section 33.3 of the architecture document
// Uses the canonical options-object contract: pickCard({ pool, ... }) -> { card, orderedIndex, error }

import { describe, it, expect, beforeEach } from 'vitest';

let storage, pickCard, getCardPool, createDailyOrder, CARDS;

function poolFor(mode) {
  const res = getCardPool({ subjects: [], filters: {}, mode: mode || 'endless' });
  expect(res.error).toBeNull();
  return res.cards;
}

beforeEach(async () => {
  localStorage.clear();
  const storageMod = await import('../../js/storage.js');
  storage = storageMod.storage;
  storage.load();

  const gatesMod = await import('../../js/game/gates.js');
  pickCard = gatesMod.pickCard;
  getCardPool = gatesMod.getCardPool;
  createDailyOrder = gatesMod.createDailyOrder;

  const cardsMod = await import('../../js/cards.js');
  CARDS = cardsMod.CARDS;
});

describe('Card selection — empty subjects means all', () => {
  it('returns a card when selectedSubjects is empty', () => {
    storage.set('selectedSubjects', []);
    const result = pickCard({ pool: poolFor('endless'), mode: 'endless', encounterIndex: 0 });
    expect(result.error).toBeNull();
    expect(result.card).not.toBeNull();
    expect(result.card.id).toBeTruthy();
  });

  it('returns a structured error for an empty pool', () => {
    const result = pickCard({ pool: [], mode: 'endless', encounterIndex: 0 });
    expect(result.card).toBeNull();
    expect(result.error.code).toBe('NO_MATCHING_CARDS');
  });
});

describe('Card selection — disabled cards excluded', () => {
  it('does not return a disabled card', () => {
    const testCard = CARDS[0];
    storage.disableCard(testCard.id);
    const pool = poolFor('endless');
    expect(pool.some(c => c.id === testCard.id)).toBe(false);
    for (let i = 0; i < 50; i++) {
      const { card } = pickCard({ pool, mode: 'endless', encounterIndex: i });
      if (card) {
        expect(card.id).not.toBe(testCard.id);
      }
    }
  });
});

describe('Card selection — recent-card avoidance', () => {
  it('avoids recently seen card IDs', () => {
    const recentIds = CARDS.slice(0, 5).map(c => c.id);
    const { card, error } = pickCard({
      pool: poolFor('endless'),
      recentIds,
      mode: 'endless',
      encounterIndex: 0
    });
    expect(error).toBeNull();
    expect(card.id).toBeTruthy();
    // Recent cards are down-weighted 50x (best-effort), so with a large pool
    // a recent card should virtually never be chosen.
    expect(recentIds).not.toContain(card.id);
  });
});

describe('Card selection — Daily determinism', () => {
  it('returns the same card for the same daily index', () => {
    const pool = poolFor('daily');
    const orderedCardIds = createDailyOrder({
      dateKey: '2026-01-01',
      eligibleCardIds: pool.map(c => c.id),
      count: 15
    });
    const r1 = pickCard({ pool, mode: 'daily', encounterIndex: 0, orderedCardIds });
    const r2 = pickCard({ pool, mode: 'daily', encounterIndex: 0, orderedCardIds });
    expect(r1.card.id).toBe(r2.card.id);
    expect(r1.orderedIndex).toBe(0);
  });
});

describe('Card selection — new cards are favored by default', () => {
  it('defaults the new-card priority to 8, and moves players still on the old default of 5', () => {
    expect(storage.get('cardFreshnessWeight')).toBe(8);
    storage.data.settings.cardFreshnessWeight = 5;
    storage.data.settings.freshnessDefaultSeen = false;
    storage._ensureInvariants();
    expect(storage.get('cardFreshnessWeight')).toBe(8);
    // someone who chose their own number keeps it
    storage.data.settings.cardFreshnessWeight = 3;
    storage.data.settings.freshnessDefaultSeen = false;
    storage._ensureInvariants();
    expect(storage.get('cardFreshnessWeight')).toBe(3);
  });

  it('brings cards the player has never answered up far more often than ones they know', () => {
    const pool = poolFor('endless').slice(0, 60);
    // the player has answered (and mostly knows) half of them
    pool.slice(0, 30).forEach((c) => {
      const stat = storage.getCardStat(c.id);
      Object.assign(storage.data.cards.cardStats[c.id] || (storage.data.cards.cardStats[c.id] = stat), { seen: 6, correct: 5, wrong: 1, lastSeen: Date.now() - 3600e3, due: Date.now() + 5 * 86400e3 });
    });
    const known = new Set(pool.slice(0, 30).map((c) => c.id));
    let fresh = 0;
    const picks = 600;
    for (let i = 0; i < picks; i++) {
      const r = pickCard({ pool, mode: 'endless', encounterIndex: 3, recentIds: [] });
      if (!known.has(r.card.id)) fresh++;
    }
    expect(fresh / picks).toBeGreaterThan(0.8);
  });
});
