/**
 * apkgzip.js — reads one entry out of a huge .apkg (a ZIP file) without loading the rest.
 *
 * A real AnKing / Zanki deck is 0.5 to 1.5 GB because of its pictures and audio, which this app never uses. Loading
 * the whole file into memory (file.arrayBuffer() + JSZip) would exhaust a phone's memory, so this module:
 *   1. reads only the last 64 KB of the file (the End Of Central Directory, plus the ZIP64 records when present),
 *   2. reads the central directory (the list of entries; a few MB even with 60,000 media files),
 *   3. slices exactly the one entry that is wanted (the collection database) and inflates it as a stream.
 * Media entries are never read. Memory use does not grow with the amount of media.
 *
 * Handles: stored (0) and deflated (8) entries, zstd entries (93), ZIP64 (files over 4 GB, or over 65,535 entries).
 * Not handled, with a clear error: encryption, other compression methods, multi-disk archives.
 *
 * No DOM and no app imports: it runs on the page and inside the import Web Worker.
 */

var EOCD_SIG = 0x06054b50;
var EOCD64_LOC_SIG = 0x07064b50;
var EOCD64_SIG = 0x06064b50;
var CEN_SIG = 0x02014b50;
var LOC_SIG = 0x04034b50;
var TAIL_BYTES = 65536 + 22 + 20 + 56; // the longest ZIP comment + the EOCD + the ZIP64 locator
var SLICE = 4 * 1024 * 1024;           // how much of a file is read per step
var MAX_CENTRAL_DIRECTORY = 512 * 1024 * 1024;

/** An error with a machine-readable code (the importer turns the code into a friendly sentence). */
export class ApkgError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ApkgError';
    this.code = code;
  }
}

/** A File or Blob; or an object that can only give arrayBuffer() (older callers and tests), wrapped into a Blob. */
export async function asBlob(file) {
  if (file && typeof file.slice === 'function' && typeof file.size === 'number') return file;
  if (file && typeof file.arrayBuffer === 'function') return new Blob([await file.arrayBuffer()]);
  throw new ApkgError('not-a-file', 'No file to read.');
}

/** Bytes [start, end) of a blob. */
export async function readRange(blob, start, end) {
  var part = blob.slice(start, end);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { resolve(new Uint8Array(fr.result)); };
    fr.onerror = function () { reject(fr.error || new Error('read failed')); };
    fr.readAsArrayBuffer(part);
  });
}

function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

/** A 64-bit little-endian number as a JS number (exact up to 2^53, far beyond any file this app can be given). */
function u64(dv, at) { return dv.getUint32(at, true) + dv.getUint32(at + 4, true) * 4294967296; }

/**
 * Find where the central directory is: {entries, size, offset}.
 * @param {Blob} blob
 */
export async function readDirectoryLocation(blob) {
  var size = blob.size;
  if (size < 22) throw new ApkgError('not-zip', 'The file is too small to be an Anki package.');
  var tailStart = Math.max(0, size - TAIL_BYTES);
  var tail = await readRange(blob, tailStart, size);
  var dv = view(tail);
  var at = -1;
  for (var i = tail.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      // a comment-length that runs exactly to the end of the file rules out a "PK\5\6" inside a comment
      if (i + 22 + dv.getUint16(i + 20, true) <= tail.length) { at = i; break; }
    }
  }
  if (at < 0) throw new ApkgError('not-zip', 'This is not a complete Anki package (the ZIP index at the end of the file is missing).');
  var disk = dv.getUint16(at + 4, true);
  var cdDisk = dv.getUint16(at + 6, true);
  var entries = dv.getUint16(at + 10, true);
  var cdSize = dv.getUint32(at + 12, true);
  var cdOffset = dv.getUint32(at + 16, true);
  var needs64 = entries === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF;
  if (needs64) {
    var loc = at - 20;
    if (loc < 0 || dv.getUint32(loc, true) !== EOCD64_LOC_SIG) {
      throw new ApkgError('not-zip', 'This is not a complete Anki package (the ZIP64 index is missing).');
    }
    var rec64At = u64(dv, loc + 8);
    var rec = await readRange(blob, rec64At, Math.min(size, rec64At + 56));
    var rdv = view(rec);
    if (rec.length < 56 || rdv.getUint32(0, true) !== EOCD64_SIG) throw new ApkgError('not-zip', 'The ZIP64 index of this package is damaged.');
    entries = u64(rdv, 32);
    cdSize = u64(rdv, 40);
    cdOffset = u64(rdv, 48);
    disk = rdv.getUint32(16, true);
    cdDisk = rdv.getUint32(20, true);
  }
  if (disk !== 0 || cdDisk !== 0) throw new ApkgError('multi-disk', 'Split (multi-part) archives are not supported.');
  if (cdOffset + cdSize > size || cdSize > MAX_CENTRAL_DIRECTORY) throw new ApkgError('corrupt', 'The ZIP index of this package is damaged or the file is cut short.');
  return { entries: entries, size: cdSize, offset: cdOffset };
}

