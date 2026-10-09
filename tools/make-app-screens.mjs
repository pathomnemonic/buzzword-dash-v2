/* global localStorage, sessionStorage, document, window */
// tools/make-app-screens.mjs — plain (uncaptioned) screenshots of the real app, used by the ads and the landing page.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   SOFTWARE_GL=1 CHROME_PATH=/path/to/chromium node tools/make-app-screens.mjs [http://localhost:4190]
//
// Writes docs/marketing/assets/screens/{home,quests,stats,locker,run-a,run-b}.png (390x844 at 2x) and the smaller
// copies the landing page uses (public/landing/{home,locker,run,stats}.png). Run `node tools/make-ads.mjs --static`
// afterwards so the ads pick the new pictures up. Re-run whenever the look of the app changes.

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4190';
const outDir = 'docs/marketing/assets/screens';
const landingDir = 'public/landing';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: process.env.SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.addInitScript(() => { try { localStorage.setItem('dx_lessons_off', '1'); } catch { /* ignore */ } });
await page.goto(base + '/?debug=1');

const closeTutorial = async () => {
  for (let i = 0; i < 10; i++) {
    const x = page.locator('#tutCloseBtn');
    if (!(await x.isVisible().catch(() => false))) break;
    await x.click();
    await page.locator('#tutExitYes').click().catch(() => {});
  }
  await page.locator('#tutorialOverlay').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  const daily = page.locator('#dailyReward');
  for (let i = 0; i < 3 && (await daily.isVisible().catch(() => false)); i++) { await daily.locator('button').click(); await page.waitForTimeout(1200); }
  await page.evaluate(() => { const c = document.getElementById('analyticsConsent'); if (c) c.remove(); });
};
await closeTutorial();
await page.waitForTimeout(2500);

const applyShowcase = () => {
  try {
    const raw = sessionStorage.getItem('showcase');
    if (!raw) return;
    const o = JSON.parse(raw);
    const key = 'buzzword_dash_v1';
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (!d) return;
    const p = d.progression;
    ['avatar_m_nurse', 'avatar_m_paramedic', 'avatar_m_ninja', 'avatar_m_wizard', 'monster_m_demon', 'monster_m_ghost', 'monster_m_yeti'].forEach((id) => { if (p.ownedItems.indexOf(id) < 0) p.ownedItems.push(id); });
    p.equipped.skin = o.skin;
    p.equipped.monster = o.monster;
    p.coins = 530;
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
  await closeTutorial();
  await page.waitForTimeout(2500);
};
const save = async (name) => {
  const buf = await page.screenshot({ timeout: 180000 });
  fs.writeFileSync(`${outDir}/${name}.png`, buf);
  console.log('wrote ' + name);
  return buf;
};

const ODD = /toast|pregnan|perioperative|management|treatment|prevention|prophyla|therapy|start|continu|counsel|screening|dose/i;
const gateText = () => page.evaluate(() => ['buzzText', 'ansText0', 'ansText1', 'ansText2'].map((id) => (document.getElementById(id) || {}).textContent || '').join(' | '));
const run = async (opts, name) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    await setup(opts);
    await page.locator('.btn-play').click();
    await page.waitForTimeout(10000);
    const text = await gateText();
    if (!ODD.test(text) && /\S/.test(text.replace(/\|/g, ''))) { const buf = await save(name); await page.evaluate('try { window.__game.endRun && window.__game.endRun(); } catch (err) {}'); await page.waitForTimeout(1500); return buf; }
    await page.evaluate('try { window.__game.endRun && window.__game.endRun(); } catch (err) {}');
    await page.waitForTimeout(1500);
  }
  throw new Error('no clean question for ' + name);
};

const landing = {};
landing.run = await run({ skin: 'avatar_m_nurse', monster: 'monster_m_demon', subjects: ['Infectious Disease'], map: 'Hospital Hallway' }, 'run-a');
await run({ skin: 'avatar_intern', monster: 'monster_m_ghost', subjects: ['Neurology'], map: 'Neural Highway' }, 'run-b');

await setup({ skin: 'avatar_m_paramedic', monster: 'monster_classic', subjects: [], map: '' });
await page.locator('[data-screen="screenHome"]').click().catch(() => {});
await page.waitForTimeout(1500);
landing.home = await save('home');
await page.getByRole('button', { name: /Quests/ }).click().catch(() => {});
await page.waitForTimeout(1500);
await save('quests');

await page.evaluate(() => {
  const st = window.__storage; const cards = window.__cards || [];
  const now = Date.now(); const DAY = 86400000;
  cards.slice(0, 260).forEach((c, i) => {
    const seen = 3 + (i % 5); const wrong = i % 7 === 0 ? 2 : 0;
    st.data.cards.cardStats[c.id] = { seen, correct: seen - wrong, wrong, lastSeen: now - (i % 9) * DAY, stability: 6 + (i % 30), difficulty: 4 + (i % 4), lastReview: now - (i % 9) * DAY, due: now + ((i % 12) - 3) * DAY, interval: 6 };
    st.data.cards.subjectStats[c.subj] = { correct: 40 + (i % 50), wrong: 6 + (i % 9) };
  });
  st.data.progression.totalCorrect = 820; st.data.progression.totalWrong = 260; st.data.progression.totalEncounters = 1080;
  st.data.settings.examDate = new Date(now + 62 * DAY).toISOString().slice(0, 10);
  st.save();
});
await page.locator('[data-screen="screenStats"]').click();
await page.waitForTimeout(1500);
landing.stats = await save('stats');
await page.locator('[data-screen="screenShop"]').click();
await page.waitForTimeout(3500);
landing.locker = await save('locker');
await browser.close();

// the landing page uses smaller copies (585 px wide)
for (const [name, buf] of Object.entries(landing)) {
  await sharp(buf).resize({ width: 585 }).png().toFile(`${landingDir}/${name}.png`);
  console.log('wrote landing/' + name);
}
