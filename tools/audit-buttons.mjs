/* global localStorage, document, window, getComputedStyle */
// tools/audit-buttons.mjs — clicks every button on every screen and reports the ones that do nothing.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/audit-buttons.mjs [http://localhost:4190] [screenName]
//
// For each screen it opens the screen fresh, finds every clickable thing, clicks them one at a time
// (reloading between clicks so one click cannot affect the next) and compares the page before and after.
// "NO EFFECT" lines need a look: either the button is not wired, or its effect is invisible.
// It also reports JavaScript errors raised by a click.

import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:4190';
const only = process.argv[3] || '';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });

const SKIP_TEXT = /reset all progress|delete my account|delete account|sign out/i;

async function fresh(keepDaily) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { window.confirm = () => true; window.alert = () => {}; window.open = () => null; } catch { /* ignore */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text().slice(0, 160)); });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(base + '/?debug=1');
  for (let i = 0; i < 10; i++) {
    const n = page.locator('#tutSkipBtn');
    if (!(await n.isVisible().catch(() => false))) break;
    await n.click();
  }
  const dr = page.locator('#dailyReward button');
  await dr.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  for (let i = 0; !keepDaily && i < 3 && (await dr.isVisible().catch(() => false)); i++) { await dr.click(); await page.waitForTimeout(1300); }
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

const SCREENS = {
  home: async () => {},
  stats: async (p) => { await p.locator('[data-screen="screenStats"]').click(); },
  locker: async (p) => { await p.locator('[data-screen="screenShop"]').click(); await p.waitForTimeout(1500); },
  leaderboard: async (p) => { await p.locator('[data-screen="screenLeaderboard"]').click(); },
  'settings hub': async (p) => { await p.locator('[data-screen="screenSettings"]').click(); },
  'settings sound': async (p) => { await p.locator('[data-screen="screenSettings"]').click(); await p.locator('[data-section="sound"]').click(); },
  'settings look': async (p) => { await p.locator('[data-screen="screenSettings"]').click(); await p.locator('[data-section="look"]').click(); },
  'settings study': async (p) => { await p.locator('[data-screen="screenSettings"]').click(); await p.locator('[data-section="study"]').click(); },
  'settings rules': async (p) => { await p.locator('[data-screen="screenSettings"]').click(); await p.locator('[data-section="rules"]').click(); },
  'settings data': async (p) => { await p.locator('[data-screen="screenSettings"]').click(); await p.locator('[data-section="data"]').click(); },
  'settings about': async (p) => { await p.locator('[data-screen="screenSettings"]').click(); await p.locator('[data-section="about"]').click(); },
  quests: async (p) => { await p.locator('#questBtn').click(); },
  achievements: async (p) => { await p.locator('#profileBtn').click(); },
  'my cards': async (p) => { await p.locator('#myCardsBtn').click(); },
  multiplayer: async (p) => { await p.locator('#multiplayerBtn').click(); await p.waitForTimeout(800); },
  tutorial: async (p) => { await p.locator('[data-screen="screenSettings"]').click(); await p.locator('[data-section="about"]').click(); await p.locator('#settingsTutorialBtn').click(); },
  flashcards: async (p) => { await p.getByRole('button', { name: /Flashcards/ }).first().click(); },
  'card browser': async (p) => { await p.getByRole('button', { name: /Browse/ }).first().click(); },
  profile: async (p) => { await p.getByRole('button', { name: /Profile/ }).first().click(); },
  exam: async (p) => { await p.getByRole('button', { name: /Exam Sim/i }).first().click(); },
  'daily reward': async () => {},
  'post-run results': async (p) => {
    await p.locator('.btn-play').click();
    await p.waitForTimeout(6500);
    await p.evaluate(() => window.__game.endRun());
    await p.waitForTimeout(2500);
  },
  'continue prompt': async (p) => {
    await p.locator('.btn-play').click();
    await p.waitForTimeout(6500);
    await p.evaluate(() => window.__game._triggerDeath('ground'));
    await p.waitForTimeout(3500);
  },
  'pause menu': async (p) => {
    await p.locator('.btn-play').click();
    await p.waitForTimeout(6000);
    await p.locator('#pauseBtn').click();
    await p.waitForTimeout(500);
  }
};

