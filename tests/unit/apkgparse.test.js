import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { Blob as NodeBlob } from 'node:buffer';
import zlib from 'node:zlib';
import { readApkg, friendlyApkgMessage } from '../../js/apkgparse.js';
import { ApkgError } from '../../js/apkgzip.js';
import { ankiImport } from '../../js/ankiimport.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const initSqlJs = require('sql.js');
const loadSql = () => initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });

async function makeDb(n, { cards = true } = {}) {
  const SQL = await loadSql();
  const db = new SQL.Database();
  db.run('CREATE TABLE notes (id integer primary key, guid text, mid integer, tags text, flds text)');
  db.run('CREATE TABLE cards (id integer primary key, nid integer, ord integer, queue integer)');
  db.run('BEGIN');
  for (let i = 1; i <= n; i++) {
    const cloze = i % 3 === 0;
    db.run('INSERT INTO notes VALUES (?,?,?,?,?)', [i * 1000, 'g' + i, 1, ' #AK::A::' + (i % 7) + ' #AK::B ', cloze ? `Cloze {{c1::alpha ${i}}} and {{c2::beta ${i}}}\x1fextra ${i}` : `Question ${i}\x1fAnswer ${i}`]);
    if (cards) {
      if (cloze) { db.run('INSERT INTO cards VALUES (?,?,?,?)', [i * 10, i * 1000, 0, i % 10 === 0 ? -1 : 0]); db.run('INSERT INTO cards VALUES (?,?,?,?)', [i * 10 + 1, i * 1000, 1, i % 10 === 0 ? -1 : 0]); }
      else db.run('INSERT INTO cards VALUES (?,?,?,?)', [i * 10, i * 1000, 0, i % 5 === 0 ? -2 : 0]);
    }
  }
  db.run('COMMIT');
  const data = db.export(); db.close();
  return data;
}
async function zipOf(files) {
  const z = new JSZip();
  Object.entries(files).forEach(([k, v]) => z.file(k, v, { compression: k.startsWith('collection') ? 'DEFLATE' : 'STORE' }));
  const buf = await z.generateAsync({ type: 'uint8array' });
  return new NodeBlob([buf]);
}
async function run(blob, extra) {
  const batches = []; const stages = [];
  const stats = await readApkg(blob, { emit: (b) => batches.push(b), onProgress: (s, d, t) => stages.push([s, d, t]), loadSql, ...extra });
  return { batches, stages, stats, cards: batches.flat() };
}

describe('reading notes in pages', () => {
  it('reads 3,500 notes in pages of 1,000, in order, with progress, and keeps suspended/buried per card', async () => {
    const blob = await zipOf({ 'collection.anki21': await makeDb(3500), media: '{}', '0': 'x'.repeat(50000) });
    const r = await run(blob, { notesPerPage: 1000 });
    expect(r.stats.notes).toBe(3500);
    expect(r.batches.length).toBe(4);
    expect(r.cards.length).toBe(2 * 1166 + (3500 - 1166));
    expect(r.cards[0].front).toBe('Question 1');
    expect(r.cards[2].front).toBe('Cloze [...] and beta 3');
    const notesStages = r.stages.filter((s) => s[0] === 'notes');
    expect(notesStages.map((s) => s[1])).toEqual([1000, 2000, 3000, 3500]);
    expect(notesStages[0][2]).toBe(3500);
    const c10 = r.cards.filter((c) => c.guid === 'g10');
    expect(c10.length).toBe(1); expect(c10[0].buried).toBe(true);
    const c30 = r.cards.filter((c) => c.guid === 'g30');
    expect(c30.length).toBe(2); expect(c30.every((c) => c.suspended)).toBe(true);
    expect(r.cards[0].tags).toEqual(['#AK::A::1', '#AK::B']);
  });
  it('can be cancelled between pages', async () => {
    const blob = await zipOf({ 'collection.anki21': await makeDb(2500) });
    let pages = 0;
    await expect(run(blob, { notesPerPage: 500, isCancelled: () => pages++ >= 3 })).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('reads a database that has no cards table or tags (a minimal one)', async () => {
    const SQL = await loadSql(); const db = new SQL.Database();
    db.run('CREATE TABLE notes (id integer, flds text)'); db.run("INSERT INTO notes VALUES (1, 'Q\x1fA')");
    const r = await run(await zipOf({ 'collection.anki2': db.export() }));
    expect(r.cards).toMatchObject([{ front: 'Q', back: 'A' }]);
  });
  it('reads the newest format (zstd) when this Node can compress it', async () => {
    if (typeof zlib.zstdCompressSync !== 'function') return;
    const z = zlib.zstdCompressSync(Buffer.from(await makeDb(1200)));
    const r = await run(await zipOf({ 'collection.anki21b': z, 'collection.anki2': 'stub' }), { notesPerPage: 500 });
    expect(r.stats.notes).toBe(1200);
    expect(r.stats.format).toBe('collection.anki21b');
  });
  it('speaks plainly about every failure', async () => {
    await expect(run(new NodeBlob([Buffer.from('not a zip')]))).rejects.toMatchObject({ code: 'not-zip' });
    await expect(run(await zipOf({ 'hello.txt': 'hi' }))).rejects.toMatchObject({ code: 'no-collection' });
    await expect(run(await zipOf({ 'collection.anki21': Buffer.from('this is not sqlite at all'.repeat(100)) }))).rejects.toMatchObject({ code: 'bad-db' });
    await expect(run(await zipOf({ 'collection.anki21b': Buffer.from([1, 2, 3, 4]) }))).rejects.toMatchObject({ code: 'zstd' });
    ['not-zip', 'corrupt', 'encrypted', 'no-collection', 'zstd', 'bad-db', 'memory', 'cancelled', 'unsupported', 'multi-disk'].forEach((code) => {
      const text = friendlyApkgMessage(new ApkgError(code, 'detail'));
      expect(text.length).toBeGreaterThan(20); expect(text).not.toMatch(/undefined|\[object/);
    });
  });
  it('parseApkg still returns {cards, warnings}, with the friendly sentence on failure', async () => {
    const ok = await ankiImport.parseApkg(await zipOf({ 'collection.anki21': await makeDb(10) }));
    expect(ok.cards.length).toBeGreaterThan(9);
    const bad = await ankiImport.parseApkg(new NodeBlob([Buffer.from('nope')]));
    expect(bad.cards).toEqual([]); expect(bad.warnings[0]).toMatch(/not an Anki deck package/);
  });
});
