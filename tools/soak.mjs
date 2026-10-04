#!/usr/bin/env node
/**
 * soak.mjs — a bot that plays the game for a long time with random inputs, to catch crashes and memory growth
 * that short tests never see.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/soak.mjs --minutes 30
 *
 * Options (or environment variables):
 *   --minutes N     how long to play (default 30; SOAK_MINUTES)
 *   --url URL       the app (default http://localhost:4173; SOAK_URL)
 *   --out FILE      where to write the JSON report (default soak-report.json)
 *   --seed N        seed for the random inputs, so a failure can be replayed (default: the time)
 *   --chrome PATH   a Chromium executable (CHROME_PATH); Playwright's own is used if not given
 *
 * What it does: starts each way of playing in turn (Endless, Study, Weakness, Daily 15, Weekly Gauntlet, a
 * friend challenge, flashcards), sends random keys at random moments (left, right, jump, slide, dash), answers the
 * "continue?" prompt, and goes home after each result. Every 15 seconds it records the JavaScript heap and the
 * number of 3D geometries, textures and shader programs.
 *
 * It fails (exit code 1) when: the page throws an error or logs one, the saved data goes the wrong shape (NaN,
 * wrong types, negative counts), the game stops responding, or the counts
 * of geometries or textures keep climbing across runs (a leak). The heap is reported with its trend; because
 * memory is noisy, only a large, steady rise counts as a failure.
 */

/* global window, document */
import { writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv, env) {
  env = env || {};
  var out = {
    minutes: Number(env.SOAK_MINUTES) || 30,
    url: env.SOAK_URL || 'http://localhost:4173',
    out: 'soak-report.json',
    seed: Date.now() % 2147483647,
    chrome: env.CHROME_PATH || ''
  };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    var v = argv[i + 1];
    if (a === '--minutes') { out.minutes = Number(v); i++; }
    else if (a === '--url') { out.url = v; i++; }
    else if (a === '--out') { out.out = v; i++; }
    else if (a === '--seed') { out.seed = Number(v); i++; }
    else if (a === '--chrome') { out.chrome = v; i++; }
  }
  return out;
}

/** A small seeded random generator (mulberry32), so a failing soak can be played again. */
export function makeRng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Does a series keep climbing? Compares the average of the last third with the first third (after dropping the
 * warm-up quarter), and asks for both a relative and an absolute rise so noise on small numbers is ignored.
 * @param {number[]} series
 * @param {{ratio?: number, minRise?: number}} [opts]
 */
export function keepsClimbing(series, opts) {
  opts = opts || {};
  var ratio = opts.ratio || 1.5;
  var minRise = opts.minRise || 50;
  var s = series.slice(Math.floor(series.length * 0.25));
  if (s.length < 6) return false;
  var third = Math.floor(s.length / 3);
  var avg = function (xs) { return xs.reduce(function (p, c) { return p + c; }, 0) / xs.length; };
  var first = avg(s.slice(0, third));
  var last = avg(s.slice(s.length - third));
  return last > first * ratio && last - first > minRise;
}

var KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Shift'];

export var MODES = [
  { id: 'endless', start: async function (page) { await page.click('.btn-play'); } },
  { id: 'study', start: async function (page) { await page.click('#homeChallengeBtn'); await page.click('[data-mode="study"]'); } },
  { id: 'weakness', start: async function (page) { await page.click('#homeChallengeBtn'); await page.click('[data-mode="weakness"]'); } },
  { id: 'daily', start: async function (page) { await page.click('#homeChallengeBtn'); await page.click('[data-mode="daily"]'); } },
  { id: 'tournament', start: async function (page) { await page.click('#homeChallengeBtn'); await page.click('#tournamentBtn'); } },
  { id: 'challenge', start: async function (page) { await page.click('#homeChallengeBtn'); await page.click('#challengeBtn'); } }
];

