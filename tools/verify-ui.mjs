/* global localStorage, window, document, innerWidth, innerHeight */
// tools/verify-ui.mjs — plays through the parts of the UI that have broken before and checks each one.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/verify-ui.mjs [http://localhost:4190]
//
// Prints PASS / FAIL per check and exits with 1 if anything failed.

import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:4190';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : '  -> ' + detail));
};

async function open(viewport, seed) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 700 });
  if (seed) await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 140)); });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(base + '/?debug=1');
  for (let i = 0; i < 10; i++) {
    const n = page.locator('#tutSkipBtn');
    if (!(await n.isVisible().catch(() => false))) break;
    await n.click();
  }
  const dr = page.locator('#dailyReward button');
  await dr.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 3 && (await dr.isVisible().catch(() => false)); i++) { await dr.click(); await page.waitForTimeout(1300); }
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

const inView = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
}, sel);

// ---------- Settings, the tutorial and How to Play ----------
{
  const { ctx, page, errors } = await open({ width: 420, height: 800 });
  await page.locator('#settingsBtn').click();
  const cards = await page.locator('.settings-card').count();
  check('Settings opens as a list of sections', cards === 6, 'found ' + cards);

  for (const sec of ['sound', 'look', 'study', 'rules', 'data', 'about']) {
    await page.locator('.settings-card[data-section="' + sec + '"]').click();
    const rows = await page.locator('#settingsContent .setting-row').count();
    const withNotes = await page.locator('#settingsContent .setting-row .setting-sublabel').count();
    check('Settings > ' + sec + ' has rows', rows > 0, 'rows ' + rows);
    if (['sound', 'look', 'study'].includes(sec)) check('Settings > ' + sec + ' explains every setting', withNotes >= rows, withNotes + ' notes for ' + rows + ' rows');
    await page.locator('#screenSettings .back-btn').click();
    check('Settings > ' + sec + ' goes back to the list', (await page.locator('.settings-card').count()) === 6);
  }

  // Tutorial from Settings: opens the interactive tutorial; Skip closes it
  await page.locator('.settings-card[data-section="about"]').click();
  await page.locator('#settingsTutorialBtn').click();
  check('Tutorial opens from Settings', await page.locator('#tutorialOverlay.active').count() === 1);
  await page.locator('#tutSkipBtn').click();
  check('Tutorial Skip button closes it', await page.locator('#tutorialOverlay.active').count() === 0);

  // Home: How to Play opens the same tutorial
  await page.locator('[data-screen="screenHome"]').click();
  await page.locator('#howToPlayBtn').click();
  check('How to Play opens the interactive tutorial', await page.locator('#tutorialOverlay.active').count() === 1);
  await page.locator('#tutSkipBtn').click();
  check('No script errors in Settings and the tutorial', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- Overlays fit on a short laptop screen ----------
{
  const { ctx, page } = await open({ width: 1366, height: 560 });
  await page.locator('#multiplayerBtn').click();
  await page.waitForTimeout(800);
  check('Versus: Close button is visible on a short screen', await inView(page, '#mpCloseBtn'));
  await page.locator('#mpCloseBtn').click();
  check('Versus: Close button closes it', await page.locator('#multiplayerOverlay.active').count() === 0);
  check('Home: PLAY is above the tab bar on a short screen', await page.evaluate(() => document.querySelector('.btn-play').getBoundingClientRect().bottom + 8 <= document.getElementById('bottomNav').getBoundingClientRect().top));
  await ctx.close();
}

// ---------- Pause and resume ----------
{
  const { ctx, page, errors } = await open({ width: 420, height: 800 });
  await page.locator('.btn-play').click();
  await page.waitForTimeout(6500);
  await page.locator('#pauseBtn').click();
  await page.waitForTimeout(300);
  check('Pause screen appears', await page.locator('#pauseOverlay.active').count() === 1 && (await page.evaluate('window.__game._state')) === 'paused');
  await page.locator('#resumeBtn').click();
  await page.waitForTimeout(400);
  check('Resume hides the pause screen and the run continues', await page.locator('#pauseOverlay.active').count() === 0 && (await page.evaluate('window.__game._state')) === 'playing');
  await page.locator('#pauseBtn').click();
  await page.waitForTimeout(200);
  await page.locator('#endRunBtn').click();
  await page.waitForTimeout(1800);
  check('End Run from the pause screen leaves the run', await page.locator('#pauseOverlay.active').count() === 0 && (await page.evaluate('window.__game._state')) !== 'playing');
  check('No script errors while pausing', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- 30 fps by default ----------
{
  const { ctx, page } = await open({ width: 420, height: 800 });
  await page.locator('.btn-play').click();
  await page.waitForTimeout(9000);
  const frames = await page.evaluate(async () => {
    const r = window.__game.renderer;
    const start = r.info.render.frame;
    await new Promise((res) => setTimeout(res, 3000));
    return (r.info.render.frame - start) / 3;
  });
  check('A run draws about 30 frames a second by default', frames > 20 && frames < 36, frames.toFixed(1) + ' fps');
  const fx = await page.evaluate(() => ({ degraded: window.__game._postfx ? !!window.__game._postfx.degraded : null, strikes: window.__storage.get('perfStrikes'), hint: window.__storage.get('perfHint') }));
  check('The 30 fps cap does not switch the glow off or lower the graphics tier', fx.degraded !== true && !fx.strikes && !fx.hint, JSON.stringify(fx));
  await ctx.close();
}

// ---------- Keyboard controls and resizing during a run ----------
{
  const { ctx, page, errors } = await open({ width: 1100, height: 700 });
  await page.locator('.btn-play').click();
  await page.waitForTimeout(8000);
  const lane0 = await page.evaluate(() => window.__game.targetLane);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  const laneL = await page.evaluate(() => window.__game.targetLane);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const laneR = await page.evaluate(() => window.__game.targetLane);
  check('Arrow keys change lanes', laneL === lane0 - 1 && laneR === Math.min(2, laneL + 2), lane0 + ' -> ' + laneL + ' -> ' + laneR);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  check('Up arrow jumps', await page.evaluate(() => window.__game.jumping));
  await page.waitForTimeout(900);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  check('Down arrow ducks', await page.evaluate(() => window.__game.sliding));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape pauses', (await page.evaluate('window.__game._state')) === 'paused' && await page.locator('#pauseOverlay.active').count() === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape again resumes', (await page.evaluate('window.__game._state')) === 'playing' && await page.locator('#pauseOverlay.active').count() === 0);
  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForTimeout(600);
  const sized = await page.evaluate(() => { const c = document.querySelector('#gameContainer canvas'); return { cssW: c.clientWidth, cssH: c.clientHeight, w: innerWidth, h: innerHeight }; });
  check('The 3D view follows the window size', Math.abs(sized.cssW - sized.w) <= 2 && Math.abs(sized.cssH - sized.h) <= 2, JSON.stringify(sized));
  check('No script errors with the keyboard and resizing', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- Swipes and double-tap on the game view ----------
{
  const { ctx, page, errors } = await open({ width: 420, height: 800 });
  await page.locator('.btn-play').click();
  await page.waitForTimeout(8000);
  const swipe = async (dx, dy) => {
    await page.mouse.move(210, 500);
    await page.mouse.down();
    await page.mouse.move(210 + dx / 2, 500 + dy / 2, { steps: 3 });
    await page.mouse.move(210 + dx, 500 + dy, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const before = await page.evaluate(() => window.__game.targetLane);
  await swipe(-120, 0);
  const afterLeft = await page.evaluate(() => window.__game.targetLane);
  await swipe(120, 0);
  const afterRight = await page.evaluate(() => window.__game.targetLane);
  check('Swiping moves between lanes', afterLeft === Math.max(0, before - 1) && afterRight === Math.min(2, afterLeft + 1), before + ' -> ' + afterLeft + ' -> ' + afterRight);
  await swipe(0, -120);
  check('Swiping up jumps', await page.evaluate(() => window.__game.jumping));
  await page.waitForTimeout(1000);
  await swipe(0, 120);
  check('Swiping down ducks', await page.evaluate(() => window.__game.sliding));
  check('No script errors with swipes', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- Study plan: runner or flashcards ----------
{
  // three cards that are due for review
  const seed = () => {
    window.__seedDone = true;
  };
  const { ctx, page, errors } = await open({ width: 420, height: 900 }, seed);
  await page.evaluate(() => {
    const k = 'buzzword_dash_v1';
    const d = JSON.parse(localStorage.getItem(k));
    d.cards.cardStats = d.cards.cardStats || {};
    ['n001', 'n002', 'n003', 'n004'].forEach((id) => { d.cards.cardStats[id] = { seen: 3, correct: 1, wrong: 2, due: Date.now() - 86400000, last: Date.now() - 2 * 86400000 }; });
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  for (let i = 0; i < 10; i++) { const n = page.locator('#tutSkipBtn'); if (!(await n.isVisible().catch(() => false))) break; await n.click(); }
  await page.waitForTimeout(1500);
  await page.locator('[data-screen="screenStats"]').click();
  await page.waitForTimeout(600);
  const runBtns = await page.locator('.plan-step-buttons .btn-green').count();
  const flashBtns = await page.locator('.plan-step-buttons .btn-outline').count();
  check('Study plan offers both the runner and flashcards for each step', runBtns >= 1 && runBtns === flashBtns, runBtns + ' run / ' + flashBtns + ' flashcards');
  await page.locator('.plan-step-buttons .btn-green').first().click();
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => ({ mode: window.__game.mode, state: window.__game._state, plan: (window.__game._modeConfig || {}).planCardIds }));
  check('"Run it" starts a runner session with the planned cards', info.mode === 'study' && Array.isArray(info.plan) && info.plan.length >= 1, JSON.stringify(info));
  const firstIsPlanned = await page.evaluate(() => { const g = window.__game; return !!(g.card && (g._modeConfig.planCardIds || []).indexOf(g.card.id) >= 0); });
  check('The first question comes from the plan', firstIsPlanned);
  check('No script errors in the study plan', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nAll checks passed');
process.exit(failed ? 1 : 0);
