// tests/e2e/smoke.spec.js
// Basic E2E smoke tests

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test.describe('Smoke tests', () => {
  test('home screen loads with title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Dx Dash/);
  });

  test('play button is visible', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.btn-play')).toBeVisible();
  });

  test('unreleased features stay out of sight', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#cohortsBtn')).toBeHidden();
    // nothing a player can see mentions cohorts (hidden elements do not count)
    expect(await page.evaluate(() => document.body.innerText.toLowerCase().includes('cohort'))).toBe(false);
  });

  test('settings are grouped into sections, each explained', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenSettings"]').click();
    await expect(page.locator('.settings-card')).toHaveCount(6);
    await page.locator('.settings-card[data-section="study"]').click();
    await expect(page.getByText(/How much more often you see cards you have never answered/)).toBeVisible();
    await page.locator('.settings-back').click();
    await expect(page.locator('.settings-card')).toHaveCount(6);
  });

  test('the tutorial can be clicked through and closed from Settings and Home', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenSettings"]').click();
    await page.locator('.settings-card[data-section="about"]').click();
    await page.getByRole('button', { name: 'Open' }).first().click();
    await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
    for (let i = 0; i < 20 && (await page.locator('#tutorialOverlay.active').count()) === 1; i++) {
      await page.locator('#tutNextBtn').click();
    }
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);

    await page.locator('[data-screen="screenHome"]').click();
    await expect(page.locator('details.howto')).toHaveCount(1);
    await page.locator('details.howto summary').click();
    await page.getByRole('button', { name: /step by step/i }).click();
    await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
    await page.locator('#tutCloseBtn').click();
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
  });

  test('only the current tab is highlighted', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenStats"]').click();
    await expect(page.locator('.nav-item[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('.nav-item[data-screen="screenStats"]')).toHaveAttribute('aria-current', 'true');
  });

  test('the Versus close button stays on screen on a short laptop window', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 560 });
    await openApp(page);
    await page.locator('#multiplayerBtn').click();
    await expect(page.locator('#mpCloseBtn')).toBeInViewport();
    await page.locator('#mpCloseBtn').click();
    await expect(page.locator('#multiplayerOverlay')).not.toHaveClass(/active/);
  });

  test('bottom navigation is visible', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#bottomNav')).toBeVisible();
  });

  test('the first-run tutorial can be completed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#onboardingOverlay')).toBeVisible();
    await openApp(page);
    await expect(page.locator('#onboardingOverlay')).toBeHidden();
  });

  test('navigating to Stats screen works', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenStats"]').click();
    await expect(page.locator('#screenStats')).toBeVisible();
  });

  test('navigating to Settings screen works', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenSettings"]').click();
    await expect(page.locator('#screenSettings')).toBeVisible();
  });

  test('the Flashcards button opens the flashcard screen', async ({ page }) => {
    await openApp(page);
    await page.locator('#flashcardBtn').click();
    await expect(page.locator('#screenFlashcard')).toBeVisible();
  });

  test('the Exam Sim button opens the exam setup', async ({ page }) => {
    await openApp(page);
    await page.locator('#examBtn').click();
    await expect(page.locator('#examContent')).toContainText(/exam block/i);
  });
});