var UTF8 = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function decodeName(bytes) {
  if (UTF8) return UTF8.decode(bytes);
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/**
 * Read the central directory and return the entries whose names are in `wanted` (an array of names).
 * Everything else (media files: thousands of numbered entries) is skipped without decoding its name.
 * @param {Blob} blob
 * @param {string[]} wanted
 * @returns {Promise<{found: Object<string, object>, total: number}>}
 */
export async function findEntries(blob, wanted) {
  var loc = await readDirectoryLocation(blob);
  var cd = await readRange(blob, loc.offset, loc.offset + loc.size);
  if (cd.length < loc.size) throw new ApkgError('corrupt', 'The file is cut short.');
  var dv = view(cd);
  var lens = Object.create(null);
  wanted.forEach(function (n) { lens[n.length] = true; });
  var found = Object.create(null);
  var pos = 0;
  var total = 0;
  while (pos + 46 <= cd.length) {
    if (dv.getUint32(pos, true) !== CEN_SIG) break;
    total++;
    var nameLen = dv.getUint16(pos + 28, true);
    var extraLen = dv.getUint16(pos + 30, true);
    var commentLen = dv.getUint16(pos + 32, true);
    var next = pos + 46 + nameLen + extraLen + commentLen;
    if (next > cd.length) throw new ApkgError('corrupt', 'The ZIP index of this package is damaged.');
    if (lens[nameLen]) {
      var name = decodeName(cd.subarray(pos + 46, pos + 46 + nameLen));
      if (wanted.indexOf(name) >= 0 && !found[name]) {
        var e = {
          name: name,
          flags: dv.getUint16(pos + 8, true),
          method: dv.getUint16(pos + 10, true),
          crc: dv.getUint32(pos + 16, true),
          compressedSize: dv.getUint32(pos + 20, true),
          size: dv.getUint32(pos + 24, true),
          offset: dv.getUint32(pos + 42, true)
        };
        // ZIP64 extra field: holds, in this order, only the values that overflowed to 0xFFFFFFFF
        var xs = pos + 46 + nameLen;
        var xe = xs + extraLen;
        while (xs + 4 <= xe) {
          var id = dv.getUint16(xs, true);
          var len = dv.getUint16(xs + 2, true);
          if (id === 1) {
            var p = xs + 4;
            if (e.size === 0xFFFFFFFF && p + 8 <= xe) { e.size = u64(dv, p); p += 8; }
            if (e.compressedSize === 0xFFFFFFFF && p + 8 <= xe) { e.compressedSize = u64(dv, p); p += 8; }
            if (e.offset === 0xFFFFFFFF && p + 8 <= xe) { e.offset = u64(dv, p); p += 8; }
          }
          xs += 4 + len;
        }
        found[name] = e;
      }
    }
    pos = next;
  }
  if (total === 0) throw new ApkgError('not-zip', 'This file is not an Anki package (it has no ZIP entries).');
  return { found: found, total: total };
}

// ----- CRC-32 (checks that what was read is what was written) -----

var CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

/** Running CRC-32: crc32(bytes, previous) -> next. Start with 0. */
export function crc32(bytes, prev) {
  var t = crcTable();
  var c = ~(prev || 0);
  for (var i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return ~c >>> 0;
}

// ----- reading one entry as a stream of chunks -----

/** The compressed bytes of an entry: where they start in the file (after its local header). */
async function dataStart(blob, e) {
  var head = await readRange(blob, e.offset, e.offset + 30);
  var dv = view(head);
  if (head.length < 30 || dv.getUint32(0, true) !== LOC_SIG) throw new ApkgError('corrupt', 'The package is damaged (an entry header is missing).');
  return e.offset + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
}

/** A ReadableStream over blob[start, end) that reads SLICE bytes at a time. */
function sliceStream(blob, start, end, onBytes) {
  var at = start;
  return new ReadableStream({
    async pull(controller) {
      if (at >= end) { controller.close(); return; }
      var to = Math.min(end, at + SLICE);
      var part = await readRange(blob, at, to);
      at = to;
      if (onBytes) onBytes(part.length);
      controller.enqueue(part);
    }
  });
}

/** True when this browser can inflate raw deflate data itself (everything since 2023; older WebViews fall back). */
export function hasNativeInflate() {
  try { return typeof DecompressionStream === 'function' && typeof ReadableStream === 'function' && !!new DecompressionStream('deflate-raw'); } catch (e) { return false; }
}

/** One local-file entry wrapped in a minimal zip, for JSZip (the fallback when DecompressionStream is missing). */
function miniZip(e, data) {
  var nameBytes = new TextEncoder().encode('e');
  var local = new Uint8Array(30 + 1 + data.length);
  var ldv = new DataView(local.buffer);
  ldv.setUint32(0, LOC_SIG, true); ldv.setUint16(4, 20, true); ldv.setUint16(8, e.method, true);
  ldv.setUint32(14, e.crc, true); ldv.setUint32(18, data.length, true); ldv.setUint32(22, e.size, true); ldv.setUint16(26, 1, true);
  local.set(nameBytes, 30); local.set(data, 31);
  var cen = new Uint8Array(46 + 1);
  var cdv = new DataView(cen.buffer);
  cdv.setUint32(0, CEN_SIG, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true); cdv.setUint16(10, e.method, true);
  cdv.setUint32(16, e.crc, true); cdv.setUint32(20, data.length, true); cdv.setUint32(24, e.size, true); cdv.setUint16(28, 1, true);
  cen.set(nameBytes, 46);
  var end = new Uint8Array(22);
  var edv = new DataView(end.buffer);
  edv.setUint32(0, EOCD_SIG, true); edv.setUint16(8, 1, true); edv.setUint16(10, 1, true); edv.setUint32(12, cen.length, true); edv.setUint32(16, local.length, true);
  var out = new Uint8Array(local.length + cen.length + end.length);
  out.set(local, 0); out.set(cen, local.length); out.set(end, local.length + cen.length);
  return out;
}

/**
 * Stream the (decompressed) bytes of one entry to onChunk. The CRC-32 is checked at the end.
 * @param {Blob} blob
 * @param {{method: number, flags: number, crc: number, size: number, compressedSize: number, offset: number, name: string}} e
 * @param {function(Uint8Array): void} onChunk called with consecutive pieces (each is a fresh array, safe to keep)
 * @param {{onProgress?: function(number, number), isCancelled?: function(): boolean, forceFallback?: boolean}} [opts] progress counts compressed bytes read
 */
export async function streamEntry(blob, e, onChunk, opts) {
  opts = opts || {};
  if (e.flags & 1) throw new ApkgError('encrypted', 'This package is encrypted.');
  if (e.method !== 0 && e.method !== 8 && e.method !== 93) throw new ApkgError('unsupported', 'This package uses a compression method that is not supported (' + e.method + ').');
  var start = await dataStart(blob, e);
  var end = start + e.compressedSize;
  if (end > blob.size) throw new ApkgError('corrupt', 'The file is cut short: an entry runs past the end of the file.');
  var crc = 0;
  var read = 0;
  function counted(n) { read += n; if (opts.onProgress) opts.onProgress(read, e.compressedSize); }
  function emit(chunk) { crc = crc32(chunk, crc); onChunk(chunk); }
  function check() {
    if (e.crc !== undefined && crc !== e.crc) throw new ApkgError('corrupt', 'The package is damaged (a checksum does not match).');
  }
  function cancelled() { return opts.isCancelled && opts.isCancelled(); }

  if (e.method === 0) {
    for (var at = start; at < end; at += SLICE) {
      if (cancelled()) throw new ApkgError('cancelled', 'Cancelled.');
      var part = await readRange(blob, at, Math.min(end, at + SLICE));
      counted(part.length);
      emit(part);
    }
    check();
    return;
  }

  if (e.method === 93) throw new ApkgError('unsupported', 'zstd-compressed ZIP entries are not supported.');

  if (!opts.forceFallback && hasNativeInflate()) {
    var reader = sliceStream(blob, start, end, counted).pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    try {
      for (;;) {
        if (cancelled()) throw new ApkgError('cancelled', 'Cancelled.');
        var r;
        try { r = await reader.read(); } catch (err) {
          if (err instanceof ApkgError) throw err;
          throw new ApkgError('corrupt', 'The package is damaged (it could not be unpacked).');
        }
        if (r.done) break;
        emit(r.value);
      }
    } finally {
      try { reader.releaseLock(); } catch (err) { /* already released */ }
    }
    check();
    return;
  }

  // Fallback: JSZip inflates the one entry (it needs the compressed bytes of this entry in memory, never the rest)
  var mod = await import('jszip');
  var JSZip = mod.default || mod;
  var data = await readRange(blob, start, end);
  counted(data.length);
  var out;
  try {
    var zip = await JSZip.loadAsync(miniZip(e, data));
    out = await zip.file('e').async('uint8array');
  } catch (err) {
    throw new ApkgError('corrupt', 'The package is damaged (it could not be unpacked).');
  }
  for (var o = 0; o < out.length; o += SLICE) emit(out.subarray(o, Math.min(out.length, o + SLICE)));
  check();
}

/** Join pieces into one array, releasing each piece as it is copied (so the peak is about 2x, not 3x). */
export function joinChunks(chunks, total) {
  var out = new Uint8Array(total);
  var at = 0;
  for (var i = 0; i < chunks.length; i++) {
    out.set(chunks[i], at);
    at += chunks[i].length;
    chunks[i] = null;
  }
  return out;
}
