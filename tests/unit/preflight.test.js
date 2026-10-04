import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preflight } from '../../tools/preflight.mjs';

function fixture(over) {
  const root = mkdtempSync(join(tmpdir(), 'pf-'));
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"version":"1.0.0"}');
  const files = { 'index.html': '<script src="/assets/a-12345678.js"></script>', 'privacy.html': 'x', 'terms.html': 'x', 'delete-account.html': 'x', 'icon.svg': 'x', 'sw.js': 'const CACHE="dx-1";', 'manifest.webmanifest': '{"name":"n","icons":[{"src":"i"}]}', 'remote-config.json': '{"killed":[]}', 'assets/a-12345678.js': 'console.log(1)' };
  Object.assign(files, over || {});
  Object.keys(files).forEach((f) => { if (files[f] !== null) writeFileSync(join(dist, f), files[f]); });
  return { root, dist };
}

describe('release preflight', () => {
  it('passes a healthy build', () => { const f = fixture(); expect(preflight(f.root, f.dist).fails).toEqual([]); });
  it('fails on a missing store page, a dead reference, an unstamped service worker and a secret', () => {
    const f = fixture({ 'privacy.html': null, 'index.html': '<script src="/assets/gone.js"></script>', 'sw.js': 'const C="__BUILD_ID__"', 'assets/a-12345678.js': 'var k="sk_live_abcdefghijklmnop";' });
    const out = preflight(f.root, f.dist).fails.join('\n');
    expect(out).toMatch(/privacy\.html/); expect(out).toMatch(/gone\.js/); expect(out).toMatch(/BUILD_ID/); expect(out).toMatch(/secret/);
  });
  it('warns when a mechanic is switched off remotely', () => {
    const f = fixture({ 'remote-config.json': '{"killed":["hazards"]}' });
    expect(preflight(f.root, f.dist).warns.join()).toMatch(/hazards/);
  });
});
