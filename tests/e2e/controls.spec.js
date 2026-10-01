// tests/e2e/controls.spec.js
// The dash can be a double tap, an on-screen button, or off; and the countdown never hides the scene.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

async function start(page, dashControl) {
  await openApp(page, '/?debug=1');
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
  await page.evaluate((m) => { window.__storage.data.settings.dashControl = m; window.__storage.save(); document.dispatchEvent(new CustomEvent('dx:controls-changed')); }, dashControl);
  await page.locator('.btn-play').click();
  await page.waitForFunction(() => window.__game._state === 'playing', null, { timeout: 25000 });
  await page.waitForFunction(() => window.__game.gatesActive && !window.__game.answerLocked, null, { timeout: 20000 });
  await page.evaluate(() => { window.__game.gateZ = -40; });
}

test.describe('Dash control', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'runner needs WebGL (verified in Chromium)');

  test('the on-screen Dash button dashes, and a double tap does not', async ({ page }) => {
    await start(page, 'button');
    await expect(page.locator('#dashBtn')).toBeVisible();
    await page.mouse.dblclick(200, 300);
    expect(await page.evaluate(() => window.__game.rushStacks)).toBe(0);
    await page.locator('#dashBtn').dispatchEvent('pointerdown');
    await expect.poll(() => page.evaluate(() => window.__game.rushStacks)).toBeGreaterThan(0);
  });

  test('a double tap dashes by default, and no button is shown', async ({ page }) => {
    await start(page, 'double');
    await expect(page.locator('#dashBtn')).toBeHidden();
    await page.mouse.click(200, 300);
    await page.mouse.click(200, 300);
    await expect.poll(() => page.evaluate(() => window.__game.rushStacks)).toBeGreaterThan(0);
  });

  test('with dash off, neither the button nor a double tap dashes', async ({ page }) => {
    await start(page, 'off');
    await expect(page.locator('#dashBtn')).toBeHidden();
    await page.mouse.dblclick(200, 300);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__game.rushStacks)).toBe(0);
  });
});

test.describe('Countdown', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'runner needs WebGL (verified in Chromium)');

  test('the scene stays visible under the 3-2-1 (no dark curtain)', async ({ page }) => {
    await openApp(page, '/?debug=1');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.locator('.btn-play').click();
    await page.waitForSelector('#countdownOverlay.active', { timeout: 20000 });
    const alpha = await page.evaluate(() => {
      const ovl = document.getElementById('countdownOverlay');
      // sample the overlay's colour at the corners and edges, where the vignette is zero
      const c = getComputedStyle(ovl).backgroundColor.match(/[\d.]+/g).map(Number);
      return c.length > 3 ? c[3] : 1;
    });
    expect(alpha).toBeLessThanOrEqual(0.1);
    await expect(page.locator('#countdownNum')).toBeVisible(); // the number is briefly hidden between 3, 2 and 1
    const box = await page.locator('#countdownNum').boundingBox();
    const vh = page.viewportSize().height;
    expect(box.y).toBeGreaterThan(vh * 0.5); // on the floor, below the runner's face
  });
});

test.describe('Phone defaults', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'runner needs WebGL (verified in Chromium)');
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } });

  test('a fresh phone gets the Dash button without touching Settings', async ({ page }) => {
    await openApp(page, '/?debug=1');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    expect(await page.evaluate(() => window.__storage.get('dashControl'))).toBe('auto');
    await page.locator('.btn-play').click();
    await page.waitForFunction(() => window.__game._state === 'playing', null, { timeout: 25000 });
    await expect(page.locator('#dashBtn')).toBeVisible();
  });

  test('after the third game it offers the double tap once, and the answer sticks', async ({ page }) => {
    await openApp(page, '/?debug=1');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.evaluate(() => { window.__storage.data.settings.runsFinished = 2; window.__storage.save(); });
    await page.locator('.btn-play').click();
    await page.waitForFunction(() => window.__game._state === 'playing', null, { timeout: 25000 });
    await page.evaluate(() => { const g = window.__game; g.wrong = 3; g.correct = 3; g.score = 500; g.lives = 0; g._endRun('no_lives'); });
    await expect(page.locator('#screenPostRun')).toHaveClass(/active/, { timeout: 10000 });
    const card = page.locator('.dash-prompt');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/by accident/);
    await card.getByRole('button', { name: /Turn on double-tap/ }).click();
    expect(await page.evaluate(() => window.__storage.get('dashControl'))).toBe('double');
    await expect(card).toHaveCount(0);
  });

  test('the tutorial teaches the Dash button on a phone, and tapping it advances', async ({ page }) => {
    await page.goto('/');
    const step = (id) => expect(page.locator('#tutorialOverlay .tut-card')).toHaveAttribute('data-step', id);
    await step('welcome');
    await page.locator('#tutNextBtn').click();
    for (const [id, key] of [['left', 'ArrowLeft'], ['right', 'ArrowRight'], ['jump', 'ArrowUp'], ['slide', 'ArrowDown']]) {
      await step(id);
      await page.keyboard.press(key);
    }
    await step('rush');
    await expect(page.locator('#tutDashBtn')).toBeVisible();
    await expect(page.locator('.tut-prompt')).toContainText(/Dash button/);
    await page.locator('#tutDashBtn').dispatchEvent('pointerdown');
    await step('answer');
  });
});
