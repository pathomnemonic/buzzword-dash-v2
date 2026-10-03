// tests/e2e/layout.spec.js
// Things the beta-tester sweep (tools/beta.mjs) found: Home slid under the tab bar on a landscape phone, the Locker
// tabs overlapped their labels, and the daily reward could pop up on top of a run.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('on a landscape phone every Home button sits above the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 360 });
  await openApp(page, '/?debug=1');
  const gap = await page.evaluate(() => {
    const nav = document.getElementById('bottomNav').getBoundingClientRect().top;
    return ['#homeChallengeBtn', '#homeFlashcardsBtn', '#multiplayerBtn', '.btn-play'].map((s) => nav - document.querySelector(s).getBoundingClientRect().bottom);
  });
  gap.forEach((g) => expect(g).toBeGreaterThanOrEqual(-1));
});

test('Home still fits at 200% zoom (195px wide)', async ({ page }) => {
  await page.setViewportSize({ width: 195, height: 390 });
  await openApp(page, '/?debug=1');
  const off = await page.evaluate(() => ['#homeChallengeBtn', '#multiplayerBtn', '#leaderboardBtn'].filter((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left < -1 || r.right > window.innerWidth + 1; }));
  expect(off).toEqual([]);
});

test('the four Locker tabs each show their icon above their label', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openApp(page, '/?debug=1');
  await page.evaluate(() => window.__ui.show('screenShop'));
  const tabs = page.locator('#shopItems [role="tab"]');
  await expect(tabs).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const t = await tabs.nth(i).evaluate((el) => { const icon = el.querySelector('.tab-icon').getBoundingClientRect(); const label = el.getBoundingClientRect(); return { stacked: getComputedStyle(el).flexDirection === 'column', iconInside: icon.left >= label.left - 1 && icon.right <= label.right + 1 }; });
    expect(t.stacked).toBe(true);
    expect(t.iconInside).toBe(true);
  }
});

for (const [w, h] of [[320, 568], [360, 640], [375, 667], [390, 780], [412, 915]]) {
  test(`the Stats page fits without scrolling at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openApp(page, '/?debug=1');
    await page.evaluate(() => window.__ui.show('screenStats'));
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => { const sc = document.querySelector('#screenStats .screen-scroll'); return sc.scrollHeight - sc.clientHeight; });
    expect(over).toBeLessThanOrEqual(1);
  });
}

for (const [w, h] of [[320, 568], [360, 640], [390, 780], [412, 915]]) {
  test(`Profile and the folded Locker each fit on one screen at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openApp(page, '/?debug=1');
    for (const s of ['screenProfile', 'screenShop']) {
      await page.evaluate((id) => window.__ui.show(id), s);
      await page.waitForTimeout(700);
      const over = await page.evaluate((id) => { const sc = document.querySelector('#' + id + ' .screen-scroll'); return sc.scrollHeight - sc.clientHeight; }, s);
      expect(over, s).toBeLessThanOrEqual(1);
    }
  });
}

test('Profile has one place to create an account, folded until wanted', async ({ page }) => {
  await openApp(page, '/?debug=1');
  await page.evaluate(() => window.__ui.show('screenProfile'));
  await expect(page.locator('#profileAccountBox')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: /create account/i })).toHaveCount(0);
});

test('the Locker opens folded, a tab opens its list, and tapping it again folds it', async ({ page }) => {
  await openApp(page, '/?debug=1');
  await page.evaluate(() => window.__ui.show('screenShop'));
  await expect(page.locator('#shopItems .shop-item')).toHaveCount(0);
  await page.locator('#shopItems [role="tab"]').nth(1).click();
  expect(await page.locator('#shopItems .shop-item').count()).toBeGreaterThan(3);
  await page.locator('#shopItems [role="tab"]').nth(1).click();
  await expect(page.locator('#shopItems .shop-item')).toHaveCount(0);
});
