import { it } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ankiImport } from '../../js/ankiimport.js';
const require = createRequire(import.meta.url);
it('corpus', async () => {
  const initSqlJs = require('sql.js'); await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const files = process.env.CORPUS.split(',');
  const report = [];
  for (const p of files) {
    const buf = readFileSync(p);
    const t0 = Date.now();
    let r;
    try {
      if (/\.apkg$/.test(p)) r = await ankiImport.parseApkg({ size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
      else r = ankiImport.parseDelimitedText(buf.toString('utf8'));
    } catch (e) { r = { error: String(e && e.message || e), cards: [], warnings: [] }; }
    report.push({ file: p, bytes: buf.length, ms: Date.now() - t0, cards: r.cards.length, error: r.error, warnings: [...new Set(r.warnings)].slice(0, 4), sample: r.cards.slice(0, Number(process.env.SAMPLE || 0)) });
  }
  writeFileSync(process.env.REPORT, JSON.stringify(report, null, 1));
}, 600000);
