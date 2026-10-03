// tests/e2e/consoleclean.spec.js
// A tour of the whole game that fails on ANY uncaught error or console error. Many bugs announce themselves in the
// console long before anyone sees them (a missing element, an undefined call in a rarely used branch).

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

const NOISE = /GPU stall|swiftshader|WebGL: INVALID|GroupMarkerNotSet|Failed to load resource.*(supabase|peerjs|fonts)|net::ERR|the server responded with a status of (404|401|403)|\[vite\]/i;

test.describe('console stays clean', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'runner needs WebGL (verified in Chromium)');

  test('visiting every screen, tab, pop-up and a short run raises no errors', async ({ page }) => {
    test.setTimeout(240000);
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) problems.push('console.error: ' + m.text().slice(0, 200)); });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));

    await openApp(page, '/?debug=1');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.waitForFunction(() => window.__ui && window.__storage);
    const ui = (fn, arg) => page.evaluate(fn, arg);
    const settle = (ms = 500) => page.waitForTimeout(ms);

    for (const id of ['screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings', 'screenMyCards', 'screenCardBrowser', 'screenFlashcard', 'screenExam', 'screenHome']) {
      await ui((s) => window.__ui.show(s), id);
      await settle(700);
    }
    for (const section of ['sound', 'look', 'study', 'rules', 'data', 'about']) {
      await ui((id) => { window.__ui.show('screenSettings'); window.__ui._settingsSection = id; window.__ui.renderSettings(); }, section);
      await settle();
    }
    await ui(() => window.__ui.show('screenShop'));
    for (const tab of ['Heroes', 'Trails', 'Maps', 'Monsters']) {
      await page.locator('.locker-tab', { hasText: tab }).click();
      await settle(900);
      const eye = page.locator('#shopItems [aria-label^="Preview"]').first();
      if (await eye.count()) { await eye.click(); await settle(900); }
    }
    for (const sheet of ['filtersSheet', 'speedSheet', 'challengeSheet', 'flashcardsSheet', 'todaySheet']) {
      await ui((id) => window.__ui.openSheet(id), sheet);
      await settle(400);
      await page.keyboard.press('Escape');
    }

    // a short run: random keys, pause and resume, then home
    await ui(() => window.__ui.show('screenHome'));
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 30000 });
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'][i % 5]);
      await settle(250);
      if (i === 10) { await page.keyboard.press('Escape'); await settle(300); await page.keyboard.press('Escape'); }
    }
    expect(problems).toEqual([]);
  });
});
