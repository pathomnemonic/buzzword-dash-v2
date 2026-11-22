// tests/e2e/opendecks.spec.js
// Open decks through the real screens: open the list, tap Add, the cards appear in My Cards and Flashcard mode with their
// source line, and Remove takes them away again.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('Open decks: add the pilot deck, study a card with its source line, remove the deck', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openApp(page, '/?debug=1');
  await page.waitForFunction(() => window.__ui);
  await page.evaluate(() => window.__ui.show('screenMyCards'));
  await page.locator('#bringCardsBtn').click();

  // the blurb is open the first time, and says why these decks and how to add your own
  const intro = page.locator('details.open-decks-intro');
  await expect(intro).toHaveAttribute('open', '');
  await expect(intro).toContainText(/open licence/);
  await expect(intro).toContainText(/Add your own/);

  const row = page.locator('[data-deck="openstax-ap-1e"]');
  await expect(row).toContainText(/CC BY 4\.0/);
  await expect(row.locator('[data-role="od-meta"]')).toContainText(/cards/);
  await row.locator('[data-role="od-add"]').click();
  await expect(page.locator('[data-role="od-status"]')).toContainText(/added/, { timeout: 20000 });
  const n = await page.evaluate(() => window.__customCards.getAll().filter((c) => c.deck === 'openstax-ap-1e').length);
  expect(n).toBeGreaterThan(300);

  // credits with the licence link
  await page.locator('.open-decks-credits summary').click();
  await expect(page.locator('.open-decks-credits')).toContainText(/openstax\.org/);

  // a flashcard shows where it came from
  await page.evaluate(() => { window.__storage.set('disabledCards', window.__cards.map((c) => c.id)); window.__ui.show('screenFlashcard'); window.__ui.renderFlashcardScreen(); });
  await page.getByRole('button', { name: /Flip cards/ }).click();
  await page.locator('#fcRevealBtn').click();
  await expect(page.locator('[data-role="source-line"]').first()).toContainText(/Source: OpenStax Anatomy & Physiology \(1st ed\.\), CC BY 4\.0/);

  // remove
  await page.evaluate(() => window.__ui.show('screenMyCards'));
  await page.locator('#bringCardsBtn').click();
  await page.locator('[data-deck="openstax-ap-1e"] [data-role="od-remove"]').click();
  expect(await page.evaluate(() => window.__customCards.getAll().filter((c) => c.deck === 'openstax-ap-1e').length)).toBe(0);
  expect(errors).toEqual([]);
});
