// tests/e2e/tutorial.spec.js
// The interactive tutorial: each practice step waits for the move, and it can be skipped at any time.

import { test, expect } from '@playwright/test';

async function openFirstRun(page) {
  await page.goto('/');
  await expect(page.locator('#tutorialOverlay')).toHaveClass(/active/);
  await expect(page.locator('#tutorialOverlay .tut-card')).toHaveAttribute('data-step', 'welcome');
}

const step = (page, id) => expect(page.locator('#tutorialOverlay .tut-card')).toHaveAttribute('data-step', id);

test.describe('Interactive tutorial', () => {
  test('moves on only when the move is done (keyboard)', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click(); // Start practice
    await step(page, 'left');

    // The wrong move does not advance
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1000);
    await step(page, 'left');

    await page.keyboard.press('ArrowLeft');
    await step(page, 'right');
    await page.keyboard.press('ArrowRight');
    await step(page, 'jump');
    await page.keyboard.press('ArrowUp');
    await step(page, 'slide');
    await page.keyboard.press('ArrowDown');
    await step(page, 'rush');
    await page.keyboard.press('Shift');
    await step(page, 'answer');

    // Wrong lane first: it is rejected, the right lane advances
    const wrong = page.locator('.tut-lane[data-correct="false"]:not([data-lane="1"])').first();
    const right = page.locator('.tut-lane[data-correct="true"]');
    const rightLane = Number(await right.getAttribute('data-lane'));
    const wrongLane = Number(await wrong.getAttribute('data-lane'));
    const press = async (from, to) => {
      for (let i = from; i !== to; i += to > from ? 1 : -1) await page.keyboard.press(to > from ? 'ArrowRight' : 'ArrowLeft');
    };
    await press(1, wrongLane);
    await expect(page.locator('.tut-feedback')).toContainText(/Not quite/);
    await step(page, 'answer');
    await press(wrongLane, 1);
    await press(1, rightLane);
    await step(page, 'done');

    await page.locator('#tutNextBtn').click(); // Start playing
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
  });

  test('swipes work on the practice track', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    const box = await page.locator('.tut-arena').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy, { steps: 6 });
    await page.mouse.up();
    await step(page, 'right');
  });

  test('a practice step can be skipped, and so can the whole tutorial', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await page.locator('#tutSkipStepBtn').click();
    await step(page, 'right');
    await page.locator('#tutSkipBtn').click();
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
  });

  test('Escape skips the tutorial', async ({ page }) => {
    await openFirstRun(page);
    await page.locator('#tutNextBtn').click();
    await step(page, 'left');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialOverlay')).not.toHaveClass(/active/);
  });
});
