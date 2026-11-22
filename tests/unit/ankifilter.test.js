import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { ankiImport } from '../../js/ankiimport.js';
import {
  buildTagTree, searchTree, createSelection, setIds, eligibleMask, stateOf, chosenIds, presetsFor, applyPresets, guessSubject, estimateBytes
} from '../../js/ankitags.js';
import { studyMethods } from '../../js/uistudy.js';

const require = createRequire(import.meta.url);

/** A tiny Anki collection with the real column names; each note: { guid, tags, flds, queues } (queues = queue per card ord). */
async function collection(notes, withCards = true) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const db = new SQL.Database();
  db.run('CREATE TABLE notes (id integer primary key, guid text, tags text, flds text)');
  if (withCards) db.run('CREATE TABLE cards (id integer primary key, nid integer, ord integer, queue integer)');
  let cid = 1;
  notes.forEach((n, i) => {
    db.run('INSERT INTO notes VALUES (?, ?, ?, ?)', [i + 1, n.guid, n.tags === undefined ? '' : ' ' + n.tags + ' ', n.flds]);
    if (withCards) (n.queues || [0]).forEach((q, ord) => db.run('INSERT INTO cards VALUES (?, ?, ?, ?)', [cid++, i + 1, ord, q]));
  });
  const d = db.export();
  db.close();
  return d;
}
async function apkgFile(db) {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('collection.anki21', db);
  zip.file('media', '{}');
  const buf = await zip.generateAsync({ type: 'uint8array' });
  return { name: 'deck.apkg', size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

const AK = '#AK_Step1_v12::#B&B::';
const NOTES = [
  { guid: 'g1', tags: AK + 'Cardiovascular::Heart_failure #AK_Step1_v12::#Sketchy_Pharm::Diuretics', flds: '{{c1::Furosemide}} blocks the {{c2::NKCC2::transporter}} in the loop of Henle\x1fLoop diuretic\x1fmy lecture note\x1f\x1fPathoma: ch 5' },
  { guid: 'g2', tags: AK + 'Neurology::Stroke #AK_Step2_v12::#UWorld::Step::2', flds: 'Most common cause of ischemic stroke?\x1fEmbolism from atrial fibrillation' },
  { guid: 'g3', tags: AK + 'Cardiovascular::Murmurs', flds: 'Holosystolic murmur at the apex radiating to the axilla\x1fMitral regurgitation', queues: [-1] },
  { guid: 'g4', tags: '', flds: 'An untagged card\x1fIts answer' },
  { guid: 'g5', tags: AK + 'Cardiovascular::Heart_failure', flds: 'BNP is released by\x1fVentricular myocytes\x1fan extra field', queues: [-2] },
  { guid: 'g6', tags: AK + 'Endocrinology', flds: '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4}}\x1f<img src="x.png">' }
];

describe('cloze notes', () => {
  it('builds a front that hides one cloze, a back with the answer, and the full sentence for teaching', () => {
    const c = ankiImport.clozeCards(['{{c1::Warfarin}} inhibits {{c2::vitamin K epoxide reductase::enzyme}}', 'INR monitoring', 'lecture']);
    expect(c.map((x) => x.front)).toEqual(['[...] inhibits vitamin K epoxide reductase', 'Warfarin inhibits [enzyme]']);
    expect(c.map((x) => x.back)).toEqual(['Warfarin', 'vitamin K epoxide reductase']);
    expect(c[0].full).toBe('Warfarin inhibits vitamin K epoxide reductase');
    expect(c[0].extra).toBe('INR monitoring · lecture');
  });
  it('several clozes with the same number blank together; numbers are ordered', () => {
    const c = ankiImport.clozeCards(['{{c2::B}} then {{c1::A}} and {{c1::C}}']);
    expect(c.map((x) => x.n)).toEqual([1, 2]);
    expect(c[0].front).toBe('B then [...] and [...]');
    expect(c[0].back).toBe('A, C');
  });
  it('nested clozes: the inner one stays visible on the outer card and hides on its own', () => {
    const c = ankiImport.clozeCards(['The {{c1::drug of choice is {{c2::epinephrine}} IM}} for anaphylaxis']);
    expect(c[0].front).toBe('The [...] for anaphylaxis');
    expect(c[0].back).toBe('drug of choice is epinephrine IM');
    expect(c[1].front).toBe('The drug of choice is [...] IM for anaphylaxis');
    expect(c[1].back).toBe('epinephrine');
  });
  it('keeps text, drops media and [sound:] tags, decodes entities', () => {
    const c = ankiImport.clozeCards(['<div>Take <b>{{c1::ASA}}</b> &amp; rest<img src="a.png">[sound:a.mp3]</div>']);
    expect(c[0].front).toBe('Take [...] & rest');
    expect(c[0].full).toBe('Take ASA & rest');
  });
  it('a note that is not a cloze returns null; markup that is not a cloze stays text', () => {
    expect(ankiImport.clozeCards(['plain'])).toBeNull();
    expect(ankiImport.clozeCards(['{{c1::open and never closed'])[0].back).toBe('open and never closed');
  });
});

describe('notes read from an Anki collection', () => {
  it('reads tags, guid, suspended and buried state, extra fields; skips image occlusion', async () => {
    const r = await ankiImport.parseApkg(await apkgFile(await collection(NOTES)));
    const byKey = Object.fromEntries(r.cards.map((c) => [c.key, c]));
    expect(Object.keys(byKey)).toEqual(['g1#c1', 'g1#c2', 'g2', 'g3', 'g4', 'g5']);
    expect(byKey['g1#c1'].tags).toEqual([AK + 'Cardiovascular::Heart_failure', '#AK_Step1_v12::#Sketchy_Pharm::Diuretics']);
    expect(byKey['g1#c1'].teach).toContain('Furosemide blocks the NKCC2 in the loop of Henle');
    expect(byKey['g1#c1'].teach).toContain('Loop diuretic · my lecture note · Pathoma: ch 5');
    expect(byKey['g1#c1'].hasExtra).toBe(true);
    expect(byKey['g2'].hasExtra).toBe(false);
    expect(byKey['g3'].suspended).toBe(true);
    expect(byKey['g2'].suspended).toBe(false);
    expect(byKey['g5'].buried).toBe(true);
    expect(byKey['g5'].hasExtra).toBe(true);
    expect(byKey['g4'].tags).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/1 note with only a picture/);
  });
  it('a cloze card is suspended only when its own card is', async () => {
    const r = await ankiImport.parseApkg(await apkgFile(await collection([{ guid: 'c', tags: 't', flds: '{{c1::a}} {{c2::b}}\x1f', queues: [0, -1] }])));
    expect(r.cards.map((c) => c.suspended)).toEqual([false, true]);
  });
  it('still reads a minimal database that has no cards table, guid or tags', async () => {
    const r = await ankiImport.parseApkg(await apkgFile(await collection(NOTES.slice(0, 2), false)));
    expect(r.cards.length).toBe(3);
    expect(r.cards.every((c) => c.suspended === false)).toBe(true);
  });
  it('reads a deck bigger than the old 5,000 cap in full', async () => {
    const many = Array.from({ length: 5200 }, (_, i) => ({ guid: 'x' + i, tags: 't::' + (i % 3), flds: 'Q' + i + '\x1fA' + i }));
    const r = await ankiImport.parseApkg(await apkgFile(await collection(many)));
    expect(r.cards.length).toBe(5200);
  });
});

describe('text exports carry guid and tags too', () => {
  it('reads the tags and guid columns of a Notes in Plain Text export', () => {
    const t = '#separator:tab\n#html:true\n#guid column:1\n#tags column:4\nG1\tQ one\tA one\ta::b c\nG2\t{{c1::X}} y\t\tz\n';
    const r = ankiImport.parseDelimitedText(t);
    expect(r.cards[0]).toMatchObject({ front: 'Q one', back: 'A one', tags: ['a::b', 'c'], key: 'G1' });
    expect(r.cards[1]).toMatchObject({ front: '[...] y', back: 'X', tags: ['z'], key: 'G2#c1' });
  });
  it('without a guid column the same text gets the same key, and one file never holds a key twice', () => {
    const a = ankiImport.parseDelimitedText('Q\tA\nQ\tA\nQ\tB\n');
    expect(a.cards.length).toBe(2);
    expect(a.cards[0].key).toBe(ankiImport.parseDelimitedText('Q\tA').cards[0].key);
  });
});

describe('the tag tree', () => {
  const recs = [
    { tags: ['A::B::C', 'A::B::D'] }, { tags: ['A::B'] }, { tags: ['A::E', 'X'] }, { tags: [] }, { tags: ['A::B::C'] }
  ];
  it('splits on :: and counts each card once per node', () => {
    const t = buildTagTree(recs);
    const A = t.root.kids.find((n) => n.name === 'A');
    expect(A.ids).toEqual([0, 1, 2, 4]);
    const B = A.kids.find((n) => n.name === 'B');
    expect(B.ids).toEqual([0, 1, 4]); // card 0 has two tags under B but counts once
    expect(B.kids.map((k) => [k.name, k.ids.length])).toEqual([['C', 2], ['D', 1]]);
    expect(t.untagged).toEqual([3]);
    expect(t.root.kids.map((n) => n.name)).toEqual(['A', 'X']);
  });
  it('checkbox states: all, some, none, and unchecking a parent clears its children', () => {
    const t = buildTagTree(recs);
    const sel = createSelection(recs.length, false);
    const mask = eligibleMask(recs, {});
    const B = t.root.kids[0].kids[0];
    expect(stateOf(B.ids, sel, mask).state).toBe('none');
    setIds(sel, B.kids[0].ids, true);
    expect(stateOf(B.ids, sel, mask).state).toBe('some');
    setIds(sel, B.ids, true);
    expect(stateOf(B.ids, sel, mask).state).toBe('all');
    setIds(sel, B.ids, false);
    expect(stateOf(B.kids[0].ids, sel, mask).state).toBe('none');
  });
  it('search keeps matching nodes and the nodes above them', () => {
    const t = buildTagTree(recs);
    const f = searchTree(t, 'c');
    expect(Object.keys(f.keep).sort()).toEqual(['A', 'A::B', 'A::B::C']);
    expect(f.matched.map((n) => n.path)).toEqual(['A::B::C']);
    expect(searchTree(t, '').keep).toBeNull();
  });
  it('filters change what is eligible and so the live count', () => {
    const r2 = [{ tags: ['a'], suspended: true }, { tags: ['a'], buried: true }, { tags: ['a'], hasExtra: true }, { tags: ['a'] }];
    const sel = createSelection(4, true);
    expect(chosenIds(sel, eligibleMask(r2, {})).length).toBe(4);
    expect(chosenIds(sel, eligibleMask(r2, { skipSuspended: true })).length).toBe(3);
    expect(chosenIds(sel, eligibleMask(r2, { skipSuspended: true, skipBuried: true })).length).toBe(2);
    expect(chosenIds(sel, eligibleMask(r2, { onlyExtra: true })).length).toBe(1);
  });
  it('presets: Step 1 / Step 2 / subject / resource, only those that exist, groups AND together', () => {
    const r = [
      { tags: [AK + 'Cardiovascular::Heart_failure'] },
      { tags: ['#AK_Step2_v12::#UWorld::Step::2', AK + 'Neurology::Stroke'] },
      { tags: ['#AK_Step2_v12::#B&B::Cardiology'] }
    ];
    const p = presetsFor(r);
    const ids = p.map((x) => x.id);
    expect(ids).toContain('step1'); expect(ids).toContain('step2'); expect(ids).not.toContain('step3');
    expect(ids).toContain('subj_Cardiology'); expect(ids).toContain('res_uworld');
    const step2 = applyPresets(r, p, ['step2']);
    expect(Array.from(step2)).toEqual([0, 1, 1]);
    const step2Cardio = applyPresets(r, p, ['step2', 'subj_Cardiology']);
    expect(Array.from(step2Cardio)).toEqual([0, 0, 1]);
    const either = applyPresets(r, p, ['step1', 'step2']);
    expect(Array.from(either)).toEqual([1, 1, 1]);
  });
  it('guesses the Dx Dash subject from tags only', () => {
    expect(guessSubject([AK + 'Cardiovascular::Heart_failure'])).toBe('Cardiology');
    expect(guessSubject(['#AK::Renal::Acid_base', '#AK::Renal'])).toBe('Nephrology');
    expect(guessSubject(['#AK::Biochemistry'])).toBe('Multisystem / Mixed');
    expect(guessSubject([])).toBe('Multisystem / Mixed');
  });
  it('estimates a size that grows with the text', () => {
    expect(estimateBytes({ front: 'a'.repeat(100), back: 'b', tags: ['t'] })).toBeGreaterThan(estimateBytes({ front: 'a', back: 'b', tags: ['t'] }));
  });
});

describe('re-import, chunks and storage', () => {
  let customCards;
  beforeEach(async () => {
    localStorage.clear();
    customCards = (await import('../../js/customcards.js')).customCards;
    ankiImport.mount(document.createElement('div'), { customCards, toast() {}, reportError() {} });
  });
  const rec = (i, extra) => Object.assign({ front: 'Question ' + i, back: 'Answer ' + i, teach: '', tags: ['#T::' + (i % 2)], key: 'k' + i }, extra || {});

  it('stores the tags and the subject the tags point at, as flashcard-only cards', async () => {
    const r = await ankiImport.importSelected([rec(1, { tags: [AK + 'Cardiovascular::Heart_failure'], teach: 'Full text — extra' })]);
    expect(r).toMatchObject({ imported: 1, updated: 0, saved: true });
    const c = customCards.getAll()[0];
    expect(c.tags).toEqual([AK + 'Cardiovascular::Heart_failure']);
    expect(c.subj).toBe('Cardiology');
    expect(c.tp).toBe('Full text — extra');
    expect(c.enabledModes).toEqual(['flashcard']);
    expect(c.ak).toBe('k1');
  });
  it('importing the same deck again updates in place instead of duplicating', async () => {
    const deck = [rec(1), rec(2), rec(3)];
    await ankiImport.importSelected(deck);
    const ids = customCards.getAll().map((c) => c.id);
    const again = await ankiImport.importSelected(deck);
    expect(again).toMatchObject({ imported: 0, updated: 0, unchanged: 3 });
    expect(customCards.getAll().length).toBe(3);
    const changed = await ankiImport.importSelected([rec(1, { back: 'A better answer' }), rec(4)]);
    expect(changed).toMatchObject({ imported: 1, updated: 1 });
    const all = customCards.getAll();
    expect(all.length).toBe(4);
    expect(all.find((c) => c.ak === 'k1').ans).toBe('A better answer');
    expect(all.find((c) => c.ak === 'k1').id).toBe(ids[0]); // same id, so its study history stays
  });
  it('imports in chunks, reports progress and lets the page breathe', async () => {
    const calls = [];
    let ticks = 0;
    const t = setInterval(() => ticks++, 0);
    const deck = Array.from({ length: 1300 }, (_, i) => rec(i));
    const r = await ankiImport.importSelected(deck, { onProgress: (d, n) => calls.push([d, n]) });
    clearInterval(t);
    expect(r.imported).toBe(1300);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[calls.length - 1]).toEqual([1300, 1300]);
    expect(calls.map((c) => c[0])).toEqual([...calls.map((c) => c[0])].sort((a, b) => a - b));
    expect(ticks).toBeGreaterThan(0);
  });
  it('stops at the limit the player allows, and the player can raise it', async () => {
    const r = await ankiImport.importSelected(Array.from({ length: 5100 }, (_, i) => rec(i)));
    expect(r.imported).toBe(5000);
    expect(r.limitReached).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/5000/);
    expect(customCards.setLimit(10000)).toBe(10000);
    const r2 = await ankiImport.importSelected(Array.from({ length: 5100 }, (_, i) => rec(i)));
    expect(r2.imported).toBe(100);
    expect(r2.unchanged).toBe(5000);
    expect(customCards.setLimit(1)).toBe(5000); // never below the default
    expect(customCards.setLimit(999999)).toBe(50000);
  });
  it('says so, and changes nothing, when the browser has no room', async () => {
    await ankiImport.importSelected([rec(1)]);
    const proto = localStorage;
    const orig = proto.setItem;
    proto.setItem = function () { throw new Error('QuotaExceededError'); };
    try {
      const r = await ankiImport.importSelected([rec(2), rec(3)]);
      expect(r.saved).toBe(false);
      expect(r.imported).toBe(0);
      expect(r.warnings.join(' ')).toMatch(/ran out of storage/);
    } finally { proto.setItem = orig; }
    expect(customCards.getAll().length).toBe(1);
  });
  it('a stored tag list is plain, short text', async () => {
    await ankiImport.importSelected([rec(1, { tags: ['leech', 'ok', 'ok', '<img src=x onerror=1>', 'x'.repeat(300)] })]);
    const tags = customCards.getAll()[0].tags;
    expect(tags).not.toContain('leech');
    expect(tags.filter((t) => t === 'ok').length).toBe(1);
    expect(tags.every((t) => t.length <= 100)).toBe(true);
  });
});

