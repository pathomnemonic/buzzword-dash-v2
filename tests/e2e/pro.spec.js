// tests/e2e/pro.spec.js — Dx Dash Pro is dormant until switched on (invisible, nothing limited), and when the remote
// config turns it on the Settings row, the gates and the paywall appear.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

async function openSettingsSection(page, section) {
  await page.evaluate(() => window.__ui.show('screenSettings'));
  await page.locator(`.settings-card[data-section="${section}"]`).click();
}

test.describe('Dx Dash Pro', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'checked in Chromium');

  test('dormant by default: no Pro row, the offline pack is not limited, no paywall', async ({ page }) => {
    await openApp(page, '/?debug=1');
    await page.waitForFunction(() => window.__pro, null, { timeout: 15000 });
    expect(await page.evaluate(() => window.__pro.proEnabled())).toBe(false);
    await openSettingsSection(page, 'about');
    await expect(page.locator('[data-setting="pro"]')).toHaveCount(0);
    await openSettingsSection(page, 'data');
    const btn = page.locator('#offlinePackBtn');
    if (await btn.count()) {
      await btn.click();
      await expect(page.locator('#proPaywall')).toHaveCount(0);
    }
  });

  test('switched on from the remote file: the row appears and a locked feature opens the paywall', async ({ page }) => {
    await page.route(/remote-config\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ killed: [], pro: { enabled: true, gates: { offline_pack: 'locked' } } }) }));
    await openApp(page, '/?debug=1');
    await page.waitForFunction(() => window.__pro, null, { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => window.__pro.proEnabled()), { timeout: 8000 }).toBe(true);
    await openSettingsSection(page, 'about');
    await expect(page.locator('[data-setting="pro"]')).toHaveCount(1);
    await openSettingsSection(page, 'data');
    const btn = page.locator('#offlinePackBtn');
    test.skip(!(await btn.count()), 'the offline pack row is not offered in this environment');
    await btn.click();
    await expect(page.locator('#proPaywall')).toBeVisible();
    await expect(page.locator('#proPaywall')).toContainText(/Dx Dash Pro/);
    await page.locator('#proPaywallClose').click();
    await expect(page.locator('#proPaywall')).toHaveCount(0);
    // Pro lifts the gate (the debug switch stands in for a purchase)
    await page.evaluate(() => window.__pro.setProDebug(true));
    expect(await page.evaluate(() => window.__pro.checkGate('offline_pack').allowed)).toBe(true);
  });
});