/** Everything on the open screen that can be clicked (also below the fold), each tagged with data-audit. */
async function clickables(page) {
  return page.evaluate(() => {
    const sel = 'button, a[href], [role="button"], [role="switch"], [role="tab"], summary, select, input[type="checkbox"], input[type="range"], .nav-item, .mode-btn, .subject-chip, .settings-card, .shop-item .btn';
    // an open overlay hides everything under it, so only look inside it
    const overlay = [...document.querySelectorAll('[role="dialog"].active, .dr-overlay, .rk-result, .tutorial-overlay.active')].pop();
    const scope = overlay || document;
    const seen = new Set();
    const out = [];
    let n = 0;
    scope.querySelectorAll(sel).forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.disabled || cs.pointerEvents === 'none') return;
      if (!el.offsetParent && cs.position !== 'fixed') return;
      const screen = el.closest('.screen');
      if (screen && !screen.classList.contains('active')) return;
      const text = (el.getAttribute('aria-label') || el.textContent || el.value || el.getAttribute('data-screen') || el.id || '').trim().replace(/s+/g, ' ').slice(0, 40);
      const r = el.getBoundingClientRect();
      const key = (el.id || '') + '|' + text + '|' + Math.round(r.left) + ',' + Math.round(r.top + window.scrollY);
      if (seen.has(key)) return;
      seen.add(key);
      el.setAttribute('data-audit', String(n));
      out.push({ n, tag: el.tagName.toLowerCase(), id: el.id || '', text });
      n++;
    });
    return out;
  });
}

async function signature(page) {
  return page.evaluate(() => {
    const active = [...document.querySelectorAll('.screen.active, .active[role="dialog"], [role="dialog"].active, #dailyReward, #rankedResult')].map((e) => e.id || e.className).join(',');
    const html = document.body.innerHTML.replace(/style="[^"]*"/g, '').length;
    let ls = 0;
    try { ls = (localStorage.getItem('buzzword_dash_v1') || '').length; } catch { /* ignore */ }
    const playing = window.__game ? window.__game._state : '';
    return JSON.stringify({ active, html, ls, playing, theme: document.documentElement.getAttribute('data-world') });
  });
}

let totalNoEffect = 0;
let totalErrors = 0;
for (const [name, open] of Object.entries(SCREENS)) {
  if (only && name !== only) continue;
  const keep = name === 'daily reward';
  let list;
  {
    const { ctx, page } = await fresh(keep);
    await open(page);
    await page.waitForTimeout(600);
    list = await clickables(page);
    await ctx.close();
  }
  console.log('\n== ' + name + ': ' + list.length + ' clickable things');
  for (let i = 0; i < list.length; i++) {
    const target = list[i];
    if (SKIP_TEXT.test(target.text)) { console.log('   skipped: ' + target.text); continue; }
    const { ctx, page, errors } = await fresh(keep);
    try {
      await open(page);
      await page.waitForTimeout(600);
      const now = await clickables(page);
      const el = now.find((c) => c.tag === target.tag && c.id === target.id && c.text === target.text) || now[i];
      if (!el) { console.log('   ? could not find again: ' + target.tag + ' "' + target.text + '"'); continue; }
      const before = await signature(page);
      const handle = page.locator('[data-audit="' + el.n + '"]');
      await handle.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await handle.click({ timeout: 8000, force: false }).catch(async () => { await handle.click({ timeout: 4000, force: true }); });
      await page.waitForTimeout(700);
      const after = await signature(page);
      const bad = errors.filter((e) => !/Dropped|auto-fix/.test(e));
      const label = target.tag + (target.id ? '#' + target.id : '') + ' "' + target.text + '"';
      if (bad.length) { totalErrors++; console.log('   ERROR  ' + label + ' -> ' + bad[0]); }
      if (before === after) {
        // sliders, selects and text fields are changed by other means; report them separately
        totalNoEffect++;
        console.log('   NO EFFECT  ' + label);
      }
    } catch (e) {
      console.log('   ! ' + target.text + ': ' + e.message.split('\n')[0].slice(0, 100));
    } finally {
      await ctx.close();
    }
  }
}
console.log('\nDone. ' + totalNoEffect + ' with no visible effect, ' + totalErrors + ' with errors.');
await browser.close();
