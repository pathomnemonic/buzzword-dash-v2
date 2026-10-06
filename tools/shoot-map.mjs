/* global window */
// tools/shoot-map.mjs — starts a run on each named map in the built app and saves screenshots (for looking at maps).
//   npx vite preview --port 4173 &   then   node tools/shoot-map.mjs "Neural Highway" "Neon ER" [--out /tmp/maps] [--wait 4500] [--atmosphere rain]
import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';

var args = process.argv.slice(2);
function opt(name, dflt) { var i = args.indexOf('--' + name); if (i < 0) return dflt; var v = args[i + 1]; args.splice(i, 2); return v; }
var out = opt('out', '/tmp/maps');
var wait = Number(opt('wait', '4500'));
var base = opt('base', 'http://localhost:4173');
var atmosphere = opt('atmosphere', '');
var width = Number(opt('width', '400'));
var height = Number(opt('height', '800'));
var maps = args;
mkdirSync(out, { recursive: true });
var chrome = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
var browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'] });
for (var name of maps) {
  var ctx = await browser.newContext({ viewport: { width: width, height: height }, bypassCSP: true });
  var page = await ctx.newPage();
  var errs = [];
  page.on('pageerror', function (e) { errs.push(e.message); });
  page.on('console', function (m) { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  if (atmosphere) await page.addInitScript('window.__forceAtmosphere = ' + JSON.stringify(atmosphere));
  await page.goto(base + '/?debug=1');
  await page.waitForTimeout(1500);
  for (var i = 0; i < 5; i++) { if (await page.locator('#tutCloseBtn').isVisible().catch(function () { return false; })) { await page.locator('#tutCloseBtn').click(); await page.locator('#tutExitYes').click().catch(function () {}); } }
  var r = page.locator('#dailyReward');
  await r.waitFor({ state: 'visible', timeout: 6000 }).catch(function () {});
  for (var j = 0; j < 3 && await r.isVisible().catch(function () { return false; }); j++) { await r.locator('button').click(); await page.waitForTimeout(1000); }
  await page.evaluate(function (n) {
    var d = window.__storage.data;
    [n.toLowerCase().replace(/[^a-z0-9]+/g, '_'), n.toLowerCase().replace(/-/g, '').replace(/[^a-z0-9]+/g, '_')].forEach(function (slug) {
      var id = 'map_' + slug.replace(/^_|_$/g, '');
      if (d.progression.ownedItems.indexOf(id) < 0) d.progression.ownedItems.push(id);
    });
    window.__storage.set('preferredMap', n);
    window.__storage.set('quality', 'high');
  }, name);
  await page.waitForTimeout(500);
  await page.locator('.btn-play').click();
  await page.waitForTimeout(wait);
  var info = await page.evaluate(function () { return { skin: window.__game.currentSkin && window.__game.currentSkin.name, state: window.__game._state, draw: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles }; });
  var file = out + '/' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
  await page.screenshot({ path: file });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file.replace('.png', '-b.png') });
  console.log(name, JSON.stringify(info), errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'ok', file);
  await ctx.close();
}
await browser.close();
