// tests/e2e/gameplay.spec.js
// Plays a real run in the browser: this catches wiring failures (no render
// loop, dead buttons) that unit tests cannot.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

test.describe('Gameplay', () => {
  // The runner is 3D. Only Chromium has a reliable software WebGL in headless CI.
  test.skip(({ browserName }) => browserName !== 'chromium', 'runner needs WebGL (verified in Chromium)');

  test('starting a run shows clues and three answer lanes', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openApp(page);
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.locator('.btn-play').click();

    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
    await expect(page.locator('#answerRow > *')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('the 3D scene actually renders (canvas is not blank)', async ({ page }) => {
    await openApp(page);
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });

    // Sample the WebGL canvas: a rendered track has many distinct colors.
    const distinct = await page.evaluate(async () => {
      // Sample right after the renderer's own frame so the drawing buffer is valid.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const src = document.querySelector('#gameContainer canvas');
      const copy = document.createElement('canvas');
      copy.width = 64;
      copy.height = 48;
      const ctx = copy.getContext('2d');
      ctx.drawImage(src, 0, 0, 64, 48);
      const data = ctx.getImageData(0, 0, 64, 48).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4) colors.add((data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4));
      return colors.size;
    });
    expect(distinct).toBeGreaterThan(8);
  });
});

test.describe('Settings and screens', () => {
  test('settings toggles work from the keyboard', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenSettings"]').click();
    const toggle = page.getByRole('switch', { name: /Colorblind/ });
    await toggle.focus();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('body')).toHaveClass(/colorblind/);
  });

  test('the leaderboard screen explains when it is not configured', async ({ page }) => {
    await openApp(page);
    await page.locator('#leaderboardBtn').click();
    await expect(page.locator('#leaderboardContent')).toContainText(/not set up|Connecting|sign in/i);
  });

  test('a flashcard session can be started and answered', async ({ page }) => {
    await openApp(page);
    await page.locator('#flashcardBtn').click();
    await page.getByRole('button', { name: /Start Flashcard Session/ }).click();
    await expect(page.locator('#flashcardContent')).toContainText(/Card 1 of/);
    await page.getByRole('button', { name: 'Show Answer' }).click();
    await page.getByRole('button', { name: /Got it/ }).click();
    await expect(page.locator('#flashcardContent')).toContainText(/Card 2 of/);
  });

  test('an exam simulation can be completed', async ({ page }) => {
    await openApp(page);
    await page.locator('#examBtn').click();
    await page.getByRole('radio', { name: '10' }).click();
    await page.getByRole('radio', { name: 'Untimed' }).click();
    await page.getByRole('button', { name: /Start exam/ }).click();
    await expect(page.locator('#examContent')).toContainText(/Question 1 of 10/);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /End exam now/ }).click();
    await expect(page.locator('#examContent')).toContainText(/Exam complete/);
  });
});

test.describe('Without WebGL', () => {
  // ?webgl=off simulates a browser that cannot create a WebGL context.
  test('the app still works and explains that the runner is unavailable', async ({ page }) => {
    await openApp(page, '/?webgl=off');
    await expect(page.locator('#webglNotice')).toContainText(/WebGL/);
    await page.locator('.btn-play').click();
    await expect(page.locator('body')).toContainText(/needs WebGL/);
    await page.locator('#flashcardBtn').click();
    await page.getByRole('button', { name: /Start Flashcard Session/ }).click();
    await expect(page.locator('#flashcardContent')).toContainText(/Card 1 of/);
  });
});
