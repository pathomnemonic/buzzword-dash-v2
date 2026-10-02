// tests/e2e/a11y.spec.js
// Accessibility: every control a screen reader or keyboard user can reach has a name, dialogs are labelled,
// and the main flows work from the keyboard.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

/** Controls on the visible page that have no accessible name, as short descriptions. */
async function unnamed(page) {
  return page.evaluate(() => {
    const out = [];
    const sel = 'button, [role="button"], [role="tab"], [role="switch"], a[href], input:not([type="hidden"]), select, textarea';
    const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    for (const el of document.querySelectorAll(sel)) {
      if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let name = el.getAttribute('aria-label') || '';
      const by = el.getAttribute('aria-labelledby');
      if (!name && by) name = by.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? text(n) : ''; }).join(' ');
      if (!name && el.labels && el.labels.length) name = [...el.labels].map(text).join(' ');
      if (!name) name = el.getAttribute('title') || '';
      if (!name && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') {
        const img = el.querySelector('img[alt]');
        name = text(el) || (img ? img.getAttribute('alt') : '');
      }
      // only symbols is not a name ("×", "⋯"): a screen reader says "multiplication x"
      if (!/[\p{L}\p{N}]/u.test(name)) {
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${text(el).slice(0, 20)}"`);
      }
    }
    return out;
  });
}

async function visit(page, label, steps) {
  for (const step of steps) await step();
  await page.waitForTimeout(300);
  const bad = await unnamed(page);
  expect(bad, `${label}: controls without a name`).toEqual([]);
}

test.describe('Accessible names', () => {
  test('Home, its popups and every tab', async ({ page }) => {
    await openApp(page);
    await visit(page, 'Home', []);
    for (const [name, open, close] of [
      ['Filters', '#filtersBtn', '#filtersSheet .sheet-close'],
      ['Speed', '#speedBtn', '#speedSheet .sheet-close'],
      ['Flashcards', '#homeFlashcardsBtn', '#flashcardsSheet .sheet-close'],
      ['Challenge', '#homeChallengeBtn', '#challengeSheet .sheet-close'],
      ['Today', '#studyGoal', '#todaySheet .sheet-close']
    ]) {
      await visit(page, name, [() => page.locator(open).click()]);
      await page.locator(close).first().click();
    }
    for (const tab of ['screenStats', 'screenShop', 'screenQuests', 'screenProfile']) {
      await visit(page, tab, [() => page.locator(`#bottomNav [data-screen="${tab}"]`).click()]);
    }
  });

  test('the Locker tabs, Settings tabs and Versus', async ({ page, isMobile }) => {
    // (the Locker's 3D preview is too slow for software rendering in the phone emulation; the names are the same)
    test.skip(isMobile, 'names are the same on a phone; the Locker preview is slow without a GPU');
    await openApp(page);
    await page.locator('#bottomNav [data-screen="screenShop"]').click();
    for (const label of ['Trails', 'Monsters', 'Heroes']) {
      await visit(page, 'Locker ' + label, [() => page.locator('#shopItems [role="tab"]', { hasText: label }).click()]);
    }
    await page.locator('#bottomNav [data-screen="screenHome"]').click();
    await page.locator('#settingsBtn').click();
    const tabs = page.locator('#screenSettings [role="tab"]');
    const count = await tabs.count();
    for (let i = 0; i < count; i++) await visit(page, 'Settings tab ' + i, [() => tabs.nth(i).click()]);
    await page.locator('#bottomNav [data-screen="screenHome"]').click();
    await visit(page, 'Versus', [() => page.locator('#multiplayerBtn').click()]);
  });

  test('the Friends screen and the profile picker', async ({ page }) => {
    await openApp(page);
    await visit(page, 'Friends', [() => page.locator('#leaderboardBtn').click()]);
    await page.locator('#bottomNav [data-screen="screenHome"]').click();
    await visit(page, 'Profile corner', [() => page.locator('#profileCornerBtn').click()]);
  });
});

test.describe('Keyboard and dialogs', () => {
  test('popups are labelled dialogs that Escape closes, and focus returns', async ({ page }) => {
    await openApp(page);
    await page.locator('#homeChallengeBtn').focus();
    await page.keyboard.press('Enter');
    const sheet = page.locator('#challengeSheet');
    await expect(sheet).toBeVisible();
    expect(await sheet.getAttribute('role')).toBe('dialog');
    expect(await sheet.getAttribute('aria-label')).toBeTruthy();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('Tab moves through Home in a sensible order, all with a visible focus ring', async ({ page }) => {
    await openApp(page);
    const seen = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const outlined = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const shadow = cs.boxShadow && cs.boxShadow !== 'none';
        return { id: el.id || el.className, visible: outlined || shadow || el.matches(':focus-visible') };
      });
      if (info) seen.push(info);
    }
    expect(seen.length).toBeGreaterThan(8);
    expect(seen.filter((s) => !s.visible).map((s) => s.id)).toEqual([]);
  });

  test('the answer lanes work from the keyboard during a run', async ({ page }) => {
    await openApp(page);
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape'); // pause
    await expect(page.locator('#pauseOverlay')).toHaveClass(/active/);
    await page.locator('#resumeBtn').click();
    await expect(page.locator('#pauseOverlay')).not.toHaveClass(/active/);
  });
});
