// tests/e2e/gameplay.spec.js
// Plays a real run in the browser: this catches wiring failures (no render
// loop, dead buttons) that unit tests cannot.

import { test, expect } from '@playwright/test';

async function skipOnboarding(page) {
  await page.goto('/');
  const next = page.locator('#obNextBtn');
  for (let i = 0; i < 8; i++) {
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
}

test.describe('Gameplay', () => {
  test('starting a run shows clues and three answer lanes', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await skipOnboarding(page);
    await page.locator('.btn-play').click();

    const buzz = page.locator('#buzzText');
    await expect(buzz).not.toHaveText('GET READY', { timeout: 15000 });
    await expect(page.locator('#answerRow > *')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('the 3D scene actually renders (canvas is not blank)', async ({ page }) => {
    await skipOnboarding(page);
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 15000 });

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

  test('settings toggles work from the keyboard', async ({ page }) => {
    await skipOnboarding(page);
    await page.locator('[data-screen="screenSettings"]').click();
    const toggle = page.getByRole('switch', { name: /Colorblind/ });
    await toggle.focus();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('body')).toHaveClass(/colorblind/);
  });

  test('the leaderboard screen explains when it is not configured', async ({ page }) => {
    await skipOnboarding(page);
    await page.locator('#leaderboardBtn').click();
    await expect(page.locator('#leaderboardContent')).toContainText(/not set up|Connecting|sign in/i);
  });
});
