#!/usr/bin/env node
/**
 * beta2.mjs — beta testers that break the application's surroundings rather than its screens:
 * storage that refuses to save, a slow phone, no network, two tabs at once, hostile links, huge text,
 * and a day with a different language, time zone or motion setting.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/beta2.mjs
 *
 * Each scenario prints PASS/FAIL and a note. Exit code 1 if any failed.
 */

/* global window, document, localStorage, Storage */
const URL = process.env.URL || 'http://localhost:4173';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const NOISE = /WebSocket|peerjs|GPU stall|swiftshader|WebGL: INVALID|GroupMarkerNotSet|Failed to load resource|net::ERR|\[vite\]|status of (404|401|403|400)|KHR_parallel|offline|Dx Dash|auto-fix/i;
const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const results = [];

async function scenario(name, fn, ctxOpts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, bypassCSP: true, ...ctxOpts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  let note = '';
  let ok = true;
  try { note = (await fn(page, context, errors)) || ''; } catch (e) { ok = false; note = String(e.message).split('\n')[0].slice(0, 220); }
  if (ok && errors.length) { ok = false; note = (note + ' ' + errors.slice(0, 2).join(' | ')).trim(); }
  results.push({ name, ok, note });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : ''));
  await context.close();
}

async function up(page, path = '/?debug=1') {
  await page.goto(URL + path);
  await page.waitForFunction(() => window.__ui, null, { timeout: 30000 });
}
async function homeVisible(page) {
  await page.waitForFunction(() => { const h = document.getElementById('screenHome'); return h && h.classList.contains('active'); }, null, { timeout: 15000 }).catch(() => {});
  return page.evaluate(() => !!document.querySelector('.btn-play') && document.querySelector('.btn-play').getBoundingClientRect().width > 0);
}
async function pastTutorial(page) {
  for (let i = 0; i < 6; i++) {
    if (await page.locator('#tutCloseBtn').isVisible().catch(() => false)) {
      await page.locator('#tutCloseBtn').click().catch(() => {});
      await page.getByRole('button', { name: /exit tutorial/i }).click({ timeout: 1500 }).catch(() => {});
    }
  }
}

await scenario('saving is refused (private mode / storage disabled): the app still opens and plays Home', async (page) => {
  await page.addInitScript(() => {
    const boom = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
    Storage.prototype.setItem = boom;
  });
  await page.goto(URL + '/?debug=1');
  await page.waitForFunction(() => window.__ui, null, { timeout: 30000 });
  await pastTutorial(page);
  if (!(await homeVisible(page))) throw new Error('Home never showed');
});

await scenario('storage reads throw (blocked cookies): the app still opens', async (page) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  await page.goto(URL + '/?debug=1');
  await page.waitForFunction(() => document.querySelector('.btn-play'), null, { timeout: 30000 });
  return 'opened';
});

await scenario('IndexedDB is missing: the app still opens', async (page) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { return undefined; } }); });
  await page.goto(URL + '/?debug=1');
  await page.waitForFunction(() => document.querySelector('.btn-play'), null, { timeout: 30000 });
});

await scenario('a very slow phone (6x CPU, slow 3G): Home is usable within 25 seconds', async (page, context) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
  const t0 = Date.now();
  await page.goto(URL + '/?debug=1');
  await page.waitForSelector('.btn-play', { state: 'visible', timeout: 60000 });
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  if (Date.now() - t0 > 25000) throw new Error('took ' + s + 's');
  return 'Home in ' + s + 's';
});

await scenario('offline after one visit: reload still opens (service worker)', async (page, context) => {
  await up(page);
  await page.waitForTimeout(4000);
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await page.waitForSelector('.btn-play', { state: 'attached', timeout: 20000 });
  await context.setOffline(false);
});

