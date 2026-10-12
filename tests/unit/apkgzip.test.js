import { describe, it, expect } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { deflateRawSync } from 'node:zlib';
import { ApkgError, findEntries, streamEntry, crc32, joinChunks, readDirectoryLocation } from '../../js/apkgzip.js';

// A tiny ZIP writer, so the tests can make layouts JSZip never produces (ZIP64, comments, a media-heavy index).
function le(n, bytes) { const b = Buffer.alloc(bytes); if (bytes === 8) b.writeBigUInt64LE(BigInt(n)); else if (bytes === 4) b.writeUInt32LE(n >>> 0); else b.writeUInt16LE(n); return b; }

function buildZip(entries, { zip64 = false, comment = '' } = {}) {
  const parts = []; const central = []; let offset = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.data);
    const method = e.method === undefined ? 8 : e.method;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const crc = e.badCrc ? 12345 : crc32(new Uint8Array(raw));
    const name = Buffer.from(e.name);
    const flags = e.encrypted ? 1 : 0;
    const local = Buffer.concat([le(0x04034b50, 4), le(20, 2), le(flags, 2), le(method, 2), le(0, 2), le(0, 2), le(crc, 4), le(body.length, 4), le(raw.length, 4), le(name.length, 2), le(0, 2), name]);
    parts.push(local, body);
    let extra = Buffer.alloc(0); let cs = body.length; let us = raw.length; let off = offset;
    if (zip64) { extra = Buffer.concat([le(1, 2), le(24, 2), le(raw.length, 8), le(body.length, 8), le(offset, 8)]); cs = 0xFFFFFFFF; us = 0xFFFFFFFF; off = 0xFFFFFFFF; }
    central.push(Buffer.concat([le(0x02014b50, 4), le(45, 2), le(20, 2), le(flags, 2), le(method, 2), le(0, 2), le(0, 2), le(crc, 4), le(cs, 4), le(us, 4), le(name.length, 2), le(extra.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4), name, extra]));
    offset += local.length + body.length;
  }
  const cd = Buffer.concat(central);
  const c = Buffer.from(comment);
  let tail;
  if (zip64) {
    const rec = Buffer.concat([le(0x06064b50, 4), le(44, 8), le(45, 2), le(45, 2), le(0, 4), le(0, 4), le(entries.length, 8), le(entries.length, 8), le(cd.length, 8), le(offset, 8)]);
    const loc = Buffer.concat([le(0x07064b50, 4), le(0, 4), le(offset + cd.length, 8), le(1, 4)]);
    tail = Buffer.concat([rec, loc, le(0x06054b50, 4), le(0, 2), le(0, 2), le(0xFFFF, 2), le(0xFFFF, 2), le(0xFFFFFFFF, 4), le(0xFFFFFFFF, 4), le(c.length, 2), c]);
  } else {
    tail = Buffer.concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(entries.length, 2), le(entries.length, 2), le(cd.length, 4), le(offset, 4), le(c.length, 2), c]);
  }
  return Buffer.concat([...parts, cd, tail]);
}

/** A blob that records every byte range read from it. */
function spyBlob(buf) {
  const blob = new NodeBlob([buf]);
  const reads = [];
  return { size: blob.size, reads, slice(a, b) { reads.push([a, b]); return blob.slice(a, b); } };
}
const bytesRead = (s) => s.reads.reduce((n, [a, b]) => n + Math.min(b, s.size) - a, 0);
async function extract(blob, name, opts) {
  const dir = await findEntries(blob, [name]);
  const chunks = []; let total = 0;
  await streamEntry(blob, dir.found[name], (c) => { chunks.push(c); total += c.length; }, opts);
  return Buffer.from(joinChunks(chunks, total));
}

