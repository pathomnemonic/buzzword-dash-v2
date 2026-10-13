import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCard, checkDeck, norm, answerSupport, leaks, nearSame, isOneSentence, isOpposite } from '../../tools/opendecks/check.mjs';
import { packageDeck, cardKey } from '../../tools/opendecks/package.mjs';
import { validateCard } from '../../js/cardschema.js';

const PASSAGE = 'Title\nThe parathyroid glands produce and secrete PTH, a peptide hormone, in response to low blood calcium levels (Figure 17.16). PTH also inhibits osteoblasts, the cells involved in bone deposition.\nThe “thyroid” gland — it sits low.';
const good = () => ({
  subj: 'Endocrinology', bw: ['Peptide hormone', 'Released when blood calcium is low'], ans: 'Parathyroid hormone (PTH)', d: ['Calcitonin', 'Aldosterone'],
  tp: 'PTH raises blood calcium.', ww: { Calcitonin: 'Lowers calcium.', Aldosterone: 'Regulates sodium.' }, source_ref: 'p1',
  evidence: 'The parathyroid glands produce and secrete PTH, a peptide hormone, in response to low blood calcium levels (Figure 17.16).'
});
const codes = (c, passage) => checkCard(c, { passage: passage === undefined ? PASSAGE : passage }).errors.map((e) => e.code);

describe('check.mjs: one card', () => {
  it('passes a good card', () => { expect(codes(good())).toEqual([]); });
  it('rejects schema problems: bad subject, one wrong answer, ww keys that are not the wrong answers', () => {
    expect(codes(Object.assign(good(), { subj: 'Astrology' }))).toContain('schema');
    expect(codes(Object.assign(good(), { d: ['Calcitonin'] }))).toContain('schema');
    expect(codes(Object.assign(good(), { ww: { Calcitonin: 'a', Other: 'b' } }))).toContain('schema');
  });
  it('requires the evidence sentence to be in the passage (case, spacing and quotes normalised) and to be one sentence', () => {
    expect(codes(Object.assign(good(), { evidence: 'THE PARATHYROID  glands produce and secrete PTH, a peptide hormone, in response to low blood calcium levels (Figure 17.16).' }))).toEqual([]);
    expect(codes(Object.assign(good(), { evidence: 'PTH is made in the thyroid gland, a peptide hormone from low calcium.' }))).toContain('evidence_not_found');
    expect(codes(good(), null)).toContain('evidence');
    const two = 'The parathyroid glands produce and secrete PTH, a peptide hormone, in response to low blood calcium levels (Figure 17.16). PTH also inhibits osteoblasts, the cells involved in bone deposition.';
    expect(codes(Object.assign(good(), { evidence: two }))).toContain('evidence');
    expect(norm('“A” — b')).toBe('"a" - b');
    expect(isOneSentence('One sentence here (Figure 1.2).')).toBe(true);
  });
  it('flags an answer the evidence does not support (lexical screen)', () => {
    const c = Object.assign(good(), { ans: 'Antidiuretic hormone (ADH)', evidence: 'PTH also inhibits osteoblasts, the cells involved in bone deposition.' });
    expect(codes(c)).toContain('unsupported');
    expect(answerSupport('Parathyroid hormone (PTH)', 'It makes PTH')).toBe(1); // the bracketed abbreviation counts
  });
  it('flags an answer that leaks into the hint, in full or by its abbreviation', () => {
    expect(codes(Object.assign(good(), { bw: ['PTH is secreted', 'Low calcium'] }))).toContain('leak');
    expect(leaks('Secreted by parathyroid hormone cells', 'Parathyroid hormone (PTH)')).toBe(true);
    expect(leaks('Peptide hormone', 'Oxytocin')).toBe(false);
  });
  it('wrong answers must differ from the answer and each other, and not be near duplicates', () => {
    expect(codes(Object.assign(good(), { d: ['Parathyroid hormone', 'Aldosterone'], ww: { 'Parathyroid hormone': 'a', Aldosterone: 'b' } }))).toContain('options');
    expect(codes(Object.assign(good(), { d: ['Calcitonin', 'Calcitonins'], ww: { Calcitonin: 'a', Calcitonins: 'b' } }))).toContain('options');
    expect(nearSame('Beta cell', 'Beta cells')).toBe(true);
    expect(nearSame('Hypothyroidism', 'Hyperthyroidism')).toBe(false);
    expect(nearSame('Angiotensin II', 'Angiotensin I')).toBe(false);
    expect(nearSame('The afferent arteriole dilates', 'The efferent arteriole dilates')).toBe(false);
  });
  it('rejects all/none-of-the-above and N/A answers', () => {
    expect(codes(Object.assign(good(), { d: ['All of the above', 'Aldosterone'], ww: { 'All of the above': 'a', Aldosterone: 'b' } }))).toContain('options');
    expect(codes(Object.assign(good(), { d: ['N/A', 'Aldosterone'], ww: { 'N/A': 'a', Aldosterone: 'b' } }))).not.toEqual([]);
  });
  it('enforces runner length limits and no HTML', () => {
    expect(codes(Object.assign(good(), { bw: ['a', 'b', 'c', 'd'] }))).toContain('length');
    expect(codes(Object.assign(good(), { bw: ['x'.repeat(61)] }))).toContain('length');
    expect(codes(Object.assign(good(), { ans: 'Parathyroid hormone released when the blood calcium is low' }))).toContain('length');
    expect(codes(Object.assign(good(), { tp: 'y'.repeat(301) }))).toContain('length');
    expect(codes(Object.assign(good(), { bw: ['<b>Peptide</b> hormone'] }))).not.toEqual([]); // (the app's own validator already refuses HTML in a hint)
    expect(codes(Object.assign(good(), { ww: { Calcitonin: '<i>Lowers calcium.</i>', Aldosterone: 'Regulates sodium.' } }))).toContain('html');
    expect(codes(Object.assign(good(), { tp: 'Fish &amp; chips' }))).toContain('html');
  });
  it('runner fitness: no sentence answers, no plain-word opposites as wrong answers', () => {
    expect(codes(Object.assign(good(), { ans: 'It raises the blood calcium level by a lot', d: ['Calcitonin', 'Aldosterone'] }))).toContain('runner');
    expect(isOpposite('Both rise', 'Both fall')).toBe(true);
    expect(isOpposite('Hypothyroidism', 'Hyperthyroidism')).toBe(false);
    expect(codes(Object.assign(good(), { ans: 'Calcium rises', d: ['Calcium falls', 'Aldosterone'], ww: { 'Calcium falls': 'a', Aldosterone: 'b' }, evidence: 'The parathyroid glands produce and secrete PTH, a peptide hormone, in response to low blood calcium levels (Figure 17.16).' }))).toContain('runner');
  });
});