describe('flashcards show the tags', () => {
  it('a short line of the last tag parts, with the full tags on hover', () => {
    const line = studyMethods._flashcardTagLine([AK + 'Cardiovascular::Heart_failure', '#AK_Step1_v12::#Sketchy_Pharm::Diuretics', 'a', 'b']);
    expect(line.text).toContain('Heart failure');
    expect(line.text).toContain('Diuretics');
    expect(line.text).toContain('+1');
    expect(line.full).toContain('#AK_Step1_v12');
    expect(studyMethods._flashcardTagLine(['#AK::#UWorld::Step::2']).text).toContain('Step 2');
    expect(studyMethods._flashcardTagLine([])).toBeNull();
  });
});

describe('the popular deck flow on the importer screen', () => {
  async function mountAndLoad(notes) {
    localStorage.clear();
    const { customCards } = await import('../../js/customcards.js');
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const box = document.createElement('div');
    document.body.appendChild(box);
    ankiImport.mount(box, { customCards, storage, toast() {}, reportError() {} });
    const file = await apkgFile(await collection(notes));
    const input = box.querySelector('.anki-dropzone input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 40 && !box.querySelector('.anki-filter'); i++) await new Promise((r) => setTimeout(r, 25));
    return { box, customCards };
  }
  const click = (el) => el.click();

  it('lists the popular decks with official links and three steps, and explains why nothing downloads by itself', () => {
    const box = document.createElement('div');
    ankiImport.mount(box, { customCards: { getAll: () => [] }, toast() {}, reportError() {} });
    const links = Array.from(box.querySelectorAll('.popular-deck a'));
    expect(links.length).toBeGreaterThanOrEqual(5);
    links.forEach((a) => { expect(a.href).toMatch(/^https:\/\//); expect(a.rel).toMatch(/noopener/); expect(a.target).toBe('_blank'); });
    expect(box.querySelector('[data-deck="anking-step"] a').href).toBe('https://www.ankihub.net/step-deck');
    expect(box.querySelectorAll('.anki-popular ol li').length).toBe(3);
    expect(box.textContent).toMatch(/Why is there no automatic download/);
    expect(box.textContent).not.toMatch(/Import automatically/);
    ankiImport.unmount();
  });

  it('after a file is read: tag tree with counts, live count, filters, then imports exactly the picked part', async () => {
    const { box, customCards } = await mountAndLoad(NOTES);
    const panel = box.querySelector('.anki-filter');
    expect(panel.textContent).toMatch(/Found 6 cards/);
    expect(panel.textContent).toMatch(/1 suspended/);
    // suspended skipped by default: 5 of 6 cards
    expect(panel.textContent).toMatch(/5 cards will be imported/);
    const tree = panel.querySelector('[role="tree"]');
    expect(tree.textContent).toContain('#AK_Step1_v12');
    expect(tree.textContent).toContain('(untagged)');
    // quick filter: Step 2 only
    const step2 = panel.querySelector('[data-preset="step2"]');
    click(step2);
    expect(step2.getAttribute('aria-pressed')).toBe('true');
    expect(panel.textContent).toMatch(/1 card will be imported/);
    click(step2);
    // untick the suspended toggle: 6 cards... (image occlusion note was never read)
    click(panel.querySelector('[data-filter="skipSuspended"]'));
    expect(panel.textContent).toMatch(/6 cards will be imported/);
    // select none, then tick one node
    Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === 'Select none').click();
    expect(panel.textContent).toMatch(/0 cards will be imported|Nothing selected/);
    const unt = Array.from(tree.querySelectorAll('[role="treeitem"]')).find((r) => r.textContent.includes('(untagged)'));
    unt.querySelector('input[type="checkbox"]').click();
    expect(panel.textContent).toMatch(/1 card will be imported/);
    const importBtn = panel.querySelector('[data-role="filter-import"]');
    expect(importBtn.textContent).toBe('Import 1 card');
    importBtn.click();
    for (let i = 0; i < 40 && !/\d+ new,|\d+ new\./.test(panel.textContent); i++) await new Promise((r) => setTimeout(r, 25));
    expect(customCards.getAll().map((c) => c.ak)).toEqual(['g4']);
    expect(panel.textContent).toMatch(/1 new/);
    ankiImport.unmount();
  });

  it('imported text from a deck is shown as text, never as markup', async () => {
    const evil = [{ guid: 'e1', tags: '<img src=x onerror=window.__pwn=1>::b', flds: '<img src=x onerror=window.__pwn=1>Q\x1fA' }];
    const { box } = await mountAndLoad(evil);
    expect(box.querySelector('.anki-filter [role="tree"] img')).toBeNull();
    expect(window.__pwn).toBeUndefined();
    ankiImport.unmount();
  });

  it('searching the tags narrows the tree and Select matches picks them', async () => {
    const { box } = await mountAndLoad(NOTES);
    const panel = box.querySelector('.anki-filter');
    const search = panel.querySelector('input[type="search"]');
    search.value = 'stroke';
    search.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 300));
    const rows = Array.from(panel.querySelectorAll('[role="treeitem"]')).map((r) => r.textContent);
    expect(rows.some((t) => t.includes('Stroke'))).toBe(true);
    expect(rows.some((t) => t.includes('Murmurs'))).toBe(false);
    Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === 'Select matches').click();
    expect(panel.textContent).toMatch(/1 card will be imported/);
    ankiImport.unmount();
  });
});
