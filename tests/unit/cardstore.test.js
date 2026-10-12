import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFakeIndexedDB } from './fakeidb.js';

const KEY = 'buzzword_dash_custom_cards';
const input = (i, extra) => ({ subject: 'Cardiology', buzzwords: ['clue ' + i], answer: 'answer ' + i, distractors: [], teachingPoint: 'tp ' + i, tags: ['a::b'], key: 'k' + i, enabledModes: ['flashcard'], ...extra });
let fake;
async function fresh() {
  vi.resetModules();
  const { customCards } = await import('../../js/customcards.js');
  return customCards;
}
beforeEach(() => { localStorage.clear(); fake = createFakeIndexedDB(); globalThis.indexedDB = fake; });
afterEach(() => { delete globalThis.indexedDB; });

describe('cards in IndexedDB', () => {
  it('loads at start, serves synchronous reads from memory, and saves in batches (pages, not one row per card)', async () => {
    const cc = await fresh();
    expect(await cc.init()).toMatchObject({ mode: 'idb', migrated: 0 });
    expect(cc.getHardLimit()).toBe(100000);
    const r = await cc.upsertMany(Array.from({ length: 1300 }, (_, i) => input(i)));
    expect(r).toMatchObject({ added: 1300, saved: true });
    expect(cc.getAll()).toBe(cc.getAll()); // the cache itself: no re-parsing per call
    expect(fake.dbs.get('dxdash_cards').stores.get('cards').data.size).toBe(6); // 1300 cards in pages of 250
    expect(localStorage.getItem(KEY)).toBeNull();
    // a new session sees the same cards in the same order
    const again = await fresh(); await again.init();
    expect(again.count()).toBe(1300);
    expect(again.getAll()[0].bw[0]).toBe('clue 0'); expect(again.getAll()[1299].bw[0]).toBe('clue 1299');
    expect(again.getById(cc.getAll()[700].id).ans).toBe('answer 700');
  });
  it('write-behind: edits, removals and clear reach the disk after a flush', async () => {
    const cc = await fresh(); await cc.init();
    const a = cc.add({ subject: 'Cardiology', buzzwords: ['one'], answer: 'A', distractors: [], teachingPoint: 'x' }).card;
    cc.add({ subject: 'Cardiology', buzzwords: ['two'], answer: 'B', distractors: [], teachingPoint: 'x' });
    cc.add({ subject: 'Cardiology', buzzwords: ['three'], answer: 'C', distractors: [], teachingPoint: 'x' });
    await cc.flush();
    cc.update(a.id, { subject: 'Cardiology', buzzwords: ['one!'], answer: 'A2', distractors: [], teachingPoint: 'y' });
    cc.remove(cc.getAll()[1].id);
    await cc.flush();
    let s = await fresh(); await s.init();
    expect(s.getAll().map((c) => c.ans)).toEqual(['A2', 'C']);
    s.clear(); await s.flush();
    s = await fresh(); await s.init();
    expect(s.count()).toBe(0);
  });
  it('batches several quick edits into one write', async () => {
    const cc = await fresh(); await cc.init();
    const before = fake.putCount;
    for (let i = 0; i < 20; i++) cc.add({ subject: 'Cardiology', buzzwords: ['c' + i], answer: 'a' + i, distractors: [], teachingPoint: 'x' });
    await cc.flush();
    expect(fake.putCount - before).toBe(1);
  });
  it('an import that does not fit changes nothing, and says why', async () => {
    const cc = await fresh(); await cc.init();
    await cc.upsertMany([input(1), input(2)]);
    fake.failPuts = true;
    const r = await cc.upsertMany(Array.from({ length: 600 }, (_, i) => input(100 + i)));
    expect(r).toMatchObject({ saved: false, added: 0, errorCode: 'quota' });
    expect(r.warnings[0]).toMatch(/ran out of storage space.*unchanged/);
    expect(cc.count()).toBe(2);
    fake.failPuts = false;
    const s = await fresh(); await s.init();
    expect(s.count()).toBe(2);
    // and it works again afterwards, with no gaps in the pages
    expect((await cc.upsertMany([input(500)])).added).toBe(1);
    expect(cc.count()).toBe(3);
  });
  it('cancelling an import leaves the earlier cards alone', async () => {
    const cc = await fresh(); await cc.init();
    await cc.upsertMany([input(1)]);
    let calls = 0;
    const r = await cc.upsertMany(Array.from({ length: 2000 }, (_, i) => input(10 + i)), { isCancelled: () => ++calls > 2 });
    expect(r.cancelled).toBe(true); expect(r.added).toBe(0);
    expect(cc.count()).toBe(1);
  });
  it('importing the same deck again updates in place: no duplicates, and nothing is rewritten when nothing changed', async () => {
    const cc = await fresh(); await cc.init();
    const deck = Array.from({ length: 700 }, (_, i) => input(i));
    await cc.upsertMany(deck);
    const ids = cc.getAll().map((c) => c.id);
    const puts = fake.putCount;
    const same = await cc.upsertMany(deck);
    expect(same).toMatchObject({ added: 0, updated: 0, unchanged: 700 });
    expect(fake.putCount).toBe(puts);
    const changed = await cc.upsertMany([input(5, { answer: 'better' })]);
    expect(changed).toMatchObject({ updated: 1, added: 0 });
    expect(cc.getAll().map((c) => c.id)).toEqual(ids);
    expect(cc.getAll()[5].ans).toBe('better');
  });
  it('search uses an index that follows the list', async () => {
    const cc = await fresh(); await cc.init();
    await cc.upsertMany([input(1), input(2, { buzzwords: ['needle clue'] })]);
    expect(cc.search('needle').map((c) => c.bw[0])).toEqual(['needle clue']);
    expect(cc.search('a::b').length).toBe(2);
    cc.remove(cc.getAll()[1].id);
    expect(cc.search('needle')).toEqual([]);
  });
});

