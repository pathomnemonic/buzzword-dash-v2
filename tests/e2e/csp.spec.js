// tests/e2e/csp.spec.js
// The production page ships a Content-Security-Policy. With it enforced (the other specs bypass it), the game must
// still start, run, and open its screens without a single violation.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

test.use({ bypassCSP: false });

test('the page has a policy, and the game runs under it without violations', async ({ page }) => {
  const violations = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });
  });
  page.on('console', (m) => { if (/content security policy/i.test(m.text())) violations.push(m.text()); });
  await openApp(page);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).not.toContain("'unsafe-eval'");

  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
  await page.locator('.btn-play').click();
  await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
  await page.waitForTimeout(2500); // some seconds of running: 3D scene, audio, generated textures
  await page.locator('#pauseBtn').click();
  await page.locator('#endRunBtn').click();
  for (const id of ['#settingsBtn', '#leaderboardBtn']) {
    await page.locator('#bottomNav [data-screen="screenHome"]').click().catch(() => {});
    await page.locator(id).click();
    await page.waitForTimeout(500);
  }
  const blocked = await page.evaluate(() => window.__csp || []);
  expect(blocked).toEqual([]);
  expect(violations).toEqual([]);
});
