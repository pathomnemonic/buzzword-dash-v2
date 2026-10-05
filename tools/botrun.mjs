#!/usr/bin/env node
/**
 * botrun.mjs — a fast-forward play bot: hundreds or thousands of runs of random play.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/botrun.mjs --runs 300 --seed 1
 *
 * soak.mjs plays in real time, so it manages a few runs an hour. This bot takes over the game clock once a run has
 * started and steps the engine itself, about a hundred times faster than real time (no drawing except now and then),
 * so one browser plays a run in a second or two. It uses the same input paths as a player (key events on the document,
 * the engine's own handlers), and it makes choices a player would not: a random hero, hat, trail, monster and map
 * every run, power-ups handed out at random moments, map changes forced early, pauses in the middle of a jump,
 * hitches and long frames, a window that changes size, and an app that goes to the background.
 *
 * It fails (exit code 1) when, during a run:
 *   - the page throws, or logs a console error
 *   - a number the game keeps (score, lives, position, camera...) is NaN or infinite, or goes the wrong way
 *     (the score falls, the multiplier leaves 1 to 8, the lives go below zero or above nine)
 *   - the run stops making progress (no gate answered for 90 seconds of play)
 *   - the number of things in the scene keeps growing (a leak), or one run holds far more than any should
 *   - a run ends with a score no run could earn, or a results screen with NaN or "undefined" on it
 *   - the saved data goes the wrong shape (see sanity.js)
 *
 * Options (or environment variables):
 *   --runs N        how many runs (default 100; BOT_RUNS)
 *   --minutes N     stop after this long even if fewer runs were played
 *   --url URL       the app (default http://localhost:4173)
 *   --seed N        seed for everything random, so a failing run can be played again (printed in the report)
 *   --out FILE      the JSON report (default botrun-report.json)
 *   --modes a,b     which modes to play (default: all of Endless, Study, Weakness, Daily 15, Weekly Gauntlet, Challenge)
 *   --chrome PATH   a Chromium executable (CHROME_PATH)
 */

/* global window, document, KeyboardEvent, PointerEvent, MutationObserver, getComputedStyle */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeRng, keepsClimbing, MODES, openApp, ensureHome, goHome } from './soak.mjs';

export function parseBotArgs(argv, env) {
  env = env || {};
  var out = {
    runs: Number(env.BOT_RUNS) || 100,
    minutes: 0,
    url: env.SOAK_URL || 'http://localhost:4173',
    seed: Date.now() % 2147483647,
    out: 'botrun-report.json',
    modes: MODES.map(function (m) { return m.id; }),
    chrome: env.CHROME_PATH || '/opt/pw-browsers/chromium'
  };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    var v = argv[i + 1];
    if (a === '--runs') { out.runs = Number(v); i++; }
    else if (a === '--minutes') { out.minutes = Number(v); i++; }
    else if (a === '--url') { out.url = v; i++; }
    else if (a === '--seed') { out.seed = Number(v); i++; }
    else if (a === '--out') { out.out = v; i++; }
    else if (a === '--modes') { out.modes = String(v).split(',').filter(Boolean); i++; }
    else if (a === '--chrome') { out.chrome = v; i++; }
  }
  return out;
}

/**
 * The most a run can score after `correct` right answers. Each right answer pays (10 + 2 x streak) x multiplier (8 at
 * most) x 2 (double points), plus a rush bonus and a small speed bonus; generous margins keep this from ever being
 * the thing that fails, while still catching a score that is off by an order of magnitude.
 */
export function maxScoreFor(correct) {
  var n = Math.max(0, Math.floor(correct || 0));
  return 16 * (10 * n + n * (n + 1)) + 400 * n + 50;
}

function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

/**
 * What one run does. Pure (seeded), so the choices are tested and a failing run can be replayed.
 * @param {function(): number} rng
 * @param {string[]} modeIds
 */
