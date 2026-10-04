#!/usr/bin/env node
/**
 * savefuzz.mjs — starts the whole app on damaged saves.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/savefuzz.mjs --count 100 --seed 3
 *
 * tests/unit/savetorture.test.js throws damaged saves at the storage code. This does it to the real app in a browser:
 * it builds a save with a lot in it, damages it (see savemutate.mjs) and damages the other things the app keeps in
 * storage (custom cards, shared decks, cloud-sync and ranked caches), loads the app on it, opens every screen and
 * Home pop-up, and checks that nothing threw, nothing logged an error, the saved data is the right shape again, and
 * no text on any screen says NaN, undefined or [object Object].
 *
 * Exit code 1 when anything fails; the damaged save that did it is written next to the report so it can be loaded again.
 */

/* global window, document, localStorage */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeRng } from './soak.mjs';
import { mutate } from './savemutate.mjs';

export function parseArgs(argv, env) {
  env = env || {};
  var out = { count: Number(env.FUZZ_COUNT) || 60, url: env.SOAK_URL || 'http://localhost:4173', seed: Date.now() % 2147483647, out: 'savefuzz-report', chrome: env.CHROME_PATH || '/opt/pw-browsers/chromium' };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    var v = argv[i + 1];
    if (a === '--count') { out.count = Number(v); i++; }
    else if (a === '--url') { out.url = v; i++; }
    else if (a === '--seed') { out.seed = Number(v); i++; }
    else if (a === '--out') { out.out = v; i++; }
    else if (a === '--chrome') { out.chrome = v; i++; }
  }
  return out;
}

var SCREENS = ['screenHome', 'screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings', 'screenMyCards', 'screenCardBrowser', 'screenFlashcard', 'screenExam', 'screenLeaderboard', 'screenCohorts', 'screenImportExport'];
var AUX_KEYS = ['buzzword_dash_custom_cards', 'buzzword_decks_v1', 'bd_cloud_meta', 'dxdash_ranked_cache', 'buzzword_activity_throttle', 'dx_tts_wps', 'buzzword_dash_v1_damaged'];
var JUNK = ['', '{', 'null', '[]', '{}', '123', '"text"', 'true', '[null,1,"x",{}]', '{"a":{"b":null}}', '\u0000', '{"__proto__":{"polluted":1}}', 'x'.repeat(100000)];
var NOISE = /GPU stall|swiftshader|WebGL: INVALID|GroupMarkerNotSet|Failed to load resource|net::ERR|WebSocket connection|peerjs|supabase|\[vite\]/i;

/** The save a player with a lot of progress would have, built the way the game builds it. Runs in the page. */
function buildRichSave() {
  var s = window.__storage;
  var subjects = ['Cardiology', 'Neurology', 'Nephrology', 'Pulmonology', 'Surgery'];
  for (var i = 0; i < 14; i++) {
    var enc = [];
    for (var k = 0; k < 6; k++) enc.push({ cardId: 'c' + ((i * 6 + k) % 40), correct: (i + k) % 3 !== 0, subject: subjects[(i + k) % subjects.length] });
    s.finalizeRun({
      runId: 'fz_' + i, mode: i % 4 === 0 ? 'daily' : 'endless', endReason: 'out_of_lives', completed: true, startedAt: Date.now() - 60000, endedAt: Date.now(), durationMs: 60000,
      score: 300 + i * 10, coinsEarned: 12, coinsCollected: 5, encountersCompleted: 6, correct: 4, wrong: 2, bestStreak: 3, fastestDecisionMs: 900, continued: false, continuesUsed: 0,
      subjectsSeen: subjects.slice(0, 3), rushesUsed: 1, powerupsCollected: 1, obstaclesJumped: 2, obstaclesSlid: 1, dailyCompleted: i % 4 === 0, encounters: enc,
      multiplayer: { matchId: null, result: 'none' }
    });
  }
  s.finalizeFlashcardSession({ sessionId: 'fzf1', total: 8, correct: 5, cardResults: [] });
  s.addCoins(900);
  s.addCardReport('c1', 'wrong_answer', 'text');
  s.set('profileName', 'Ada');
  s.set('examDate', '2027-03-01');
  return JSON.parse(JSON.stringify(s.data));
}

