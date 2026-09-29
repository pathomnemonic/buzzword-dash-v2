// tests/e2e/smoke.spec.js
// Basic E2E smoke tests

import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('home screen loads with title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Buzzword Dash/);
  });

  test('play button is visible', async ({ page }) => {
    await page.goto('/');
    const playButton = page.locator('.btn-play');
    await expect(playButton).toBeVisible();
  });

  test('bottom navigation is visible', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('#bottomNav');
    await expect(nav).toBeVisible();
  });

  test('navigating to Stats screen works', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-screen="screenStats"]').click();
    const statsScreen = page.locator('#screenStats');
    await expect(statsScreen).toBeVisible();
  });

  test('navigating to Settings screen works', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-screen="screenSettings"]').click();
    const settingsScreen = page.locator('#screenSettings');
    await expect(settingsScreen).toBeVisible();
  });
});