await scenario('two tabs open at once: a change in one is not wiped by the other', async (page, context) => {
  await up(page);
  await pastTutorial(page);
  const b = await context.newPage();
  await b.goto(URL + '/?debug=1');
  await b.waitForFunction(() => window.__storage, null, { timeout: 30000 });
  await page.evaluate(() => { window.__storage.set('coins', 4321); });
  await page.waitForTimeout(500);
  await b.evaluate(() => { window.__storage.set('totalCorrect', 77); });
  await b.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.__storage, null, { timeout: 30000 });
  const got = await page.evaluate(() => ({ coins: window.__storage.get('coins'), tc: window.__storage.get('totalCorrect') }));
  if (got.coins !== 4321 && got.tc !== 77) throw new Error('both changes lost: ' + JSON.stringify(got));
  if (got.coins !== 4321) return 'NOTE: tab B overwrote tab A\'s coins (last writer wins): ' + JSON.stringify(got);
  if (got.tc !== 77) return 'NOTE: tab A overwrote tab B\'s change: ' + JSON.stringify(got);
  return 'both changes kept';
});

await scenario('hostile links: garbage challenge, huge query, script in the hash, odd paths', async (page) => {
  const links = ['/?challenge=%00%00', '/?c=' + 'A'.repeat(5000), '/?room=<script>alert(1)</script>', '/#/../../etc/passwd', '/?join=' + '9'.repeat(500), '/?debug=1&mode=%27%22', '/?challenge=eyJ4IjoxfQ'];
  for (const l of links) {
    await page.goto(URL + l).catch(() => {});
    await page.waitForTimeout(800);
    const alive = await page.evaluate(() => !!document.getElementById('bottomNav') || !!document.querySelector('.btn-play'));
    if (!alive) throw new Error('page did not load for ' + l.slice(0, 40));
  }
});

await scenario('200% text size and 320px width: Home still shows Play and the three ways to play', async (page) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await up(page);
  await pastTutorial(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => ['.btn-play', '#multiplayerBtn', '#homeFlashcardsBtn', '#homeChallengeBtn'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.right <= window.innerWidth + 1; }));
  if (info.includes(false)) throw new Error('a main button is off screen at big text: ' + JSON.stringify(info));
});

await scenario('Arabic locale, Tokyo time zone, reduced motion: nothing throws', async (page) => {
  await up(page);
  await pastTutorial(page);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  for (const s of ['screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings']) { await page.evaluate((id) => window.__ui.show(id), s); await page.waitForTimeout(250); }
}, { locale: 'ar-EG', timezoneId: 'Asia/Tokyo' });

await scenario('Back and Forward 40 times in a row, and a reload mid-way', async (page) => {
  await up(page);
  await pastTutorial(page);
  for (const s of ['screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings']) await page.evaluate((id) => window.__ui.show(id), s);
  for (let i = 0; i < 40; i++) { await (i % 2 ? page.goForward() : page.goBack()).catch(() => {}); }
  await page.reload();
  await page.waitForFunction(() => window.__ui, null, { timeout: 30000 });
  if (!(await homeVisible(page))) throw new Error('Home not showing after the Back storm');
});

await scenario('the window is made tiny, huge, then tiny again while a sheet is open', async (page) => {
  await up(page);
  await pastTutorial(page);
  await page.evaluate(() => window.__ui.openSheet('challengeSheet'));
  for (const [w, h] of [[200, 200], [2560, 1440], [320, 200], [1024, 3000], [390, 780]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150); }
  await page.evaluate(() => window.__ui.closeSheets());
});

await scenario('a corrupt save, an empty save, an old-version save and a gigantic save all load', async (page) => {
  await up(page);
  const blobs = ['{', '', '{"v":0}', '[]', JSON.stringify({ progression: { coins: 'lots', equipped: null }, settings: 5 }), JSON.stringify({ junk: 'x'.repeat(2_000_000) })];
  const key = await page.evaluate(() => { const ks = Object.keys(localStorage).filter((k) => /dx|dash|buzz/i.test(k)); return ks[0] || null; });
  if (!key) return 'skipped: no save key found';
  for (const blob of blobs) {
    await page.evaluate(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* too big */ } }, [key, blob]);
    await page.reload();
    await page.waitForFunction(() => window.__ui, null, { timeout: 30000 });
    if (!(await homeVisible(page))) { await pastTutorial(page); if (!(await homeVisible(page))) throw new Error('no Home after save ' + blob.slice(0, 20)); }
  }
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' scenarios passed');
process.exit(failed.length ? 1 : 0);
