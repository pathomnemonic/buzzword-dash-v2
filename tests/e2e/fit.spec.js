// tests/e2e/fit.spec.js
// Guards the layout against the things that kept slipping past: a screen that suddenly needs scrolling, a line that
// disappears on a short phone, the question growing down over the player, and a screen that jumps or resizes when a
// menu is opened. Every check runs on a spread of phone sizes, so a change to a font, a padding or a string cannot
// quietly break one of them.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

// width x height of real phones' browser windows, smallest first
const PHONES = [[320, 568], [360, 600], [360, 640], [375, 667], [390, 780], [412, 915]];
const TAB_SCREENS = ['screenStats', 'screenQuests', 'screenShop', 'screenProfile'];

async function open(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await openApp(page, '/?debug=1');
  await page.waitForTimeout(500);
}

/** Interactive things that stick out of the window sideways, or whose own text is cut off. */
async function layoutProblems(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
    const insideScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').forEach((el) => {
      if (!visible(el) || el.closest('[hidden], .screen:not(.active)')) return;
      const r = el.getBoundingClientRect();
      const name = (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 24) + '"';
      if ((r.left < -1 || r.right > vw + 1) && !insideScroller(el)) bad.push('sticks out sideways: ' + name);
      const cs = getComputedStyle(el);
      if (el.tagName === 'BUTTON' && (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 2) bad.push('text cut off: ' + name);
    });
    if (document.documentElement.scrollWidth > vw + 1) bad.push('the page scrolls sideways');
    return bad;
  });
}

for (const [w, h] of PHONES) {
  test(`Home at ${w}x${h}: nothing hidden, nothing under the tab bar, bonus subject and Go Pro visible`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('dx_pro_force_sell', '1'); } catch (e) { /* no storage */ } });
    await open(page, w, h);
    await page.evaluate(() => window.__ui.show('screenHome'));
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, shown: b.height > 0 && getComputedStyle(e).display !== 'none' }; };
      return { nav: document.getElementById('bottomNav').getBoundingClientRect().top, bonus: box('.home-header .home-tagline'), banner: box('#homeProBanner'), play: box('.btn-play'), modes: box('.mode-row'), howTo: box('#howToPlayBtn'), topbar: box('.home-topbar') };
    });
    expect(r.bonus && r.bonus.shown, 'the "Bonus today" line must show at every size').toBe(true);
    expect(r.banner && r.banner.shown, 'the Go Pro button must show').toBe(true);
    for (const k of ['play', 'modes', 'howTo']) expect(r[k].bottom, k + ' must end clear of the tab bar (not touching it)').toBeLessThanOrEqual(r.nav - 10);
    // the pieces are in order and do not overlap
    expect(r.banner.bottom).toBeLessThanOrEqual(r.play.top + 2);
    expect(r.bonus.bottom).toBeLessThanOrEqual(r.banner.top + 2);
    expect(r.topbar.top).toBeGreaterThanOrEqual(0);
    expect(await layoutProblems(page)).toEqual([]);
  });

  test(`the one-page screens fit without scrolling at ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    for (const s of TAB_SCREENS) {
      await page.evaluate((id) => window.__ui.show(id), s);
      await page.waitForTimeout(700);
      const over = await page.evaluate((id) => { const sc = document.querySelector('#' + id + ' .screen-scroll'); return sc.scrollHeight - sc.clientHeight; }, s);
      expect(over, s + ' must not need scrolling').toBeLessThanOrEqual(1);
      expect(await layoutProblems(page), s).toEqual([]);
    }
  });

  test(`every Home pop-up fits the window at ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    for (const sheet of ['challengeSheet', 'flashcardsSheet', 'filtersSheet', 'speedSheet', 'todaySheet', 'streakSheet']) {
      await page.evaluate((id) => window.__ui.openSheet(id), sheet);
      await page.waitForTimeout(400);
      const r = await page.evaluate((id) => {
        const card = document.querySelector('#' + id + ' .sheet-card'); const b = card.getBoundingClientRect(); const cs = getComputedStyle(card);
        return { top: b.top, bottom: b.bottom, scrolls: cs.overflowY === 'auto' || cs.overflowY === 'scroll', closeShown: (() => { const c = document.querySelector('#' + id + ' .sheet-close'); if (!c) return true; const cb = c.getBoundingClientRect(); return cb.bottom <= innerHeight + 1 && cb.top >= 0; })() };
      }, sheet);
      expect(r.top, sheet).toBeGreaterThanOrEqual(-1);
      expect(r.bottom <= h + 1 || r.scrolls, sheet + ' must fit or scroll inside itself').toBe(true);
      if (sheet === 'challengeSheet' || sheet === 'flashcardsSheet') {
        const over = await page.evaluate((id) => { const c = document.querySelector('#' + id + ' .sheet-card'); return c.scrollHeight - c.clientHeight; }, sheet);
        expect(over, sheet + ': every mode must be visible at once, with no scrolling').toBeLessThanOrEqual(1);
      }
      expect(await layoutProblems(page), sheet).toEqual([]);
      await page.evaluate(() => window.__ui.closeSheets());
    }
  });
}

