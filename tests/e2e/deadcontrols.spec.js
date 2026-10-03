// tests/e2e/deadcontrols.spec.js
// "Dead control" crawler: on every main screen, click every visible control and fail if clicking it does
// NOTHING you could see (no screen change, no popup, no toast, no change to the page, not disabled afterwards).
// This is the bug where Performance > Weakest topics showed an arrow as if it would open something, then did nothing.

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// Things we must not click blindly (they wipe data, sign out, leave the page, or start a run), or that
// intentionally do nothing visible on their own.
const SKIP = /^go\b|daily 15|weekly gauntlet|friend challenge|exam sim|hide this|reminder|reset|delete|erase|wipe|sign ?out|log ?out|remove|play|start|begin|retry|leave|block|report|buy|\u{1FA99}|export|download|share|copy|file|upload|support|tip|review|rate|privacy|terms|license|open .*(page|site|link)|import|restore/iu;

const SCREENS = [
  ['screenStats', 'Stats'],
  ['screenShop', 'Locker'],
  ['screenQuests', 'Quests'],
  ['screenProfile', 'Profile'],
  ['screenSettings', 'Settings'],
  ['screenMyCards', 'My Cards'],
  ['screenCardBrowser', 'Card browser'],
  ['screenHome', 'Home']
];

async function show(page, screenId) {
  await page.evaluate((id) => window.__ui.show(id), screenId);
  await page.waitForTimeout(900); // the screen slides in; under load that takes a while, and a moving control cannot be clicked
}

/** Describe each visible clickable control on the screen, in a stable order. */
async function controls(page, screenId) {
  return page.evaluate((id) => {
    const root = document.getElementById(id);
    const out = [];
    const sel = 'button, summary, [role="button"], [role="switch"], [role="tab"], a[href], .clickable, [tabindex="0"]';
    for (const el of root.querySelectorAll(sel)) {
      if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      out.push({ text: ((el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 40), tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40) });
    }
    return out;
  }, screenId);
}

test.describe('no dead controls', () => {
  for (const [screenId, label] of SCREENS) {
    test(label + ': every control does something', async ({ page }) => {
      test.setTimeout(240000);
      await openApp(page, '/?debug=1');
      await page.waitForFunction(() => window.__ui);
      await show(page, screenId);
      const list = await controls(page, screenId);
      const dead = [];
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); }); // a prompt or confirm is a visible reaction
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (SKIP.test(c.text)) continue;
        await show(page, screenId);
        // start from a clean slate: folded sections closed (they remember being open, which would hide a click's effect)
        await page.evaluate(() => document.querySelectorAll('details[open]').forEach((d) => { d.open = false; }));
        await page.waitForTimeout(100);
        dialogs = 0;
        const live = await controls(page, screenId);
        if (!live[i] || live[i].text !== c.text) continue; // the page re-rendered differently; skip rather than guess
        const handle = (await page.evaluateHandle(({ id, idx }) => {
          const root = document.getElementById(id);
          const els = [...root.querySelectorAll('button, summary, [role="button"], [role="switch"], [role="tab"], a[href], .clickable, [tabindex="0"]')].filter((el) => {
            if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return false;
            return !(el.disabled || el.getAttribute('aria-disabled') === 'true');
          });
          return els[idx];
        }, { id: screenId, idx: i })).asElement();
        if (!handle) continue;
        const before = await page.evaluate(() => {
          window.__mut = 0;
          window.__obs && window.__obs.disconnect();
          window.__obs = new MutationObserver((m) => { window.__mut += m.length; });
          window.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
          return { screen: document.body.getAttribute('data-screen'), href: location.href, open: document.querySelectorAll('details[open]').length };
        });
        await handle.scrollIntoViewIfNeeded().catch(() => {});
        let clickError = '';
        await handle.click({ timeout: 8000, trial: false }).catch((e) => { clickError = String(e.message).split('\n')[0]; });
        await page.waitForTimeout(450);
        const after = await page.evaluate(() => ({ mut: window.__mut, screen: document.body.getAttribute('data-screen'), href: location.href, open: document.querySelectorAll('details[open]').length }));
        const changed = dialogs > 0 || after.mut > 0 || after.screen !== before.screen || after.href !== before.href || after.open !== before.open;
        if (!changed) dead.push(`${c.tag} "${c.text}" (${c.cls})${clickError ? ' CLICK FAILED: ' + clickError : ''}`);
        await page.keyboard.press('Escape').catch(() => {});
      }
      expect(dead, label + ': controls that did nothing').toEqual([]);
    });
  }
});


