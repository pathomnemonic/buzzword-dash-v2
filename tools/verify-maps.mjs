/* global localStorage, window, document, innerWidth, innerHeight */
// tools/verify-maps.mjs — starts a run on every map (glow off and on) and watches for errors, then checks overlays and the study picker on a short laptop screen.
//   node tools/verify-maps.mjs [http://localhost:4190]
import { chromium } from '@playwright/test';
const base = process.argv[2] || 'http://localhost:4190';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let problems = 0;
const bad = (m) => { problems++; console.log('  PROBLEM  ' + m); };
async function open(viewport, settings) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  await ctx.addInitScript((s) => { try { const k = 'buzzword_dash_v1'; const d = JSON.parse(localStorage.getItem(k) || 'null'); if (d) { Object.assign(d.settings, s); localStorage.setItem(k, JSON.stringify(d)); } } catch { /* ignore */ } }, settings || {});
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) page.errs.push(m.text().slice(0, 160)); });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(base + '/?debug=1');
  for (let i = 0; i < 10; i++) { const n = page.locator('#obNextBtn'); if (!(await n.isVisible().catch(() => false))) break; await n.click(); }
  const dr = page.locator('#dailyReward button');
  await dr.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 3 && (await dr.isVisible().catch(() => false)); i++) { await dr.click(); await page.waitForTimeout(1300); }
  await page.reload();
  for (let i = 0; i < 10; i++) { const n = page.locator('#obNextBtn'); if (!(await n.isVisible().catch(() => false))) break; await n.click(); }
  await page.waitForTimeout(1000);
  return { ctx, page };
}
const maps = ['Neural Highway', 'Vascular Rush', 'Skeletal Corridor', 'Cellular Matrix', 'Neon ER', 'Hospital Hallway', 'DNA Helix Tunnel', 'Prescription Sunset', 'Cardiac Pulse', 'Surgical Theater', 'Candy Lab', 'X-Ray Vision', 'Defibrillator Shock'];
console.log('\n== every map');
for (const map of maps) {
  for (const glow of [false, true]) {
    const { ctx, page } = await open({ width: 420, height: 800 }, { preferredMap: map, quality: 'high', glowEffects: glow });
    await page.locator('.btn-play').click();
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => ({ st: window.__game._state, skin: window.__game.currentSkin && window.__game.currentSkin.name, draw: window.__game.renderer.info.render.calls }));
    if (r.st !== 'playing') bad(map + ' (glow ' + glow + '): state ' + r.st);
    if (r.skin !== map) bad(map + ': got map ' + r.skin);
    const e = page.errs.filter((x) => !/Dropped|auto-fix/.test(x));
    if (e.length) bad(map + ': errors ' + e.slice(0, 2).join(' | '));
    console.log('  ' + map + (glow ? ' +glow' : '') + ': ' + r.st + ', ' + r.draw + ' draw calls');
    await ctx.close();
  }
}
console.log('\n== short laptop screen (1366x560)');
{
  const { ctx, page } = await open({ width: 1366, height: 560 }, {});
  const fits = async (sel, label) => {
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: innerWidth, h: innerHeight, cx: (b.left + b.right) / 2 };
    }, sel);
    if (!r) { bad(label + ': not found'); return; }
    if (r.l < -1 || r.r > r.w + 1) bad(label + ': sticks out sideways ' + JSON.stringify(r));
    if (Math.abs(r.cx - r.w / 2) > 60) bad(label + ': not centered (center ' + Math.round(r.cx) + ' of ' + r.w + ')');
  };
  await page.locator('#flashcardBtn').click();
  await page.waitForTimeout(500);
  await fits('.study-picker', 'study picker');
  const go = page.getByRole('button', { name: /Flip cards/ });
  await go.scrollIntoViewIfNeeded();
  if (!(await go.isVisible())) bad('Flip cards button not reachable'); 
  await page.locator('[data-screen="screenHome"]').click().catch(() => {});
  await page.locator('.btn-play').click();
  await page.waitForTimeout(6500);
  await page.locator('#pauseBtn').click();
  await page.waitForTimeout(500);
  await fits('#pauseOverlay > :first-child', 'pause box');
  await page.getByRole('button', { name: /Resume/ }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game._triggerDeath('ground'));
  await page.waitForTimeout(3500);
  await fits('.continue-box', 'continue box');
  const cb = await page.evaluate(() => { const b = document.getElementById('continueNoBtn'); if (!b) return null; const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; });
  if (cb === false) bad('continue "No" button is off screen');
  const e = page.errs.filter((x) => !/Dropped|auto-fix/.test(x));
  if (e.length) bad('laptop: errors ' + e.slice(0, 2).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(problems ? '\n' + problems + ' problem(s) found' : '\nNo problems found');
process.exit(problems ? 1 : 0);
