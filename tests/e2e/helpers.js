// tests/e2e/helpers.js
// Shared helpers for the browser tests.

/**
 * Open the app and get past the first-run tutorial.
 *
 * A fresh browser profile shows a full-screen onboarding overlay that
 * intercepts every click, so tests must dismiss it before interacting.
 */
export async function openApp(page) {
  await page.goto('/');
  const next = page.locator('#obNextBtn');
  for (let i = 0; i < 10; i++) {
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
  await page.locator('#onboardingOverlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/** True when this browser can create a WebGL context (the 3D game needs it). */
export async function hasWebGL(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
}
