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

  test('with nothing to buy (no payment link) nothing is limited and nothing is shown', async ({ page }) => {
    await openApp(page, '/?debug=1');
    await page.waitForFunction(() => window.__pro, null, { timeout: 15000 });
    expect(await page.evaluate(() => window.__pro.proLive())).toBe(false);
    expect(await page.evaluate(() => window.__cards.length)).toBeGreaterThan(3000);
    await openSettingsSection(page, 'about');
    await expect(page.locator('[data-setting="pro"]')).toHaveCount(0);
    await page.evaluate(() => window.__ui.show('screenHome'));
    await expect(page.locator('.library-banner')).toHaveCount(0);
  });

  test('once something can be bought: 300 free cards, the unlock strip, the Pro row and the paywall', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('dx_pro_force_sell', '1'); } catch (e) { /* ignore */ } });
    await openApp(page, '/?debug=1');
    await page.waitForFunction(() => window.__pro, null, { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => window.__pro.proLive()), { timeout: 8000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__cards.length), { timeout: 8000 }).toBe(300);
    await openSettingsSection(page, 'about');
    await expect(page.locator('[data-setting="pro"]')).toHaveCount(1);
    await page.evaluate(() => window.__ui.show('screenHome'));
    // the offline pack is Pro only: asking opens the paywall
    await openSettingsSection(page, 'data');
    const btn = page.locator('#offlinePackBtn');
    test.skip(!(await btn.count()), 'the offline pack row is not offered in this environment');
    await btn.click();
    await expect(page.locator('#proPaywall')).toBeVisible();
    await expect(page.locator('#proPaywall')).toContainText(/Dx Dash Pro/);
    await expect(page.locator('#proPaywall')).toContainText(/300 of/);
    await page.locator('#proPaywallClose').click();
    await expect(page.locator('#proPaywall')).toHaveCount(0);
    // Pro (the debug switch stands in for a purchase) opens every card and lifts the gate
    await page.evaluate(() => window.__pro.setProDebug(true));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dx:pro-changed')));
    await expect.poll(() => page.evaluate(() => window.__cards.length), { timeout: 8000 }).toBeGreaterThan(3000);
    expect(await page.evaluate(() => window.__pro.checkGate('offline_pack').allowed)).toBe(true);
  });
});