describe('moving the old localStorage cards across', () => {
  const old = [1, 2, 3].map((i) => ({ id: 'old' + i, subj: 'Cardiology', bw: ['old ' + i], ans: 'o' + i, d: ['x', 'y'], tp: 't', ww: {}, isCustom: true }));
  it('migrates once, keeps the order, removes the old entry, and ignores junk', async () => {
    localStorage.setItem(KEY, JSON.stringify([...old, null, { id: 5 }, 'junk']));
    const cc = await fresh();
    expect(await cc.init()).toMatchObject({ mode: 'idb', migrated: 3 });
    expect(cc.getAll().map((c) => c.id)).toEqual(['old1', 'old2', 'old3']);
    expect(localStorage.getItem(KEY)).toBeNull();
    const again = await fresh();
    expect(await again.init()).toMatchObject({ mode: 'idb', migrated: 0 });
    expect(again.count()).toBe(3);
  });
  it('a copy that did not fit stays in localStorage and the cards stay usable', async () => {
    localStorage.setItem(KEY, JSON.stringify(old));
    fake.failPuts = true;
    const cc = await fresh();
    expect(await cc.init()).toMatchObject({ mode: 'ls' });
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(cc.getAll().map((c) => c.id)).toEqual(['old1', 'old2', 'old3']);
    expect(cc.getHardLimit()).toBe(50000);
  });
  it('does not lose or double cards when a migration was interrupted (some already in IndexedDB)', async () => {
    const cc = await fresh(); await cc.init();
    await cc.upsertMany([input(1)]);
    const idOfFirst = cc.getAll()[0].id;
    localStorage.setItem(KEY, JSON.stringify([{ id: idOfFirst, subj: 'Cardiology', bw: ['dup'], ans: 'd', d: [], tp: 't', ww: {} }, ...old]));
    const s = await fresh(); await s.init();
    expect(s.count()).toBe(4);
    expect(s.getAll().filter((c) => c.id === idOfFirst).length).toBe(1);
  });
});

describe('when IndexedDB cannot be used', () => {
  it('falls back to localStorage (private mode / blocked), with the old limits', async () => {
    delete globalThis.indexedDB;
    const cc = await fresh();
    expect(await cc.init()).toMatchObject({ mode: 'ls' });
    expect(cc.getDefaultLimit()).toBe(5000);
    await cc.upsertMany([input(1)]);
    expect(JSON.parse(localStorage.getItem(KEY)).length).toBe(1);
  });
  it('falls back when opening fails or never answers', async () => {
    fake.failOpen = true;
    const cc = await fresh();
    expect(await cc.init()).toMatchObject({ mode: 'ls' });
    await cc.upsertMany([input(1)]);
    expect(cc.count()).toBe(1);
  });
});
