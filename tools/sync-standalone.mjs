#!/usr/bin/env node
/**
 * sync-standalone.mjs — brings the standalone copy of the game (the old buzzword-dash repository: the same game with no
 * Supabase, Stripe or accounts behind it) up to date with this repository.
 *
 *   node tools/sync-standalone.mjs ../buzzword-dash [--check]
 *
 * It copies the game's source (js, css, public, tests, tools, database, supabase, the config files and package files)
 * over the standalone checkout and leaves that repository's own README, workflows and git history alone. The standalone
 * build is the same code built with VITE_NO_BACKEND=1 (see js/features.js), which is what its CI sets.
 *
 * Why it matters: both copies are served from the same host (github.io), so they share the browser's storage. Keeping
 * them on the same code means the save-protection and per-site storage key are in both, and neither can overwrite the
 * other's saves.
 *
 * With --check it only lists what would change. Afterwards run, inside the standalone repository:
 *   npm ci && VITE_NO_BACKEND=1 npm run lint && npm run typecheck && VITE_NO_BACKEND=1 npm test && VITE_NO_BACKEND=1 npm run build
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

var target = resolve(process.argv[2] || '');
var checkOnly = process.argv.indexOf('--check') > 0;
var here = resolve(new URL('..', import.meta.url).pathname);
if (!process.argv[2] || !existsSync(join(target, 'package.json'))) { console.error('Usage: node tools/sync-standalone.mjs <path to the standalone checkout> [--check]'); process.exit(2); }
if (target === here) { console.error('That is this repository.'); process.exit(2); }

var DIRS = ['js', 'css', 'public', 'tests', 'tools', 'database', 'supabase'];
var FILES = ['index.html', 'tsconfig.json', 'tsconfig.checked.json', 'vite.config.js', 'vitest.config.js', 'playwright.config.js', 'eslint.config.js', 'package.json', 'package-lock.json', 'capacitor.config.json'];

function walk(dir, base, out) {
  readdirSync(dir).forEach(function (name) {
    var p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out); else out.push(p.slice(base.length + 1));
  });
  return out;
}

var changed = [];
function consider(rel) {
  var from = join(here, rel);
  var to = join(target, rel);
  var differs = !existsSync(to) || !readFileSync(from).equals(readFileSync(to));
  if (differs) changed.push(rel);
  return differs;
}
DIRS.forEach(function (d) { walk(join(here, d), here, []).forEach(consider); });
FILES.forEach(function (f) { if (existsSync(join(here, f))) consider(f); });

console.log(changed.length + ' file(s) differ.');
if (checkOnly) { changed.slice(0, 40).forEach(function (f) { console.log('  ' + f); }); if (changed.length > 40) console.log('  ...'); process.exit(changed.length ? 1 : 0); }
changed.forEach(function (rel) {
  cpSync(join(here, rel), join(target, rel), { recursive: true, force: true });
});
console.log('Copied. Now run the checks listed at the top of this file inside ' + target + '.');
