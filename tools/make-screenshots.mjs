/* global localStorage, sessionStorage, document */
// tools/make-screenshots.mjs — captioned portrait store screenshots.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/make-screenshots.mjs [http://localhost:4190]
//
// Writes assets/store/screenshots/NN-name.png (1080x1920).

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import { BG, CYAN, WHITE } from './brand.mjs';

const base = process.argv[2] || 'http://localhost:4190';
const outDir = 'assets/store/screenshots';
fs.mkdirSync(outDir, { recursive: true });
for (const old of fs.readdirSync(outDir)) if (old.endsWith('.png')) fs.unlinkSync(outDir + '/' + old);

const browser = await chromium.launch({ args: process.env.SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
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
    d.settings.quality = 'high';
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

// Questions that read oddly out of context (management / "what to start" items) are skipped:
// the shots should show a classic vignette-to-diagnosis question.
const ODD = /toast|pregnan|perioperative|management|treatment|prevention|prophyla|therapy|start|continu|counsel|screening|dose/i;
const gateText = () => page.evaluate(() => {
  const ids = ['buzzText', 'ansText0', 'ansText1', 'ansText2'];
  const t = ids.map((id) => (document.getElementById(id) || {}).textContent || '').join(' | ');
  return /closing in|Get ready|GET READY/i.test(document.body.innerText) ? 'toast ' + t : t;
});
const endRun = async () => {
  await page.evaluate('try { window.__game.endRun && window.__game.endRun(); } catch (err) {}');
  await page.waitForTimeout(1500);
};

// A run frame with a clean question on screen (retries with a new run when the question is odd)
const run = async (opts, name, caption, sub, waitMs) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    await setup(opts);
    await page.locator('.btn-play').click();
    await page.waitForTimeout(waitMs);
    const text = await gateText();
    if (!ODD.test(text) && /\S/.test(text.replace(/\|/g, ''))) {
      console.log('question: ' + text);
      await snap(name, caption, sub);
      await endRun();
      return;
    }
    console.log('skipping question: ' + text);
    await endRun();
  }
  throw new Error('no clean question found for ' + name);
};

// The case review after a real stretch of play
const results = async (opts, name, caption, sub) => {
  await setup(opts);
  await page.locator('.btn-play').click();
  await page.waitForTimeout(50000);
  await endRun();
  await page.waitForTimeout(1500);
  const toggle = page.locator('#postRunContent .collapsible-toggle').first();
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
  await page.waitForTimeout(500);
  await snap(name, caption, sub);
};

await run({ skin: 'avatar_m_ninja', monster: 'monster_m_demon', subjects: ['Infectious Disease'], map: 'Neon ER' },
  'run-1', 'Study that feels like a game', 'Run, dodge and pick the diagnosis', 10000);
await run({ skin: 'avatar_m_wizard', monster: 'monster_m_ghost', subjects: ['Neurology'], map: 'Neural Highway' },
  'run-2', 'Real board-style questions', 'Spot the buzzwords. Pick the Dx.', 10000);
await results({ skin: 'avatar_m_robot', monster: 'monster_m_yeti', subjects: ['Cardiology'], map: 'Cardiac Pulse' },
  'review', 'Learn from every miss', 'Quick explanations, then it comes back');

await setup({ skin: 'avatar_m_king', monster: 'monster_classic', subjects: [], map: '' });
await page.locator('[data-screen="screenHome"]').click().catch(() => {});
await page.getByRole('button', { name: /Quests/ }).click().catch(() => {});
await page.waitForTimeout(1500);
await snap('goals', 'Build a daily streak', 'Short goals that keep you consistent');

await page.locator('[data-screen="screenShop"]').click();
await page.waitForTimeout(3500);
await snap('rewards', 'Earn rewards as you improve', 'Coins from correct answers unlock new looks');

await browser.close();

const W = 1080, H = 1920, CAP = 330, PAD = 70;
let n = 1;
for (const f of frames) {
  const shotW = W - PAD * 2;
  const shotH = H - CAP - PAD - 40;
  const shot = await sharp(f.buf).resize(shotW, shotH, { fit: 'cover', position: 'top' })
    .composite([{ input: Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="56" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CAP}">
    <text x="${W / 2}" y="150" font-family="Arial, Helvetica, sans-serif" font-size="${Math.min(82, Math.floor(940 / (f.caption.length * 0.6)))}" font-weight="900" fill="${WHITE}" text-anchor="middle">${f.caption}</text>
    <text x="${W / 2}" y="240" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="${CYAN}" text-anchor="middle">${f.sub}</text></svg>`);
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([{ input: label, top: 0, left: 0 }, { input: shot, top: CAP, left: PAD }])
    .png().toFile(`${outDir}/${String(n++).padStart(2, '0')}-${f.name}.png`);
}
console.log('wrote ' + (n - 1) + ' screenshots to ' + outDir);
