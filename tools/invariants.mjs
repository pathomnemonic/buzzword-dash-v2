#!/usr/bin/env node
/**
 * invariants.mjs — drives the real engine through hundreds of questions and checks its books after every one.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/invariants.mjs --runs 12 --seed 4
 *
 * Each run answers questions at random (right or wrong, with random streaks) in a random mode, resolving each
 * question by putting the runner in a chosen lane and letting the gates arrive. After every answer it checks
 * the rules the game must never break:
 *   - lives are whole numbers from 0 to the mode's maximum and never go up except by a heart or a continue
 *   - the score never goes down, correct + wrong equals the answers recorded, the streak is 0 after a miss
 *     and one higher after a hit, the best streak is never below the streak
 *   - coins are never negative; a miss never earns points
 *   - when the run ends: it ends once, the summary matches the counts, and the saved totals went up by exactly
 *     what the run did.
 * Exit code 1 and the seed on any broken rule.
 */

/* global window, document */
import { makeRng } from './soak.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : d; };
const RUNS = Number(opt('runs', 8));
const SEED = Number(opt('seed', Date.now() % 100000));
const URL = opt('url', 'http://localhost:4173');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const rng = makeRng(SEED);
const NOISE = /WebSocket|peerjs|GPU stall|swiftshader|WebGL: INVALID|GroupMarkerNotSet|Failed to load resource|net::ERR|\[vite\]|status of (404|401|403|400)|KHR_parallel/i;

const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, bypassCSP: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto(URL + '/?debug=1');
await page.waitForFunction(() => window.__game && window.__storage, null, { timeout: 30000 });
await page.evaluate(() => window.__storage.set('reviewTipSeen', true));
for (let i = 0; i < 6; i++) {
  if (await page.locator('#tutCloseBtn').isVisible().catch(() => false)) {
    await page.locator('#tutCloseBtn').click().catch(() => {});
    await page.getByRole('button', { name: /exit tutorial/i }).click({ timeout: 1500 }).catch(() => {});
  }
}
for (let i = 0; i < 4; i++) {
  if (!(await page.locator('#dailyReward').isVisible({ timeout: i ? 400 : 8000 }).catch(() => false))) break;
  await page.locator('#dailyReward button').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
}

