// tests/e2e/importer.spec.js
// Bringing in your own cards through the real screens: upload an Anki text export, paste an AI reply, then study them.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp } from './helpers.js';

test('Anki export and an AI reply both end up as cards you can use', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await openApp(page, '/?debug=1');
  await page.waitForFunction(() => window.__ui);
  await page.evaluate(() => window.__ui.show('screenMyCards'));
  await page.locator('#bringCardsBtn').click();
  await expect(page.getByText('Bring in your own cards')).toBeVisible();
  // the instructions are on the screen
  await expect(page.getByText(/Notes in Plain Text/)).toBeVisible();

  // 1. an Anki "Notes in Plain Text" export, uploaded as a file
  await page.locator('#ankiImportContainer input[type="file"]').setInputFiles('tests/fixtures/anki-export-sample.txt');
  await expect(page.locator('.anki-import-preview')).toContainText(/Found 6 cards/);
  await page.getByRole('button', { name: 'Import as flashcards' }).click();
  await expect(page.locator('.anki-import-status')).toContainText(/Imported 6 flashcards/);

  // 2. an AI chat's reply, pasted
  const reply = readFileSync('tests/fixtures/ai-reply-sample.txt', 'utf8');
  await page.locator('#ankiImportContainer textarea').nth(1).fill(reply);
  await page.getByRole('button', { name: /Import quiz cards/ }).click();
  await expect(page.locator('.anki-import-status')).toContainText(/Imported 5 quiz cards/);

  // they are in My Cards, 11 in all
  await page.evaluate(() => window.__ui.show('screenMyCards'));
  await expect(page.locator('#customCardList')).toContainText(/11 custom cards/);
  expect(await page.evaluate(() => window.__storage && true)).toBe(true);
  expect(errors).toEqual([]);
});
