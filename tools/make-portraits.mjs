/* global window */
// Renders public/portraits/<hero id>-face.webp and -body.webp from the hero models (default colors).
// Usage: start `npx vite --port 5173`, then `node tools/make-portraits.mjs`. Needs Playwright with Chromium.
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(base + '/tools/portraits.html');
await page.waitForFunction(() => window.portraitsReady, null, { timeout: 60000 });
const out = await page.evaluate(() => window.renderPortraits());
mkdirSync('public/portraits', { recursive: true });
let bytes = 0;
for (const [id, v] of Object.entries(out)) {
  for (const kind of ['face', 'body']) {
    const buf = Buffer.from(v[kind].split(',')[1], 'base64');
    writeFileSync(`public/portraits/${id}-${kind}.webp`, buf);
    bytes += buf.length;
  }
  console.log(id, 'height', v.height.toFixed(2));
}
console.log(Object.keys(out).length, 'heroes,', Math.round(bytes / 1024), 'KB');
await browser.close();
