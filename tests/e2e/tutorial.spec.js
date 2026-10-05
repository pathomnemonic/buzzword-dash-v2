// tests/e2e/tutorial.spec.js
// The how-to-play runs in the real game: a coach card asks for one move at a time, the obstacle or question
// that needs it is sent on the real track, and nothing from it is saved.

import { test, expect } from '@playwright/test';
import { hasWebGL, closeTutorial, dismissDailyReward } from './helpers.js';

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

/** Go through the spotlight tour: press the highlighted spot, or Next where there is nothing to press. */
async function walkTour(page) {
  const seen = [];
  for (let i = 0; i < 40; i++) {
    if (!(await page.locator('#tourOverlay').count())) break;
    const title = await page.locator('.tour-card h2').textContent().catch(() => null);
    if (title === null) break;
    seen.push(title);
    const next = page.locator('#tourNextBtn');
    if (await next.count()) {
      await next.click();
    } else {
      const box = await page.locator('.tour-ring').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(450);
  }
  expect(seen).not.toContain('PLAY');
  expect(seen).not.toContain('Weekly Gauntlet');
  expect(seen).toEqual(expect.arrayContaining(['Filters', 'Racing a friend', 'Choose your cards', 'Challenge', 'Your first trail', 'Daily quests']));
  await expect(page.locator('#tourOverlay')).toHaveCount(0);
}

test.describe('Interactive tutorial (on the real track)', () => {
  test.setTimeout(150000);

  test('tapping an answer at the top explains that you steer into the gate instead', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await page.evaluate(() => document.getElementById('ans2').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await expect(page.locator('#tutorialCoach .coach-feedback')).toContainText(/just the choices.*right gate/);
    await expect(page.locator('#ans2')).toHaveClass(/tut-nudge/);
    await step(page, 'left'); // and the step did not move on
  });

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
    // The card for the swipes sits near the top, clear of where the thumb swipes
    const cardBottom = await page.evaluate(() => document.querySelector('#tutorialCoach .tut-card').getBoundingClientRect().bottom / window.innerHeight);
    expect(cardBottom).toBeLessThan(0.5);

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
    await clearObstacle(page, 'high', 'ArrowDown', 'answer');

    // Picking the right lane comes first: a real question with real gates, the clue in the game's own top bar,
    // and the coach card tucked under the answer boxes (never over the lower part, where the swipes are)
    await page.waitForFunction(() => window.__game.gatesActive && !window.__game.answerLocked, null, { timeout: 30000 });
    await expect(page.locator('#buzzText')).not.toHaveText('GET READY');
    await expect(page.locator('#ansText0')).not.toHaveText('');
    const under = await page.evaluate(() => {
      const card = document.querySelector('#tutorialCoach .tut-card').getBoundingClientRect();
      return { cardTop: card.top, answersBottom: document.getElementById('answerRow').getBoundingClientRect().bottom, cardBottom: card.bottom, cardRight: card.right, height: window.innerHeight, wide: window.matchMedia('(min-width: 1000px) and (min-height: 600px) and (min-aspect-ratio: 4/3)').matches };
    });
    expect(under.cardTop).toBeGreaterThanOrEqual(under.answersBottom - 1);
    // (on a wide screen the question is a column on the left, and the card stays inside it, off the track)
    if (under.wide) expect(under.cardRight).toBeLessThanOrEqual(380);
    else expect(under.cardBottom).toBeLessThan(under.height * 0.6);
    const { right } = await page.evaluate(() => ({ right: window.__game.gates.findIndex((g) => g.correct) }));
    const lane = () => page.evaluate(() => window.__game.targetLane);
    let at = await lane();
    while (at !== right) {
      await page.keyboard.press(at < right ? 'ArrowRight' : 'ArrowLeft');
      at = await lane();
    }
    await page.evaluate(() => { window.__game.gateZ = -12; });

    // ...then the dash, on a second question
    await step(page, 'rush', 60000);
    await page.waitForFunction(() => window.__game.gatesActive && !window.__game.answerLocked, null, { timeout: 30000 });
    await page.evaluate(() => { window.__game.gateZ = -15; }); // nearer, so a slow machine does not wait long
    await page.keyboard.press('Shift');

    // After the practice the run is put away and a spotlight tour of the real screens begins
    await expect(page.locator('#tourOverlay')).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.__game._state)).toBe('ended');
    const coinsBefore = await page.evaluate(() => window.__storage.get('coins'));
    expect(coinsBefore).toBeGreaterThanOrEqual(500); // exactly enough for the first trail the tour buys
    await walkTour(page);
    // the tour had them buy and wear a trail
    expect(await page.evaluate(() => window.__storage.get('coins'))).toBeLessThan(coinsBefore);
    expect(await page.evaluate(() => window.__storage.get('equipped').trail)).not.toBe('trail_none');

    await step(page, 'done', 20000);
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

  test('the tour can be skipped, and pressing PLAY in it does not start a run', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    for (const id of ['left', 'right', 'jump', 'slide']) { await step(page, id); await page.locator('#tutSkipStepBtn').click(); }
    await step(page, 'answer');
    await page.locator('#tutSkipStepBtn').click();
    await step(page, 'rush');
    await page.locator('#tutSkipStepBtn').click();
    await expect(page.locator('#tourOverlay')).toBeVisible({ timeout: 60000 });
    // Home, then coins, then Filters (there is no lesson on the PLAY button): pressing the highlighted spot only moves the tour on
    await page.locator('#tourNextBtn').click();
    await expect(page.locator('.tour-card h2')).toHaveText('Coins and best score');
    let box = await page.locator('.tour-ring').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.tour-card h2')).toHaveText('Filters');
    expect(await page.evaluate(() => window.__game._state)).toBe('ended'); // no new run
    // clicking anywhere dimmed does nothing
    await page.mouse.click(5, 5);
    await expect(page.locator('.tour-card h2')).toHaveText('Filters');
    await page.locator('#tourCloseBtn').click(); // the tour's × asks first too
    await expect(page.locator('#tutExitConfirm')).toBeVisible();
    await page.locator('#tutExitYes').click();
    await expect(page.locator('#tourOverlay')).toHaveCount(0);
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
    await expect(page.locator('#screenHome')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__storage.get('firstRunComplete'))).toBe(true);
  });

  test('there is no Skip button: a small × asks "are you sure?", and Keep going carries on', async ({ page }) => {
    await openFirstRun(page);
    await expect(page.getByRole('button', { name: /skip tutorial|skip tour/i })).toHaveCount(0);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await expect(page.getByRole('button', { name: /skip tutorial|skip tour/i })).toHaveCount(0);
    await page.locator('#tutCloseBtn').click();
    await expect(page.locator('#tutExitConfirm')).toContainText(/Exit the tutorial\?/);
    await expect(page.locator('#tutExitConfirm')).toContainText(/How to play/);
    await page.locator('#tutExitStay').click();
    await expect(page.locator('#tutExitConfirm')).toHaveCount(0);
    await step(page, 'left'); // still there
    expect(await page.evaluate(() => window.__game._tutorial)).toBe(true);
    expect(await page.evaluate(() => window.__storage.get('firstRunComplete'))).toBe(false);
  });

  test('skipping the tutorial puts the run away without saving it', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await closeTutorial(page);
    await expect(page.locator('#tutorialCoach')).not.toHaveClass(/active/);
    await expect(page.locator('#screenHome')).toHaveClass(/active/, { timeout: 10000 });
    expect(await page.evaluate(() => window.__game._state)).toBe('ended');
    expect(await page.evaluate(() => window.__storage.get('runsFinished') || 0)).toBe(0);
    expect(await page.evaluate(() => window.__storage.get('firstRunComplete'))).toBe(true);
    // The top bar is the real game's: it is put away again
    expect(await page.evaluate(() => document.getElementById('hud').classList.contains('off'))).toBe(true);
  });

  test('Escape asks before closing the tutorial, on the welcome page and during practice', async ({ page }) => {
    await openFirstRun(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutExitConfirm')).toBeVisible(); // asks first
    await page.locator('#tutExitYes').click();
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => window.__game._state)).toBe('idle'); // no run was ever started

    await dismissDailyReward(page); // (the daily reward comes up once the player is back on Home)
    await page.locator('#howToPlayBtn').click();
    await step(page, 'welcome');
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutExitConfirm')).toBeVisible();
    await page.keyboard.press('Escape'); // Escape on the warning means "keep going"
    await expect(page.locator('#tutExitConfirm')).toHaveCount(0);
    await step(page, 'left');
    await page.keyboard.press('Escape');
    await page.locator('#tutExitYes').click();
    await expect(page.locator('#tutorialCoach')).not.toHaveClass(/active/);
    await expect(page.locator('#screenHome')).toHaveClass(/active/, { timeout: 10000 });
  });
});

test.describe('Tour panels are for looking at', () => {
  test('buttons inside the Versus panel do nothing while the tour is open', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    for (const id of ['left', 'right', 'jump', 'slide']) { await step(page, id); await page.locator('#tutSkipStepBtn').click(); }
    await step(page, 'answer'); await page.locator('#tutSkipStepBtn').click();
    await step(page, 'rush'); await page.locator('#tutSkipStepBtn').click();
    await expect(page.locator('#tourOverlay')).toBeVisible({ timeout: 60000 });
    // walk to the Versus panel
    for (let i = 0; i < 20; i++) {
      const title = await page.locator('.tour-card h2').textContent();
      if (title === 'Racing a friend') break;
      const next = page.locator('#tourNextBtn');
      if (await next.count()) await next.click();
      else { const b = await page.locator('.tour-ring').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      await page.waitForTimeout(450);
    }
    await expect(page.locator('.tour-card h2')).toHaveText('Racing a friend');
    const before = await page.evaluate(() => document.getElementById('mpContent').innerText);
    const host = page.locator('#mpContent button').first();
    await host.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getElementById('mpContent').innerText)).toBe(before);
    await expect(page.locator('.tour-card h2')).toHaveText('Racing a friend');
  });
});
