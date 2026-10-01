// tests/e2e/helpers.js
// Shared helpers for the browser tests.

/**
 * Open the app and get past the first-run tutorial.
 *
 * A fresh browser profile shows a full-screen onboarding overlay that
 * intercepts every click, so tests must dismiss it before interacting.
 */
export async function openApp(page, path = '/') {
  await page.goto(path);
  const next = page.locator('#tutSkipBtn');
  for (let i = 0; i < 10; i++) {
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
  await page.locator('#tutorialOverlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  await dismissDailyReward(page);
}

/**
 * The daily reward screen shows once a day, a moment after the tutorial. Claim it
 * so it does not sit on top of the page. (Day 7 is a chest, which needs a second tap.)
 */
export async function dismissDailyReward(page) {
  const overlay = page.locator('#dailyReward');
  try {
    await overlay.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    return;
  }
  for (let i = 0; i < 3 && (await overlay.isVisible().catch(() => false)); i++) {
    await overlay.locator('button').click();
    await page.waitForTimeout(1200);
  }
}

/** True when this browser can create a WebGL context (the 3D game needs it). */
export async function hasWebGL(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
}
