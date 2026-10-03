// tests/e2e/tutorialfuzz.spec.js
// Try to break the tutorial: tap and swipe everywhere, jam keys (Tab, Enter, Space...), resize, press Escape, and
// check that nothing outside it changed (no settings, no coins, no run started behind it) and that it can always
// be left, leaving Home on screen.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KEYS = ['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyP', 'Backspace'];

for (const seed of [1, 2, 3]) {
  test(`random taps, keys and swipes cannot break the tutorial (seed ${seed})`, async ({ page }) => {
    test.setTimeout(170000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await openApp(page, '/?debug=1');
    await page.waitForFunction(() => window.__ui && window.__storage);
    const before = await page.evaluate(() => JSON.stringify({ s: window.__storage.data.settings, p: window.__storage.data.progression }));
    const r = rng(seed);
    const vp = page.viewportSize();

    await page.evaluate(() => window.__ui.showTutorial());
    await page.waitForTimeout(1200);
    for (let i = 0; i < 70; i++) {
      const roll = r();
      if (roll < 0.5) await page.mouse.click(r() * vp.width, r() * vp.height).catch(() => {});
      else if (roll < 0.8) await page.keyboard.press(KEYS[Math.floor(r() * KEYS.length)]).catch(() => {});
      else if (roll < 0.9) { const x = r() * vp.width, y = r() * vp.height; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + (r() - 0.5) * 260, y + (r() - 0.5) * 260, { steps: 3 }); await page.mouse.up(); }
      else await page.mouse.dblclick(r() * vp.width, r() * vp.height).catch(() => {});
      await page.waitForTimeout(120);
      // Escape asks "are you sure?": the random clicks may answer yes, which is a legitimate way out
      if (!(await page.evaluate(() => !!(document.querySelector('#tutorialOverlay.active, #tourOverlay, .tutorial-coach.active') || (window.__game && window.__game._tutorial))))) break;
    }

    // Whatever state it is in, it can be left
    for (let i = 0; i < 12; i++) {
      const open = await page.evaluate(() => !!(document.querySelector('#tutorialOverlay.active, #tourOverlay, .tutorial-coach.active') || (window.__game && window.__game._tutorial)));
      if (!open) break;
      if (await page.locator('#tourCloseBtn').isVisible().catch(() => false)) await page.locator('#tourCloseBtn').click().catch(() => {});
      else if (await page.locator('#tutCloseBtn').isVisible().catch(() => false)) await page.locator('#tutCloseBtn').click().catch(() => {});
      else await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
      if (await page.locator('#tutExitYes').isVisible().catch(() => false)) await page.locator('#tutExitYes').click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(800);
    const end = await page.evaluate(() => ({
      open: !!(document.querySelector('#tutorialOverlay.active, #tourOverlay, .tutorial-coach.active') || (window.__game && window.__game._tutorial)),
      running: !!(window.__game && (window.__game.running || window.__game.paused)),
      screens: [...document.querySelectorAll('.screen.active')].map((s) => s.id),
      after: JSON.stringify({ s: window.__storage.data.settings, p: window.__storage.data.progression }),
      problems: window.__dataProblems(),
      diag: window.__game ? { state: window.__game._state, mode: window.__game.mode, tutorial: !!window.__game._tutorial, hud: document.getElementById('hud') && document.getElementById('hud').className } : null
    }));
    expect(end.open, 'the tutorial can always be closed').toBe(false);
    expect(end.running, 'no run is left going behind it: ' + JSON.stringify(end.diag)).toBe(false);
    expect(end.screens.length, 'a screen is showing: ' + end.screens.join()).toBe(1);
    expect(end.problems).toEqual([]);
    // nothing changed except the one item the tour teaches with
    const a = JSON.parse(before); const b = JSON.parse(end.after);
    const allowed = new Set(['ownedItems', 'coins', 'equipped', 'lockerSeen', 'tutorialSeen', 'firstTutorialDone', 'lastLoginDate', 'loginStreak', 'xp']);
    const changed = Object.keys(b.p).filter((k) => JSON.stringify(a.p[k]) !== JSON.stringify(b.p[k]) && !allowed.has(k));
    expect(changed, 'progress fields changed by the tutorial').toEqual([]);
    expect(Object.keys(b.s).filter((k) => JSON.stringify(a.s[k]) !== JSON.stringify(b.s[k]) && !/Seen|tutorial|Prompt|perfStrikes|quality/i.test(k)), 'settings changed by the tutorial').toEqual([]);
    if (b.p.coins !== a.p.coins) expect(b.p.coins).toBe(a.p.coins - 2000);
    expect(errors).toEqual([]);
  });
}
