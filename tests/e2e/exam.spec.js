// tests/e2e/exam.spec.js
// The Exam Sim from setup to results: answer every question, flag one, finish, read the report and study the misses.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('an untimed 10-question exam can be taken, finished and reviewed', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await openApp(page, '/?debug=1');
  await page.waitForFunction(() => window.__ui);
  await page.evaluate(() => window.__ui.show('screenExam'));
  await expect(page.getByText('Start exam')).toBeVisible({ timeout: 15000 });
  await page.getByRole('radio', { name: '10', exact: true }).click();
  await page.getByRole('radio', { name: /Untimed/ }).click();
  await page.getByRole('button', { name: /Start exam/ }).click();
  await expect(page.locator('#examClock')).toHaveText(/Untimed/);

  for (let i = 0; i < 10; i++) {
    // four or three answer buttons that are not navigation
    const choices = page.locator('#examContent button.btn-block');
    await choices.nth(i % 2).click();
    if (i === 3) await page.getByRole('button', { name: /Flag/ }).click();
    await page.getByRole('button', { name: i === 9 ? /Finish/ : /Next/ }).click();
  }
  // "Finish" asks when something is unanswered; everything was answered, so the report shows
  await expect(page.locator('#examContent').getByText(/readiness|Accuracy|correct/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#examContent')).toContainText(/\d+\s*\/\s*10|\d+%/);
  const study = page.getByRole('button', { name: /Study missed/ });
  if (await study.count()) {
    await study.click();
    await expect(page.locator('#screenFlashcard')).toHaveClass(/active/);
  }
  expect(errors).toEqual([]);
});
