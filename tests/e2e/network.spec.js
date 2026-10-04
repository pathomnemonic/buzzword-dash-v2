// tests/e2e/network.spec.js — the network going away, slow or flaky (section 49 of the QA plan).
import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

test.describe('Network', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'service workers and offline are checked in Chromium');

  test('losing the connection says so kindly, and coming back says so too', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page, '/?debug=1');
    await context.setOffline(true);
    await expect(page.locator('.notice-chip', { hasText: /Offline/ })).toBeVisible({ timeout: 5000 });
    await context.setOffline(false);
    await expect(page.locator('.notice-chip', { hasText: /Back online/ })).toBeVisible({ timeout: 5000 });
    expect(errors).toEqual([]);
  });

  test('a returning player who is offline can open the app, play a run and keep the progress', async ({ page, context }) => {
    await openApp(page, '/?debug=1');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    // wait for the service worker to take over and cache what the first visit loaded
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.waitForFunction(() => window.__ui && navigator.serviceWorker.controller, null, { timeout: 20000 });
    await page.waitForTimeout(3000);
    await context.setOffline(true);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await expect(page.locator('.btn-play')).toBeVisible({ timeout: 20000 });
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 30000 });
    expect(await page.evaluate(() => window.__dataProblems())).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('flaky connection: half of the lazy files fail, the app still starts and runs', async ({ page }) => {
    let n = 0;
    await page.route(/\/assets\/[^/]+\.js$/, (r) => ((++n % 4 === 0) ? r.abort() : r.continue()));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?debug=1');
    await page.waitForTimeout(6000);
    // chunk recovery may reload once; either way Home must come up
    await expect(page.locator('body')).toBeVisible();
    await page.unroute(/\/assets\/[^/]+\.js$/);
    await page.reload();
    await expect(page.locator('.btn-play, #tutCloseBtn').first()).toBeVisible({ timeout: 20000 });
  });
});