export function pickConfig(rng, modeIds) {
  var skill = pick(rng, [0.1, 0.35, 0.6, 0.8, 0.95, 1, 1]);
  return {
    mode: pick(rng, modeIds),
    seed: Math.floor(rng() * 2147483647),
    skill: skill,                                        // chance of steering to the right gate
    dodge: pick(rng, [0, 0.3, 0.7, 0.95, 1]),            // chance of jumping or sliding at an obstacle
    noise: pick(rng, [0, 0.3, 1.5]),                     // random key presses a second
    swipes: pick(rng, [0, 0.2, 1]),                      // random swipes a second
    rush: pick(rng, [0, 0.05, 0.4]),                     // dash presses a second
    power: pick(rng, [0, 0.02, 0.15]),                   // power-ups handed out a second
    mapRate: pick(rng, [0, 0.01, 0.08]),                 // map changes forced early, a second
    pauseRate: pick(rng, [0, 0, 0.004, 0.02]),           // pauses a second
    jitter: pick(rng, [0, 0.01, 0.1]),                   // share of frames that are long or short
    reactSec: pick(rng, [0.2, 1.5, 4]),                  // how long after a gate appears the bot starts steering
    maxEncounters: 6 + Math.floor(rng() * 40),
    viewport: pick(rng, [[390, 780], [360, 640], [412, 915], [320, 568], [768, 1024], [844, 390]]),
    quality: pick(rng, ['auto', 'low', 'medium', 'high']),
    userSpeed: pick(rng, [0.5, 1, 1, 1.5, 2]),
    continueYes: pick(rng, [0, 0.5, 1]),
    background: rng() < 0.15,                            // the app goes to the background and comes back during the run
    resize: rng() < 0.15,
    viewportAfter: pick(rng, [[390, 780], [320, 480], [1024, 700]])
  };
}

