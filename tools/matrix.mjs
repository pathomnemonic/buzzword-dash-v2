#!/usr/bin/env node
/**
 * matrix.mjs — plays runs across random combinations of everything the player can choose, with the game's
 * events forced on top, and checks the game stays sane.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/matrix.mjs --runs 40 --seed 3
 *
 * Each run picks a way to play (endless, study, weakness, daily is skipped once done), a map, a runner skin, a
 * trail, a monster, a hat/gear/clothing item, a speed, a quality level and a viewport, owns everything, and then
 * during the run: sends random keys, grabs every power-up (including a second Auto-Pilot), makes the monster
 * catch up, pauses and resumes, hides and shows the tab, resizes the window, and ends the run at a random time
 * (sometimes mid-answer). After each run it checks: no page error or console error, no NaN in the runner or the
 * camera, the lives and score still numbers, the saved data sane, and that the 3D geometry/texture counts have
 * not grown from the run before (a leak).
 *
 * Exit code 1 with the seed when something fails.
 */

/* global window, document */
import { makeRng } from './soak.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : d; };
const RUNS = Number(opt('runs', 30));
const SEED = Number(opt('seed', Date.now() % 100000));
const URL = opt('url', 'http://localhost:4173');
const CHROME = opt('chrome', process.env.CHROME_PATH || '/opt/pw-browsers/chromium');
const NOISE = /WebSocket connection|peerjs|GPU stall|swiftshader|WebGL: INVALID|GroupMarkerNotSet|Failed to load resource|net::ERR|\[vite\]|status of (404|401|403|400)|offline|KHR_parallel/i;
const VIEWPORTS = [[390, 780], [320, 480], [1280, 720], [800, 360], [412, 915]];
const MODES = ['endless', 'endless', 'endless', 'study', 'weakness', 'timed_practice'];
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD'];

const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const rng = makeRng(SEED);
const pick = (a) => a[Math.floor(rng() * a.length)];
const failures = [];
const log = (m) => console.log(m);

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, bypassCSP: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(URL + '/?debug=1');
  await page.waitForFunction(() => window.__game && window.__storage, null, { timeout: 30000 });
  // past the first-run tutorial
  await page.evaluate(() => { window.__storage.set('reviewTipSeen', true); });
  for (let i = 0; i < 6; i++) {
    if (await page.locator('#tutCloseBtn').isVisible().catch(() => false)) {
      await page.locator('#tutCloseBtn').click().catch(() => {});
      await page.getByRole('button', { name: /exit tutorial/i }).click({ timeout: 2000 }).catch(() => {});
    }
  }
  return { page, errors, context };
}

const { page, errors } = await newPage();

