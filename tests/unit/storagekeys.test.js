import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { storage } from '../../js/storage.js';

/** A typo'd storage key reads as undefined forever and nothing complains. Every key the code uses must have a default. */

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'cards' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

describe('storage keys', () => {
  it('every key read or written with storage.get/set has a default value', () => {
    localStorage.clear();
    storage.load();
    expect(storage.get('zz_not_a_key')).toBeUndefined(); // so the check below can detect typos
    const used = new Map();
    walk('js').forEach((p) => {
      const src = readFileSync(p, 'utf8');
      const re = /storage\.(?:get|set)\(\s*'([A-Za-z0-9_]+)'/g;
      let m;
      while ((m = re.exec(src))) used.set(m[1], p);
    });
    const missing = [...used].filter(([k]) => storage.get(k) === undefined).map(([k, p]) => k + ' (' + p + ')');
    expect(missing).toEqual([]);
  });
});