async function gameState(page) {
  return page.evaluate(function () {
    var g = window.__game;
    if (!g) return { ok: false };
    var info = g.renderer && g.renderer.info;
    var mem = (performance && performance.memory) || {};
    return {
      ok: true,
      running: !!g.running,
      screen: document.body.getAttribute('data-screen'),
      geometries: info ? info.memory.geometries : 0,
      textures: info ? info.memory.textures : 0,
      programs: info && info.programs ? info.programs.length : 0,
      heapMB: mem.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1048576) : 0
    };
  });
}

/** Get past the first-run tutorial and the daily reward. */
export async function openApp(page, url) {
  await page.goto(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'debug=1', { timeout: 40000 });
  for (var i = 0; i < 6; i++) {
    if (!(await page.locator('#tutCloseBtn').isVisible().catch(function () { return false; }))) break;
    await page.locator('#tutCloseBtn').click();
    await page.locator('#tutExitYes').click().catch(function () {});
  }
  var reward = page.locator('#dailyReward');
  try { await reward.waitFor({ state: 'visible', timeout: 6000 }); } catch { return; }
  for (var j = 0; j < 3 && (await reward.isVisible().catch(function () { return false; })); j++) {
    await reward.locator('button').click();
    await page.waitForTimeout(1000);
  }
}

/** Make sure Home is usable: close anything left open, and reload if a control is still covered. */
export async function ensureHome(page, url) {
  await page.keyboard.press('Escape').catch(function () {});
  var ok = await page.locator('.btn-play').click({ trial: true, timeout: 3000 }).then(function () { return true; }, function () { return false; });
  if (!ok) {
    await page.reload();
    await openApp(page, url);
  }
}

export async function goHome(page) {
  var home = page.locator('#goHomeBtn');
  if (await home.isVisible().catch(function () { return false; })) { await home.click().catch(function () {}); return; }
  await page.keyboard.press('Escape').catch(function () {});
}

/** Play one run with random keys until it ends (or the time is up). Returns how many inputs were sent. */
async function playRun(page, rng, deadline) {
  var inputs = 0;
  var started = Date.now();
  while (Date.now() < deadline && Date.now() - started < 4 * 60 * 1000) {
    var st = await gameState(page);
    if (!st.ok) throw new Error('The game object disappeared');
    if (!st.running && st.screen !== 'screenGame') {
      if (Date.now() - started > 3000) break; // the run is over
    }
    var cont = page.locator('#continueNoBtn');
    if (await cont.isVisible().catch(function () { return false; })) await cont.click().catch(function () {});
    var burst = 1 + Math.floor(rng() * 3);
    for (var b = 0; b < burst; b++) {
      await page.keyboard.press(KEYS[Math.floor(rng() * KEYS.length)]).catch(function () {});
      inputs++;
    }
    await page.waitForTimeout(80 + Math.floor(rng() * 320));
  }
  return inputs;
}