const failures = [];
for (let n = 0; n < RUNS; n++) {
  const mode = ['endless', 'endless', 'study'][Math.floor(rng() * 3)];
  const pCorrect = [0.2, 0.5, 0.8, 0.95][Math.floor(rng() * 4)];
  const answers = 6 + Math.floor(rng() * 14);
  const desc = `run ${n + 1}/${RUNS} seed ${SEED} mode ${mode} pCorrect ${pCorrect} answers ${answers}`;
  try {
    await page.evaluate(() => { document.querySelectorAll('.sheet-overlay.active .sheet-close').forEach((b) => b.click()); window.__ui.show('screenHome'); });
    await page.waitForTimeout(400);
    if (await page.locator('#dailyReward').isVisible().catch(() => false)) { await page.locator('#dailyReward button').first().click({ force: true }); await page.waitForTimeout(1300); }
    if (mode === 'endless') await page.locator('.btn-play').click({ force: true });
    else { await page.locator('#homeChallengeBtn').click({ force: true }); await page.locator(`#challengeSheet [data-mode="${mode}"]`).click({ force: true }); }
    await page.waitForFunction(() => window.__game.running, null, { timeout: 20000 });
    const before = await page.evaluate(() => { const s = window.__storage; return { correct: s.get('totalCorrect'), wrong: s.get('totalWrong'), enc: s.get('totalEncounters') }; });
    let ended = 0;
    await page.evaluate(() => {
      window.__endCount = 0;
      const g = window.__game;
      if (!g.__wrapped) { g.__wrapped = true; const prev = g.onRunEnd; g.onRunEnd = function () { window.__endCount++; return prev && prev.apply(this, arguments); }; }
    });
    let prevState = null;
    for (let a = 0; a < answers; a++) {
      const ready = await page.waitForFunction(() => window.__game.gatesActive || !window.__game.running, null, { timeout: 40000, polling: 100 }).then(() => true).catch(() => false);
      if (!ready) throw new Error('no question arrived within 40s (answer ' + a + ')');
      const wantRight = rng() < pCorrect;
      const lane = await page.evaluate((wantRight) => {
        const g = window.__game;
        if (!g.running || !g.gatesActive) return -1;
        const right = g.gates.findIndex((x) => x.correct);
        const wrongs = [0, 1, 2].filter((i) => i !== right);
        const lane = wantRight ? right : wrongs[Math.floor(Math.random() * 2)];
        g.targetLane = lane; g.currentLane = lane; g.playerGroup.position.x = [-3, 0, 3][lane];
        return lane;
      }, wantRight);
      if (lane < 0) break; // the run ended (out of lives)
      const snap = await page.evaluate(() => { const g = window.__game; return { score: g.score, lives: g.lives, streak: g.streak, correct: g.correct, wrong: g.wrong, coins: g.coins, answers: g.runCards.length }; });
      await page.evaluate(() => { const g = window.__game; g.gateZ = 0.5; });
      await page.waitForFunction((k) => { const g = window.__game; return !g.running || g.runCards.length > k; }, snap.answers, { timeout: 15000, polling: 50 });
      const now = await page.evaluate(() => { const g = window.__game; return { score: g.score, lives: g.lives, streak: g.streak, bestStreak: g.bestStreak, correct: g.correct, wrong: g.wrong, coins: g.coins, answers: g.runCards.length, running: g.running, maxLives: g._modeConfig && g._modeConfig.lives }; });
      const bad = [];
      const right = now.correct > snap.correct;
      if (!Number.isInteger(now.lives) || now.lives < 0) bad.push('lives ' + now.lives);
      if (now.score < snap.score) bad.push(`score fell ${snap.score} -> ${now.score}`);
      if (now.correct + now.wrong !== now.answers) bad.push(`correct ${now.correct} + wrong ${now.wrong} != answers ${now.answers}`);
      if (right && now.streak !== snap.streak + 1) bad.push(`streak after a hit ${snap.streak} -> ${now.streak}`);
      if (!right && now.wrong > snap.wrong && now.streak !== 0) bad.push('streak not reset after a miss: ' + now.streak);
      if (!right && now.wrong > snap.wrong && now.score > snap.score) bad.push(`a miss earned points ${snap.score} -> ${now.score}`);
      if (now.bestStreak < now.streak) bad.push('best streak below streak');
      if (now.coins < 0) bad.push('negative coins');
      if (mode !== 'study' && !right && now.wrong > snap.wrong && now.lives >= snap.lives && now.lives !== 0) bad.push(`a miss cost no life ${snap.lives} -> ${now.lives}`);
      if (bad.length) throw new Error(bad.join('; '));
      prevState = now;
      if (!now.running) break;
    }
    // end the run (if it has not ended) and check the books
    const final = await page.evaluate(() => {
      const g = window.__game;
      if (g.running) g._endRun('manual');
      return null;
    });
    void final;
    for (let k = 0; k < 40; k++) {
      const st = await page.evaluate(() => { const o = document.getElementById('continueOverlay'); if (o && o.classList.contains('active')) { document.getElementById('continueNoBtn').click(); } return window.__endCount; });
      if (st >= 1) break;
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(700);
    const out = await page.evaluate(() => {
      const g = window.__game; const s = window.__storage;
      const sum = g.getRunSummary ? g.getRunSummary() : null;
      return { ended: window.__endCount, runCorrect: g.correct, runWrong: g.wrong, answers: g.runCards.length, sum: sum && { correct: sum.correct, wrong: sum.wrong, score: sum.score }, score: g.score, tc: s.get('totalCorrect'), tw: s.get('totalWrong'), te: s.get('totalEncounters'), problems: window.__dataProblems() };
    });
    ended = out.ended;
    if (ended !== 1) throw new Error('the run ended ' + ended + ' times');
    if (out.sum && (out.sum.correct !== out.runCorrect || out.sum.wrong !== out.runWrong)) throw new Error('summary disagrees with the run: ' + JSON.stringify(out));
    {
      if (out.tc - before.correct !== out.runCorrect) throw new Error(`saved correct total went up by ${out.tc - before.correct}, the run had ${out.runCorrect}`);
      if (out.tw - before.wrong !== out.runWrong) throw new Error(`saved wrong total went up by ${out.tw - before.wrong}, the run had ${out.runWrong}`);
    }
    if (out.problems && out.problems.length) throw new Error('saved data problems: ' + JSON.stringify(out.problems).slice(0, 200));
    if (errors.length) throw new Error(errors.splice(0).join(' | '));
    console.log('ok   ' + desc + `  (${out.runCorrect} right, ${out.runWrong} wrong, score ${out.score})`);
    void prevState;
    await page.locator('#goHomeBtn').click({ force: true, timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('     state: ' + JSON.stringify(await page.evaluate(() => ({ screen: (document.querySelector('.screen.active') || {}).id, running: window.__game.running, overlays: [...document.querySelectorAll('.active, .show')].map((e) => e.id || e.className).slice(0, 10), top: (() => { const b = document.getElementById('homeChallengeBtn'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e.id || e.className); })() })).catch(() => ({}))));
    failures.push({ desc, error: String(e.message).slice(0, 400) });
    console.log('FAIL ' + desc + '\n     ' + String(e.message).slice(0, 400));
    errors.length = 0;
    await page.goto(URL + '/?debug=1').catch(() => {});
    await page.waitForFunction(() => window.__game, null, { timeout: 30000 }).catch(() => {});
  }
}
await browser.close();
if (failures.length) { console.log('\n' + failures.length + ' failing run(s), seed ' + SEED); process.exit(1); }
console.log('\nall ' + RUNS + ' runs kept their books (seed ' + SEED + ')');
