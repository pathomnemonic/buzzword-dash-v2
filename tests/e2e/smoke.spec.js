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
