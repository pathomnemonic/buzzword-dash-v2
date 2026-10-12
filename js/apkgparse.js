/**
 * apkgparse.js — reads the notes out of an .apkg / .colpkg in small steps, so a 30,000-note AnKing deck works on a phone.
 *
 * Steps (each reports progress and checks for cancel):
 *   1. apkgzip.js finds the collection database inside the ZIP and streams just that entry (media is never read),
 *   2. a zstd stream (new Anki format) or the plain bytes become one Uint8Array,
 *   3. sql.js opens it; notes are read in pages (keyset paging on the note id, only the columns needed), turned into
 *      records by ankinotes.js and handed to `emit` in batches. The page can paint between pages,
 *   4. the database is closed and the memory released, whatever happens.
 *
 * Runs on the page or inside apkgworker.js (a Web Worker), unchanged. No DOM, no app imports.
 */

import { ApkgError, asBlob, findEntries, streamEntry, joinChunks } from './apkgzip.js';
import { noteRecords, splitTags } from './ankinotes.js';

export var MAX_PARSED_CARDS = 100000;   // a hard ceiling on what one file may read into memory
export var NOTES_PER_PAGE = 1500;       // notes read per step (a few MB of text)
var DB_NAMES = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];

/** sql.js with its bundled WebAssembly file (works offline; the CSP allows wasm). */
export async function loadSqlJs() {
  var mods = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  var init = mods[0].default || mods[0];
  var wasmUrl = mods[1].default;
  if (typeof location !== 'undefined' && location.href) {
    try { wasmUrl = new URL(wasmUrl, location.href).href; } catch (e) { /* keep the relative URL */ }
  }
  return init({ locateFile: function () { return wasmUrl; } });
}

/** The sentence a player sees for a failure (never a stack trace or a code). */
export function friendlyApkgMessage(err) {
  var code = err && err.code;
  switch (code) {
    case 'not-zip': return 'That file is not an Anki deck package. In Anki choose File > Export, pick "Anki Deck Package (*.apkg)" and use the file it makes. If it came from a download, the download may have stopped early: try it again.';
    case 'corrupt': return 'That deck file looks damaged or incomplete (' + ((err && err.message) || 'it could not be read') + '). If you downloaded it, download it again; if you exported it, export it again.';
    case 'encrypted': return 'That deck file is password-protected, which cannot be read here. Export it again from Anki without a password.';
    case 'multi-disk': return 'That deck is split into several parts. Export it from Anki as a single .apkg file.';
    case 'unsupported': return 'That deck uses a package format this app cannot read yet. In Anki choose Export, tick "Support older Anki versions", and import the new file.';
    case 'no-collection': return 'Could not find any notes in that file. It is a ZIP, but not an Anki deck. Re-export the deck from Anki with "Support older Anki versions" ticked.';
    case 'zstd': return 'This deck uses the newest Anki format and could not be unpacked. In Anki choose Export, tick "Support older Anki versions", and import the new file.';
    case 'bad-db': return 'The notes inside that file could not be read (the database is damaged or protected). Export the deck from Anki again.';
    case 'memory': return 'This phone ran out of memory reading that deck. Close other apps and tabs and try again, or export a smaller part of the deck from Anki (one subdeck) and import it in parts.';
    case 'cancelled': return 'Cancelled. Nothing was imported.';
    default: return 'Could not read that file: ' + ((err && err.message) || String(err));
  }
}

/** Is this an out-of-memory failure (WebAssembly and typed-array allocations fail with RangeError)? */
function isMemoryError(e) {
  return !!e && (e.name === 'RangeError' || /memory|allocation|array buffer/i.test(e.message || ''));
}

function tick() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }

/**
 * Read an Anki package.
 * @param {Blob|{arrayBuffer: function}} file
 * @param {object} o
 * @param {function(object[]): void} o.emit receives each batch of importable records (in note order)
 * @param {function(string, number, number): void} [o.onProgress] (stage 'open'|'unpack'|'sql'|'notes', done, total)
 * @param {function(): boolean} [o.isCancelled]
 * @param {function(): Promise<object>} [o.loadSql] default loadSqlJs (tests pass their own)
 * @param {number} [o.notesPerPage]
 * @returns {Promise<{warnings: string[], notes: number, cards: number, mediaSkipped: number, truncated: boolean, format: string}>}
 * @throws {ApkgError} (see friendlyApkgMessage)
 */
