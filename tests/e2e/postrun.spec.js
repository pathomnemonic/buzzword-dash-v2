// tests/e2e/postrun.spec.js
// The results ("Case Review") page is laid out symmetrically at every phone size: nothing hangs off one side,
// rows of tiles and buttons fill the width evenly, and the page never scrolls sideways.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

const SIZES = [
  { name: 'narrow phone', width: 320, height: 568 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'tall phone', width: 412, height: 915 }
];

async function finishRun(page, { wrong }) {
  await page.locator('.btn-play').click();
  await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
  await page.evaluate((w) => {
    const g = window.__game;
    g.wrong = w; g.correct = 3; g.score = 1230; g.lives = w ? 0 : 3;
    g._endRun(w ? 'no_lives' : 'manual');
  }, wrong);
  await expect(page.locator('#screenPostRun')).toHaveClass(/active/, { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: vw - r.right, width: r.width }; };
    const root = document.getElementById('postRunContent');
    const rows = (sel) => [...root.querySelectorAll(sel)].map(box);
    const group = (sel) => {
      const items = rows(sel);
      return items.length ? { first: items[0], last: items[items.length - 1], widths: items.map((i) => i.width) } : null;
    };
    const blocks = [...root.children].filter((el) => el.getBoundingClientRect().width > 0).map((el) => ({ cls: el.className || el.tagName, ...box(el) }));
    const buttonRows = [...root.querySelectorAll('#playAgainBtn, #goHomeBtn')].map(box);
    const secondary = [...root.querySelectorAll('button.btn-block')].filter((b) => b.parentElement && b.parentElement.classList.contains('post-secondary')).map(box);
    const everything = [...root.querySelectorAll('*')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
    return {
      vw,
      hscroll: document.documentElement.scrollWidth - vw,
      outOfView: everything.filter((r) => r.left < -1 || r.right > vw + 1).length,
      blocks,
      stats: group('.post-stat'),
      actions: { items: buttonRows },
      secondary
    };
  });
}

test.describe('Results page symmetry', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'runner needs WebGL (verified in Chromium)');

  for (const size of SIZES) {
    for (const variant of [{ name: 'a lost run', wrong: 4 }, { name: 'a clean run', wrong: 0 }]) {
      test(`${variant.name} on a ${size.name} is centered and even`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await openApp(page, '/?debug=1');
        test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
        await finishRun(page, variant);
        const m = await measure(page);

        expect(m.hscroll, 'no sideways scrolling').toBeLessThanOrEqual(0);
        expect(m.outOfView, 'nothing runs off either edge').toBe(0);

        // every block is centered: equal space on the left and right
        m.blocks.forEach((b) => expect(Math.abs(b.left - b.right), `block ${b.cls}`).toBeLessThanOrEqual(2));

        // the stat tiles: equal widths, and the row mirrors left to right
        expect(m.stats.widths.length).toBe(5);
        const w = m.stats.widths;
        expect(Math.max(...w) - Math.min(...w), 'stat tiles are the same width').toBeLessThanOrEqual(1.5);
        expect(Math.abs(m.stats.first.left - m.stats.last.right), 'stat row mirrors').toBeLessThanOrEqual(2);

        // Again / Home share the row evenly and mirror each other
        const [again, home] = m.actions.items;
        expect(Math.abs(again.width - home.width)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(again.left - home.right)).toBeLessThanOrEqual(2);

        // the secondary buttons: an odd one out spans the row instead of hugging one side
        if (m.secondary.length % 2 === 1) {
          const last = m.secondary[m.secondary.length - 1];
          expect(Math.abs(last.left - last.right), 'lone button is centered').toBeLessThanOrEqual(2);
        }
        m.secondary.forEach((b) => expect(b.left).toBeGreaterThanOrEqual(0));
      });

      test(`${variant.name} on a ${size.name}: the pop-ups are centered and do not overlap`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await openApp(page, '/?debug=1');
        test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
        await page.locator('.btn-play').click();
        await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
        // a new best and an achievement at once is the busiest the screen gets
        await page.evaluate((w) => {
          const g = window.__game;
          g.wrong = w; g.correct = 3; g.score = 1230; g.lives = w ? 0 : 3;
          g._endRun(w ? 'no_lives' : 'manual');
        }, variant.wrong);
        await expect(page.locator('#screenPostRun')).toHaveClass(/active/, { timeout: 10000 });
        await page.evaluate(() => { window.__ui && window.__ui.showAchievementNotification(['ach_first_run']); });
        const rects = await page.evaluate(() => {
          const vw = innerWidth;
          const pick = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: vw - r.right, top: r.top, bottom: r.bottom }; };
          return [...document.querySelectorAll('.new-best-banner')].map(pick).concat(
            [...document.body.children].filter((el) => el.style && el.style.position === 'fixed' && el.textContent.includes('Achievement Unlocked')).map(pick));
        });
        rects.forEach((r) => expect(Math.abs(r.left - r.right), 'pop-up is centered').toBeLessThanOrEqual(2));
        if (rects.length === 2) {
          const [a, b] = rects;
          const overlap = a.top < b.bottom && b.top < a.bottom;
          expect(overlap, 'the new-best banner and the achievement popup do not overlap').toBe(false);
        }
      });
    }
  }
});
