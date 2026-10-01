/* global localStorage, sessionStorage */
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
for (const old of fs.readdirSync(outDir)) if (old.endsWith('.png')) fs.unlinkSync(outDir + '/' + old);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.goto(base + '/?debug=1');
const skip = async () => {
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#obNextBtn');
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
  await page.locator('#onboardingOverlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
};
await skip();
await page.waitForTimeout(2500);

const frames = [];
const snap = async (name, caption, sub) => {
  const buf = await page.screenshot();
  frames.push({ name, caption, sub, buf });
  console.log('captured ' + name);
};

// Put the save into a showcase state (owned items, a subject, a favorite map).
// An init script applies it before the app starts, because the app saves its own
// copy of the data when the page unloads.
await page.addInitScript(() => {
  try {
    const raw = sessionStorage.getItem('showcase');
    if (!raw) return;
    const o = JSON.parse(raw);
    const key = 'buzzword_dash_v1';
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (!d) return;
    const p = d.progression;
    ['avatar_m_ninja', 'avatar_m_wizard', 'avatar_m_robot', 'avatar_m_king', 'avatar_m_explorer', 'avatar_m_alien',
      'monster_m_demon', 'monster_m_ghost', 'monster_m_yeti', 'monster_m_dragon'].forEach((id) => { if (p.ownedItems.indexOf(id) < 0) p.ownedItems.push(id); });
    p.equipped.skin = o.skin;
    p.equipped.monster = o.monster;
    d.settings.selectedSubjects = o.subjects;
    d.settings.preferredMap = o.map;
    d.settings.quality = 'medium';
    localStorage.setItem(key, JSON.stringify(d));
  } catch { /* ignore */ }
});
const setup = async (opts) => {
  await page.evaluate((o) => sessionStorage.setItem('showcase', JSON.stringify(o)), opts);
  await page.reload();
  await skip();
  await page.waitForTimeout(2500);
  console.log('equipped', await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('buzzword_dash_v1') || '{}'); return d.progression && d.progression.equipped.skin + ' ' + d.settings.quality; }));
};

const run = async (opts, name, caption, sub, waitMs) => {
  await setup(opts);
  await page.locator('.btn-play').click();
  await page.waitForTimeout(waitMs);
  await snap(name, caption, sub);
  await page.evaluate("try { window.__game.endRun && window.__game.endRun(); } catch (err) {}");
  await page.waitForTimeout(1500);
};

await setup({ skin: 'avatar_intern', monster: 'monster_classic', subjects: [], map: '' });
await snap('home', 'Run the list.', 'Board questions, at a sprint');

await run({ skin: 'avatar_m_ninja', monster: 'monster_m_demon', subjects: ['Cardiology'], map: 'Cardiac Pulse' },
  'run-cardio', 'Dodge. Dash. Dx.', 'Pick the diagnosis lane at full speed', 10000);
await run({ skin: 'avatar_m_wizard', monster: 'monster_m_ghost', subjects: ['Neurology'], map: 'Neural Highway' },
  'run-neuro', 'Pick your hero', '12 animated 3D characters to unlock', 10000);
await run({ skin: 'avatar_m_robot', monster: 'monster_m_yeti', subjects: ['Pulmonology'], map: 'Neon ER' },
  'run-er', 'Outrun the exam monster', 'Six monsters, twelve themed tracks', 14000);

await setup({ skin: 'avatar_m_king', monster: 'monster_classic', subjects: [], map: '' });
await page.locator('[data-screen="screenShop"]').click();
await page.waitForTimeout(3500);
await snap('locker', 'Unlock 3D characters', 'Plus trails, vehicles and monsters');

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
