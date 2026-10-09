// tests/e2e/lessons.spec.js
// After the short how-to-play, every other menu has a red dot and teaches itself the first time it is opened.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

async function openWithLessons(page) {
  await openApp(page, '/?debug=1', { lessons: true });
  // (openApp left the player on Home with the how-to-play closed: dots are on)
  await page.waitForTimeout(500);
}

const dot = (page, selector) => page.locator(selector + ' > .nav-dot, ' + selector + ' .nav-dot').first();

test.describe('Red dots and lessons', () => {
  test('every menu and tab has a red dot once the how-to-play is over', async ({ page }) => {
    await openWithLessons(page);
    for (const sel of ['#filtersBtn', '#speedBtn', '#homeFlashcardsBtn', '#homeChallengeBtn', '#settingsBtn',
      '.nav-item[data-screen="screenStats"]', '.nav-item[data-screen="screenShop"]', '.nav-item[data-screen="screenQuests"]', '.nav-item[data-screen="screenProfile"]']) {
      await expect(dot(page, sel), sel).toBeVisible();
    }
  });

  test('the streak, Today, Settings sections and Locker tabs each explain themselves too', async ({ page }) => {
    await openWithLessons(page);
    await page.locator('#streakChip').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Your streak', { timeout: 5000 });
    await page.locator('#tourNextBtn').click();
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
    await page.locator('#streakSheet .sheet-close').click();
    await page.locator('#settingsBtn').click();
    await page.waitForTimeout(900);
    await page.locator('#tourCloseBtn').click(); // (the Settings lesson itself)
    await page.locator('.settings-card[data-section="look"]').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Look and performance', { timeout: 5000 });
    await page.locator('#tourNextBtn').click();
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
    await expect(dot(page, '.settings-card[data-section="look"]')).toHaveCount(0);
  });

  test('opening a tab shows its lesson once, with no step count, and its dot goes', async ({ page }) => {
    await openWithLessons(page);
    await page.locator('.nav-item[data-screen="screenQuests"]').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Daily quests', { timeout: 5000 });
    await expect(page.locator('.tour-card .tut-count')).toHaveCount(0);
    await page.locator('#tourNextBtn').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Working through quests');
    await page.locator('#tourNextBtn').click();
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
    await expect(dot(page, '.nav-item[data-screen="screenQuests"]')).toHaveCount(0);
    // opening it again does not repeat the lesson
    await page.locator('.nav-item[data-screen="screenHome"]').click();
    await page.locator('.nav-item[data-screen="screenQuests"]').click();
    await page.waitForTimeout(900);
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
  });

  test('the Locker lesson walks through buying and wearing a first trail', async ({ page }) => {
    await openWithLessons(page);
    const coins = await page.evaluate(() => window.__storage.get('coins'));
    await page.locator('.nav-item[data-screen="screenShop"]').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Your hero', { timeout: 5000 });
    for (let i = 0; i < 12; i++) {
      if (!(await page.locator('#tourOverlay').count())) break;
      const next = page.locator('#tourNextBtn');
      if (await next.count()) await next.click();
      else { const b = await page.locator('.tour-ring').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      await page.waitForTimeout(450);
    }
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
    expect(await page.evaluate(() => window.__storage.get('coins'))).toBeLessThan(coins);
    expect(await page.evaluate(() => window.__storage.get('equipped').trail)).not.toBe('trail_none');
  });

  test('a lesson can be closed with the ×, and does not come back', async ({ page }) => {
    await openWithLessons(page);
    await page.locator('.nav-item[data-screen="screenStats"]').click();
    await expect(page.locator('.tour-card h2')).toBeVisible({ timeout: 5000 });
    await page.locator('#tourCloseBtn').click();
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
    await page.locator('.nav-item[data-screen="screenHome"]').click();
    await page.locator('.nav-item[data-screen="screenStats"]').click();
    await page.waitForTimeout(900);
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
  });

  test('the Versus lesson only shows the panel: its buttons do nothing meanwhile', async ({ page }) => {
    await openWithLessons(page);
    await page.locator('#multiplayerBtn').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Racing a friend', { timeout: 5000 });
    const before = await page.evaluate(() => document.getElementById('mpContent').innerText);
    await page.locator('#mpContent button').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getElementById('mpContent').innerText)).toBe(before);
    await expect(page.locator('.tour-card h2')).toHaveText('Racing a friend');
    // and there is no "find a ranked match" for now: Versus is by room code only
    await expect(page.locator('#mpContent')).not.toContainText(/ranked/i);
    await expect(page.locator('#mpContent')).toContainText(/Host Game/);
    await expect(page.locator('#mpContent #mpJoinCode')).toHaveCount(1);
  });

  test('the Filters lesson walks through the sections and closes the pop-up', async ({ page }) => {
    await openWithLessons(page);
    await page.locator('#filtersBtn').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Subjects', { timeout: 5000 });
    for (let i = 0; i < 12; i++) {
      if (!(await page.locator('#tourOverlay').count())) break;
      const next = page.locator('#tourNextBtn');
      if (await next.count()) await next.click();
      else { const b = await page.locator('.tour-ring').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      await page.waitForTimeout(450);
    }
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
    await expect(page.locator('#filtersSheet')).not.toHaveClass(/active/);
  });
});