async function playFlashcards(page, rng) {
  await page.click('#homeFlashcardsBtn');
  await page.click('#flashcardBtn');
  for (var i = 0; i < 12; i++) {
    var reveal = page.locator('#fcRevealBtn, [data-fc="reveal"], button:has-text("Reveal")').first();
    if (await reveal.isVisible().catch(function () { return false; })) await reveal.click().catch(function () {});
    var rate = page.locator(rng() < 0.5 ? 'button:has-text("Got it")' : 'button:has-text("Missed")').first();
    if (await rate.isVisible().catch(function () { return false; })) await rate.click().catch(function () {});
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Escape').catch(function () {});
}

export async function soak(opts) {
  var pw = await import('@playwright/test');
  var launch = { args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] };
  // Playwright's own browser if it was installed; otherwise the system Chromium the other QA tools use
  if (opts.chrome) launch.executablePath = opts.chrome;
  else if (existsSync('/opt/pw-browsers/chromium')) launch.executablePath = '/opt/pw-browsers/chromium';
  var browser = await pw.chromium.launch(launch);
  var page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) {
    if (m.type() !== 'error') return;
    var text = m.text();
    if (/GPU stall|swiftshader|WebGL: INVALID|Failed to load resource.*(supabase|peerjs)/i.test(text)) return;
    errors.push('console.error: ' + text.slice(0, 300));
  });

  page.setDefaultTimeout(8000);
  var rng = makeRng(opts.seed);
  var deadline = Date.now() + opts.minutes * 60 * 1000;
  var samples = [];
  var runs = [];
  var lastSample = 0;
  await openApp(page, opts.url);

  async function sample(label) {
    var st = await gameState(page);
    if (st.ok) samples.push({ t: Math.round((Date.now() - (deadline - opts.minutes * 60000)) / 1000), label: label, heapMB: st.heapMB, geometries: st.geometries, textures: st.textures, programs: st.programs });
  }

  var n = 0;
  while (Date.now() < deadline && errors.length < 20) {
    var mode = MODES[n % MODES.length];
    n++;
    var result = { mode: mode.id, inputs: 0, error: null };
    try {
      await ensureHome(page, opts.url);
      await mode.start(page);
      await page.waitForTimeout(1500);
      result.inputs = await playRun(page, rng, deadline);
      await page.waitForTimeout(800);
      await goHome(page);
      if (n % MODES.length === 0) { await playFlashcards(page, rng); await goHome(page); }
      await page.waitForTimeout(500);
      // Measure what is left after the track and everything on it is thrown away, which is what the next run starts
      // from. (Measured with the track still built, the counts follow whichever map happened to be showing.)
      await page.evaluate(function () {
        try { window.__game._cleanupObjects(); window.__game._cleanupTrack(); } catch { /* the engine may be mid-run */ }
        if (window.gc) window.gc();
      });
      var problems = await page.evaluate(function () { return window.__dataProblems ? window.__dataProblems() : []; });
      if (problems.length) errors.push('saved data after ' + mode.id + ': ' + problems.slice(0, 5).join('; '));
      await sample('after ' + mode.id);
    } catch (e) {
      result.error = String(e && e.message || e).slice(0, 300);
      errors.push('bot: ' + mode.id + ': ' + result.error);
      await page.reload().catch(function () {});
      await openApp(page, opts.url).catch(function () {});
    }
    runs.push(result);
    if (Date.now() - lastSample > 15000) { await sample('tick'); lastSample = Date.now(); }
  }
  await browser.close();

  var after = samples.filter(function (s) { return /^after/.test(s.label); });
  var leaks = [];
  ['geometries', 'textures', 'programs'].forEach(function (k) {
    if (keepsClimbing(after.map(function (s) { return s[k]; }), { minRise: k === 'programs' ? 15 : 50 })) leaks.push(k + ' keep climbing');
  });
  if (keepsClimbing(after.map(function (s) { return s.heapMB; }), { ratio: 2, minRise: 100 })) leaks.push('JavaScript heap keeps climbing');

  var report = { options: opts, runs: runs.length, perMode: runs.reduce(function (o, r) { o[r.mode] = (o[r.mode] || 0) + 1; return o; }, {}), errors: errors, leaks: leaks, samples: samples };
  return report;
}

async function main() {
  var opts = parseArgs(process.argv.slice(2), process.env);
  console.log('Soak: ' + opts.minutes + ' min against ' + opts.url + ' (seed ' + opts.seed + ')');
  var report = await soak(opts);
  writeFileSync(opts.out, JSON.stringify(report, null, 2));
  var last = report.samples[report.samples.length - 1];
  console.log('Runs: ' + report.runs + ' ' + JSON.stringify(report.perMode));
  if (last) console.log('Last sample: heap ' + last.heapMB + ' MB, geometries ' + last.geometries + ', textures ' + last.textures + ', programs ' + last.programs);
  report.errors.slice(0, 10).forEach(function (e) { console.log('ERROR ' + e); });
  report.leaks.forEach(function (l) { console.log('LEAK  ' + l); });
  console.log('Report: ' + opts.out);
  process.exit(report.errors.length || report.leaks.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(function (e) { console.error(e); process.exit(2); });
}
