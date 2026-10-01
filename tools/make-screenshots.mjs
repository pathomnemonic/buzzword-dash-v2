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
import { BG, CYAN } from './brand.mjs';

const base = process.argv[2] || 'http://localhost:4190';
const outDir = 'assets/store/screenshots';
fs.mkdirSync(outDir, { recursive: true });
for (const old of fs.readdirSync(outDir)) if (old.endsWith('.png')) fs.unlinkSync(outDir + '/' + old);

const browser = await chromium.launch({ args: process.env.SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.goto(base + '/?debug=1');
const dismissDaily = async (pg) => {
  const overlay = pg.locator('#dailyReward');
  try { await overlay.waitFor({ state: 'visible', timeout: 3000 }); } catch { return; }
  for (let i = 0; i < 3 && (await overlay.isVisible().catch(() => false)); i++) {
    await overlay.locator('button').click();
    await pg.waitForTimeout(1200);
  }
};
const skip = async () => {
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#obNextBtn');
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
  await page.locator('#onboardingOverlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  await dismissDaily(page);
};
await skip();
await page.waitForTimeout(2500);

const frames = [];
const snap = async (name, caption, sub, from) => {
  const buf = await (from || page).screenshot();
  frames.push({ name, caption, sub, buf });
  console.log('captured ' + name);
};

// Put the save into a showcase state (owned items, a subject, a favorite map).
// An init script applies it before the app starts, because the app saves its own
// copy of the data when the page unloads.
const applyShowcase = () => {
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
};
await page.addInitScript(applyShowcase);
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
// Two real players in a live head-to-head match (needs internet for the PeerJS signaling server)
const multiplayerShot = async (name, caption, sub) => {
  const players = [];
  const make = async (skin, monster) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript((o) => sessionStorage.setItem('showcase', JSON.stringify(o)), { skin, monster, subjects: ['Infectious Disease'], map: 'Neon ER' });
    await ctx.addInitScript(applyShowcase);
    const pg = await ctx.newPage();
    pg.on('dialog', (d) => d.accept());
    await pg.goto(base + '/?debug=1');
    for (let i = 0; i < 10; i++) {
      const next = pg.locator('#obNextBtn');
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
    }
    await pg.waitForTimeout(1500);
    await dismissDaily(pg);
    await pg.reload();
    for (let i = 0; i < 10; i++) {
      const next = pg.locator('#obNextBtn');
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
    }
    await pg.waitForTimeout(1500);
    await dismissDaily(pg);
    players.push(pg);
    return pg;
  };
  try {
    const host = await make('avatar_m_ninja', 'monster_m_demon');
    const guest = await make('avatar_m_robot', 'monster_m_yeti');
    await host.locator('#multiplayerBtn').click();
    await host.locator('#mpHostBtn').click();
    await host.locator('.mp-room-code').waitFor({ timeout: 20000 });
    const code = (await host.locator('.mp-room-code').innerText()).trim();
    await guest.locator('#multiplayerBtn').click();
    await guest.locator('#mpJoinCode').fill(code);
    await guest.locator('#mpJoinBtn').click();
    await host.locator('#mpReadyBtn').waitFor({ timeout: 30000 });
    await host.locator('#mpReadyBtn').click();
    await guest.locator('#mpReadyBtn').click();
    await host.locator('#mpStartMatchBtn').click({ timeout: 20000 });
    await host.waitForTimeout(14000);
    for (let attempt = 0; attempt < 5; attempt++) {
      const text = await host.evaluate(() => ['buzzText', 'ansText0', 'ansText1', 'ansText2'].map((id) => (document.getElementById(id) || {}).textContent || '').join(' | '));
      const page = await host.evaluate(() => document.body.innerText);
      if (!ODD.test(text) && /\S/.test(text.replace(/\|/g, '')) && /Rival/.test(page) && !/closing in/i.test(page)) break;
      await host.waitForTimeout(4000);
    }
    await snap(name, caption, sub, host);
  } catch (e) {
    console.log('multiplayer frame skipped: ' + e.message);
  } finally {
    for (const pg of players) await pg.context().close();
  }
};

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
await multiplayerShot('multiplayer', 'Challenge a friend. Live.', 'Head-to-head, no account needed');
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
  const size = Math.min(86, Math.floor(960 / (f.caption.length * 0.62)));
  const font = 'font-family="Arial Rounded MT Bold, Trebuchet MS, Arial, sans-serif" font-weight="900" text-anchor="middle"';
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CAP}">
    <g transform="translate(${W / 2} 152) skewX(-8)">
      <text x="0" y="8" ${font} font-size="${size}" fill="#1b0a40" stroke="#1b0a40" stroke-width="16" stroke-linejoin="round">${f.caption}</text>
      <text x="0" y="0" ${font} font-size="${size}" fill="#ffd23f" stroke="#1b0a40" stroke-width="10" stroke-linejoin="round">${f.caption}</text>
      <text x="0" y="0" ${font} font-size="${size}" fill="#ffd23f">${f.caption}</text>
    </g>
    <text x="${W / 2}" y="240" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="${CYAN}" text-anchor="middle">${f.sub}</text></svg>`);
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([{ input: label, top: 0, left: 0 }, { input: shot, top: CAP, left: PAD }])
    .png().toFile(`${outDir}/${String(n++).padStart(2, '0')}-${f.name}.png`);
}
console.log('wrote ' + (n - 1) + ' screenshots to ' + outDir);