export async function readApkg(file, o) {
  var emit = o.emit;
  var progress = o.onProgress || function () {};
  var cancelled = o.isCancelled || function () { return false; };
  var pageSize = o.notesPerPage || NOTES_PER_PAGE;
  var warnings = [];
  function check() { if (cancelled()) throw new ApkgError('cancelled', 'Cancelled.'); }

  progress('open', 0, 1);
  var blob = await asBlob(file);
  check();
  var dir = await findEntries(blob, DB_NAMES);
  var entry = null;
  for (var i = 0; i < DB_NAMES.length && !entry; i++) entry = dir.found[DB_NAMES[i]] || null;
  if (!entry) throw new ApkgError('no-collection', 'No collection in the package.');
  progress('open', 1, 1);

  // ---- the collection database as bytes (the only big thing read from the file) ----
  var dbBytes = await unpackCollection(blob, entry, progress, cancelled);
  check();

  // ---- open it ----
  progress('sql', 0, 1);
  var db = null;
  var stats = { warnings: warnings, notes: 0, cards: 0, mediaSkipped: 0, truncated: false, format: entry.name };
  try {
    var SQL = await (o.loadSql || loadSqlJs)();
    check();
    try { db = new SQL.Database(dbBytes); } catch (e) {
      throw isMemoryError(e) ? new ApkgError('memory', 'Out of memory.') : new ApkgError('bad-db', 'Not a database.');
    }
    dbBytes = null; // sql.js keeps its own view of the bytes now; nothing else here needs them
    progress('sql', 1, 1);
    await readNotes(db, emit, progress, cancelled, pageSize, stats);
  } catch (e) {
    if (e instanceof ApkgError) throw e;
    if (isMemoryError(e)) throw new ApkgError('memory', 'Out of memory.');
    throw new ApkgError('bad-db', (e && e.message) || 'Could not read the notes.');
  } finally {
    if (db) { try { db.close(); } catch (e) { /* already closed */ } }
  }
  return stats;
}

/** Stream the database entry; for the newest Anki format, unzstd it as it arrives. Returns the SQLite bytes. */
async function unpackCollection(blob, entry, progress, cancelled) {
  var chunks = [];
  var total = 0;
  var isZstd = /\.anki21b$/.test(entry.name);
  var feed;
  var finish = function () {};
  if (isZstd) {
    var fz;
    try { fz = await import('fzstd'); } catch (e) { throw new ApkgError('zstd', 'zstd missing'); }
    var Decompress = fz.Decompress || (fz.default && fz.default.Decompress);
    var dec = new Decompress(function (data) {
      // the decoder reuses its buffer, so each piece is copied
      var copy = data.slice();
      chunks.push(copy);
      total += copy.length;
    });
    feed = function (chunk) { dec.push(chunk, false); };
    finish = function () { dec.push(new Uint8Array(0), true); };
  } else {
    feed = function (chunk) { chunks.push(chunk); total += chunk.length; };
  }
  try {
    await streamEntry(blob, entry, function (chunk) {
      try { feed(chunk); } catch (e) {
        if (isMemoryError(e)) throw e;
        throw new ApkgError(isZstd ? 'zstd' : 'corrupt', 'Could not unpack: ' + ((e && e.message) || e));
      }
    }, { onProgress: function (done, of) { progress('unpack', done, of); }, isCancelled: cancelled });
  } catch (e) {
    chunks.length = 0;
    if (e instanceof ApkgError) throw e;
    if (isMemoryError(e)) throw new ApkgError('memory', 'Out of memory.');
    throw new ApkgError('corrupt', (e && e.message) || 'Could not unpack.');
  }
  try { finish(); } catch (e) { chunks.length = 0; throw new ApkgError('zstd', 'Could not unpack: ' + ((e && e.message) || e)); }
  if (!total) throw new ApkgError(isZstd ? 'zstd' : 'corrupt', 'The collection inside is empty.');
  try { return joinChunks(chunks, total); } catch (e) {
    throw isMemoryError(e) ? new ApkgError('memory', 'Out of memory.') : e;
  }
}