// The Home pop-ups (filters, speed, challenge, flashcards, today) are not screens, so they get their own pass.
const SHEETS = ['filtersSheet', 'speedSheet', 'challengeSheet', 'flashcardsSheet', 'todaySheet'];

test.describe('no dead controls in the Home pop-ups', () => {
  for (const sheet of SHEETS) {
    test(sheet + ': every control does something', async ({ page }) => {
      test.setTimeout(120000);
      await openApp(page, '/?debug=1');
      await page.waitForFunction(() => window.__ui);
      const names = await (async () => {
        await page.evaluate((id) => window.__ui.openSheet(id), sheet);
        await page.waitForTimeout(400);
        return controls(page, sheet);
      })();
      const dead = [];
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); });
      for (let i = 0; i < names.length; i++) {
        const c = names[i];
        if (SKIP.test(c.text) || /close|\u00D7|back|got it|ok$/i.test(c.text)) continue;
        await page.evaluate((id) => window.__ui.openSheet(id), sheet);
        await page.waitForTimeout(300);
        dialogs = 0;
        const handle = (await page.evaluateHandle(({ id, idx }) => {
          const root = document.getElementById(id);
          const els = [...root.querySelectorAll('button, summary, [role="button"], [role="switch"], [role="tab"], a[href], .clickable, [tabindex="0"]')].filter((el) => {
            if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return false;
            return !(el.disabled || el.getAttribute('aria-disabled') === 'true');
          });
          return els[idx];
        }, { id: sheet, idx: i })).asElement();
        if (!handle) continue;
        await page.evaluate(() => {
          window.__mut = 0;
          window.__obs && window.__obs.disconnect();
          window.__obs = new MutationObserver((m) => { window.__mut += m.length; });
          window.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        });
        const before = await page.evaluate((id) => document.getElementById(id).className, sheet);
        let err = '';
        await handle.click({ timeout: 4000 }).catch((e) => { err = String(e.message).split('\n')[0]; });
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({ mut: window.__mut }));
        if (!(dialogs > 0 || after.mut > 0)) dead.push(`${c.tag} "${c.text}"${err ? ' CLICK FAILED: ' + err : ''} (was ${before})`);
        await page.keyboard.press('Escape').catch(() => {});
      }
      expect(dead, sheet + ': controls that did nothing').toEqual([]);
    });
  }
});


// Every settings section (Sound, Look, Study, Rules, Data, About) is a page of its own.
const SECTIONS = ['sound', 'look', 'study', 'rules', 'data', 'about'];

test.describe('no dead controls in the settings sections', () => {
  for (const section of SECTIONS) {
    test('settings > ' + section + ': every control does something', async ({ page }) => {
      test.setTimeout(150000);
      await openApp(page, '/?debug=1');
      await page.waitForFunction(() => window.__ui);
      const open = async () => {
        await page.evaluate((id) => { window.__ui.show('screenSettings'); window.__ui._settingsSection = id; window.__ui.renderSettings(); }, section);
        await page.waitForTimeout(700);
      };
      await open();
      const list = await controls(page, 'screenSettings');
      const dead = [];
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); });
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (SKIP.test(c.text) || /^back|\u2190/i.test(c.text)) continue;
        await open();
        dialogs = 0;
        const handle = (await page.evaluateHandle(({ idx }) => {
          const root = document.getElementById('screenSettings');
          const els = [...root.querySelectorAll('button, summary, [role="button"], [role="switch"], [role="tab"], a[href], .clickable, [tabindex="0"]')].filter((el) => {
            if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
            const r = el.getBoundingClientRect();
            return r.width >= 4 && r.height >= 4 && !el.disabled;
          });
          return els[idx];
        }, { idx: i })).asElement();
        if (!handle) continue;
        await page.evaluate(() => {
          window.__mut = 0;
          window.__obs && window.__obs.disconnect();
          window.__obs = new MutationObserver((m) => { window.__mut += m.length; });
          window.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        });
        let err = '';
        await handle.click({ timeout: 8000 }).catch((e) => { err = String(e.message).split('\n')[0]; });
        await page.waitForTimeout(450);
        const mut = await page.evaluate(() => window.__mut);
        if (!(dialogs > 0 || mut > 0)) dead.push(`${c.tag} "${c.text}"${err ? ' CLICK FAILED: ' + err : ''}`);
        await page.keyboard.press('Escape').catch(() => {});
      }
      expect(dead, 'settings ' + section + ': controls that did nothing').toEqual([]);
    });
  }
});