describe('check.mjs: a deck, and packaging', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-'));
  writeFileSync(join(dir, 'p1.txt'), PASSAGE);
  const header = { format: 1, id: 'test-deck', title: 'T', source: 'S', licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }, attribution: 'a', url: 'https://example.org/', version: '1.0.0' };
  it('drops the failures, finds duplicates, and reports header problems', () => {
    const dup = good();
    const bad = Object.assign(good(), { ans: 'Cortisol', bw: ['Different clue entirely', 'Steroid'], d: ['Calcitonin', 'Aldosterone'] });
    const res = checkDeck(Object.assign({}, header, { cards: [good(), dup, bad] }), { sourceDir: dir });
    expect(res.total).toBe(3);
    expect(res.passed.length).toBe(1);
    expect(res.byCode.duplicate).toBe(1);
    expect(res.byCode.unsupported).toBe(1);
    expect(checkDeck({ format: 1, cards: [good()] }, { sourceDir: dir }).header.join(' ')).toMatch(/missing or invalid header field: id/);
  });
  it('packages only passing cards, adds stable keys and the deck tag, and the app validator accepts them', () => {
    const r = packageDeck(Object.assign({}, header, { cards: [Object.assign(good(), { tags: ['T::A'] }), Object.assign(good(), { bw: ['x'.repeat(70)] })] }), dir);
    expect(r.deck.count).toBe(1);
    expect(r.deck.cards[0].tags).toEqual(['T::A', 'deck:test-deck']);
    expect(r.deck.cards[0].key).toBe(cardKey('test-deck', good()));
    expect(r.index).toMatchObject({ id: 'test-deck', count: 1, file: 'test-deck.json' });
    const c = r.deck.cards[0];
    expect(validateCard({ id: 'v1', subj: c.subj, bw: c.bw, ans: c.ans, d: c.d, tp: c.tp, ww: c.ww, isCustom: true }, { strict: false }).success).toBe(true);
  });
});

describe('the shipped pilot deck', () => {
  const deck = JSON.parse(readFileSync('public/decks/openstax-ap-1e.json', 'utf8'));
  const index = JSON.parse(readFileSync('public/decks/index.json', 'utf8'));
  it('is listed in the index with its licence and the counts agree', () => {
    const row = index.decks.find((d) => d.id === deck.id);
    expect(row.count).toBe(deck.cards.length);
    expect(row.licence.name).toBe('CC BY 4.0');
    expect(row.attribution).toMatch(/openstax\.org/);
    expect(row.size).toBeGreaterThan(1000);
  });
  it('passes every automatic check again, against the saved source passages', () => {
    const res = checkDeck(deck, { sourceDir: 'tools/opendecks/source/openstax-ap-1e' });
    expect(res.header).toEqual([]);
    expect(res.failed.map((f) => f.card.ans + ': ' + f.errors[0].message)).toEqual([]);
    expect(deck.cards.length).toBeGreaterThan(300);
  });
  it('has unique keys, every card has the deck tag, and the app validator accepts every card', () => {
    expect(new Set(deck.cards.map((c) => c.key)).size).toBe(deck.cards.length);
    deck.cards.forEach((c) => {
      expect(c.tags).toContain('deck:' + deck.id);
      const v = validateCard({ id: 'v', subj: c.subj, bw: c.bw, ans: c.ans, d: c.d, tp: c.tp, ww: c.ww, isCustom: true }, { strict: false });
      expect(v.success).toBe(true);
    });
  });
});
