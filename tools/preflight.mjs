#!/usr/bin/env node
/**
 * preflight.mjs — the last checks before a build goes to the stores or to the site.
 *
 *   npm run build && node tools/preflight.mjs
 *
 * FAIL lines stop the release (exit 1); WARN lines are things to look at. Checks: the pages the stores require
 * exist, every file the home page points at exists, the service worker is stamped with a build id, no secret-looking
 * text or debugger statement is in the shipped code, the bundles are inside their size budget, the manifest and
 * remote-config.json are valid, and it shows the app and Android versions (whether the Android versionCode went up
 * is a human check) and whether the online backend was configured at build time.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export var BUDGET = { jsBytes: 5200000, largestJsBytes: 900000, distBytes: 40 * 1024 * 1024 };
var REQUIRED = ['index.html', 'privacy.html', 'terms.html', 'delete-account.html', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'remote-config.json'];
var SECRETS = [/service_role/i, /sk_live_[A-Za-z0-9]{10,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{30,}/];

function walk(dir, out) {
  out = out || [];
  readdirSync(dir).forEach(function (n) {
    var p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}

/** @returns {{fails: string[], warns: string[], info: string[]}} */
export function preflight(root, dist) {
  var fails = [];
  var warns = [];
  var info = [];
  if (!existsSync(dist)) return { fails: ['no build in ' + dist + ': run npm run build first'], warns: warns, info: info };
  REQUIRED.forEach(function (f) { if (!existsSync(join(dist, f))) fails.push('missing ' + f + ' in the build'); });

  var html = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : '';
  var refs = [];
  html.replace(/(?:src|href)="([^"#?]+)"/g, function (_, u) { if (!/^(https?:|data:|mailto:|\/\/)/.test(u)) refs.push(u); return ''; });
  refs.forEach(function (u) {
    var rel = u.replace(/^\.?\//, '');
    if (rel && !existsSync(join(dist, rel))) fails.push('index.html points at ' + u + ' which is not in the build');
  });

  var sw = existsSync(join(dist, 'sw.js')) ? readFileSync(join(dist, 'sw.js'), 'utf8') : '';
  if (/__BUILD_ID__/.test(sw)) fails.push('sw.js still has the __BUILD_ID__ placeholder (old caches would never be replaced)');

  var files = walk(dist);
  var js = files.filter(function (f) { return extname(f) === '.js' && f.indexOf('/assets/') >= 0; });
  var jsBytes = 0;
  var largest = 0;
  js.forEach(function (f) {
    var text = readFileSync(f, 'utf8');
    var size = statSync(f).size;
    jsBytes += size;
    largest = Math.max(largest, size);
    if (/\bdebugger\b\s*;/.test(text) && !/three/.test(f)) warns.push('a debugger statement in ' + f.replace(dist, ''));
    SECRETS.forEach(function (re) { if (re.test(text)) fails.push('secret-looking text (' + re + ') in ' + f.replace(dist, '')); });
    if (/YOUR_SUPABASE_URL/.test(text)) info.push('the online backend was NOT configured at build time (placeholders are in the bundle): accounts, friends and leaderboards stay off');
  });
  info = info.filter(function (v, i) { return info.indexOf(v) === i; });
  if (jsBytes > BUDGET.jsBytes) warns.push('JavaScript is ' + Math.round(jsBytes / 1024) + ' KB, over the ' + Math.round(BUDGET.jsBytes / 1024) + ' KB budget');
  if (largest > BUDGET.largestJsBytes) warns.push('the largest bundle is ' + Math.round(largest / 1024) + ' KB, over ' + Math.round(BUDGET.largestJsBytes / 1024) + ' KB');
  var total = files.reduce(function (s, f) { return s + statSync(f).size; }, 0);
  if (total > BUDGET.distBytes) warns.push('the build is ' + Math.round(total / 1048576) + ' MB, over ' + Math.round(BUDGET.distBytes / 1048576) + ' MB');
  info.push('JavaScript ' + Math.round(jsBytes / 1024) + ' KB in ' + js.length + ' files; build ' + Math.round(total / 1048576) + ' MB');

  var pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  var gradle = existsSync(join(root, 'android/app/build.gradle')) ? readFileSync(join(root, 'android/app/build.gradle'), 'utf8') : '';
  var vc = /versionCode\s+(\d+)/.exec(gradle);
  var vn = /versionName\s+"([^"]+)"/.exec(gradle);
  info.push('package ' + pkg.version + '; Android versionName ' + (vn ? vn[1] : '?') + ' versionCode ' + (vc ? vc[1] : '?'));
  try {
    var manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
    if (!manifest.name || !manifest.icons || !manifest.icons.length) fails.push('manifest.webmanifest needs a name and icons');
  } catch { fails.push('manifest.webmanifest is not valid JSON'); }
  try {
    var rc = JSON.parse(readFileSync(join(dist, 'remote-config.json'), 'utf8'));
    if (Array.isArray(rc.killed) && rc.killed.length) warns.push('remote-config.json has mechanics switched off: ' + rc.killed.join(', '));
  } catch { fails.push('remote-config.json is missing or not valid JSON'); }
  return { fails: fails, warns: warns, info: info };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  var r = preflight(process.cwd(), join(process.cwd(), 'dist'));
  r.info.forEach(function (l) { console.log('INFO ' + l); });
  r.warns.forEach(function (l) { console.log('WARN ' + l); });
  r.fails.forEach(function (l) { console.log('FAIL ' + l); });
  console.log(r.fails.length ? 'Preflight FAILED' : 'Preflight passed' + (r.warns.length ? ' with warnings' : ''));
  process.exit(r.fails.length ? 1 : 0);
}