/** Read notes (and the state of their cards) page by page. */
async function readNotes(db, emit, progress, cancelled, pageSize, stats) {
  var totalNotes = 0;
  try {
    var cnt = db.exec('SELECT count(*) FROM notes');
    totalNotes = cnt[0] && cnt[0].values[0] ? Number(cnt[0].values[0][0]) : 0;
  } catch (e) { throw new ApkgError('bad-db', 'No notes table.'); }

  var withMeta = true;
  var noteStmt;
  try { noteStmt = db.prepare('SELECT id, guid, tags, flds FROM notes WHERE id > ? ORDER BY id LIMIT ' + pageSize); } catch (e) {
    withMeta = false;
    noteStmt = db.prepare('SELECT id, flds FROM notes WHERE id > ? ORDER BY id LIMIT ' + pageSize);
  }
  // Which of a note's cards are suspended (queue -1) or buried (-2, -3). Missing in minimal databases.
  var cardStmt = null;
  try { cardStmt = db.prepare('SELECT nid, ord, queue FROM cards WHERE nid > ? AND nid <= ?'); } catch (e) { cardStmt = null; }

  var seenKeys = Object.create(null);
  var lastId = -Infinity;
  var stub = false;
  var done = 0;
  try {
    for (;;) {
      if (cancelled()) throw new ApkgError('cancelled', 'Cancelled.');
      noteStmt.bind([lastId === -Infinity ? -1e18 : lastId]);
      var rows = [];
      while (noteStmt.step()) rows.push(noteStmt.get());
      noteStmt.reset();
      if (!rows.length) break;
      var firstId = rows[0][0];
      var endId = rows[rows.length - 1][0];

      var queues = null;
      if (cardStmt) {
        queues = Object.create(null);
        cardStmt.bind([firstId - 1, endId]);
        while (cardStmt.step()) {
          var cr = cardStmt.get();
          (queues[cr[0]] = queues[cr[0]] || [])[cr[1]] = cr[2];
        }
        cardStmt.reset();
      }

      var batch = [];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var flds = withMeta ? row[3] : row[1];
        if (typeof flds !== 'string') continue;
        var fields = flds.split('\x1f');
        if (/update to the latest anki/i.test(fields[0])) { stub = true; continue; }
        var made = noteRecords(fields, withMeta ? {
          guid: typeof row[1] === 'string' ? row[1] : '',
          tags: splitTags(row[2]),
          queues: queues ? queues[row[0]] || null : null
        } : {});
        stats.mediaSkipped += made.media;
        for (var k = 0; k < made.records.length; k++) {
          var rec = made.records[k];
          if (rec.key && seenKeys[rec.key]) continue;
          if (rec.key) seenKeys[rec.key] = true;
          if (stats.cards >= MAX_PARSED_CARDS) { stats.truncated = true; break; }
          batch.push(rec);
          stats.cards++;
        }
      }
      stats.notes += rows.length;
      done += rows.length;
      lastId = endId;
      if (batch.length && !stub) emit(batch);
      progress('notes', Math.min(done, totalNotes || done), totalNotes || done);
      if (stats.truncated) break;
      await tick(); // let the page paint and take a tap before the next page
    }
  } finally {
    try { noteStmt.free(); } catch (e) { /* best effort */ }
    if (cardStmt) { try { cardStmt.free(); } catch (e) { /* best effort */ } }
  }
  if (stub) {
    stats.stub = true;
    stats.warnings.push('This deck was exported in the newest Anki format, which cannot be read here. In Anki choose Export, tick "Support older Anki versions", and import the new file.');
  }
  if (stats.mediaSkipped) stats.warnings.push(stats.mediaSkipped + ' note' + (stats.mediaSkipped === 1 ? '' : 's') + ' with only a picture or sound ' + (stats.mediaSkipped === 1 ? 'was' : 'were') + ' skipped.');
  if (stats.truncated) stats.warnings.push('Only the first ' + MAX_PARSED_CARDS + ' cards were read.');
}
