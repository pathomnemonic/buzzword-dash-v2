import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ankiImport } from '../../js/ankiimport.js';

const require = createRequire(import.meta.url);

async function makeApkg(entries, dbName = 'collection.anki21') {
  const JSZip = require('jszip');
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const db = new SQL.Database();
  db.run('CREATE TABLE notes (id integer primary key, flds text)');
  entries.forEach((flds, i) => db.run('INSERT INTO notes VALUES (?, ?)', [i + 1, flds]));
  const data = db.export();
  db.close();
  const zip = new JSZip();
  zip.file(dbName, data);
  zip.file('media', '{}');
  const buf = await zip.generateAsync({ type: 'uint8array' });
  return { size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

describe('Anki import', () => {
  it('reads front and back from an .apkg and strips HTML', async () => {
    const f = await makeApkg(['<b>Drug of choice for anaphylaxis</b>\x1fEpinephrine<br>IM', 'Antidote for heparin\x1fProtamine sulfate', 'only one field']);
    const r = await ankiImport.parseApkg(f);
    expect(r.cards).toEqual([
      { front: 'Drug of choice for anaphylaxis', back: 'Epinephrine IM' },
      { front: 'Antidote for heparin', back: 'Protamine sulfate' }
    ]);
  });

  it('turns cloze notes into one card per cloze number, with hints', async () => {
    const f = await makeApkg(['{{c1::Warfarin}} inhibits {{c2::vitamin K epoxide reductase::enzyme}}\x1fINR monitoring']);
    const r = await ankiImport.parseApkg(f);
    expect(r.cards).toEqual([
      { front: '[...] inhibits vitamin K epoxide reductase', back: 'Warfarin (INR monitoring)' },
      { front: 'Warfarin inhibits [enzyme]', back: 'vitamin K epoxide reductase (INR monitoring)' }
    ]);
  });

  it('prefers collection.anki21 (the real notes) over the stand-in collection.anki2', async () => {
    const JSZip = require('jszip');
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    const mk = (flds) => { const db = new SQL.Database(); db.run('CREATE TABLE notes (id integer, flds text)'); db.run('INSERT INTO notes VALUES (1, ?)', [flds]); const d = db.export(); db.close(); return d; };
    const zip = new JSZip();
    zip.file('collection.anki2', mk('Please update to the latest Anki version\x1fthen import again'));
    zip.file('collection.anki21', mk('Real question\x1fReal answer'));
    const buf = await zip.generateAsync({ type: 'uint8array' });
    const r = await ankiImport.parseApkg({ size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    expect(r.cards).toEqual([{ front: 'Real question', back: 'Real answer' }]);
  });

  it('explains the newest Anki format instead of importing the placeholder note', async () => {
    const stand = await makeApkg(['Please update to the latest Anki version\x1fthen import again'], 'collection.anki2');
    const r1 = await ankiImport.parseApkg(stand);
    expect(r1.cards).toEqual([]);
    expect(r1.warnings.join(' ')).toMatch(/Support older Anki versions/);
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file('collection.anki21b', new Uint8Array([1, 2, 3]));
    const buf = await zip.generateAsync({ type: 'uint8array' });
    const r2 = await ankiImport.parseApkg({ size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    expect(r2.cards).toEqual([]);
    expect(r2.warnings.join(' ')).toMatch(/newest Anki format/);
  });
});

describe('CSV and TSV import', () => {
  it('reads Anki text exports (tab separated), quoted fields and BOMs', () => {
    const tsv = '﻿Cardio\tFirst-line for stable angina\nQ2\t"Beta blocker, e.g. ""metoprolol"""\n';
    const r = ankiImport.parseDelimitedText(tsv);
    expect(r.cards).toEqual([
      { front: 'Cardio', back: 'First-line for stable angina' },
      { front: 'Q2', back: 'Beta blocker, e.g. "metoprolol"' }
    ]);
  });
  it('reads CSV with multiline quoted fields', () => {
    const r = ankiImport.parseDelimitedText('front,back\n"Line one\nline two",Answer\n', { hasHeaders: true });
    expect(r.cards).toEqual([{ front: 'Line one\nline two', back: 'Answer' }]);
  });
  it('imports raw cards as flashcard-only custom cards without placeholder answers', () => {
    expect(typeof ankiImport.importRaw).toBe('function');
  });
});

describe('Anki cards end up studyable', () => {
  it('imported cards are saved as flashcard-only custom cards and show up as new cards to study', async () => {
    localStorage.clear();
    const { customCards } = await import('../../js/customcards.js');
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const before = customCards.getAll().length;
    ankiImport.mount(document.createElement('div'), { customCards, storage, toast() {}, reportError() {} });
    const r = ankiImport.importRaw([{ front: 'What is the antidote for acetaminophen?', back: 'N-acetylcysteine' }, { front: '', back: 'x' }]);
    expect(r.imported).toBe(1);
    expect(r.rejected).toBe(1);
    const all = customCards.getAll();
    expect(all.length).toBe(before + 1);
    const added = all[all.length - 1];
    expect(added.enabledModes).toEqual(['flashcard']);
    expect(added.dist || []).toEqual([]);
    expect(added.ans).toBe('N-acetylcysteine');
    const { ui } = await import('../../js/ui.js');
    expect(ui._pickerPools().fresh).toContain(added.id);
    ankiImport.unmount();
  });
});
