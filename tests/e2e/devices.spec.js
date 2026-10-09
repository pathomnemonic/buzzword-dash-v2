// tests/e2e/devices.spec.js
// One game, every reasonable screen: small and large phones, a folded and an unfolded foldable, 7" to 13" tablets (iPad and
// Android) both ways up, and a Chromebook-sized window. On each, every main screen must fit sideways with every control on
// the screen, Home must sit clear of the tab bar, and (where the runner can draw) the question, the answers and the player
// must all be on the screen. Sizes are CSS pixels, the numbers the browser reports on those devices.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

const PHONES = [
  ['small phone (iPhone SE 1st gen)', 320, 568], ['iPhone SE', 375, 667], ['iPhone 15', 393, 852], ['iPhone Pro Max', 430, 932],
  ['Android phone', 360, 780], ['Pixel', 412, 915], ['foldable, folded', 344, 882]
];
const BIG = [
  ['foldable, unfolded', 884, 1104], ['foldable, wide', 841, 701], ['Android 7in tablet', 600, 960], ['iPad mini', 744, 1133],
  ['iPad', 810, 1080], ['iPad Air / 11in', 820, 1180], ['iPad Pro 11in', 834, 1194], ['iPad Pro 13in', 1024, 1366],
  ['Android 10in tablet', 800, 1280], ['small tablet, landscape', 960, 600], ['iPad, landscape', 1180, 820], ['iPad Pro 13in, landscape', 1366, 1024],
  ['tablet, landscape', 1280, 800], ['Chromebook', 1366, 768]
];
const ALL = PHONES.concat(BIG);
const TABS = ['screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings'];

async function open(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await openApp(page, '/?debug=1');
  await page.waitForTimeout(400);
}

/** Visible buttons, links and fields that stick out past the left or right edge of the window (outside a sideways scroller). */
async function offscreen(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
    const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').forEach((el) => {
      if (!visible(el) || el.closest('[hidden], .screen:not(.active)')) return;
      const r = el.getBoundingClientRect();
      if ((r.left < -1 || r.right > vw + 1) && !inScroller(el)) bad.push((el.id ? '#' + el.id : String(el.className).split(' ')[0] || el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 20) + '"');
    });
    if (document.documentElement.scrollWidth > vw + 1) bad.push('the page scrolls sideways');
    return bad;
  });
}

for (const [name, w, h] of ALL) {
  test.describe(`${name} (${w}x${h})`, () => {
    test('Home fits: every button on screen and clear of the tab bar', async ({ page }) => {
      await open(page, w, h);
      await page.evaluate(() => window.__ui.show('screenHome'));
      await page.waitForTimeout(500);
      const gaps = await page.evaluate(() => {
        const nav = document.getElementById('bottomNav').getBoundingClientRect();
        const sel = ['#filtersBtn', '.btn-play', '#speedBtn', '#homeFlashcardsBtn', '#homeChallengeBtn', '#multiplayerBtn', '#howToPlayBtn'];
        return { navInside: nav.left >= -1 && nav.right <= innerWidth + 1 && nav.bottom <= innerHeight + 1, gaps: sel.map((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return [s, 99]; return [s, Math.round(nav.top - e.getBoundingClientRect().bottom)]; }) };
      });
      expect(gaps.navInside, 'the tab bar must be inside the window').toBe(true);
      for (const [s, g] of gaps.gaps) expect(g, s + ' must end above the tab bar').toBeGreaterThanOrEqual(-1);
      expect(await offscreen(page)).toEqual([]);
    });

    test('every main screen fits sideways', async ({ page }) => {
      await open(page, w, h);
      for (const id of TABS) {
        await page.evaluate((s) => window.__ui.show(s), id);
        await page.waitForTimeout(350);
        expect(await offscreen(page), id).toEqual([]);
      }
    });
  });
}

// The runner itself, on the larger screens and the two smallest phones (it needs WebGL).
for (const [name, w, h] of [ALL[0], ALL[1], ...BIG.filter((d) => ['foldable, unfolded', 'foldable, wide', 'Android 7in tablet', 'iPad Air / 11in', 'iPad Pro 13in', 'small tablet, landscape', 'iPad, landscape', 'Chromebook'].includes(d[0]))]) {
  test(`a run on ${name} (${w}x${h}): question, answers and runner are all on the screen`, async ({ page }) => {
    test.slow();
    await open(page, w, h);
    test.skip(!(await hasWebGL(page)), 'the runner needs WebGL');
    await page.locator('.btn-play').click({ timeout: 30000 });
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 25000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.camera.updateMatrixWorld();
      const v = g.playerGroup.position.clone(); v.project(g.camera);
      const px = (v.x + 1) / 2 * innerWidth; const py = (1 - v.y) / 2 * innerHeight;
      const box = (id) => { const e = document.getElementById(id); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      return { vw: innerWidth, vh: innerHeight, px, py, buzz: box('buzzBox'), answers: box('answerRow'), hud: box('hud') };
    });
    for (const k of ['buzz', 'answers']) {
      expect(r[k], k + ' must exist').toBeTruthy();
      expect(r[k].l, k + ' left').toBeGreaterThanOrEqual(-1);
      expect(r[k].r, k + ' right').toBeLessThanOrEqual(r.vw + 1);
    }
    expect(r.answers.b, 'the answers must end above the runner').toBeLessThan(r.py);
    expect(r.px, 'the runner is on the screen').toBeGreaterThan(0);
    expect(r.px).toBeLessThan(r.vw);
    expect(r.py, 'the runner is on the screen').toBeLessThan(r.vh);
  });
}
