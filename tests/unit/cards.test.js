// tests/unit/cards.test.js
// Card validation tests per Section 33.2 of the architecture document

import { describe, it, expect } from 'vitest';
import { CARDS, SUBJECTS } from '../../js/cards.js';

describe('Card collection — imports', () => {
  it('imports CARDS as a non-empty array', () => {
    expect(Array.isArray(CARDS)).toBe(true);
    expect(CARDS.length).toBeGreaterThan(0);
  });

  it('imports SUBJECTS as an array of 15 canonical subjects', () => {
    expect(SUBJECTS).toHaveLength(15);
  });
});

describe('Card collection — unique IDs', () => {
  it('has no duplicate card IDs', () => {
    const ids = CARDS.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('Card collection — canonical subjects', () => {
  it('every card has a canonical subject', () => {
    for (const card of CARDS) {
      expect(SUBJECTS).toContain(card.subj);
    }
  });
});

describe('Card collection — required fields', () => {
  it('every card has id, bw, ans, d, and tp', () => {
    for (const card of CARDS) {
      expect(card.id).toBeTruthy();
      expect(Array.isArray(card.bw)).toBe(true);
      expect(card.bw.length).toBeGreaterThanOrEqual(1);
      expect(card.ans).toBeTruthy();
      expect(Array.isArray(card.d)).toBe(true);
      expect(card.tp).toBeTruthy();
    }
  });
});

describe('Card collection — exactly two unique distractors', () => {
  it('every card has exactly 2 distractors', () => {
    for (const card of CARDS) {
      expect(card.d).toHaveLength(2);
    }
  });

  it('distractors are unique within each card', () => {
    for (const card of CARDS) {
      expect(card.d[0]).not.toBe(card.d[1]);
    }
  });
});

describe('Card collection — answer differs from distractors', () => {
  it('answer is not equal to either distractor', () => {
    for (const card of CARDS) {
      expect(card.ans).not.toBe(card.d[0]);
      expect(card.ans).not.toBe(card.d[1]);
    }
  });
});

describe('Card collection — ww keys match distractors', () => {
  it('ww keys only reference actual distractors', () => {
    for (const card of CARDS) {
      if (!card.ww) continue;
      const wwKeys = Object.keys(card.ww);
      for (const key of wwKeys) {
        expect(card.d).toContain(key);
      }
    }
  });
});

describe('Card collection — unsafe HTML detection', () => {
  it('no card field contains HTML script tags', () => {
    for (const card of CARDS) {
      const allText = [
        ...card.bw,
        card.ans,
        ...card.d,
        card.tp,
        ...(card.ww ? Object.values(card.ww) : []),
        ...(card.pearls || [])
      ].join(' ');

      expect(allText).not.toMatch(/<script/i);
      expect(allText).not.toMatch(/javascript:/i);
      // Inline event-handler attributes inside an HTML tag (e.g. <img onerror=...>).
      // Plain prose like "Peritonitis = surgical emergency" is legitimate.
      expect(allText).not.toMatch(/<[a-z][^>]*\son\w+\s*=/i);
    }
  });
});
