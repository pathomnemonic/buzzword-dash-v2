// tests/e2e/lanelock.spec.js
// "When I change gates at the last minute it still counts the gate I was in front of a second ago."
// Plays real encounters in the real engine, switching lanes at random moments up to the very last instant, and
// checks that the gate that is scored is always the one the player last asked for.

import { test, expect } from '@playwright/test';
import { openApp, hasWebGL } from './helpers.js';

test.describe('Lane switching at the last moment', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'runner needs WebGL (verified in Chromium)');

  test('the scored gate is always the lane last asked for', async ({ page }) => {
    test.setTimeout(150000);
    await openApp(page, '/?debug=1');
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this environment');
    await page.waitForFunction(() => window.__game && window.__storage);
    await page.evaluate(() => window.__storage.set('userSpeed', 10)); // more encounters in less time

    await page.evaluate(() => {
      const g = window.__game;
      window.__lane = { resolved: [], keys: 0 };
      const orig = g._resolveEncounter.bind(g);
      g._resolveEncounter = function () {
        const asked = g.targetLane;
        const labels = g.gates.map((x) => x.label);
        const r = orig();
        const last = g.runCards && g.runCards[g.runCards.length - 1];
        window.__lane.resolved.push({ asked, committed: g.committedLane, choice: last ? last.committedLane : null, labels });
        return r;
      };
      const emit = g._emit.bind(g);
      g._emit = function (type, payload) {
        if (type === 'encounter_started') {
          // switch lane at a random moment, biased towards the last instant before the answer locks
          const lock = Math.max(0.3, payload.secondsToLock || 1) * 1000;
          const when = lock * (0.55 + Math.random() * 0.43);
          const dir = Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight';
          setTimeout(() => { window.__lane.keys++; document.dispatchEvent(new KeyboardEvent('keydown', { key: dir, bubbles: true })); }, when);
        }
        return emit(type, payload);
      };
    });

    await page.locator('.btn-play').click();
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY', { timeout: 20000 });
    await page.waitForFunction(() => window.__lane.resolved.length >= 8 || !window.__game.running, null, { timeout: 120000 });

    const { resolved, keys } = await page.evaluate(() => window.__lane);
    expect(resolved.length).toBeGreaterThanOrEqual(3);
    expect(keys).toBeGreaterThan(0);
    for (const r of resolved) {
      expect(r.committed, JSON.stringify(r)).toBe(r.asked);
      expect(r.choice, JSON.stringify(r)).toBe(r.asked);
    }
  });
});
