import { describe, it, expect, beforeEach } from 'vitest';
import { customCards } from '../../js/customcards.js';
import { loadIndex, addDeck, removeDeck, installed, deckToInputs, sourceLine, credits } from '../../js/opendecks.js';
import { getCardPool } from '../../js/game/gates.js';
import { parseAiReply } from '../../js/importguide.js';

const ENTRY = { id: 'demo-deck', title: 'Demo', source: 'Demo Book', licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }, count: 2, size: 2048, version: '1.0.0', file: 'demo-deck.json', attribution: 'x', url: 'https://example.org/' };

function card(n, extra) {
  return Object.assign({
    subj: 'Cardiology', bw: ['Clue ' + n + ' a', 'Clue ' + n + ' b'], ans: 'Answer ' + n, d: ['Wrong ' + n + 'x', 'Wrong ' + n + 'y'], tp: 'Teach ' + n + '.',
    ww: { ['Wrong ' + n + 'x']: 'Because x.', ['Wrong ' + n + 'y']: 'Because y.' }, tags: ['Demo::Heart::T' + n], source_ref: 's' + n, evidence: 'E' + n + ' is a sentence.', key: 'demo-deck:k' + n
  }, extra || {});
}
function deckFile(version, cards) {
  return { format: 1, id: 'demo-deck', title: 'Demo', source: 'Demo Book', licence: ENTRY.licence, attribution: 'x', url: ENTRY.url, version, count: cards.length, discipline: 'physiology', cards };
}
function fakeFetch(files) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const name = String(url).replace(/^.*decks\//, '');
    if (!(name in files)) return { ok: false, status: 404, text: async () => '' };
    const v = files[name];
    if (v instanceof Error) throw v;
    const text = JSON.stringify(v);
    return { ok: true, status: 200, headers: { get: () => String(text.length) }, text: async () => text };
  };
  fn.calls = calls;
  return fn;
}

beforeEach(() => { localStorage.clear(); customCards.clear(); });

describe('Open decks: add, update, remove', () => {
  it('adds a deck as runner AND flashcard cards, with attribution, tags and subject filter intact', async () => {
    const f = fakeFetch({ 'demo-deck.json': deckFile('1.0.0', [card(1), card(2)]) });
    const progress = [];
    const r = await addDeck(ENTRY, { customCards, fetchFn: f, onProgress: (p) => progress.push(p) });
    expect(r).toMatchObject({ ok: true, imported: 2, updated: 0, removed: 0 });
    expect(progress).toContain('download');
    const mine = customCards.getAll().filter((c) => c.deck === 'demo-deck');
    expect(mine.length).toBe(2);
    expect(mine[0].attr).toBe('Demo Book, CC BY 4.0');
    expect(mine[0].tags).toEqual(['Demo::Heart::T1']);
    expect(mine[0].source).toBe('physiology');
    expect(mine[0].d.length).toBe(2); // real wrong answers: not flashcard-only
    // a runner pool (any runner mode) and the flashcard pool both contain them; subject filter still applies
    const runner = getCardPool({ subjects: ['Cardiology'], filters: {}, mode: 'endless' });
    expect(runner.cards.filter((c) => c.deck === 'demo-deck').length).toBe(2);
    const fc = getCardPool({ subjects: ['Cardiology'], filters: {}, mode: 'flashcard' });
    expect(fc.cards.filter((c) => c.deck === 'demo-deck').length).toBe(2);
    const other = getCardPool({ subjects: ['Neurology'], filters: {}, mode: 'endless' });
    expect(other.cards.some((c) => c.deck === 'demo-deck')).toBe(false);
    expect(installed(customCards)['demo-deck'].count).toBe(2);
  });

  it('a player’s own flashcard-only import stays out of the runner pool', async () => {
    await customCards.upsertMany([{ subject: 'Cardiology', buzzwords: ['Front'], answer: 'Back', distractors: [], teachingPoint: 'Back', key: 'anki:1', tags: [] }]);
    await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': deckFile('1.0.0', [card(1)]) }) });
    const runner = getCardPool({ subjects: ['Cardiology'], filters: {}, mode: 'endless' });
    expect(runner.cards.some((c) => c.ak === 'anki:1')).toBe(false);
    expect(runner.cards.some((c) => c.deck === 'demo-deck')).toBe(true);
    const fc = getCardPool({ subjects: ['Cardiology'], filters: {}, mode: 'flashcard' });
    expect(fc.cards.some((c) => c.ak === 'anki:1')).toBe(true);
  });

  it('re-adding updates in place: same ids, changed cards updated, dropped cards retired, nothing duplicated', async () => {
    await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': deckFile('1.0.0', [card(1), card(2)]) }) });
    const ids = Object.fromEntries(customCards.getAll().map((c) => [c.ak, c.id]));
    const v2 = deckFile('1.1.0', [card(1, { d: ['Better wrong', 'Wrong 1y'], ww: { 'Better wrong': 'z', 'Wrong 1y': 'Because y.' } }), card(3)]);
    const r = await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': v2 }) });
    expect(r).toMatchObject({ ok: true, imported: 1, updated: 1, removed: 1 });
    const now = customCards.getAll().filter((c) => c.deck === 'demo-deck');
    expect(now.map((c) => c.ak).sort()).toEqual(['demo-deck:k1', 'demo-deck:k3']);
    expect(now.find((c) => c.ak === 'demo-deck:k1').id).toBe(ids['demo-deck:k1']);
    expect(now.find((c) => c.ak === 'demo-deck:k1').d[0]).toBe('Better wrong');
    // adding the same version again changes nothing
    const again = await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': v2 }) });
    expect(again).toMatchObject({ ok: true, imported: 0, updated: 0, unchanged: 2 });
  });

  it('removing a deck removes exactly its cards', async () => {
    await customCards.upsertMany([{ subject: 'Cardiology', buzzwords: ['Front'], answer: 'Back', distractors: [], teachingPoint: 'Back', key: 'anki:1', tags: [] }]);
    await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': deckFile('1.0.0', [card(1), card(2)]) }) });
    expect(removeDeck('demo-deck', customCards)).toBe(2);
    expect(customCards.getAll().map((c) => c.ak)).toEqual(['anki:1']);
    expect(installed(customCards)['demo-deck']).toBeUndefined();
  });

  it('can add only the chosen topics and leaves the rest of the deck alone', async () => {
    const deck = deckFile('1.0.0', [card(1), card(2), card(3)]);
    const r = await addDeck(ENTRY, { customCards, deck, only: new Set(['demo-deck:k2']), fetchFn: fakeFetch({}) });
    expect(r.imported).toBe(1);
    await addDeck(ENTRY, { customCards, deck, only: new Set(['demo-deck:k3']), fetchFn: fakeFetch({}) });
    expect(customCards.getAll().map((c) => c.ak).sort()).toEqual(['demo-deck:k2', 'demo-deck:k3']);
  });

  it('says so in plain words when offline, on a bad file, on a 404, and when cancelled; nothing is added', async () => {
    const off = await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': new TypeError('Failed to fetch') }) });
    expect(off.ok).toBe(false);
    expect(off.error).toMatch(/No connection/);
    const gone = await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({}) });
    expect(gone.error).toMatch(/404/);
    const bad = await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': { format: 7, id: 'demo-deck', cards: [] } }) });
    expect(bad.error).toMatch(/not in a format/);
    const cancelled = await addDeck(ENTRY, { customCards, fetchFn: fakeFetch({ 'demo-deck.json': deckFile('1.0.0', [card(1)]) }), isCancelled: () => true });
    expect(cancelled).toMatchObject({ ok: false, cancelled: true });
    expect(customCards.getAll().length).toBe(0);
  });

  it('refuses a deck whose id does not match its list entry', async () => {
    const r = await addDeck(Object.assign({}, ENTRY, { id: 'other-deck' }), { customCards, fetchFn: fakeFetch({ 'demo-deck.json': deckFile('1.0.0', [card(1)]) }) });
    expect(r.ok).toBe(false);
  });
});