/** The bot that runs inside the page (it is serialised by Playwright, so it must not use anything from this file). */
function installBot() {
  var B = (window.__bot = {});
  var RealDate = Date;
  var realNow = performance.now.bind(performance);
  var realRAF = window.requestAnimationFrame.bind(window);
  B.turbo = false;
  B.vt = 0;
  B.vt0 = 0;
  B.wall0 = 0;
  B.perfOff = 0;
  B.dateOff = 0;
  B.held = [];
  B.steps = 0;
  B.maxima = { children: 0, obstacles: 0, coins: 0, props: 0, geometries: 0, textures: 0, stepMs: 0 };

  function wall() { return B.turbo ? B.wall0 + (B.vt - B.vt0) : RealDate.now() + B.dateOff; }
  performance.now = function () { return B.turbo ? B.vt : realNow() + B.perfOff; };
  window.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(wall()); }
    static now() { return wall(); }
  };
  // While the bot drives the clock the page's own frame loop sleeps; it wakes when the bot hands the clock back
  window.requestAnimationFrame = function (cb) {
    if (B.turbo) { B.held.push(cb); return -1; }
    return realRAF(cb);
  };

  B.seed = function (s) {
    var a = s >>> 0;
    B.rng = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Math.random = B.rng;
  };
  B.seed(1);

  B.begin = function () {
    if (B.turbo) return;
    B.vt = B.vt0 = performance.now();
    B.wall0 = wall();
    B.turbo = true;
  };
  B.finish = function () {
    if (!B.turbo) return;
    B.perfOff = B.vt - realNow();
    B.dateOff = wall() - RealDate.now();
    B.turbo = false;
    var held = B.held;
    B.held = [];
    held.forEach(function (cb) { realRAF(cb); });
  };

  // what the game said in words (toasts), so "nothing happened" can be told from "it explained why not"
  B.toasts = [];
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) { if (n.classList && n.classList.contains('toast')) B.toasts.push(n.textContent); });
    });
  }).observe(document, { childList: true, subtree: true });

  B.press = function (key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
  };
  B.swipe = function (canvas, dx, dy) {
    if (!canvas) return;
    var ev = function (type, x, y) { return new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }); };
    canvas.dispatchEvent(ev('pointerdown', 200, 400));
    canvas.dispatchEvent(ev('pointermove', 200 + dx, 400 + dy));
    canvas.dispatchEvent(ev('pointerup', 200 + dx, 400 + dy));
  };

  B.startRun = function (o) {
    B.seed(o.seed);
    B.o = o;
    B.lastScore = 0;
    B.lastEnc = 0;
    B.lastProgressStep = 0;
    B.targetEnc = -1;
    B.target = 1;
    B.reactAt = 0;
    B.runSteps = 0;
    B.progressEnc = -1;
  };

  var POWERUPS = ['shield', 'double', 'magnet', 'autoPilot', 'scoreFrenzy'];
  B.act = function (g, o, dt) {
    var rng = B.rng;
    // steer to a gate: usually the right one, after a "thinking" delay
    if (g.gatesActive && !g.answerLocked && g.gates && g.gates.length === 3) {
      if (B.targetEnc !== g.encountersDone) {
        B.targetEnc = g.encountersDone;
        var right = 1;
        for (var i = 0; i < 3; i++) if (g.gates[i].correct) right = i;
        B.target = rng() < o.skill ? right : Math.floor(rng() * 3);
        B.reactAt = g.elapsedTime + rng() * o.reactSec;
      }
      if (g.elapsedTime >= B.reactAt && g.targetLane !== B.target) B.press(g.targetLane < B.target ? 'ArrowRight' : 'ArrowLeft');
    }
    // obstacles in the lane: jump the low ones, slide under the high ones
    if (o.dodge > 0 && g.obstacleMeshes) {
      for (var j = 0; j < g.obstacleMeshes.length; j++) {
        var ob = g.obstacleMeshes[j];
        var d = ob.userData;
        if (d.checked || d.lane !== g.currentLane || ob.position.z < -9 || ob.position.z > -2) continue;
        if (d.botDecided === undefined) d.botDecided = rng() < o.dodge;
        if (d.botDecided) B.press(d.type === 'high' ? 'ArrowDown' : 'ArrowUp');
      }
    }
    if (rng() < o.noise * dt) B.press(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'][Math.floor(rng() * 8)]);
    if (rng() < o.swipes * dt) {
      var s = [[60, 0], [-60, 0], [0, -60], [0, 60]][Math.floor(rng() * 4)];
      B.swipe(g.renderer.domElement, s[0], s[1]);
    }
    if (rng() < o.rush * dt) B.press(rng() < 0.5 ? 'Shift' : ' ');
    if (g.autoPilotHeld && rng() < 0.3 * dt) B.press('Control');
    if (rng() < o.power * dt) g._collectPowerup(POWERUPS[Math.floor(rng() * POWERUPS.length)]);
    if (rng() < o.mapRate * dt) g.encountersUntilTransition = 1;
    if (rng() < o.pauseRate * dt) g.togglePause();
  };

  function notFinite(v) { return typeof v !== 'number' || !isFinite(v); }
  var NUMBERS = ['score', 'streak', 'multiplier', 'coins', 'lives', 'speed', 'monsterZ', 'gateZ', 'playerY', 'elapsedTime', 'encountersDone', 'correct', 'wrong', 'targetLane', 'rushStacks'];
  B.check = function (g) {
    var i;
    for (i = 0; i < NUMBERS.length; i++) if (notFinite(g[NUMBERS[i]])) return 'not a finite number: ' + NUMBERS[i] + ' = ' + g[NUMBERS[i]];
    var p = g.playerGroup && g.playerGroup.position;
    if (p && (notFinite(p.x) || notFinite(p.y) || notFinite(p.z))) return 'player position is not finite: ' + [p.x, p.y, p.z];
    var c = g.camera.position;
    if (notFinite(c.x) || notFinite(c.y) || notFinite(c.z)) return 'camera position is not finite: ' + [c.x, c.y, c.z];
    // (Study mode has no lives and shows 99)
    if (g.lives < -1 || (g.lives > 9 && g.mode !== 'study')) return 'lives out of range: ' + g.lives;
    if (g.multiplier < 1 || g.multiplier > 8) return 'multiplier out of range: ' + g.multiplier;
    if (g.streak < 0) return 'negative streak: ' + g.streak;
    if (g.score < B.lastScore) return 'score went down: ' + B.lastScore + ' -> ' + g.score;
    if (g.encountersDone < B.lastEnc) return 'encounters went down: ' + B.lastEnc + ' -> ' + g.encountersDone;
    if (g.correct + g.wrong > g.encountersDone) return 'answers (' + g.correct + ' + ' + g.wrong + ') exceed the gates passed (' + g.encountersDone + ')';
    if (g.targetLane < 0 || g.targetLane > 2 || g.targetLane !== Math.floor(g.targetLane)) return 'lane out of range: ' + g.targetLane;
    if (g.gatesActive && g.gates.length !== 3) return 'gates are active with ' + g.gates.length + ' gates';
    if (g.gatesActive) {
      var right = 0;
      for (i = 0; i < g.gates.length; i++) if (g.gates[i].correct) right++;
      if (right !== 1) return 'a gate set has ' + right + ' right answers';
    }
    B.lastScore = g.score;
    B.lastEnc = g.encountersDone;
    var m = B.maxima;
    m.children = Math.max(m.children, g.scene.children.length);
    m.obstacles = Math.max(m.obstacles, g.obstacleMeshes.length);
    m.coins = Math.max(m.coins, g.coinMeshes.length);
    m.props = Math.max(m.props, g.envPropMeshes.length);
    if (g.scene.children.length > 700) {
      var kinds = {};
      g.scene.children.forEach(function (c) { var k = c.type + (c.name ? ':' + c.name : '') + (c.userData && c.userData.type ? '/' + c.userData.type : ''); kinds[k] = (kinds[k] || 0) + 1; });
      var top = Object.keys(kinds).sort(function (a, b) { return kinds[b] - kinds[a]; }).slice(0, 5).map(function (k) { return k + ' x' + kinds[k]; });
      return 'the scene holds ' + g.scene.children.length + ' top-level objects (most: ' + top.join(', ') + '; map changes ' + g._mapChanges + ', encounters ' + g.encountersDone + ')';
    }
    if (g.obstacleMeshes.length > 80) return g.obstacleMeshes.length + ' obstacles alive at once';
    if (g.coinMeshes.length > 700) return g.coinMeshes.length + ' coins and pick-ups alive at once';
    if (g.envPropMeshes.length > 400) return g.envPropMeshes.length + ' scenery props alive at once';
    return null;
  };

  B.run = function (steps) {
    var g = window.__game;
    var o = B.o;
    var out = { steps: 0, stop: null, issues: [] };
    if (!B.turbo) B.begin();
    for (var i = 0; i < steps; i++) {
      var st = g._state;
      if (st !== 'playing' && st !== 'dying') { out.stop = 'state:' + st; break; }
      var dt = 1 / 60;
      if (B.rng() < o.jitter) dt = [1 / 144, 1 / 30, 1 / 20, 0.09, 0.12, 0.5][Math.floor(B.rng() * 6)];
      B.vt += dt * 1000;
      var t0 = realNow();
      try {
        if (st === 'playing') B.act(g, o, dt);
        g.update(dt, B.vt);
      } catch (e) {
        out.issues.push('exception in update: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
        out.stop = 'exception';
        break;
      }
      B.steps++;
      B.runSteps++;
      out.steps++;
      // drawing is the slow part (software GL), so only now and then, and always during a map change
      if (B.runSteps % 900 === 0 || (g.transitionActive && B.runSteps % 45 === 0)) {
        try { g.render(); } catch (e2) { out.issues.push('exception in render: ' + (e2 && e2.message)); out.stop = 'exception'; break; }
        var mem = g.renderer.info.memory;
        B.maxima.geometries = Math.max(B.maxima.geometries, mem.geometries);
        B.maxima.textures = Math.max(B.maxima.textures, mem.textures);
      }
      B.maxima.stepMs = Math.max(B.maxima.stepMs, realNow() - t0);
      var bad = B.check(g);
      if (bad) { out.issues.push(bad); if (out.issues.length >= 3) { out.stop = 'issues'; break; } }
      if (g.encountersDone !== B.progressEnc) { B.progressEnc = g.encountersDone; B.lastProgressStep = B.runSteps; }
      if (st === 'playing' && !g.transitionActive && (B.runSteps - B.lastProgressStep) / 60 > 90) {
        out.issues.push('no gate answered for 90 seconds of play (encounters ' + g.encountersDone + ', gatesActive ' + g.gatesActive + ', waitingForNext ' + g.waitingForNext + ', transition ' + g.transitionActive + ')');
        out.stop = 'stuck';
        break;
      }
      if (st === 'playing' && g.encountersDone >= o.maxEncounters) { out.stop = 'cap'; break; }
    }
    out.state = g._state;
    out.stats = { score: g.score, correct: g.correct, wrong: g.wrong, lives: g.lives, encounters: g.encountersDone, streak: g.bestStreak, maps: g._mapChanges };
    return out;
  };

  B.background = function (hidden) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return hidden ? 'hidden' : 'visible'; } });
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return !!hidden; } });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(hidden ? 'blur' : 'focus'));
  };

  B.memory = function () {
    var g = window.__game;
    // what is left once the track and everything on it is thrown away (what the next run starts from)
    try { g._cleanupObjects(); g._cleanupTrack(); } catch { /* the engine may be mid-run */ }
    var info = g && g.renderer && g.renderer.info;
    var n = 0;
    if (g && g.scene) g.scene.traverse(function () { n++; });
    return { geometries: info ? info.memory.geometries : 0, textures: info ? info.memory.textures : 0, programs: info && info.programs ? info.programs.length : 0, objects: n };
  };

  B.badText = function (selector) {
    var el = document.querySelector(selector);
    if (!el) return '';
    var t = el.innerText || '';
    var m = /NaN|undefined|\[object Object\]|Infinity|null\b/.exec(t);
    return m ? m[0] + ' in: ' + t.replace(/\s+/g, ' ').slice(0, 160) : '';
  };
}

