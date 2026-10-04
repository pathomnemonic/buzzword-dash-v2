import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { deckGenericWords, strictLeakReport, strictClueLeak } from '../../js/cardleaks.js';

async function rawCards() {
  const files = readdirSync('js/cards').filter((f) => f.endsWith('.js'));
  const out = [];
  for (const f of files) {
    const mod = await import('../../js/cards/' + f);
    Object.values(mod).forEach((v) => { if (Array.isArray(v)) out.push(...v); });
  }
  return out;
}

describe('strict clue-leak detector', () => {
  const generic = new Set();
  it('catches the CLL Rai staging card that slipped through before', () => {
    const card = { ans: 'CLL Rai Staging', d: ['Ann Arbor Staging', 'TNM Staging'] };
    expect(strictClueLeak('CLL staging', card, generic)).toMatch(/cll/);
    expect(strictClueLeak('Rai staging system', card, generic)).toMatch(/rai/);
    expect(strictClueLeak('Lymphocytosis alone = stage 0', card, generic)).toBe('');
  });
  it('catches acronyms spelled out and answer initials', () => {
    const card = { ans: 'SBP Prophylaxis', d: ['Empiric Antibiotics'] };
    expect(strictClueLeak('Spontaneous bacterial peritonitis prevention', card, generic)).toMatch(/spells out/);
    expect(strictClueLeak('Norfloxacin', card, generic)).toBe('');
  });
});

describe('built-in cards never hand the player the answer', () => {
  it('no clue contains a distinctive word, the initials, the spelled-out acronym or the whole answer', async () => {
    const cards = await rawCards();
    expect(cards.length).toBeGreaterThan(2500);
    const generic = deckGenericWords(cards.map((c) => c.ans));
    const bad = [];
    cards.forEach((c) => strictLeakReport(c, generic).leaking.forEach((l) => bad.push(c.id + ' [' + c.ans + '] "' + l.clue + '" ' + l.why)));
    expect(bad).toEqual([]);
  });
  it('every built-in card keeps at least three clues', async () => {
    const cards = await rawCards();
    const thin = cards.filter((c) => (c.bw || []).length < 3).map((c) => c.id);
    expect(thin).toEqual([]);
  });
});