describe('Open decks: the list and the credits', () => {
  it('reads the list, ignores malformed rows, and fails gracefully', async () => {
    const good = await loadIndex(fakeFetch({ 'index.json': { format: 1, decks: [ENTRY, { id: 'BAD ID' }, { id: 'no-title', count: 3 }] } }).bind(null), {});
    // (the fake maps any url ending in decks/<name>; the list lives at decks/index.json)
    expect(good.ok).toBe(true);
    expect(good.decks.map((d) => d.id)).toEqual(['demo-deck']);
    const off = await loadIndex(fakeFetch({ 'index.json': new TypeError('Failed to fetch') }), {});
    expect(off).toMatchObject({ ok: false, decks: [] });
    expect(off.error).toMatch(/No connection/);
  });
  it('builds the one-line source and the credits list with licence links', () => {
    expect(sourceLine(ENTRY)).toBe('Demo Book, CC BY 4.0');
    const c = credits([ENTRY]);
    expect(c[0].licence.url).toMatch(/^https:\/\/creativecommons\.org\//);
    expect(c[0].url).toBe(ENTRY.url);
  });
  it('turns deck cards into upsert inputs and skips malformed ones', () => {
    const inputs = deckToInputs(deckFile('1.0.0', [card(1), { subj: 'Cardiology', bw: ['x'], ans: 'y', d: ['only one'], key: 'k' }]));
    expect(inputs.length).toBe(1);
    expect(inputs[0]).toMatchObject({ deck: 'demo-deck', key: 'demo-deck:k1', whyWrong1: 'Because x.' });
  });
});

describe('the real AI reply parser keeps the provenance fields', () => {
  it('carries source_ref and evidence through', () => {
    const reply = JSON.stringify([{ subj: 'Cardiology', bw: ['Rate unrelated to demand', 'Alkaline pH'], ans: 'Hyperventilation', d: ['Eupnea', 'Hyperpnea'], tp: 't', ww: { Eupnea: 'a', Hyperpnea: 'b' }, source_ref: '22.6', evidence: 'A sentence from the passage.' }]);
    const r = parseAiReply(reply);
    expect(r.cards[0]).toMatchObject({ source_ref: '22.6', evidence: 'A sentence from the passage.' });
  });
});