export async function savefuzz(opts) {
  var pw = await import('@playwright/test');
  var browser = await pw.chromium.launch({ executablePath: opts.chrome, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  var context = await browser.newContext({ viewport: { width: 390, height: 780 }, bypassCSP: true });
  var page = await context.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console.error: ' + m.text().slice(0, 300)); });
  page.on('dialog', function (d) { d.dismiss().catch(function () {}); });
  page.setDefaultTimeout(8000);

  await page.goto(opts.url + '/?debug=1', { timeout: 40000 });
  await page.waitForFunction(function () { return window.__storage && window.__ui; }, null, { timeout: 30000, polling: 100 });
  var base = await page.evaluate(buildRichSave);

  var rng = makeRng(opts.seed);
  var failures = [];
  mkdirSync(opts.out, { recursive: true });

  for (var i = 1; i <= opts.count && failures.length < 10; i++) {
    var mutant = JSON.parse(JSON.stringify(base));
    var n = 1 + Math.floor(rng() * 4);
    for (var m = 0; m < n; m++) mutate(mutant, rng);
    var aux = {};
    AUX_KEYS.forEach(function (k) { if (rng() < 0.25) aux[k] = JUNK[Math.floor(rng() * JUNK.length)]; });
    var text;
    try { text = JSON.stringify(mutant); } catch { continue; }
    errors.length = 0;
    var problems = [];
    try {
      await page.evaluate(function (a) {
        localStorage.clear();
        localStorage.setItem('buzzword_dash_v1', a.text);
        Object.keys(a.aux).forEach(function (k) { localStorage.setItem(k, a.aux[k]); });
      }, { text: text, aux: aux });
      await page.goto(opts.url + '/?debug=1', { timeout: 40000 });
      await page.waitForFunction(function () { return window.__storage && window.__ui && window.__game; }, null, { timeout: 30000, polling: 100 });
      await page.waitForTimeout(700);
      // anything covering the screen (the first-run tour, the daily reward) is closed the way a player would
      for (var t = 0; t < 4; t++) {
        var covered = await page.evaluate(function () { return !!document.querySelector('#tutCloseBtn, #dailyReward button, #tourOverlay'); });
        if (!covered) break;
        await page.locator('#dailyReward button').first().click({ timeout: 1500 }).catch(function () {});
        await page.locator('#tutCloseBtn').first().click({ timeout: 1500 }).catch(function () {});
        await page.locator('#tutExitYes').first().click({ timeout: 1500 }).catch(function () {});
        await page.keyboard.press('Escape').catch(function () {});
        await page.waitForTimeout(300);
      }
      var visited = await page.evaluate(async function (screens) {
        var bad = [];
        for (var si = 0; si < screens.length; si++) {
          try { window.__ui.show(screens[si]); } catch (e) { bad.push(screens[si] + ': ' + e.message); }
          await new Promise(function (r) { setTimeout(r, 90); });
          var el = document.getElementById(screens[si]);
          var m = el && /NaN|undefined|\[object Object\]|Infinity/.exec(el.innerText || '');
          if (m) bad.push(screens[si] + ' shows "' + m[0] + '": ' + (el.innerText || '').replace(/\s+/g, ' ').slice(0, 120));
        }
        window.__ui.show('screenHome');
        return bad;
      }, SCREENS);
      problems = problems.concat(visited);
      // Home pop-ups: the Today sheet and the streak calendar
      for (var sel of ['#studyGoal', '#streakChip']) {
        await page.locator(sel).first().click({ timeout: 1500 }).catch(function () {});
        await page.waitForTimeout(250);
        var shown = await page.evaluate(function () {
          var open = document.querySelector('.sheet-overlay.active');
          var m = open && /NaN|undefined|\[object Object\]|Infinity/.exec(open.innerText || '');
          return m ? m[0] + ' in ' + (open.innerText || '').replace(/\s+/g, ' ').slice(0, 120) : '';
        });
        if (shown) problems.push('pop-up ' + sel + ' shows ' + shown);
        await page.keyboard.press('Escape').catch(function () {});
      }
      var data = await page.evaluate(function () { return window.__dataProblems(); });
      if (data.length) problems.push('saved data: ' + data.slice(0, 3).join('; '));
    } catch (e) {
      problems.push('bot: ' + String(e && e.message || e).split('\n')[0]);
    }
    errors.forEach(function (e) { problems.push(e); });
    if (problems.length) {
      var file = join(opts.out, 'fail-' + i + '.json');
      writeFileSync(file, JSON.stringify({ save: mutant, aux: aux, problems: problems }, null, 2));
      failures.push({ i: i, problems: problems.slice(0, 5), file: file });
      console.log('FAIL #' + i + ': ' + problems.slice(0, 2).join(' | ').slice(0, 300) + '  (' + file + ')');
    }
    if (i % 10 === 0) console.log('...' + i + ' saves, ' + failures.length + ' failures');
  }
  await browser.close();
  return { options: opts, tried: opts.count, failures: failures };
}

async function main() {
  var opts = parseArgs(process.argv.slice(2), process.env);
  console.log('Save fuzz: ' + opts.count + ' damaged saves, seed ' + opts.seed + ', ' + opts.url);
  var report = await savefuzz(opts);
  writeFileSync(join(opts.out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(report.failures.length ? report.failures.length + ' damaged saves broke something' : 'The app started and every screen opened on all ' + report.tried + ' damaged saves');
  process.exit(report.failures.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(function (e) { console.error(e); process.exit(2); });
}
