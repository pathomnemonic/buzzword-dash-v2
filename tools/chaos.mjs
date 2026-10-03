#!/usr/bin/env node
/**
 * chaos.mjs — a monkey that tries to break the game.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/chaos.mjs --minutes 10 --seed 7
 *
 * Unlike soak.mjs (which plays), this does the things players do by accident or on purpose: taps random controls,
 * jams keys, types awful text (very long, emoji, right-to-left, markup), rotates and shrinks the window, goes
 * offline and back, hides the app and brings it back, jumps the clock past midnight, switches screens as fast as it
 * can, uses the Back key, and reloads in the middle of things. After every step it checks: no uncaught error, no
 * console error, the saved data still the right shape, and that some screen or the game is showing.
 *
 * Exit code 1 and a list of what broke (with the seed, so it can be replayed) when anything fails.
 */

/* global window, document, localStorage */
import { writeFileSync } from 'node:fs';
import { makeRng } from './soak.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : d; };
const MINUTES = Number(opt('minutes', 5));
const SEED = Number(opt('seed', Date.now() % 100000));
const URL = opt('url', 'http://localhost:4173');
const CHROME = opt('chrome', process.env.CHROME_PATH || '/opt/pw-browsers/chromium');
const OUT = opt('out', 'chaos-report.json');

const NOISE = /WebSocket connection|peerjs|GPU stall|swiftshader|WebGL: INVALID|GroupMarkerNotSet|Failed to load resource|net::ERR|\[vite\]|status of (404|401|403|400)|ERR_INTERNET_DISCONNECTED|offline/i;
const AVOID = /reset|delete|erase|wipe|sign ?out|log ?out|remove all|restore|account/i;
const NASTY = ['', ' ', 'a'.repeat(3000), '\u{1F600}'.repeat(200), '‮evil‬', '<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'; DROP TABLE x;--", '\u0000\u0001', 'ñ'.repeat(100), '-1', '1e999', 'null', '{{c1::x}}', '\n\n\n', '   leading', 'Ünïcödé', '0'.repeat(500)];
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Shift', 'Escape', 'Enter', 'Tab', 'Backspace', 'KeyP', 'KeyM', 'Digit1', 'Digit2'];
const SCREENS = ['screenHome', 'screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings', 'screenMyCards', 'screenCardBrowser', 'screenFlashcard', 'screenExam', 'screenLeaderboard', 'screenCohorts'];
const VIEWPORTS = [[390, 780], [320, 480], [1280, 720], [800, 360], [360, 800], [1024, 1366], [250, 300]];

const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 780 }, bypassCSP: true });
const page = await context.newPage();
const rng = makeRng(SEED);
const pick = (a) => a[Math.floor(rng() * a.length)];
const problems = [];
const log = [];
let step = 0;
let current = '';