describe('reading one entry out of a big .apkg', () => {
  const db = Buffer.from('SQLite format 3\0'.repeat(5000));
  it('finds and inflates a deflated entry, and reads a stored one as is', async () => {
    const zip = buildZip([{ name: 'collection.anki21', data: db }, { name: 'meta', data: 'hi', method: 0 }]);
    expect((await extract(new NodeBlob([zip]), 'collection.anki21')).equals(db)).toBe(true);
    expect((await extract(new NodeBlob([zip]), 'meta')).toString()).toBe('hi');
  });
  it('never reads the media: only the end of the file, the index and the one entry', async () => {
    const media = Array.from({ length: 300 }, (_, i) => ({ name: String(i), data: Buffer.alloc(20000, i % 251), method: 0 }));
    const zip = buildZip([...media, { name: 'collection.anki21', data: db }, ...media.map((m, i) => ({ ...m, name: 'x' + i }))]);
    const spy = spyBlob(zip);
    const out = await extract(spy, 'collection.anki21');
    expect(out.equals(db)).toBe(true);
    expect(zip.length).toBeGreaterThan(11000000);
    expect(bytesRead(spy)).toBeLessThan(400000); // the file is 12 MB of media; a few hundred KB were read
  });
  it('handles ZIP64 (sizes and offsets in the extra field, entry counts in the ZIP64 end record)', async () => {
    const zip = buildZip([{ name: 'a', data: 'x'.repeat(100), method: 0 }, { name: 'collection.anki21', data: db }], { zip64: true });
    const loc = await readDirectoryLocation(new NodeBlob([zip]));
    expect(loc.entries).toBe(2);
    expect((await extract(new NodeBlob([zip]), 'collection.anki21')).equals(db)).toBe(true);
  });
  it('copes with a ZIP comment, and a "PK\\5\\6" inside it', async () => {
    const zip = buildZip([{ name: 'collection.anki2', data: db }], { comment: 'junk PK\x05\x06 junk' });
    expect((await extract(new NodeBlob([zip]), 'collection.anki2')).equals(db)).toBe(true);
  });
  it('the JSZip fallback (no DecompressionStream) gives the same bytes', async () => {
    const zip = buildZip([{ name: 'collection.anki21', data: db }]);
    expect((await extract(new NodeBlob([zip]), 'collection.anki21', { forceFallback: true })).equals(db)).toBe(true);
  });
  it('says so for a cut-off file, a non-zip, a bad checksum, encryption and a missing entry', async () => {
    const zip = buildZip([{ name: 'collection.anki21', data: db }]);
    await expect(findEntries(new NodeBlob([zip.subarray(0, zip.length - 30)]), ['x'])).rejects.toMatchObject({ code: 'not-zip' });
    await expect(findEntries(new NodeBlob([Buffer.from('this is not a zip file at all, just text')]), ['x'])).rejects.toMatchObject({ code: 'not-zip' });
    await expect(findEntries(new NodeBlob([Buffer.alloc(5)]), ['x'])).rejects.toBeInstanceOf(ApkgError);
    const bad = buildZip([{ name: 'collection.anki21', data: db, badCrc: true }]);
    await expect(extract(new NodeBlob([bad]), 'collection.anki21')).rejects.toMatchObject({ code: 'corrupt' });
    const enc = buildZip([{ name: 'collection.anki21', data: db, encrypted: true }]);
    await expect(extract(new NodeBlob([enc]), 'collection.anki21')).rejects.toMatchObject({ code: 'encrypted' });
    expect((await findEntries(new NodeBlob([zip]), ['nope'])).found.nope).toBeUndefined();
  });
  it('a cut inside the entry data is corrupt, not a hang', async () => {
    const zip = buildZip([{ name: 'collection.anki21', data: db }, { name: 'later', data: Buffer.alloc(50000, 1), method: 0 }]);
    const cutAt = Buffer.from(zip).indexOf(Buffer.from('later')) + 20; // cut inside the second entry, keeping a valid-looking tail
    const broken = Buffer.concat([zip.subarray(0, cutAt), zip.subarray(zip.length - 200)]);
    await expect(findEntries(new NodeBlob([broken]), ['collection.anki21']).then((d) => extract(new NodeBlob([broken]), 'collection.anki21'))).rejects.toBeInstanceOf(ApkgError);
  });
  it('can be cancelled between pieces', async () => {
    const zip = buildZip([{ name: 'collection.anki21', data: db, method: 0 }]);
    await expect(extract(new NodeBlob([zip]), 'collection.anki21', { isCancelled: () => true })).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('crc32 matches the known value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
  });
});

