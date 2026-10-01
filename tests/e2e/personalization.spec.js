// tests/e2e/personalization.spec.js
// Settings rules and the Locker tabs (no WebGL needed).

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test.describe('Personalization', () => {
  test('turning off a power-up marks runs as custom (not ranked)', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenSettings"]').click();
    await page.locator('.settings-card[data-section="rules"]').click();
    await expect(page.getByText('Your Rules (single-player)')).toBeVisible();
    await expect(page.getByText('Standard rules: runs are ranked.')).toBeVisible();

    await page.getByRole('switch', { name: 'Shield power-up' }).click();
    await expect(page.getByText(/Custom rules on: no Shield/)).toBeVisible();

    await page.getByRole('switch', { name: 'Shield power-up' }).click();
    await expect(page.getByText('Standard rules: runs are ranked.')).toBeVisible();
  });

  test('the Locker separates 3D characters from customizable ones', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenShop"]').click();
    await expect(page.getByRole('tab', { name: /Characters/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Animated 3D characters/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Classic characters/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Vehicles/ })).toBeVisible();

    await page.getByRole('tab', { name: /Customize/ }).click();
    await expect(page.getByText(/Equipped: .* · Animated 3D character/)).toBeVisible();
    await expect(page.getByText(/Dr\. Dash colors/)).toBeVisible();
    await expect(page.locator('.color-part')).toHaveCount(2);
    await page.locator('.color-part[data-part="top"] .scrub-swatch[title="Maroon"]').click();
    await expect(page.locator('.color-part[data-part="top"] .scrub-swatch[title="Maroon"]')).toHaveAttribute('aria-pressed', 'true');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('buzzword_dash_v1')).settings.modelColors);
    expect(saved.avatar_intern.top).toBe(0x9a2f45);
  });
});