/** What can be checked once a run is over, from numbers the page reports. Pure, so it is tested. */
export function checkRunEnd(r) {
  var out = [];
  if (r.score < 0 || !isFinite(r.score)) out.push('final score is ' + r.score);
  if (r.score > maxScoreFor(r.correct)) out.push('score ' + r.score + ' is more than ' + r.correct + ' right answers can earn (' + maxScoreFor(r.correct) + ')');
  if (r.correct + r.wrong > r.encounters) out.push('answers exceed gates passed');
  if (r.encountersSaved != null && r.encountersSaved !== r.encounters) out.push('the save counted ' + r.encountersSaved + ' gates; the run had ' + r.encounters);
  return out;
}

export async function botrun(opts) {
  var pw = await import('@playwright/test');
  var shop = await import('../js/game/shopdata.js');
  var catalog = await import('../js/game/modelcatalog.js');
  var skins = await import('../js/game/skins.js');
  var items = shop.LOCKER_ITEMS;
  var allIds = items.map(function (i) { return i.id; });
  catalog.CHARACTER_MODELS.concat(catalog.MONSTER_MODELS).forEach(function (m) { if (allIds.indexOf(m.id) < 0) allIds.push(m.id); });
  var bySlot = {};
  items.forEach(function (i) { (bySlot[i.type] = bySlot[i.type] || []).push(i.id); });
  var mapNames = skins.SKINS.map(function (s) { return s.name; });

  var browser = await pw.chromium.launch({ executablePath: opts.chrome, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info'] });
  var context = await browser.newContext({ viewport: { width: 390, height: 780 }, bypassCSP: true });
  var page = await context.newPage();
  var errors = [];
  var NOISE = /GPU stall|swiftshader|WebGL: INVALID|GroupMarkerNotSet|Failed to load resource|net::ERR|WebSocket connection|peerjs|supabase/i;
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console.error: ' + m.text().slice(0, 300)); });
  page.on('dialog', function (d) { d.dismiss().catch(function () {}); });
  page.on('crash', function () { errors.push('the page crashed (the browser process ran out of memory or lost the graphics context)'); });
  browser.on('disconnected', function () { errors.push('the browser closed'); });
  page.setDefaultTimeout(8000);
  await page.addInitScript(installBot);

  var rng = makeRng(opts.seed);
  var started = Date.now();
  var runs = [];
  var samples = [];
  var problems = [];
  var maxima = {};
  var perMode = {};
  var skipped = [];
  var modeById = {};
  MODES.forEach(function (m) { modeById[m.id] = m; });
  var modeIds = opts.modes.filter(function (m) { return modeById[m]; });

  function problem(runNo, cfg, text) {
    problems.push({ run: runNo, mode: cfg && cfg.mode, seed: cfg && cfg.seed, text: String(text).slice(0, 400) });
    console.log('PROBLEM run ' + runNo + (cfg ? ' [' + cfg.mode + ' seed ' + cfg.seed + ']' : '') + ': ' + String(text).slice(0, 220));
  }

  await openApp(page, opts.url);
  await page.waitForFunction(function () { return window.__game && window.__storage; }, null, { timeout: 20000, polling: 100 });
  // Own everything, so every hero, hat, trail, monster and map can come up
  await page.evaluate(function (ids) {
    var s = window.__storage;
    s.data.progression.ownedItems = ids.slice();
    s.data.progression.coins = 5000;
    s.save();
  }, allIds);

  for (var n = 1; n <= opts.runs && problems.length < 25; n++) {
    if (opts.minutes && Date.now() - started > opts.minutes * 60000) break;
    var cfg = pickConfig(rng, modeIds);
    var runErrorsBefore = errors.length;
    var runStarted = Date.now();
    try {
      await ensureHome(page, opts.url);
      await page.setViewportSize({ width: cfg.viewport[0], height: cfg.viewport[1] });
      // a random loadout, the same way the Locker sets one
      var loadout = { skin: pick(rng, bySlot.skin), hat: pick(rng, bySlot.hat), trail: pick(rng, bySlot.trail), gear: pick(rng, bySlot.gear), clothing: pick(rng, bySlot.clothing), monster: pick(rng, bySlot.monster) };
      var preferred = rng() < 0.2 ? pick(rng, mapNames) : '';
      await page.evaluate(function (a) {
        var s = window.__storage;
        Object.keys(a.loadout).forEach(function (slot) { s.equipItem(a.loadout[slot], slot); });
        s.set('preferredMap', a.preferred);
        s.set('quality', a.quality);
        s.set('userSpeed', a.userSpeed);
        if (s.get('coins') < 400) s.addCoins(2000);
      }, { loadout: loadout, preferred: preferred, quality: cfg.quality, userSpeed: cfg.userSpeed });
      var before = await page.evaluate(function () { return { enc: window.__storage.get('totalEncounters') || 0 }; });

      await page.evaluate(function () { window.__bot.toasts.length = 0; });
      await modeById[cfg.mode].start(page);
      var playing = await page.waitForFunction(function () { return window.__game._state === 'playing'; }, null, { timeout: 15000, polling: 100 }).then(function () { return true; }, function () { return false; });
      if (!playing) {
        var said = await page.evaluate(function () { return window.__bot.toasts.slice(); });
        if (said.length) { skipped.push({ run: n, mode: cfg.mode, said: said[0] }); continue; } // the game said no, in words: fine
        problem(n, cfg, 'the run did not start and nothing explained why (state ' + (await page.evaluate(function () { return window.__game._state + ', screen ' + document.body.getAttribute('data-screen'); })) + ')');
        continue;
      }
      await page.evaluate(function (c) { window.__bot.startRun(c); }, cfg);

      var last = null;
      var chunk = 0;
      var continues = 0;
      var done = false;
      while (!done) {
        chunk++;
        if (chunk > 400) { problem(n, cfg, 'run did not end after ' + chunk + ' chunks'); break; }
        last = await page.evaluate(function (steps) { return window.__bot.run(steps); }, 1500);
        last.issues.forEach(function (t) { problem(n, cfg, t); });
        if (last.stop === 'exception' || last.stop === 'stuck' || last.stop === 'issues') {
          await page.evaluate(function () { window.__bot.finish(); });
          await page.evaluate(function () { try { window.__game.requestEnd('manual_end'); } catch { /* the run may be over */ } });
          done = true;
        } else if (last.stop === 'cap') {
          await page.evaluate(function () { window.__bot.finish(); window.__game.requestEnd('manual_end'); });
          done = true;
        } else if (last.stop && last.stop.indexOf('state:') === 0) {
          var state = last.stop.slice(6);
          await page.evaluate(function () { window.__bot.finish(); });
          if (state === 'continue_prompt') {
            await page.waitForSelector('#continueYesBtn', { state: 'visible', timeout: 6000 }).catch(function () { problem(n, cfg, 'the Continue prompt is not showing'); });
            if (rng() < cfg.continueYes && continues < 2) {
              continues++;
              await page.locator('#continueYesBtn').click({ timeout: 8000, force: true }).catch(async function (e) { problem(n, cfg, 'continue button: ' + e.message.split('\n')[0] + ' ' + (await page.evaluate(function () { var o = document.getElementById('continueOverlay'); var b = document.getElementById('continueYesBtn'); var r = b.getBoundingClientRect(); return 'overlay "' + o.className + '" display ' + getComputedStyle(o).display + ' btn ' + [r.x, r.y, r.width, r.height].map(Math.round) + ' disabled ' + b.disabled + ' state ' + window.__game._state; }).catch(function () { return ''; }))); });
              await page.waitForFunction(function () { return window.__game._state === 'playing'; }, null, { timeout: 15000, polling: 100 }).catch(function () { problem(n, cfg, 'did not go back to playing after Continue'); });
            } else {
              await page.locator('#continueNoBtn').click({ timeout: 8000, force: true }).catch(function (e) { problem(n, cfg, 'end-run button: ' + e.message.split('\n')[0]); });
              done = true;
            }
          } else if (state === 'paused') {
            const shown = await page.evaluate(function () { var o = document.getElementById('pauseOverlay'); return o.classList.contains('active') ? '' : 'class "' + o.className + '", state ' + window.__game._state + ', screen ' + document.body.getAttribute('data-screen') + ', continueOverlay "' + document.getElementById('continueOverlay').className + '"'; });
            if (shown && /state paused/.test(shown)) problem(n, cfg, 'paused but the pause screen is not showing: ' + shown);
            if (cfg.background) { await page.evaluate(function () { window.__bot.background(true); }); await page.waitForTimeout(150); await page.evaluate(function () { window.__bot.background(false); }); }
            await page.waitForTimeout(100 + Math.floor(rng() * 300));
            await page.keyboard.press('Escape');
            await page.waitForFunction(function () { return window.__game._state !== 'paused'; }, null, { timeout: 4000, polling: 100 }).catch(function () { problem(n, cfg, 'Escape did not resume the run'); });
          } else if (state === 'countdown' || state === 'preparing') {
            await page.waitForFunction(function () { return window.__game._state === 'playing'; }, null, { timeout: 10000, polling: 100 }).catch(function () { problem(n, cfg, 'stuck in ' + state); done = true; });
          } else {
            // finishing / ended / idle: the run is over
            done = true;
          }
        }
        if (!done && cfg.background && chunk === 2) {
          await page.evaluate(function () { window.__bot.finish(); window.__bot.background(true); });
          await page.waitForTimeout(200);
          await page.evaluate(function () { window.__bot.background(false); });
        }
        if (!done && cfg.resize && chunk === 3) {
          await page.evaluate(function () { window.__bot.finish(); });
          await page.setViewportSize({ width: cfg.viewportAfter[0], height: cfg.viewportAfter[1] });
          await page.waitForTimeout(100);
        }
      }
      await page.evaluate(function () { window.__bot.finish(); });
      // let the result screen come up (the page's own timers run in real time again)
      var reachedResults = await page.waitForFunction(function () { return document.body.getAttribute('data-screen') === 'screenPostRun'; }, null, { timeout: 12000, polling: 100 }).then(function () { return true; }, function () { return false; });
      if (!reachedResults) problem(n, cfg, 'no results screen after the run ended (state ' + (await page.evaluate(function () { return window.__game._state + ', screen ' + document.body.getAttribute('data-screen'); })) + ')');
      await page.waitForTimeout(900);
      var post = await page.evaluate(function () {
        var g = window.__game;
        return {
          state: g._state,
          screen: document.body.getAttribute('data-screen'),
          score: g.score, correct: g.correct, wrong: g.wrong, encounters: g.encountersDone,
          encountersSaved: (window.__storage.get('totalEncounters') || 0),
          bad: window.__bot.badText('#screenPostRun'),
          data: window.__dataProblems()
        };
      });
      post.encountersSaved = post.encountersSaved - before.enc;
      // modes that do not save a finished run (Study never ends; a quit with nothing answered) do not move the counter
      if (post.encountersSaved === 0) post.encountersSaved = null;
      checkRunEnd(post).forEach(function (t) { problem(n, cfg, t); });
      if (post.bad) problem(n, cfg, 'results screen shows ' + post.bad);
      if (post.data.length) problem(n, cfg, 'saved data: ' + post.data.slice(0, 3).join('; '));
      await goHome(page);
      await page.waitForTimeout(300);
      var mem = await page.evaluate(function () { return window.__bot.memory(); });
      samples.push(Object.assign({ run: n }, mem));
      var bm = await page.evaluate(function () { return window.__bot.maxima; });
      Object.keys(bm).forEach(function (k) { maxima[k] = Math.max(maxima[k] || 0, bm[k]); });
      perMode[cfg.mode] = (perMode[cfg.mode] || 0) + 1;
      runs.push({ n: n, mode: cfg.mode, seed: cfg.seed, skill: cfg.skill, stats: last && last.stats, ms: Date.now() - runStarted });
    } catch (e) {
      problem(n, cfg, 'bot: ' + String(e && e.message || e).split('\n')[0]);
      await page.evaluate(function () { if (window.__bot) window.__bot.finish(); }).catch(function () {});
      await page.reload().catch(function () {});
      await openApp(page, opts.url).catch(function () {});
      await page.waitForFunction(function () { return window.__game && window.__storage; }, null, { timeout: 20000, polling: 100 }).catch(function () {});
    }
    errors.slice(runErrorsBefore).forEach(function (t) { problem(n, cfg, t); });
    if (n % 10 === 0) console.log('...' + n + ' runs, ' + problems.length + ' problems, ' + Math.round((Date.now() - started) / 1000) + ' s');
  }
  await browser.close();

  var leaks = [];
  ['geometries', 'textures', 'programs', 'objects'].forEach(function (k) {
    if (keepsClimbing(samples.map(function (s) { return s[k]; }), { minRise: k === 'programs' ? 15 : 60 })) leaks.push(k + ' keep climbing across runs');
  });
  return { options: opts, runs: runs.length, perMode: perMode, skipped: skipped, problems: problems, leaks: leaks, maxima: maxima, samples: samples, seconds: Math.round((Date.now() - started) / 1000), played: runs };
}

async function main() {
  var opts = parseBotArgs(process.argv.slice(2), process.env);
  console.log('Bot: ' + opts.runs + ' runs, seed ' + opts.seed + ', ' + opts.url);
  var report = await botrun(opts);
  writeFileSync(opts.out, JSON.stringify(report, null, 2));
  var last = report.samples[report.samples.length - 1];
  console.log('Runs: ' + report.runs + ' ' + JSON.stringify(report.perMode) + ' in ' + report.seconds + ' s');
  if (report.skipped.length) console.log('Not started, with a message: ' + report.skipped.length + ' (e.g. ' + JSON.stringify(report.skipped[0]) + ')');
  console.log('Highest seen: ' + JSON.stringify(report.maxima));
  if (last) console.log('Last memory sample: ' + JSON.stringify(last));
  report.problems.slice(0, 10).forEach(function (p) { console.log('PROBLEM ' + JSON.stringify(p)); });
  report.leaks.forEach(function (l) { console.log('LEAK ' + l); });
  console.log('Report: ' + opts.out);
  process.exit(report.problems.length || report.leaks.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(function (e) { console.error(e); process.exit(2); });
}