let baseline = null;
for (let n = 0; n < RUNS; n++) {
  const mode = pick(MODES);
  const vp = pick(VIEWPORTS);
  const speed = pick([1, 1, 2, 3]);
  const quality = pick(['low', 'medium', 'high']);
  const dashControl = pick(['double', 'button']);
  const desc = `run ${n + 1}/${RUNS} seed ${SEED} mode ${mode} ${vp.join('x')} speed ${speed} q ${quality} dash ${dashControl}`;
  try {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.evaluate(({ speed, quality, dashControl }) => {
      const s = window.__storage;
      s.set('speed', speed);
      s.set('quality', quality);
      s.set('dashControl', dashControl);
      s.set('coins', 50000);
      return true;
    }, { speed, quality, dashControl });
    // equip random owned/known ids: read every id the Locker would show by opening it
    await page.locator('#bottomNav [data-screen="screenShop"]').click().catch(() => {});
    await page.waitForTimeout(300);
    const tabs = await page.locator('#shopItems [role="tab"]').count();
    for (let t = 0; t < tabs; t++) {
      await page.locator('#shopItems [role="tab"]').nth(t).click().catch(() => {});
      const rows = page.locator('#shopItems .shop-item');
      const count = await rows.count();
      if (!count) continue;
      const row = rows.nth(Math.floor(rng() * count));
      const buy = row.locator('.btn-gold');
      if (await buy.count()) await buy.first().click({ timeout: 1500 }).catch(() => {});
      const eq = row.getByRole('button', { name: /^\s*Equip\s*$/ });
      if (await eq.count()) await eq.first().click({ timeout: 1500 }).catch(() => {});
      // the confirm of a purchase, if any
      await page.getByRole('button', { name: /^(buy|confirm|yes)/i }).first().click({ timeout: 300 }).catch(() => {});
    }
    await page.locator('#bottomNav [data-screen="screenHome"]').click().catch(() => {});
    await page.waitForTimeout(200);

    // start the run
    if (mode === 'endless') await page.locator('.btn-play').click();
    else {
      await page.locator('#homeChallengeBtn').click();
      await page.locator(`#challengeSheet [data-mode="${mode}"]`).click();
    }
    await page.waitForFunction(() => window.__game && (window.__game.running || window.__game.gatesActive), null, { timeout: 30000 });
    // dismiss a no-WebGL / not-enough-weakness alert if one stopped the run
    const alive = await page.evaluate(() => window.__game.running);
    if (!alive) { log('skip (did not start): ' + desc); await page.keyboard.press('Escape'); continue; }

    const frames = 12 + Math.floor(rng() * 30);
    for (let i = 0; i < frames; i++) {
      const r = rng();
      if (r < 0.5) await page.keyboard.press(pick(KEYS));
      else if (r < 0.62) await page.evaluate(() => { const g = window.__game; ['shield', 'magnet', 'double', 'autoPilot', 'autoPilot', 'scoreFrenzy'].forEach((t) => g._collectPowerup(t)); });
      else if (r < 0.7) await page.evaluate(() => { const g = window.__game; if (g._monsterSlip) g._monsterSlip(); });
      else if (r < 0.76) await page.locator('#autoBtn').dispatchEvent('pointerdown').catch(() => {});
      else if (r < 0.82) await page.locator('#dashBtn').dispatchEvent('pointerdown').catch(() => {});
      else if (r < 0.88) await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
      else if (r < 0.93) await page.keyboard.press('KeyP');
      else if (r < 0.97) await page.setViewportSize({ width: vp[1], height: vp[0] });
      else await page.evaluate(() => { const g = window.__game; g.lives = 1; });
      await page.waitForTimeout(80 + Math.floor(rng() * 300));
      const bad = await page.evaluate(() => {
        const g = window.__game;
        const nums = [g.playerGroup && g.playerGroup.position.x, g.playerGroup && g.playerGroup.position.y, g.camera && g.camera.position.x, g.camera && g.camera.position.y, g.camera && g.camera.position.z, g.score, g.lives, g.speed];
        return nums.some((v) => typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v)) ? JSON.stringify(nums) : '';
      });
      if (bad) throw new Error('NaN or non-number in the game state: ' + bad);
    }
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.evaluate(() => { const g = window.__game; if (g.paused) g.resume && g.resume(); g._endRun(Math.random() < 0.5 ? 'no_lives' : 'manual'); });
    await page.waitForTimeout(700);
    // a "continue?" or results screen: get home
    await page.locator('#goHomeBtn').click({ timeout: 2500 }).catch(async () => { await page.keyboard.press('Escape'); });
    await page.waitForTimeout(300);
    const problems = await page.evaluate(() => (window.__dataProblems ? window.__dataProblems() : []));
    if (problems && problems.length) throw new Error('saved data problems: ' + JSON.stringify(problems).slice(0, 300));
    const info = await page.evaluate(() => { const i = window.__game.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures }; });
    if (baseline === null && n >= 2) baseline = info;
    if (baseline && (info.geo > baseline.geo * 2 + 200 || info.tex > baseline.tex * 2 + 100)) throw new Error('3D memory keeps growing: ' + JSON.stringify(info) + ' vs ' + JSON.stringify(baseline));
    if (errors.length) throw new Error(errors.splice(0).join(' | '));
    log('ok   ' + desc + ' geo ' + info.geo + ' tex ' + info.tex);
  } catch (e) {
    failures.push({ desc, error: String(e && e.message || e).slice(0, 500) });
    log('FAIL ' + desc + '\n     ' + String(e && e.message || e).slice(0, 500));
    errors.length = 0;
    // recover: reload and carry on
    await page.goto(URL + '/?debug=1').catch(() => {});
    await page.waitForFunction(() => window.__game, null, { timeout: 30000 }).catch(() => {});
  }
}
await browser.close();
if (failures.length) { console.log('\n' + failures.length + ' failing run(s), seed ' + SEED); process.exit(1); }
console.log('\nall ' + RUNS + ' runs ok (seed ' + SEED + ')');
