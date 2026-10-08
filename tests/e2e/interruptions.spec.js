// tests/e2e/interruptions.spec.js
// What happens when something else takes the phone: the app goes to the background, the screen locks, a call comes in,
// the phone is turned sideways, the app is killed in the middle of a run (section 46 of the QA plan).
// Real phone calls and lock screens can only be tried on a device (docs/DEVICE-TESTING.md); these tests check that the
// browser events those things produce are handled the way the game promises.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

test.describe('Interruptions', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the runner needs WebGL (verified in Chromium)');

  async function startRun(page) {
    await openApp(page, '/?debug=1');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
    await expect.poll(() => page.evaluate(() => window.__game._state)).toBe('playing');
  }

  const setVisibility = (page, hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(h ? 'pagehide' : 'pageshow'));
  }, hidden);

  const snapshot = (page) => page.evaluate(() => {
    const g = window.__game;
    return { state: g._state, score: g.score, lives: g.lives, enc: g.encountersDone, t: g.elapsedTime, gateZ: g.gateZ, streak: g.streak };
  });

  test('sending the app to the background pauses the run, and nothing moves while it is away', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startRun(page);
    const before = await snapshot(page);
    await setVisibility(page, true);
    await expect.poll(() => page.evaluate(() => window.__game._state)).toBe('paused');
    await expect(page.locator('#pauseOverlay')).toHaveClass(/active/);
    await page.waitForTimeout(500);
    const settled = await snapshot(page);
    await page.waitForTimeout(1500);
    const during = await snapshot(page);
    expect(during.state).toBe('paused');
    expect(Math.abs(during.t - before.t)).toBeLessThan(0.6); // (a frame or two may still have run before the pause)
    expect(during.lives).toBe(before.lives);
    // the score climbs with distance, so a frame or two before the pause may add a few points; once paused it stands still
    expect(Math.abs(during.score - before.score)).toBeLessThan(40);
    expect(during.score).toBe(settled.score);
    expect(during.t).toBe(settled.t);

    await setVisibility(page, false);
    // coming back never drops the player into a moving lane: the pause screen waits for them
    await expect(page.locator('#pauseOverlay')).toHaveClass(/active/);
    expect((await snapshot(page)).state).toBe('paused');
    await page.locator('#resumeBtn').click();
    await expect.poll(() => page.evaluate(() => window.__game._state)).toBe('playing');
    await expect(page.locator('#pauseOverlay')).not.toHaveClass(/active/);
    const after = await snapshot(page);
    expect(after.lives).toBeGreaterThanOrEqual(1);
    expect(after.enc - before.enc).toBeLessThanOrEqual(1); // the time away was not played
    expect(errors).toEqual([]);
  });

  test('locking and unlocking the screen ten times in a row leaves the run intact', async ({ page }) => {
    test.setTimeout(120000); // (software graphics make every tap slow; the run itself is not)
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startRun(page);
    for (let i = 0; i < 10; i++) {
      await setVisibility(page, true);
      await setVisibility(page, false);
      const state = await page.evaluate(() => window.__game._state);
      if (state === 'paused') await page.locator('#resumeBtn').click();
      await page.waitForTimeout(150);
    }
    await expect.poll(() => page.evaluate(() => window.__game._state)).toBe('playing');
    await expect(page.locator('#pauseOverlay')).not.toHaveClass(/active/);
    expect(errors).toEqual([]);
  });

  test('a call: the music and any spoken question stop when the page is hidden, and come back on return', async ({ page }) => {
    await startRun(page);
    await setVisibility(page, true);
    expect(await page.evaluate(() => window.__audio._paused)).toBe(true);
    expect(await page.evaluate(() => ['suspended', 'closed'].includes(window.__audio.ctx && window.__audio.ctx.state) || !window.__audio.ctx)).toBe(true);
    await setVisibility(page, false);
    expect(await page.evaluate(() => window.__audio._paused)).toBe(false);
  });

  test('audio that the system interrupted (state "interrupted") is woken by the next tap', async ({ page }) => {
    await startRun(page);
    const woke = await page.evaluate(() => {
      const a = window.__audio;
      let resumed = 0;
      const real = a.ctx;
      // a stand-in context in the state Safari reports during a call
      const stand = Object.create(real);
      Object.defineProperty(stand, 'state', { configurable: true, writable: true, value: 'interrupted' });
      stand.resume = function () { resumed++; this.state = 'running'; return Promise.resolve(); };
      a.ctx = stand;
      a.unlock();
      const out = { resumed, state: a.ctx.state };
      a.ctx = real;
      return out;
    });
    expect(woke.resumed).toBe(1);
    expect(woke.state).toBe('running');
  });

  test('turning the phone sideways mid-run keeps the picture, the question and the answer lanes on screen, and back again', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 780 });
    await startRun(page);
    for (const [w, h] of [[780, 390], [390, 780], [844, 390], [360, 640]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(400);
      const fit = await page.evaluate(() => {
        const g = window.__game;
        const c = document.querySelector('#gameContainer canvas');
        const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; };
        return {
          vw: innerWidth, vh: innerHeight, aspect: g.camera.aspect, canvasW: c.clientWidth, canvasH: c.clientHeight,
          answers: r('#answerRow'), buzz: r('#buzzText'), overflow: document.documentElement.scrollWidth > innerWidth + 2
        };
      });
      expect(Math.abs(fit.aspect - fit.vw / fit.vh), `${w}x${h} camera aspect`).toBeLessThan(0.05);
      expect(fit.canvasW, `${w}x${h} canvas width`).toBeGreaterThanOrEqual(fit.vw - 2);
      expect(fit.overflow, `${w}x${h} page overflow`).toBe(false);
      expect(fit.answers, `${w}x${h} answer row`).not.toBeNull();
      expect(fit.answers.bottom, `${w}x${h} answers inside the screen`).toBeLessThanOrEqual(fit.vh + 2);
      expect(fit.answers.top).toBeGreaterThanOrEqual(-2);
    }
    expect(['playing', 'paused']).toContain(await page.evaluate(() => window.__game._state));
    expect(errors).toEqual([]);
  });

  test('the app being killed in the middle of a run (a reload) comes back to Home with the save intact', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startRun(page);
    const coinsBefore = await page.evaluate(() => window.__storage.get('coins'));
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForFunction(() => window.__storage && window.__ui, null, { timeout: 20000 });
    // no leftover "run in progress": Home is showing and the data is the right shape
    await expect(page.locator('.btn-play')).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => window.__dataProblems())).toEqual([]);
    expect(await page.evaluate(() => window.__storage.get('coins'))).toBeGreaterThanOrEqual(coinsBefore);
    // and a new run can start straight away
    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
    expect(errors).toEqual([]);
  });

  test('going to the background while the results screen or a pop-up is open does not break either', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page, '/?debug=1');
    await page.locator('#streakChip').click();
    await expect(page.locator('#streakSheet')).toHaveClass(/active/);
    await setVisibility(page, true);
    await setVisibility(page, false);
    await expect(page.locator('#streakSheet')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#streakSheet')).not.toHaveClass(/active/);
    expect(errors).toEqual([]);
  });
});
