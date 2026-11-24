import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { FREE_CARD_IDS } from '../../js/freecards.js';
import { CARD_BY_ID, loadCards } from '../../js/cardhub.js';

beforeAll(async () => { await loadCards(); });
const slate = JSON.parse(fs.readFileSync('social/week1-slate.json', 'utf8'));

describe('the social slate only uses free cards, with clues straight from the card', () => {
  it('every card is in the free 300', () => {
    for (const p of slate.posts) {
      for (const id of [p.card, ...(p.cards || [])].filter(Boolean)) expect(FREE_CARD_IDS.has(id), id).toBe(true);
    }
  });
  it('every clue is verbatim from its card, and the answer matches', () => {
    for (const p of slate.posts.filter((x) => x.type === 'clues')) {
      const c = CARD_BY_ID.get(p.card);
      expect(c.ans.startsWith(p.answer) || p.answer.startsWith(c.ans.split(' — ')[0]), p.card).toBe(true);
      expect(p.clues.slice().sort(), p.card).toEqual(c.bw.slice().sort());
    }
  });
  it('a duel\'s shared clue is on both cards and its separator only on one', () => {
    for (const p of slate.posts.filter((x) => x.type === 'duel')) {
      const [a, b] = p.cards.map((id) => CARD_BY_ID.get(id));
      expect(a.bw).toContain(p.shared_clue);
      expect(b.bw).toContain(p.shared_clue);
      const owner = CARD_BY_ID.get(p.separator_card);
      const other = p.cards.map((id) => CARD_BY_ID.get(id)).find((c) => c.id !== owner.id);
      expect(owner.bw).toContain(p.separator);
      expect(other.bw).not.toContain(p.separator);
    }
  });
});