function report(kind, detail) {
  problems.push({ step, action: current, kind, detail: String(detail).slice(0, 400) });
  console.log(`PROBLEM [step ${step}, ${current}] ${kind}: ${String(detail).slice(0, 200)}`);
}
page.on('pageerror', (e) => report('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) report('console.error', m.text()); });
page.on('dialog', (d) => { (rng() < 0.5 ? d.accept() : d.dismiss()).catch(() => {}); });
page.setDefaultTimeout(3000);

async function open() {
  await page.goto(URL + '/?debug=1');
  for (let i = 0; i < 6 && (await page.locator('#tutCloseBtn').isVisible().catch(() => false)); i++) {
    await page.locator('#tutCloseBtn').click().catch(() => {});
    await page.locator('#tutExitYes').click().catch(() => {});
  }
  const reward = page.locator('#dailyReward');
  try { await reward.waitFor({ state: 'visible', timeout: 5000 }); } catch { return; }
  for (let j = 0; j < 3 && (await reward.isVisible().catch(() => false)); j++) { await reward.locator('button').click().catch(() => {}); await page.waitForTimeout(900); }
}

const actions = {
  async clickRandom() {
    const el = await page.evaluateHandle((avoidSrc) => {
      const avoid = new RegExp(avoidSrc, 'i');
      const els = [...document.querySelectorAll('button, a[href], summary, [role="button"], [role="switch"], [role="tab"], select, input, .shop-item, .nav-item')].filter((e) => {
        if (e.checkVisibility && !e.checkVisibility({ checkVisibilityCSS: true })) return false;
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || e.disabled) return false;
        return !avoid.test((e.textContent || '') + (e.getAttribute('aria-label') || '') + (e.id || ''));
      });
      return els[Math.floor(Math.random() * els.length)] || null;
    }, AVOID.source);
    const h = el.asElement();
    if (h) { current = 'click ' + (await h.evaluate((e) => (e.id || e.className || e.tagName).toString().slice(0, 30)).catch(() => '?')); await h.click({ timeout: 1500, force: rng() < 0.2 }).catch(() => {}); }
  },
  async jamKeys() { current = 'jam keys'; for (let i = 0; i < 12; i++) await page.keyboard.press(pick(KEYS)).catch(() => {}); },
  async typeNasty() {
    current = 'type nasty text';
    const inputs = page.locator('input[type="text"], input:not([type]), textarea, input[type="search"]');
    const n = await inputs.count().catch(() => 0);
    if (n) { const i = inputs.nth(Math.floor(rng() * n)); await i.fill(pick(NASTY), { timeout: 1500 }).catch(() => {}); await page.keyboard.press('Enter').catch(() => {}); }
  },
  async resize() { current = 'resize'; const [w, h] = pick(VIEWPORTS); await page.setViewportSize({ width: w, height: h }); },
  async offline() { current = 'offline/online'; await context.setOffline(true); await page.waitForTimeout(300); await actions.clickRandom(); await context.setOffline(false); },
  async hideApp() {
    current = 'hide and show app';
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  },
  async midnight() {
    current = 'jump the clock a day';
    await page.evaluate(() => { const off = (window.__chaosClock || 0) + 86400000; window.__chaosClock = off; const D = Date; const base = window.__RealDate || (window.__RealDate = D); window.Date = class extends base { constructor(...a) { if (a.length) super(...a); else super(base.now() + off); } static now() { return base.now() + off; } }; });
    await actions.show();
  },
  async show() { current = 'switch screen'; await page.evaluate((id) => { window.__ui && window.__ui.show(id); }, pick(SCREENS)); },
  async rapidShow() { current = 'rapid screen switching'; for (let i = 0; i < 10; i++) await page.evaluate((id) => window.__ui && window.__ui.show(id), pick(SCREENS)); },
  async back() { current = 'history back'; await page.goBack().catch(() => {}); if (!page.url().startsWith(URL)) { await open(); await page.waitForFunction(() => window.__ui, null, { timeout: 15000 }).catch(() => {}); } },
  async reload() { current = 'reload'; await page.reload().catch(() => {}); await page.waitForFunction(() => window.__ui, null, { timeout: 15000 }).catch(() => {}); },
  async startRun() { current = 'start a run'; await page.evaluate(() => window.__ui && window.__ui.show('screenHome')); await page.locator('.btn-play').click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(1500); await actions.jamKeys(); },
  async doubleTap() { current = 'double and triple tap'; const x = 50 + rng() * 250, y = 100 + rng() * 500; await page.mouse.dblclick(x, y).catch(() => {}); await page.mouse.click(x, y, { clickCount: 3 }).catch(() => {}); },
  async corruptSave() {
    current = 'corrupt the save then reload';
    await page.evaluate((junk) => { try { localStorage.setItem('buzzword_dash_v1', junk); } catch { /* full */ } }, pick(['{', 'null', '[]', '{"schemaVersion":2,"progression":{"coins":"NaN","xp":-3,"ownedItems":5}}', '\u0000']));
    await actions.reload();
  },
  async dragSwipe() { current = 'swipe'; const x = 60 + rng() * 250, y = 200 + rng() * 300; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + (rng() - 0.5) * 300, y + (rng() - 0.5) * 300, { steps: 4 }); await page.mouse.up(); }
};
const names = Object.keys(actions);
const weights = { clickRandom: 12, jamKeys: 4, typeNasty: 3, resize: 2, offline: 1, hideApp: 2, midnight: 1, show: 3, rapidShow: 2, back: 1, reload: 1, startRun: 2, doubleTap: 2, corruptSave: 0.4, dragSwipe: 2 };
const bag = names.flatMap((n) => Array(Math.max(1, Math.round((weights[n] ?? 1) * 2))).fill(n));

async function checkInvariants() {
  const state = await page.evaluate(() => {
    const screens = [...document.querySelectorAll('.screen.active')].map((s) => s.id);
    const g = window.__game;
    return {
      screens,
      running: !!(g && (g.running || g.paused)),
      problems: window.__dataProblems ? window.__dataProblems() : [],
      overflow: document.documentElement.scrollWidth > window.innerWidth + 4,
      bodyScreen: document.body.getAttribute('data-screen')
    };
  }).catch((e) => { report('page unreachable', e.message); return null; });
  if (!state) return;
  if (state.problems.length) report('saved data wrong', state.problems.slice(0, 3).join('; '));
  if (!state.screens.length && !state.running) report('nothing on screen', 'no active screen and no run');
  if (state.screens.length > 1) report('two screens at once', state.screens.join(', '));
}

console.log(`Chaos: ${MINUTES} min, seed ${SEED}, ${URL}`);
await open();
await page.waitForFunction(() => window.__ui, null, { timeout: 15000 });
const end = Date.now() + MINUTES * 60000;
while (Date.now() < end && problems.length < 25) {
  step++;
  const name = pick(bag);
  log.push(name);
  try { await actions[name](); } catch (e) { report('action threw', name + ': ' + e.message); }
  await page.waitForTimeout(150 + Math.floor(rng() * 250));
  await checkInvariants();
  // let the game get back to a menu now and then so every screen is reachable
  if (step % 40 === 0) { await page.keyboard.press('Escape').catch(() => {}); await page.evaluate(() => { try { if (window.__game && (window.__game.running || window.__game.paused)) window.__game.end && window.__game.end('quit'); } catch { /* ignore */ } }).catch(() => {}); }
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ seed: SEED, steps: step, problems, tail: log.slice(-30) }, null, 2));
console.log(`Steps: ${step}. Problems: ${problems.length}. Report: ${OUT}`);
process.exit(problems.length ? 1 : 0);
