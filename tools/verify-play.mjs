/* global localStorage, window, document */
// tools/verify-play.mjs — plays every single-player mode with a simple bot and watches for trouble.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/verify-play.mjs [http://localhost:4190] [seconds per mode]
//
// The bot steers into the right lane most of the time (and the wrong one now and then), jumps and
// slides at random, accepts or declines the continue prompt, and clicks through the results screen.
// It reports script errors, runs that get stuck, and screens that fail to appear.

import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:4190';
const seconds = Number(process.argv[3] || 40);
const wrongRate = Number(process.argv[4] || 0.15);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let problems = 0;
const report = (msg) => { problems++; console.log('  PROBLEM  ' + msg); };

async function newPage(seedCoins) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((coins) => {
    try {
      const k = 'buzzword_dash_v1';
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if (d) {
        d.progression.coins = coins;
        // some missed cards so Weakness mode has something to practice
        d.cards = d.cards || {};
        d.cards.cardStats = d.cards.cardStats || {};
        for (let i = 1; i <= 12; i++) d.cards.cardStats['n' + String(i).padStart(3, '0')] = { seen: 4, correct: 1, wrong: 3, due: Date.now() - 1000, last: Date.now() - 100000 };
        localStorage.setItem(k, JSON.stringify(d));
      }
    } catch { /* ignore */ }
  }, seedCoins);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text().slice(0, 160)); });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(base + '/?debug=1');
  for (let i = 0; i < 10; i++) {
    const n = page.locator('#obNextBtn');
    if (!(await n.isVisible().catch(() => false))) break;
    await n.click();
  }
  const dr = page.locator('#dailyReward button');
  await dr.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 3 && (await dr.isVisible().catch(() => false)); i++) { await dr.click(); await page.waitForTimeout(1300); }
  await page.reload();
  for (let i = 0; i < 10; i++) {
    const n = page.locator('#obNextBtn');
    if (!(await n.isVisible().catch(() => false))) break;
    await n.click();
  }
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}

/** Runs inside the page: steer, jump and slide for a while; returns what happened. */
const botScript = async ({ ms, wrongRate }) => {
  const g = window.__game;
  const stats = { gates: 0, continues: 0, maxScore: 0, states: {} };
  const end = performance.now() + ms;
  let lastScore = -1, lastChange = performance.now(), stuck = false;
  while (performance.now() < end) {
    const st = g._state;
    stats.states[st] = (stats.states[st] || 0) + 1;
    if (st === 'playing') {
      if (g.gatesActive && g.gates && g.gates.length === 3) {
        let lane = g.gates.findIndex((x) => x.correct);
        if (lane < 0) lane = 1;
        if (Math.random() < wrongRate) lane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
        g.targetLane = lane;
        stats.gates++;
      }
      const r = Math.random();
      if (r < 0.03) g.jump();
      else if (r < 0.06) g.slide();
      const progress = g.encountersDone + g.coins;
      if (progress !== lastScore) { lastScore = progress; lastChange = performance.now(); }
      stats.maxScore = Math.max(stats.maxScore, g.score);
      if (performance.now() - lastChange > 25000) { stuck = true; break; }
    } else if (st === 'continue_prompt') {
      const yes = document.getElementById('continueYesBtn');
      const no = document.getElementById('continueNoBtn');
      if (stats.continues < 1 && yes) { stats.continues++; yes.click(); } else if (no) no.click();
    } else if (st === 'ended') {
      break;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return { ...stats, stuck, finalState: g._state };
};

const MODES = [
  ['endless', async (p) => { await p.locator('.btn-play').click(); }],
  ['study', async (p) => { await p.locator('.mode-btn[data-mode="study"]').click(); }],
  ['weakness', async (p) => { await p.locator('.mode-btn[data-mode="weakness"]').click(); }],
  ['daily', async (p) => { await p.locator('.mode-btn[data-mode="daily"]').click(); }]
];

for (const [name, start] of MODES) {
  console.log('\n== ' + name);
  const { ctx, page, errors } = await newPage(5000);
  try {
    await start(page);
    await page.waitForTimeout(7000);
    const state = await page.evaluate(() => window.__game._state);
    if (state !== 'playing') {
      report(name + ': the run did not start (state ' + state + ')');
    } else {
      const res = await page.evaluate(botScript, { ms: seconds * 1000, wrongRate });
      console.log('  played: ' + JSON.stringify({ gates: res.gates, maxScore: res.maxScore, continues: res.continues, final: res.finalState }));
      if (res.stuck) report(name + ': the run got stuck (score did not change for 25 s)');
      // end the run if the bot did not die, and look at the results screen
      if (res.finalState === 'playing') {
        await page.locator('#pauseBtn').click();
        await page.locator('#endRunBtn').click();
      }
      await page.waitForTimeout(3500);
      const postRun = await page.locator('#screenPostRun.active').count();
      if (!postRun) report(name + ': the results screen did not appear');
      else {
        const hasAgain = await page.locator('#playAgainBtn').count();
        const hasHome = await page.locator('#goHomeBtn').count();
        if (!hasAgain || !hasHome) report(name + ': results screen is missing a button (again ' + hasAgain + ', home ' + hasHome + ')');
        await page.locator('#goHomeBtn').click();
        await page.waitForTimeout(800);
        const homeShown = await page.locator('#screenHome.active').count();
        if (!homeShown) report(name + ': Home did not open from the results screen');
        const navLit = await page.locator('.nav-item[aria-current="true"]').count();
        if (navLit !== 1) report(name + ': ' + navLit + ' tabs are highlighted on Home');
        // and play again from Home to make sure a second run works
        await start(page);
        await page.waitForTimeout(5000);
        const again = await page.evaluate(() => window.__game._state);
        if (again !== 'playing') report(name + ': a second run did not start (state ' + again + ')');
      }
    }
  } catch (e) {
    report(name + ': ' + e.message.split('\n')[0]);
  }
  const bad = errors.filter((e) => !/Dropped|auto-fix/.test(e));
  if (bad.length) report(name + ': script errors: ' + bad.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(problems ? '\n' + problems + ' problem(s) found' : '\nNo problems found');
process.exit(problems ? 1 : 0);
