// tools/make-screenshots.mjs — captioned portrait store screenshots.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/make-screenshots.mjs [http://localhost:4190]
//
// Writes assets/store/screenshots/NN-name.png (1080x1920). Uses software
// WebGL, so the 3D frames look like the game at its lowest quality setting;
// replace them with real-device captures before launch if you want the best look.

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import { BG, CYAN, WHITE } from './brand.mjs';

const base = process.argv[2] || 'http://localhost:4190';
const outDir = 'assets/store/screenshots';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.goto(base + '/?debug=1');
for (let i = 0; i < 10; i++) {
  const next = page.locator('#obNextBtn');
  if (!(await next.isVisible().catch(() => false))) break;
  await next.click();
}
await page.locator('#onboardingOverlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2500);

const frames = [];
const snap = async (name, caption, sub) => {
  const buf = await page.screenshot();
  frames.push({ name, caption, sub, buf });
  console.log('captured ' + name);
};

await snap('home', 'Run the list.', 'Board questions, at a sprint');
await page.locator('[data-screen="screenShop"]').click();
await page.waitForTimeout(3500);
await snap('locker', 'Unlock 3D characters', 'Plus trails, vehicles and monsters');

await page.locator('[data-screen="screenHome"]').click();
await page.waitForTimeout(800);
await page.locator('.btn-play').click();
await page.waitForTimeout(9000);
await snap('run', 'Dodge. Dash. Dx.', 'Pick the diagnosis lane at full speed');
await page.waitForTimeout(6000);
await snap('run2', 'Keep your streak alive', 'Miss one and the monster closes in');

await page.evaluate("try { window.__game.endRun && window.__game.endRun(); } catch (err) {}");
await page.waitForTimeout(3000);
await snap('results', 'Learn from misses', 'Case review with quick explanations');

await browser.close();

const W = 1080, H = 1920, CAP = 330, PAD = 70;
let n = 1;
for (const f of frames) {
  const shotW = W - PAD * 2;
  const shotH = H - CAP - PAD - 40;
  const shot = await sharp(f.buf).resize(shotW, shotH, { fit: 'cover', position: 'top' })
    .composite([{ input: Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="56" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CAP}">
    <text x="${W / 2}" y="150" font-family="Arial, Helvetica, sans-serif" font-size="${f.caption.length > 18 ? 72 : 82}" font-weight="900" fill="${WHITE}" text-anchor="middle">${f.caption}</text>
    <text x="${W / 2}" y="240" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="${CYAN}" text-anchor="middle">${f.sub}</text></svg>`);
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([{ input: label, top: 0, left: 0 }, { input: shot, top: CAP, left: PAD }])
    .png().toFile(`${outDir}/${String(n++).padStart(2, '0')}-${f.name}.png`);
}
console.log('wrote ' + (n - 1) + ' screenshots to ' + outDir);
