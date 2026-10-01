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
    const box = await page.locator('#countdownNum').boundingBox();
    const vh = page.viewportSize().height;
    expect(box.y).toBeGreaterThan(vh * 0.5); // on the floor, below the runner's face
  });
});
