// tests/e2e/analytics.spec.js — analytics: nothing leaves the device without a yes, no personal data rides along,
// and the player can change their mind. The app must be built with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for the
// consent card to exist; on a build without them the first test still proves nothing is sent.
import { test, expect } from '@playwright/test';
import { closeTutorial, dismissDailyReward, hasWebGL } from './helpers.js';

const INGEST = /\/rest\/v1\/rpc\/ingest_analytics/;

async function watch(page) {
  const ingests = [];
  const others = [];
  await page.route(/\/rest\/v1\/rpc\//, async (route) => {
    const req = route.request();
    if (INGEST.test(req.url())) ingests.push(JSON.parse(req.postData() || '{}'));
    else others.push({ url: req.url(), body: req.postData() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"accepted":1}' });
  });
  return { ingests, others };
}

async function available(page) {
  return page.evaluate(() => !!(window.__analyticsAvailable && window.__analyticsAvailable()));
}

test.describe('Analytics', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'checked in Chromium');

  test('nothing is sent before the player answers', async ({ page }) => {
    const seen = await watch(page);
    await page.goto('/?debug=1');
    await page.waitForFunction(() => window.__analytics, null, { timeout: 15000 });
    await page.waitForTimeout(2500);
    expect(seen.ingests).toEqual([]);
    const state = await page.evaluate(() => window.__analytics.consentState());
    expect(['unset', 'denied']).toContain(state);
  });

  test('"No thanks" sends no events and the card does not return', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.waitForFunction(() => window.__analytics, null, { timeout: 15000 });
    test.skip(!(await available(page)), 'built without a backend: no consent card');
    const seen = await watch(page);
    await page.locator('#analyticsConsent').waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('#analyticsNo').click();
    await page.waitForTimeout(2000);
    expect(seen.ingests).toEqual([]);
    expect(await page.evaluate(() => window.__analytics.consentState())).toBe('denied');
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.locator('#analyticsConsent')).toHaveCount(0);
    expect(seen.ingests).toEqual([]);
  });

  test('"Share anonymously" sends clean batches, and switching off in Settings stops it', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.waitForFunction(() => window.__analytics, null, { timeout: 15000 });
    test.skip(!(await available(page)), 'built without a backend: no consent card');
    const seen = await watch(page);
    await page.locator('#analyticsConsent').waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('#analyticsYes').click();
    await page.evaluate(() => { window.__analytics.track('screen_view', { screen: 'shop', from: 'home', via: 'tab' }); return window.__analytics.flush({ force: true }); });
    await expect.poll(() => seen.ingests.length, { timeout: 8000 }).toBeGreaterThan(0);
    const all = JSON.stringify(seen.ingests);
    const names = seen.ingests.flatMap((b) => (b.p_batch.events || []).map((e) => e.n));
    expect(names).toContain('session_start');
    expect(names).toContain('consent_changed');
    // no personal data: no e-mail addresses, no links, no player name
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(all).not.toMatch(/https?:\/\/(?!localhost)/);
    const batch = seen.ingests[0].p_batch;
    expect(batch.install.id).toMatch(/[0-9a-f-]{16,}/);
    const ctx = Object.values(batch.sessions)[0]?.ctx;
    expect(ctx).toBeTruthy();
    expect(JSON.stringify(ctx)).not.toMatch(/Mozilla|HeadlessChrome/);

    // turn it off in Settings → Data: the queue is wiped and nothing more is sent
    // the tutorial follows the card on a fresh install
    await page.locator('#tutCloseBtn').waitFor({ state: 'visible', timeout: 8000 });
    await closeTutorial(page);
    await dismissDailyReward(page);
    await page.evaluate(() => window.__ui.show('screenSettings'));
    await page.locator('.settings-card[data-section="data"]').click();
    const toggle = page.locator('[data-setting="analytics"] .toggle');
    await toggle.waitFor({ state: 'visible', timeout: 5000 });
    await toggle.click();
    expect(await page.evaluate(() => window.__analytics.consentState())).toBe('denied');
    const before = seen.ingests.length;
    await page.evaluate(() => window.__analytics.track('screen_view', { screen: 'home' }));
    await page.waitForTimeout(1500);
    expect(seen.ingests.length).toBe(before);
  });

  test('"Delete my analytics data" asks the server to delete this install', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.waitForFunction(() => window.__analytics, null, { timeout: 15000 });
    test.skip(!(await available(page)), 'built without a backend: no consent card');
    const seen = await watch(page);
    await page.locator('#analyticsConsent').waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('#analyticsYes').click();
    const id = await page.evaluate(() => window.__analytics.installId());
    const deleted = await page.evaluate(() => window.__analytics.deleteMyData());
    expect(deleted).toBe(true);
    expect(seen.others.some((o) => /delete_analytics/.test(o.url) && o.body.includes(id))).toBe(true);
    expect(await page.evaluate(() => window.__analytics.installId())).not.toBe(id);
  });

  test('a real run is reported: run_start and run_end with the result', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1');
    await page.waitForFunction(() => window.__analytics, null, { timeout: 15000 });
    test.skip(!(await available(page)), 'built without a backend: no consent card');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    const seen = await watch(page);
    await page.locator('#analyticsConsent').waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('#analyticsYes').click();
    await page.locator('#tutCloseBtn').waitFor({ state: 'visible', timeout: 8000 });
    await closeTutorial(page);
    await dismissDailyReward(page);
    await page.evaluate(() => { window.__storage.set('reviewTipSeen', true); });
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
    await page.evaluate(() => { const g = window.__game; g.score = 480; g._endRun('manual_end'); });
    await expect(page.locator('#screenPostRun')).toHaveClass(/active/, { timeout: 10000 });
    await page.evaluate(() => window.__analytics.flush({ force: true }));
    await expect.poll(() => seen.ingests.flatMap((b) => b.p_batch.events.map((e) => e.n)).includes('run_end'), { timeout: 8000 }).toBe(true);
    const events = seen.ingests.flatMap((b) => b.p_batch.events);
    const start = events.find((e) => e.n === 'run_start');
    const end = events.find((e) => e.n === 'run_end');
    expect(start.p.mode).toBeTruthy();
    expect(start.p.run_id).toBe(end.p.run_id);
    expect(end.p.reason).toBe('manual_end');
    expect(end.p.score).toBe(480);
    expect(end.p.duration_s).toBeGreaterThanOrEqual(0);
    expect(typeof end.p.fps_avg).toBe('number');
    expect(events.map((e) => e.n)).toContain('screen_view');
    // ids are unique, so a retry can never double-count
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