test.describe('The account invitation at the end of the how-to-play', () => {
  test.setTimeout(150000);
  const card = (page) => page.locator('#tutorialCoach .tut-card, #tutorialOverlay .tut-card');
  const step = (page, id, timeout = 30000) => expect(card(page)).toHaveAttribute('data-step', id, { timeout });

  async function toTheAccountPage(page) {
    await page.addInitScript(() => {
      window.__tutorialAccountOverride = {
        available: () => true,
        render: (container, done) => {
          const b = document.createElement('button');
          b.id = 'fakeSignUp'; b.type = 'button'; b.textContent = 'Sign up';
          b.addEventListener('click', () => done());
          container.appendChild(b);
        }
      };
    });
    await page.addInitScript(() => { try { localStorage.setItem('dx_lessons_off', '1'); } catch (e) { /* ignore */ } });
    await page.goto('/?debug=1');
    await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
    await step(page, 'welcome');
    await page.locator('#tutNextBtn').click();
    for (const id of ['left', 'right', 'jump', 'slide', 'answer', 'rush']) { await step(page, id, 60000); await page.locator('#tutSkipStepBtn').click(); }
    await expect(page.locator('#tourOverlay')).toBeVisible({ timeout: 60000 });
    await page.locator('#tourNextBtn').click();                      // Welcome home
    const box = await page.locator('.tour-ring').boundingBox();      // Coins
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator('#tourNextBtn').click();                      // There is more to find
    await step(page, 'account', 20000);
  }

  test('it comes second to last, the × asks "are you sure?" and says why, and skipping leads to the closing page', async ({ page }) => {
    await toTheAccountPage(page);
    await expect(card(page)).not.toContainText(/step \d+ of/i);
    await expect(card(page)).toContainText(/free account/i);
    await page.locator('#tutCloseBtn').click();
    const ask = page.locator('#tutExitConfirm');
    await expect(ask).toContainText(/Are you sure\?/);
    await expect(ask).toContainText(/this one device/i);
    await expect(ask).toContainText(/study groups/i);
    // "Make my account" stays on the page
    await page.locator('#tutExitStay').click();
    await step(page, 'account');
    // "Maybe later" asks the same question; "Skip for now" moves on to the last page
    await page.locator('#tutAccountLater').click();
    await expect(page.locator('#tutExitConfirm')).toBeVisible();
    await page.locator('#tutExitYes').click();
    await step(page, 'done');
    await expect(card(page)).toContainText(/red dot/i);
  });

  test('making the account carries straight on to the last page', async ({ page }) => {
    await toTheAccountPage(page);
    await page.locator('#fakeSignUp').click();
    await step(page, 'done', 10000);
  });
});
