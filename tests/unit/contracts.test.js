import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Does everything the code names actually exist?"  The quests bug was code reading QUEST_IDS.MARATHON, which
 * was never defined, so those quests could never complete and nothing complained (undefined is silently falsy).
 * This test loads every module and checks every CONSTANT.MEMBER the sources mention against the real object.
 */

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'cards' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

const paths = walk('js').map((p) => p.replace(/\\/g, '/'));
const sources = Object.fromEntries(paths.map((p) => [p, readFileSync(p, 'utf8')]));

async function collectConstants() {
  const out = {};
  for (const p of paths) {
    if (p === 'js/main.js') continue; // starts the whole app when loaded
    let mod;
    try { mod = await import('../../' + p); } catch (e) { continue; }
    for (const [name, val] of Object.entries(mod)) {
      if (/^[A-Z][A-Z0-9_]*$/.test(name) && val && typeof val === 'object' && !Array.isArray(val)) {
        (out[name] = out[name] || []).push({ from: p, val });
      }
    }
  }
  return out;
}

describe('constant tables are only used with members that exist', () => {
  it('every CONSTANT.MEMBER in the source resolves', async () => {
    const consts = await collectConstants();
    expect(Object.keys(consts)).toEqual(expect.arrayContaining(['QUEST_IDS']));
    const problems = [];
    for (const [file, src] of Object.entries(sources)) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const re = /\b([A-Z][A-Z0-9_]{2,})\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
      let m;
      while ((m = re.exec(code))) {
        const [, name, member] = m;
        const defs = consts[name];
        if (!defs || defs.length !== 1) continue; // unknown or ambiguous name: not a constant table we can check
        const val = defs[0].val;
        if (member in val || member in Object.prototype) continue;
        problems.push(file + ': ' + name + '.' + member);
      }
    }
    expect(problems).toEqual([]);
  });
});
