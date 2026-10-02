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
      for (const sel of ['#settingsBtn', '#leaderboardBtn', '#profileCornerBtn', '.btn-play', '#filtersBtn', '#speedBtn', '#howToPlayBtn', '#multiplayerBtn', '#homeFlashcardsBtn', '#homeChallengeBtn']) {
        const box = await page.locator(sel).boundingBox();
        expect(box, sel).not.toBeNull();
        expect(box.y, sel).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${sel} bottom=${Math.round(box.y + box.height)} y=${Math.round(box.y)} h=${Math.round(box.height)} navTop=${Math.round(navTop)} viewport=${size.width}x${size.height}`).toBeLessThanOrEqual(navTop + 1);
      }
    });
  }

  test('Home is the middle tab, and Settings and Ranks are buttons, not tabs', async ({ page }) => {
    await openApp(page);
    const tabs = await page.locator('#bottomNav .nav-item').evaluateAll((els) => els.map((e) => e.dataset.screen));
    expect(tabs).toEqual(['screenStats', 'screenShop', 'screenHome', 'screenQuests', 'screenProfile']);
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
    for (const name of ['Study', 'Weakness', 'Daily 15', 'Weekly Gauntlet', 'Friend challenge', 'Exam Sim']) {
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

  test('Filters, Speed and Today are popups; the card library lives in Flashcards; Quests is a tab', async ({ page }) => {
    await openApp(page);
    await page.locator('#filtersBtn').click();
    await expect(page.locator('#filtersSheet')).toBeVisible();
    await page.locator('#filtersSheet .sheet-close').click();
    await page.locator('#speedBtn').click();
    await expect(page.locator('#speedSheet')).toBeVisible();
    await expect(page.locator('#speedDial')).toBeVisible();
    await page.locator('#speedSheet .sheet-close').click();
    await page.locator('#studyGoal').click();
    await expect(page.locator('#todaySheet')).toBeVisible();
    await page.locator('#todaySheet .sheet-close').click();
    await page.locator('#homeFlashcardsBtn').click();
    await expect(page.locator('#cardBrowserBtn')).toBeVisible();
    await expect(page.locator('#myCardsBtn')).toBeVisible();
    await page.locator('#cardBrowserBtn').click();
    await expect(page.locator('#screenCardBrowser')).toBeVisible();
    await page.locator('#bottomNav [data-screen="screenQuests"]').click();
    await expect(page.locator('#questList')).toBeVisible();
    await page.locator('#bottomNav [data-screen="screenProfile"]').click();
    await expect(page.locator('#calendarGrid')).toBeVisible();
  });

  test('swiping sideways moves between tabs and the indicator follows', async ({ page }) => {
    await openApp(page);
    const swipe = async (dx) => page.evaluate((d) => {
      const fire = (type, x) => {
        // Touch and TouchEvent do not exist in desktop Firefox or WebKit, so build a plain event with the same shape
        const t = { identifier: 1, target: document.body, clientX: x, clientY: 300 };
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [t] });
        Object.defineProperty(ev, 'changedTouches', { value: [t] });
        document.dispatchEvent(ev);
      };
      fire('touchstart', 200); fire('touchend', 200 + d);
    }, dx);
    await swipe(-120); // left: next tab
    await expect(page.locator('#screenQuests')).toHaveClass(/active/);
    await expect(page.locator('#tabIndicator span.on')).toHaveCount(1);
    await swipe(-120);
    await expect(page.locator('#screenProfile')).toHaveClass(/active/);
    await swipe(-120); // the last tab: nothing further
    await expect(page.locator('#screenProfile')).toHaveClass(/active/);
    await swipe(120);
    await swipe(120);
    await expect(page.locator('#screenHome')).toHaveClass(/active/);
  });

  test('How to play opens the guided tutorial', async ({ page }) => {
    await openApp(page);
    await page.locator('#howToPlayBtn').click();
    await expect(page.locator('#tutorialOverlay')).toBeVisible();
    await expect(page.locator('#tutSkipBtn')).toBeVisible();
  });

  test('every page has a Back button that steps back one level, and the tab screens rely on the bottom bar', async ({ page }) => {
    await openApp(page);
    await page.locator('#settingsBtn').click();
    await page.locator('.settings-card[data-section="sound"]').click();
    await page.locator('#screenSettings .back-btn').click();     // section -> list of sections
    await expect(page.locator('.settings-card[data-section="sound"]')).toBeVisible();
    await page.locator('#screenSettings .back-btn').click();     // list -> Home
    await expect(page.locator('#screenHome')).toHaveClass(/active/);
    await page.locator('#leaderboardBtn').click();
    await page.locator('#screenLeaderboard .back-btn').click();
    await expect(page.locator('#screenHome')).toHaveClass(/active/);
    await page.locator('#bottomNav [data-screen="screenStats"]').click();
    await expect(page.locator('#screenStats .back-btn')).toHaveCount(0);  // a tab: the bottom bar moves you
    await page.locator('#bottomNav [data-screen="screenHome"]').click();
    await expect(page.locator('#screenHome')).toHaveClass(/active/);
  });
});
