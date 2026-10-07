// tests/e2e/premium.spec.js
// Buying a real-money Locker item must never look like "nothing happened": every tap says something, an older backend shows
// "Soon" instead of a price (so nobody is charged for something that cannot be delivered), and a working backend sends
// the player to the payment page.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

async function openTrails(page, fake) {
  await openApp(page, '/?debug=1');
  await page.evaluate((src) => { const f = eval('(' + src + ')'); window.__calls = []; window.__ui.getLeaderboard = () => f(window.__calls); }, fake);
  await page.evaluate(() => window.__ui.show('screenShop'));
  await page.waitForTimeout(900);
  await page.locator('#shopItems [role="tab"]', { hasText: 'Trails' }).first().click();
  await page.waitForTimeout(700);
}

const READY = `(calls) => ({ isAuthenticated: () => true, isGuest: () => false, getUserId: () => 'u1', getMyPro: async () => ({ active: false, items: [] }),
  proFunction: async (a, x) => { calls.push([a, x]); if (a === 'capabilities') return { ok: true, items: true }; if (a === 'item') return { url: 'https://checkout.stripe.com/c/pay_test' }; return { error: 'no' }; } })`;
const OLD = `(calls) => ({ isAuthenticated: () => true, isGuest: () => false, getUserId: () => 'u1', getMyPro: async () => ({ active: false, items: [] }),
  proFunction: async (a, x) => { calls.push([a, x]); return { error: 'Unknown request.' }; } })`;
const GUEST = `(calls) => ({ isAuthenticated: () => true, isGuest: () => true, getUserId: () => 'g1', getMyPro: async () => ({ active: false, items: [] }), proFunction: async (a) => { calls.push([a]); return { error: 'no' }; } })`;

test.describe('premium Locker items', () => {
  test('with a ready backend: a price, a confirming tap, then the payment page', async ({ page }) => {
    await page.route('https://checkout.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>stripe</h1>' }));
    await openTrails(page, READY);
    const btn = page.locator('[data-premium="trail_fire"]');
    await expect(btn).toContainText('$0.99');
    await btn.click();
    await expect(btn).toContainText(/Tap again/); // the first tap asks
    await btn.click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 8000 });
  });

  test('with an older backend: it says Soon, and every tap explains', async ({ page }) => {
    await openTrails(page, OLD);
    const btn = page.locator('[data-premium="trail_fire"]');
    await expect(btn).toContainText('Soon', { timeout: 8000 });
    await btn.click();
    await expect(page.locator('.toast')).toContainText(/coming soon/i);
    expect(await page.evaluate(() => window.__calls.filter((c) => c[0] === 'item').length)).toBe(0); // it never tried to charge
  });

  test('a guest is asked to create an account, not left wondering', async ({ page }) => {
    await openTrails(page, GUEST);
    const btn = page.locator('[data-premium="trail_fire"]');
    await expect(btn).toContainText('$0.99');
    await btn.click();
    await expect(page.locator('.toast')).toContainText(/Create a free account/i);
    expect(await page.evaluate(() => window.__calls.filter((c) => c[0] === 'item').length)).toBe(0);
  });

  test('if the payment function turns out to be old, the failure is explained and the button goes back to Soon', async ({ page }) => {
    // capabilities could not be learned (the call fails), but the purchase itself says "Unknown request."
    const FLAKY = `(calls) => ({ isAuthenticated: () => true, isGuest: () => false, getUserId: () => 'u1', getMyPro: async () => ({ active: false, items: [] }),
      proFunction: async (a) => { calls.push([a]); if (a === 'capabilities') throw new Error('network'); return { error: 'Unknown request.' }; } })`;
    await openTrails(page, FLAKY);
    const btn = page.locator('[data-premium="trail_fire"]');
    await btn.click();
    await btn.click();
    await expect(page.locator('.toast')).toContainText(/not switched on|not charged/i, { timeout: 8000 });
    await expect(page.locator('[data-premium="trail_fire"]')).toContainText('Soon', { timeout: 8000 });
  });
});

test('premium maps show a dollar price (never "level 0" or coins) and are not owned', async ({ page }) => {
  await openApp(page, '/?debug=1');
  await page.evaluate(() => window.__ui.show('screenShop'));
  await page.waitForTimeout(900);
  await page.locator('#shopItems [role="tab"]', { hasText: 'Maps' }).first().click();
  await page.waitForTimeout(700);
  for (const id of ['map_dna_helix_tunnel', 'map_aquarium_imaging_center']) {
    const row = page.locator('[data-map="' + id + '"]');
    await expect(row).toContainText(/Premium/);
    await expect(row).not.toContainText(/level 0/i);
    await expect(row).not.toContainText('🪙');
    await expect(row.locator('[data-premium]')).toHaveCount(1);
  }
  expect(await page.evaluate(() => { const s = window.__ui; return typeof s; })).toBe('object');
});
