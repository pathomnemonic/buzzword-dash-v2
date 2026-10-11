import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { ankiImport } from '../../js/ankiimport.js';

const require = createRequire(import.meta.url);

async function sqlite(flds) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const db = new SQL.Database();
  db.run('CREATE TABLE notes (id integer primary key, flds text)');
  flds.forEach((f, i) => db.run('INSERT INTO notes VALUES (?, ?)', [i + 1, f]));
  const d = db.export();
  db.close();
  return d;
}
async function apkg(files) {
  const JSZip = require('jszip');
  const zip = new JSZip();
  Object.keys(files).forEach((k) => zip.file(k, files[k]));
  const buf = await zip.generateAsync({ type: 'uint8array' });
  return { size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}
const STUB = 'Please update to the latest Anki version, then import the .colpkg/.apkg file again.\x1f';

describe('newest Anki export (collection.anki21b, zstd)', () => {
  it.skipIf(typeof zlib.zstdCompressSync !== 'function')('unpacks and reads it, ignoring the stand-in collection.anki2', async () => {
    const real = zlib.zstdCompressSync(Buffer.from(await sqlite(['Q one\x1fA one', '{{c1::Heparin}} binds {{c2::antithrombin}}\x1f'])));
    const f = await apkg({ meta: new Uint8Array([8, 3]), 'collection.anki21b': real, 'collection.anki2': await sqlite([STUB]) });
    const r = await ankiImport.parseApkg(f);
    expect(r.cards.map((c) => c.front)).toEqual(['Q one', '[...] binds antithrombin', 'Heparin binds [...]']);
    expect(r.cards[0].back).toBe('A one');
  });
  it('says so, and does not import the stand-in note, when the zstd file cannot be unpacked', async () => {
    const r = await ankiImport.parseApkg(await apkg({ 'collection.anki21b': new Uint8Array([1, 2, 3, 4]), 'collection.anki2': await sqlite([STUB]) }));
    expect(r.cards).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/newest Anki format/);
  });
  it('a deck holding only the "update Anki" stand-in imports nothing and explains why', async () => {
    const r = await ankiImport.parseApkg(await apkg({ 'collection.anki2': await sqlite([STUB]) }));
    expect(r.cards).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/Support older Anki versions/);
    expect(r.warnings.join(' ')).not.toMatch(/picture/);
  });
});

describe('HTML in fields', () => {
  it('keeps "<" and ">" that are part of the text, decodes numeric and named entities once', () => {
    expect(ankiImport.stripHtml('BP <90 and HR >100')).toBe('BP <90 and HR >100');
    expect(ankiImport.stripHtml('<b>CRP</b> &#8805; 10 &amp; ESR &#x2265; 20 &ndash; &beta;-blocker')).toBe('CRP ≥ 10 & ESR ≥ 20 – β-blocker');
    expect(ankiImport.stripHtml('literal &amp;lt;b&amp;gt;')).toBe('literal &lt;b&gt;');
    expect(ankiImport.stripHtml('<img src="x.png">pic<br/>[sound:a.mp3]text')).toBe('pic text');
  });
});

describe('Notes in Plain Text export with every option ticked', () => {
  const r = ankiImport.parseDelimitedText(readFileSync('tests/fixtures/anki-export-wide.txt', 'utf8'));
  it('skips comment and directive lines, drops guid/notetype/deck/tags columns, no stray commas', () => {
    expect(r.cards[0]).toEqual({ front: 'BP <90 and HR >100 in shock', back: 'Hypovolemic & septic shock ≥ 2 types' });
    expect(r.warnings).toEqual([]);
  });
  it('drops the "y" flag of optional-reversed notes', () => {
    expect(r.cards[1]).toEqual({ front: 'Antidote for heparin', back: 'Protamine' });
  });
  it('clozes keep their Extra field and no empty padding columns', () => {
    expect(r.cards[2].back).toBe('Warfarin (INR)');
  });
  it('a TSV without a #separator line is read as tabs even when the text has more commas than tabs', () => {
    const t = ankiImport.parseDelimitedText('Fever, rash, arthralgia, and malar rash\tSLE, anti-dsDNA, anti-Smith\nA, B, C, D, E\tF\n');
    expect(t.cards.length).toBe(2);
    expect(t.cards[0].front).toBe('Fever, rash, arthralgia, and malar rash');
  });
});