// Larger text (Android's font size setting) and a phone's bottom safe area make the tab bar taller and the buttons bigger.
// Home must still keep its bottom buttons clear of the tab bar.
for (const [w, h, scale, safe] of [[360, 640, 1.15, 0], [360, 640, 1.3, 0], [360, 600, 1.3, 0], [390, 780, 1.3, 34], [390, 844, 1, 34], [320, 568, 1.15, 0]]) {
  test(`Home keeps clear of the tab bar at ${w}x${h} with ${Math.round(scale * 100)}% text and a ${safe}px bottom inset`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('dx_pro_force_sell', '1'); } catch (e) { /* no storage */ } });
    await open(page, w, h);
    await page.evaluate(([k, inset]) => {
      document.documentElement.style.setProperty('--safe-bottom', inset + 'px');
      const els = [...document.body.querySelectorAll('*')];
      const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
      els.forEach((e, i) => { e.style.fontSize = sizes[i] * k + 'px'; });
    }, [scale, safe]);
    await page.evaluate(() => window.__ui.show('screenHome'));
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const nav = document.getElementById('bottomNav').getBoundingClientRect().top; const g = (s) => nav - document.querySelector(s).getBoundingClientRect().bottom; return { modes: g('.mode-row'), howTo: g('#howToPlayBtn'), play: g('.btn-play') }; });
    for (const k of ['modes', 'howTo', 'play']) expect(r[k], k + ' must clear the tab bar').toBeGreaterThanOrEqual(10);
  });
}

// ───────── the question must never come down over the player ─────────
// The player's head is about 57% of the way down the window. The question, the answers and the explanation must end
// above half of it, with the longest real card (a 260-character clue, 61-character answers, a 249-character
// explanation) and then something longer than any card.
for (const [w, h] of PHONES) {
  test(`the question, answers and explanation stay above the player at ${w}x${h}`, async ({ page }) => {
    test.slow();
    await open(page, w, h);
    test.skip(!(await hasWebGL(page)), 'the runner needs WebGL');
    await page.locator('.btn-play').click({ timeout: 30000 });
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
    const words = 'Hemorrhagic transformation • Beta-hydroxybutyrate • Thrombocytopenia with schistocytes • Anticholinesterase poisoning • ';
    const results = await page.evaluate(async (words) => {
      const g = window.__game;
      g.camera.updateMatrixWorld();
      const v = g.playerGroup.position.clone(); v.y += 2.2; v.project(g.camera);
      const head = (1 - v.y) / 2 * innerHeight;
      const lowest = () => {
        let b = 0; const parts = {};
        for (const id of ['buzzBox', 'answerRow', 'feedbackEl', 'teachEl']) { const el = document.getElementById(id); if (!el || !el.getClientRects().length || ((id === 'feedbackEl' || id === 'teachEl') && !el.textContent)) continue; const bb = el.getBoundingClientRect().bottom; parts[id] = Math.round(bb); b = Math.max(b, bb); }
        return { b, parts };
      };
      const cases = [
        { name: 'longest real card', bw: [words.repeat(2).slice(0, 260)], answers: ['A'.repeat(1).concat('nticholinesterase poisoning from organophosphate exposure'.padEnd(60, 'x')).slice(0, 61), 'Beta-hydroxybutyrate accumulation in diabetic ketoacidosis', 'Thrombocytopenia with schistocytes on the smear'], teach: 'T'.repeat(1) + 'he teaching point explains the mechanism in full and then the exam trap. '.repeat(4).slice(0, 248) },
        { name: 'longer than any card', bw: [words.repeat(3).slice(0, 340)], answers: ['Q'.repeat(85), 'R'.repeat(85), 'S'.repeat(85)], teach: 'U'.repeat(1) + 'ntil the explanation is much longer than any real one. '.repeat(8).slice(0, 400) }
      ];
      const out = [];
      const tb = document.getElementById('teachEl');
      for (const c of cases) {
        // 1) the question with its three answers
        tb.textContent = ''; tb.classList.remove('show');
        window.__ui.showBuzzwords({ id: 'x', bw: c.bw });
        window.__ui.showAnswerChoices(c.answers.map((label) => ({ label })));
        await new Promise((r) => setTimeout(r, 100));
        let l = lowest();
        out.push({ name: c.name + ' (question and answers)', head: Math.round(head), bottom: Math.round(l.b), parts: l.parts, clueFont: getComputedStyle(document.getElementById('buzzText')).fontSize });
        // 2) after the answer: the answers are cleared and the explanation shows under the clue
        window.__ui.hideAnswerChoices();
        tb.textContent = c.teach; tb.classList.add('show');
        window.__ui.fitQuestionHud();
        await new Promise((r) => setTimeout(r, 100));
        l = lowest();
        out.push({ name: c.name + ' (explanation)', head: Math.round(head), bottom: Math.round(l.b), parts: l.parts, clueFont: getComputedStyle(document.getElementById('buzzText')).fontSize });
      }
      return out;
    }, words);
    for (const r of results) {
      expect(r.bottom, `${r.name}: the question block must end above the player's head (${JSON.stringify(r.parts)}, head at ${r.head})`).toBeLessThanOrEqual(r.head - 6);
      expect(parseFloat(r.clueFont), `${r.name}: the clue must stay readable`).toBeGreaterThanOrEqual(10);
    }
  });
}

