#!/usr/bin/env node
/**
 * beta.mjs — an army of beta testers for the application itself (not the runner): every screen and pop-up, at
 * many screen sizes and orientations, checked for the things real people hit.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/beta.mjs [--out beta-report.json]
 *
 * For every screen and sheet at every viewport it reports:
 *   covered     a button, link or field whose centre is hidden under something else (cannot be tapped)
 *   offscreen   something that runs off the left or right edge
 *   hscroll     the page scrolls sideways
 *   unlabeled   a control with no text, label or title (invisible to a screen reader)
 *   tiny        a tap target under 44 px (a suggestion, not a failure)
 *   clipped     text cut off by its own box
 * Failures (covered, offscreen, hscroll, unlabeled) exit 1; suggestions are listed.
 */

/* global window, document, getComputedStyle */
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : d; };
const URL = opt('url', 'http://localhost:4173');
const OUT = opt('out', 'beta-report.json');
const CHROME = opt('chrome', process.env.CHROME_PATH || '/opt/pw-browsers/chromium');
const VIEWPORTS = [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [1280, 800], [800, 360], [667, 375], [844, 390], [195, 390], [250, 440]];
const SCREENS = ['screenHome', 'screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings', 'screenMyCards', 'screenCardBrowser', 'screenFlashcard', 'screenExam', 'screenLeaderboard'];
const SHEETS = ['challengeSheet', 'flashcardsSheet', 'filtersSheet', 'speedSheet', 'todaySheet'];

const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true });
const page = await context.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto(URL + '/?debug=1');
await page.waitForFunction(() => window.__ui && window.__storage, null, { timeout: 30000 });
await page.evaluate(() => { window.__storage.set('reviewTipSeen', true); });
for (let i = 0; i < 6; i++) {
  if (await page.locator('#tutCloseBtn').isVisible().catch(() => false)) {
    await page.locator('#tutCloseBtn').click().catch(() => {});
    await page.getByRole('button', { name: /exit tutorial/i }).click({ timeout: 2000 }).catch(() => {});
  }
}
for (let i = 0; i < 4; i++) {
  if (!(await page.locator('#dailyReward').isVisible({ timeout: i ? 500 : 8000 }).catch(() => false))) break;
  await page.locator('#dailyReward button').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
}

const audit = () => page.evaluate(() => {
  const vw = window.innerWidth;
  const out = [];
  const label = (el) => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const inActive = (el) => { const sc = el.closest('.screen, .sheet-overlay, .tutorial-overlay'); return !sc || sc.classList.contains('active'); };
  const modal = document.querySelector('.sheet-overlay.active, #multiplayerOverlay.active, #quickReviewOverlay.active');
  const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button]')].filter((e) => visible(e) && inActive(e) && !e.closest('[hidden], [aria-hidden=true]') && !e.disabled && (!modal || modal.contains(e)) && !(e.closest('details') && !e.closest('details').open && e.tagName !== 'SUMMARY') && !e.closest('[data-collapsed], .collapsed'));
  controls.forEach((el) => {
    const r = el.getBoundingClientRect();
    const cx = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
    const cy = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
    // only judge controls that are inside the visible window (scrolled-off ones are reached by scrolling)
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    // the game HUD sits under the screens while nothing is running
    if (el.closest('#hud') && el.closest('#hud').classList.contains('off')) return;
    // inside a scrolling area, only what is in view there counts (the rest is reached by scrolling)
    let sc = el.parentElement;
    while (sc && sc !== document.body) { const o = getComputedStyle(sc).overflowY; if ((o === 'auto' || o === 'scroll') && sc.scrollHeight > sc.clientHeight + 1) break; sc = sc.parentElement; }
    if (sc && sc !== document.body) {
      const cr = sc.getBoundingClientRect();
      const nav = document.getElementById('bottomNav');
      const navTop = nav && nav.getBoundingClientRect().top < cr.bottom ? nav.getBoundingClientRect().top : cr.bottom;
      if (cy < cr.top || cy > Math.min(cr.bottom, navTop)) return;
    }
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) out.push({ kind: 'covered', el: label(el), by: label(top) });
    if (r.left < -1 || r.right > vw + 1) out.push({ kind: 'offscreen', el: label(el), at: Math.round(r.left) + '..' + Math.round(r.right) });
    const named = (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || (el.labels && el.labels.length) || el.getAttribute('placeholder') || el.getAttribute('aria-labelledby');
    if (!named) out.push({ kind: 'unlabeled', el: label(el) });
    if ((r.width < 44 || r.height < 44) && el.tagName !== 'INPUT' && !(el.type === 'checkbox' || el.type === 'radio')) out.push({ kind: 'tiny', el: label(el), size: Math.round(r.width) + 'x' + Math.round(r.height) });
  });
  const hs = document.documentElement.scrollWidth - vw;
  if (hs > 1) out.push({ kind: 'hscroll', el: 'page', by: hs });
  const active = document.querySelector('.screen.active');
  if (active) {
    [...active.querySelectorAll('h1, h2, h3, button, .btn, .stat-pill, .setup-btn')].filter(visible).forEach((el) => {
      const s = getComputedStyle(el);
      if (s.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis') out.push({ kind: 'clipped', el: label(el) });
    });
  }
  return out;
});

const findings = new Map();
function note(where, items) {
  items.forEach((it) => {
    const key = it.kind + '|' + it.el + '|' + (it.by || '');
    const rec = findings.get(key) || { ...it, where: [] };
    if (!rec.where.includes(where)) rec.where.push(where);
    findings.set(key, rec);
  });
}

for (const [w, h] of VIEWPORTS) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  for (const id of SCREENS) {
    await page.evaluate((sid) => { try { window.__ui.show(sid); } catch { /* not a showable screen here */ } }, id);
    await page.waitForTimeout(250);
    const exists = await page.evaluate((sid) => { const e = document.getElementById(sid); return !!e && e.classList.contains('active'); }, id);
    if (!exists) continue;
    note(`${id} @${w}x${h}`, await audit());
  }
  await page.evaluate(() => window.__ui.show('screenHome'));
  for (const sh of SHEETS) {
    await page.evaluate((sid) => { window.__ui.openSheet(sid); }, sh);
    await page.waitForTimeout(250);
    note(`${sh} @${w}x${h}`, await audit());
    await page.evaluate(() => window.__ui.closeSheets());
  }
}

const FAIL = ['covered', 'offscreen', 'hscroll', 'unlabeled'];
const list = [...findings.values()];
const byKind = (k) => list.filter((f) => f.kind === k);
for (const kind of [...FAIL, 'clipped', 'tiny']) {
  const rows = byKind(kind);
  if (!rows.length) continue;
  console.log(`\n== ${kind} (${rows.length}) ==`);
  rows.slice(0, 40).forEach((f) => console.log(`  ${f.el}${f.by ? ' <- ' + f.by : ''}${f.size ? ' ' + f.size : ''}  [${f.where.slice(0, 4).join(', ')}${f.where.length > 4 ? ' +' + (f.where.length - 4) : ''}]`));
}
writeFileSync(OUT, JSON.stringify(list, null, 1));
await browser.close();
const failing = list.filter((f) => FAIL.includes(f.kind));
console.log(`\n${failing.length} failing finding(s), ${list.length - failing.length} suggestion(s)`);
process.exit(failing.length ? 1 : 0);
