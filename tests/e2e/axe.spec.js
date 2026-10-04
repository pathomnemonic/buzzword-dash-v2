// tests/e2e/axe.spec.js — automated accessibility audit (axe-core) of every screen and Home pop-up.
// Serious and critical findings fail the build; contrast findings are listed in the test output but only fail
// on the screens a player sees most (Home).
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { openApp } from './helpers.js';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const SCREENS = ['screenHome', 'screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings', 'screenMyCards', 'screenCardBrowser', 'screenFlashcard', 'screenExam', 'screenPostRun'];

async function audit(page) {
  await page.addScriptTag({ path: AXE }).catch(() => {});
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n')[1]) }));
  });
}

test.describe('axe accessibility audit', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for the audit');

  for (const id of SCREENS) {
    test(`${id} has no serious or critical issues apart from contrast`, async ({ page }) => {
      await openApp(page, '/?debug=1');
      await page.evaluate((s) => window.__ui.show(s), id);
      await page.waitForTimeout(500);
      const found = await audit(page);
      const hard = found.filter((f) => f.id !== 'color-contrast');
      const contrast = found.filter((f) => f.id === 'color-contrast');
      if (contrast.length) console.log(`${id} contrast: ${JSON.stringify(contrast[0].nodes)}`);
      expect(hard, JSON.stringify(hard, null, 1)).toEqual([]);
      if (id === 'screenHome') expect(contrast, JSON.stringify(contrast, null, 1)).toEqual([]);
    });
  }

  for (const sheet of ['#studyGoal', '#streakChip']) {
    test(`the Home pop-up opened by ${sheet} has no serious issues`, async ({ page }) => {
      await openApp(page, '/?debug=1');
      await page.locator(sheet).click();
      await page.waitForTimeout(400);
      const hard = (await audit(page)).filter((f) => f.id !== 'color-contrast');
      expect(hard, JSON.stringify(hard, null, 1)).toEqual([]);
    });
  }
});
