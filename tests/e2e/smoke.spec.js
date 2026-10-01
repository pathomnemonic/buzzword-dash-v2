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

  test('Settings and Home open the same tutorial, and it can be skipped', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-screen="screenSettings"]').click();
    await page.locator('.settings-card[data-section="about"]').click();
    await page.locator('#settingsTutorialBtn').click();
    await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
    await expect(page.locator('#tutorialOverlay .tut-card')).toHaveAttribute('data-step', 'welcome');
    await page.locator('#tutSkipBtn').click();
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);

    await page.locator('[data-screen="screenHome"]').click();
    await page.locator('#howToPlayBtn').click();
    await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
    await expect(page.locator('#tutorialOverlay .tut-card')).toHaveAttribute('data-step', 'welcome');
    await page.locator('#tutSkipBtn').click();
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
  });

  test('the three question filters sit on one page behind a single row on Home', async ({ page }) => {
    await openApp(page);
    // Home shows one row, not the filters themselves
    await expect(page.locator('#screenHome #filtersBtn')).toBeVisible();
    await expect(page.locator('#screenHome #subjectToggle')).toHaveCount(0);
    await expect(page.locator('#screenHome #examFilterContainer')).toHaveCount(0);
    await expect(page.locator('#filtersSummary')).toHaveText(/All subjects/);

    await page.locator('#filtersBtn').click();
    await expect(page.locator('#screenFilters')).toHaveClass(/active/);
    await expect(page.locator('.nav-item[aria-current="true"]')).toHaveAttribute('data-screen', 'screenHome');
    // all three filters are on the page
    await expect(page.locator('#screenFilters #subjectToggle')).toBeVisible();
    await expect(page.locator('#screenFilters #examFilterToggle')).toBeVisible();
    await expect(page.locator('#screenFilters #advancedFilterContainer')).toBeVisible();

    // picking one subject changes the summary on Home
    await page.locator('#subjectToggle').click();
    await page.locator('#deselectAllSubjects').click();
    await page.locator('#subjectScroll .subject-chip').first().click();
    await page.locator('#screenFilters .back-btn').click();
    await expect(page.locator('#screenHome')).toHaveClass(/active/);
    await expect(page.locator('#filtersSummary')).not.toHaveText(/All subjects/);
  });

  test('badges live in the profile, and a new badge wears a red dot until the profile is seen', async ({ page }) => {
    await openApp(page, '/?debug=1');
    // no separate Badges button on Home any more
    await expect(page.locator('#achievementsBtn')).toHaveCount(0);
    await expect(page.locator('#profileBtn .nav-dot')).toHaveCount(0);

    // earn a badge: the profile buttons get a dot
    await page.evaluate(() => {
      window.__storage.unlockAchievement('ach_first_run');
      document.dispatchEvent(new CustomEvent('dx:attention-changed'));
    });
    await expect(page.locator('#profileBtn .nav-dot')).toHaveCount(1);
    await expect(page.locator('#profileCornerBtn .nav-dot')).toHaveCount(1);

    // the badges are in the profile, with the new one marked
    await page.locator('#profileBtn').click();
    await expect(page.locator('#screenProfile')).toHaveClass(/active/);
    await expect(page.locator('#profileBadges')).toContainText(/Badges \(1\//);
    await expect(page.locator('#profileBadges .achievement-item.is-new')).toHaveCount(1);
    // tapping an earned badge pins it
    await page.locator('#profileBadges .achievement-item.unlocked').first().click();
    await expect(page.locator('#profileBadges .achievement-item.pinned')).toHaveCount(1);

    // leaving the profile clears the dot
    await page.locator('[data-screen="screenHome"]').click();
    await expect(page.locator('#profileBtn .nav-dot')).toHaveCount(0);
    await expect(page.locator('#profileCornerBtn .nav-dot')).toHaveCount(0);
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

  test('the first run opens the tutorial once; skipping ends the first run', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
    await page.locator('#tutSkipBtn').click();
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
  });

  test('the profile button is in the top right of Home and opens the account panel', async ({ page }) => {
    await openApp(page);
    const btn = page.locator('#profileCornerBtn');
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    const vp = page.viewportSize();
    expect(box.x + box.width / 2).toBeGreaterThan(vp.width / 2);
    expect(box.y).toBeLessThan(160);
    await btn.click();
    await expect(page.locator('#accountOverlay')).toHaveClass(/active/);
    // With accounts configured there is an email field; without, the panel says accounts are not set up.
    await expect(page.locator('#accountBody')).toContainText(/Create account|not set up|Loading|Signed in/);
    await page.locator('#accountCloseBtn').click();
    await expect(page.locator('#accountOverlay')).not.toHaveClass(/active/);
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