// ───────── opening a menu must not make the screen jump or resize ─────────
for (const [w, h] of [[360, 640], [390, 780]]) {
  test(`opening a folded section does not move or resize the screen at ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    const snap = (screen) => page.evaluate((id) => {
      const wrap = document.querySelector('#' + id + ' .fit-zoom');
      const first = document.querySelector('#' + id + ' .screen-scroll h2, #' + id + ' .screen-scroll .perf-hero');
      return { zoom: wrap ? wrap.style.zoom : '', top: first ? Math.round(first.getBoundingClientRect().top) : 0, height: first ? Math.round(first.getBoundingClientRect().height) : 0, width: first ? Math.round(first.getBoundingClientRect().width) : 0 };
    }, screen);
    for (const [screen, summary] of [['screenStats', '#screenStats .perf-summary'], ['screenProfile', '#screenProfile .profile-fold-sum']]) {
      await page.evaluate((id) => window.__ui.show(id), screen);
      await page.waitForTimeout(800);
      const before = await snap(screen);
      const n = await page.locator(summary).count();
      for (let i = 0; i < Math.min(n, 5); i++) {
        await page.locator(summary).nth(i).click();
        await page.waitForTimeout(450);
        const during = await snap(screen);
        expect(during, `${screen}: opening section ${i} must not change the zoom or move the top of the page`).toEqual(before);
        await page.locator(summary).nth(i).click();
        await page.waitForTimeout(450);
        expect(await snap(screen), `${screen}: closing section ${i} must put it back exactly`).toEqual(before);
      }
    }
  });
}

test('opening a Locker tab does not change the size of the page', async ({ page }) => {
  await open(page, 360, 640);
  await page.evaluate(() => window.__ui.show('screenShop'));
  await page.waitForTimeout(800);
  const zoom = () => page.evaluate(() => { const w = document.querySelector('#screenShop .fit-zoom'); return w ? w.style.zoom : ''; });
  const before = await zoom();
  const tabs = page.locator('#shopItems [role="tab"]');
  for (let i = 0; i < 4; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(400);
    // a tab's list is long: the page may scroll, but it must keep the size it had
    expect(await zoom(), 'tab ' + i).toBe(before);
    await tabs.nth(i).click();
    await page.waitForTimeout(300);
  }
});

// ───────── text must be readable ─────────
test('badge names are readable, earned or not', async ({ page }) => {
  await open(page, 360, 640);
  await page.evaluate(() => window.__ui.show('screenProfile'));
  await page.waitForTimeout(800);
  await page.locator('#screenProfile summary', { hasText: 'Badges' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('details.badge-group > summary').first().click();
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => [...document.querySelectorAll('.profile-badge-list .achievement-item')].map((item) => {
    const n = item.querySelector('.achievement-name');
    let op = 1; for (let e = n; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    return { text: n.textContent, op, fs: parseFloat(getComputedStyle(n).fontSize), shown: n.getBoundingClientRect().height > 0 };
  }));
  expect(r.length).toBeGreaterThan(3);
  for (const b of r) { expect(b.shown, b.text).toBe(true); expect(b.op, b.text + ' is too faint').toBeGreaterThanOrEqual(0.85); expect(b.fs, b.text).toBeGreaterThanOrEqual(10); }
});
