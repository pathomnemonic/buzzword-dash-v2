// tests/e2e/tutorial.spec.js
// The how-to-play runs in the real game: a coach card asks for one move at a time, the obstacle or question
// that needs it is sent on the real track, and nothing from it is saved.

import { test, expect } from '@playwright/test';
import { hasWebGL } from './helpers.js';

const card = (page) => page.locator('#tutorialCoach .tut-card, #tutorialOverlay .tut-card');
const step = (page, id, timeout = 30000) => expect(card(page)).toHaveAttribute('data-step', id, { timeout });

async function openFirstRun(page) {
  await page.goto('/?debug=1');
  await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
  await step(page, 'welcome');
  test.skip(!(await hasWebGL(page)), 'the real-track tutorial needs WebGL');
}

/**
 * Clear the obstacle the tutorial just sent: press the key, then (so a slow or busy machine does not decide the
 * outcome) bring the obstacle up to the runner while the jump or slide is under way, as it would arrive in play.
 */
async function clearObstacle(page, type, key, nextId) {
  await page.waitForFunction((t) => window.__game.obstacleMeshes.some((o) => o.userData.type === t), type, { timeout: 30000 });
  await page.keyboard.press(key);
  await page.waitForFunction((t) => (t === 'low' ? window.__game.playerY > 0.4 : window.__game.sliding), type, { timeout: 10000, polling: 'raf' });
  await page.evaluate((t) => { const o = window.__game.obstacleMeshes.find((m) => m.userData.type === t); if (o) o.position.z = -1; }, type);
  await step(page, nextId, 60000);
}

test.describe('Interactive tutorial (on the real track)', () => {
  test.setTimeout(150000);

  test('asks for each move in turn and sends the obstacle or question only then', async ({ page }) => {
    await openFirstRun(page);
    // Nothing is running behind the welcome page
    expect(await page.evaluate(() => window.__game._state)).toBe('idle');
    await page.locator('#tutNextBtn').click(); // Start practice: the real run, with its countdown
    await step(page, 'left');
    expect(await page.evaluate(() => window.__game._tutorial)).toBe(true);
    // The track is empty until a move asks for something: no obstacles, coins or question yet
    expect(await page.evaluate(() => window.__game.obstacleMeshes.length + window.__game.coinMeshes.length)).toBe(0);
    expect(await page.evaluate(() => window.__game.gatesActive)).toBe(false);

    // The wrong move does not advance
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    await step(page, 'left');
    await page.keyboard.press('ArrowLeft');
    await step(page, 'right');
    await page.keyboard.press('ArrowRight');
    await step(page, 'jump');

    // The jump step sends one obstacle down the runner's lane
    await expect.poll(() => page.evaluate(() => window.__game.obstacleMeshes.filter((o) => o.userData.type === 'low').length)).toBeGreaterThan(0);
    await clearObstacle(page, 'low', 'ArrowUp', 'slide');
    await expect.poll(() => page.evaluate(() => window.__game.obstacleMeshes.filter((o) => o.userData.type === 'high').length)).toBeGreaterThan(0);
    await clearObstacle(page, 'high', 'ArrowDown', 'rush');

    // The rush step sends a real question with real gates, and the clue shows in the game's own top bar
    await page.waitForFunction(() => window.__game.gatesActive, null, { timeout: 30000 });
    await page.evaluate(() => { window.__game.gateZ = -15; }); // nearer, so a slow machine does not wait long
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY');
    await expect(page.locator('#ansText0')).not.toHaveText('');
    await page.keyboard.press('Shift');
    await step(page, 'answer');

    // Answering: moving into the right lane finishes the step
    await page.waitForFunction(() => window.__game.gatesActive && !window.__game.answerLocked, null, { timeout: 30000 });
    const { right } = await page.evaluate(() => ({ right: window.__game.gates.findIndex((g) => g.correct) }));
    const lane = () => page.evaluate(() => window.__game.targetLane);
    let at = await lane();
    while (at !== right) {
      await page.keyboard.press(at < right ? 'ArrowRight' : 'ArrowLeft');
      at = await lane();
    }
    await page.evaluate(() => { window.__game.gateZ = -12; });
    await step(page, 'done', 60000);
    await page.locator('#tutNextBtn').click(); // Start playing
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
    await expect(page.locator('#screenHome')).toHaveClass(/active/, { timeout: 10000 });
    expect(await page.evaluate(() => window.__game._state)).toBe('ended');

    // It was never a real run: nothing saved
    const saved = await page.evaluate(() => ({ runs: window.__storage.get('runsFinished') || 0, first: window.__storage.get('firstRunComplete') }));
    expect(saved.runs).toBe(0);
    expect(saved.first).toBe(true);
  });

  test('swipes on the track work', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    const box = await page.locator('#gameContainer canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height * 0.6;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 90, cy, { steps: 6 });
    await page.mouse.up();
    await step(page, 'right');
  });

  test('a missed obstacle is sent again, and a step can be skipped', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await page.locator('#tutSkipStepBtn').click();
    await step(page, 'right');
    await page.locator('#tutSkipStepBtn').click();
    await step(page, 'jump');
    // Do nothing: the obstacle arrives, the coach says so and sends another
    await page.waitForFunction(() => window.__game.obstacleMeshes.some((o) => o.userData.type === 'low'), null, { timeout: 30000 });
    await page.evaluate(() => { const o = window.__game.obstacleMeshes.find((m) => m.userData.type === 'low'); o.position.z = 5; }); // it arrives
    await expect(page.locator('.coach-feedback')).toContainText(/got you/i, { timeout: 40000 });
    await expect.poll(() => page.evaluate(() => window.__game.obstacleMeshes.filter((o) => o.userData.type === 'low' && o.position.z < -5).length), { timeout: 40000 }).toBeGreaterThan(0);
    await step(page, 'jump');
  });

  test('skipping the tutorial puts the run away without saving it', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await page.locator('#tutSkipBtn').click();
    await expect(page.locator('#tutorialCoach')).not.toHaveClass(/active/);
    await expect(page.locator('#screenHome')).toHaveClass(/active/, { timeout: 10000 });
    expect(await page.evaluate(() => window.__game._state)).toBe('ended');
    expect(await page.evaluate(() => window.__storage.get('runsFinished') || 0)).toBe(0);
    expect(await page.evaluate(() => window.__storage.get('firstRunComplete'))).toBe(true);
    // The top bar is the real game's: it is put away again
    expect(await page.evaluate(() => document.getElementById('hud').classList.contains('off'))).toBe(true);
  });

  test('Escape skips the tutorial, on the welcome page and during practice', async ({ page }) => {
    await openFirstRun(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => window.__game._state)).toBe('idle'); // no run was ever started

    await page.locator('#howToPlayBtn').click();
    await step(page, 'welcome');
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialCoach')).not.toHaveClass(/active/);
    await expect(page.locator('#screenHome')).toHaveClass(/active/, { timeout: 10000 });
  });
});
