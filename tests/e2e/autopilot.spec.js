// tests/e2e/autopilot.spec.js
// Auto-Pilot is a power-up you keep in hand: a button appears above Dash, only one can be held, and using it
// answers the question that is up. The results page lets the player change filters and flags a card quietly.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

async function startRun(page) {
  await page.locator('.btn-play').click();
  await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
  await page.waitForFunction(() => window.__game && window.__game.gatesActive, null, { timeout: 30000 });
}

test('Auto-Pilot waits in hand, cannot be picked up twice, and answers the question when tapped', async ({ page }) => {
  await openApp(page, '/?debug=1');
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
  await startRun(page);
  await expect(page.locator('#autoBtn')).toBeHidden();
  await page.evaluate(() => { const g = window.__game; g._collectPowerup('autoPilot'); g._collectPowerup('autoPilot'); });
  expect(await page.evaluate(() => window.__game.autoPilotHeld)).toBe(true);
  expect(await page.evaluate(() => window.__game.runPowerupsCollected), 'the second pick-up did nothing').toBe(1);
  await expect(page.locator('#autoBtn')).toBeVisible();
  await page.evaluate(() => { window.__game.dashControl = 'button'; });
  await page.locator('#autoBtn').dispatchEvent('pointerdown');
  const s = await page.evaluate(() => ({ held: window.__game.autoPilotHeld, left: window.__game.autoPilotGatesLeft }));
  expect(s.held).toBe(false);
  expect(s.left).toBe(1);
  await expect(page.locator('#autoBtn')).toBeHidden();
});

test('the results page has Filters, a big Play again and a small flag on missed cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, '/?debug=1');
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
  await startRun(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.runCards.push({ ok: false, choice: 'X', card: { id: 'c1', bw: ['a', 'b', 'c'], ans: 'Y', tp: 'tp', subj: 'S', d: [], ww: {} } });
    g.wrong = 1; g.correct = 0; g.lives = 0;
    g._endRun('no_lives');
  });
  await expect(page.locator('#screenPostRun')).toHaveClass(/active/, { timeout: 10000 });
  const again = await page.locator('#playAgainBtn').boundingBox();
  const home = await page.locator('#goHomeBtn').boundingBox();
  expect(again.width).toBeGreaterThan(home.width * 1.6);
  const flag = page.locator('.review-flag').first();
  await expect(flag).toBeVisible();
  expect((await flag.boundingBox()).width).toBeLessThan(30);
  await page.locator('#postFiltersBtn').click();
  await expect(page.locator('#filtersSheet')).toHaveClass(/active/);
});

test('Ctrl uses the Auto-Pilot on a computer', async ({ page }) => {
  await openApp(page, '/?debug=1');
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
  await startRun(page);
  await page.evaluate(() => window.__game._collectPowerup('autoPilot'));
  await page.keyboard.press('Control');
  const s = await page.evaluate(() => ({ held: window.__game.autoPilotHeld, left: window.__game.autoPilotGatesLeft }));
  expect(s).toEqual({ held: false, left: 1 });
});

test('Settings → Keyboard: change a key, see it in use, and go back to the standard keys', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page, '/?debug=1');
  await page.locator('#settingsBtn').click();
  await page.locator('.settings-card[data-section="keys"]').click();
  const row = page.locator('.key-row[data-action="autoPilot"]');
  await expect(row.locator('.key-btn').first()).toHaveText('Ctrl');
  await row.locator('.key-btn').first().click();
  await expect(row.locator('.key-btn').first()).toHaveText(/Press a key/);
  await page.keyboard.press('e');
  await expect(row.locator('.key-btn').first()).toHaveText('E');
  // giving it to another action takes it from the first
  await page.locator('.key-row[data-action="jump"] .key-btn').first().click();
  await page.keyboard.press('e');
  await expect(page.locator('.key-row[data-action="jump"] .key-btn').first()).toHaveText('E');
  await expect(row.locator('.key-btn').first()).toHaveText('—');
  // Escape cancels a change
  await row.locator('.key-btn').first().click();
  await page.keyboard.press('Escape');
  await expect(row.locator('.key-btn').first()).toHaveText('—');
  await page.locator('#resetKeysBtn').click();
  await expect(row.locator('.key-btn').first()).toHaveText('Ctrl');
});
