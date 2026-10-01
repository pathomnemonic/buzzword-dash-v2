// tests/e2e/home.spec.js
// Home fits on one screen (no scrolling), the tab bar has Home in the middle, and the popups explain each mode.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const SIZES = [
  { name: 'small phone', width: 360, height: 640 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'tall phone', width: 412, height: 915 },
  { name: 'laptop', width: 1280, height: 720 }
];

test.describe('Home layout', () => {
  for (const size of SIZES) {
    test(`fits without scrolling on a ${size.name} (${size.width}x${size.height})`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openApp(page);
      const layout = page.locator('.home-layout');
      await expect(layout).toBeVisible();
      const overflow = await layout.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(overflow).toBeLessThanOrEqual(1);
      // every main control is on screen and clear of the tab bar
      const navTop = await page.locator('#bottomNav').evaluate((el) => el.getBoundingClientRect().top);
      for (const sel of ['#settingsBtn', '#leaderboardBtn', '#profileCornerBtn', '.btn-play', '#filtersBtn', '#speedBtn', '#multiplayerBtn', '#homeFlashcardsBtn', '#homeChallengeBtn', '#examBtn']) {
        const box = await page.locator(sel).boundingBox();
        expect(box, sel).not.toBeNull();
        expect(box.y, sel).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, sel).toBeLessThanOrEqual(navTop + 1);
      }
    });
  }

  test('Home is the middle tab, and Settings and Ranks are buttons, not tabs', async ({ page }) => {
    await openApp(page);
    const tabs = await page.locator('#bottomNav .nav-item').evaluateAll((els) => els.map((e) => e.dataset.screen));
    expect(tabs).toEqual(['screenStats', 'screenQuests', 'screenHome', 'screenShop', 'screenCards']);
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#screenSettings')).toBeVisible();
    await page.locator('#bottomNav [data-screen="screenHome"]').click();
    await page.locator('#leaderboardBtn').click();
    await expect(page.locator('#screenLeaderboard')).toBeVisible();
  });

  test('the Challenge popup describes every mode and closes again', async ({ page }) => {
    await openApp(page);
    await page.locator('#homeChallengeBtn').click();
    const sheet = page.locator('#challengeSheet');
    await expect(sheet).toBeVisible();
    for (const name of ['Study', 'Weakness', 'Daily 15', 'Friend challenge', 'Weekly tournament']) {
      await expect(sheet.getByText(name, { exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('the Flashcards popup leads to the picker with that source chosen', async ({ page }) => {
    await openApp(page);
    await page.locator('#homeFlashcardsBtn').click();
    await expect(page.locator('#flashcardsSheet')).toBeVisible();
    await page.locator('#flashcardsSheet [data-source="fresh"]').click();
    await expect(page.locator('#screenFlashcard')).toBeVisible();
    await expect(page.locator('.pick-source.on')).toContainText('New cards');
  });

  test('Speed and Today open as popups, Cards is a hub, the calendar is on Stats', async ({ page }) => {
    await openApp(page);
    await page.locator('#speedBtn').click();
    await expect(page.locator('#speedSheet')).toBeVisible();
    await page.locator('#speedSheet .sheet-close').click();
    await page.locator('#studyGoal').click();
    await expect(page.locator('#todaySheet')).toBeVisible();
    await page.locator('#todaySheet .sheet-close').click();
    await page.locator('#bottomNav [data-screen="screenCards"]').click();
    await expect(page.locator('#cardBrowserBtn')).toBeVisible();
    await expect(page.locator('#myCardsBtn')).toBeVisible();
    await page.locator('#bottomNav [data-screen="screenStats"]').click();
    await expect(page.locator('#calendarGrid')).toBeVisible();
  });

  test('How to play opens the guided tutorial', async ({ page }) => {
    await openApp(page);
    await page.locator('#howToPlayBtn').click();
    await expect(page.locator('#tutorialOverlay')).toBeVisible();
    await expect(page.locator('#tutSkipBtn')).toBeVisible();
  });
});
