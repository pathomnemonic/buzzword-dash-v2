/* global localStorage, window */
// tools/verify-flows.mjs — checks that the big features WORK end to end, not just that their buttons respond.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/verify-flows.mjs [http://localhost:4190]
//
// Exam simulator (answer, finish, report), Challenge (run starts, ends, result), the study picker for
// flashcards (every way of choosing cards), hands-free audio (speech stubbed), Weekly Tournament.

import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:4190';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let problems = 0;
const bad = (m) => { problems++; console.log('  PROBLEM  ' + m); };
const ok = (m) => console.log('  ok  ' + m);

async function open(seed = true) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    // a fake speech engine so hands-free can run headless
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', { value: { speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 20); }, cancel() {}, getVoices() { return []; } }, configurable: true });
    window.confirm = () => true;
  });
  if (seed) {
    await ctx.addInitScript(() => {
      try {
        const k = 'buzzword_dash_v1';
        const d = JSON.parse(localStorage.getItem(k) || 'null');
        if (!d) return;
        d.cards = d.cards || {}; d.cards.cardStats = d.cards.cardStats || {};
        for (let i = 1; i <= 15; i++) d.cards.cardStats['n' + String(i).padStart(3, '0')] = { seen: 4, correct: 1, wrong: 3, due: Date.now() - 1000, last: Date.now() - 100000 };
        localStorage.setItem(k, JSON.stringify(d));
      } catch { /* ignore */ }
    });
  }
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) page.errs.push(m.text().slice(0, 160)); });
  await page.goto(base + '/?debug=1');
  for (let i = 0; i < 10; i++) { const n = page.locator('#tutSkipBtn'); if (!(await n.isVisible().catch(() => false))) break; await n.click(); }
  const dr = page.locator('#dailyReward button');
  await dr.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 3 && (await dr.isVisible().catch(() => false)); i++) { await dr.click(); await page.waitForTimeout(1300); }
  await page.reload();
  for (let i = 0; i < 10; i++) { const n = page.locator('#tutSkipBtn'); if (!(await n.isVisible().catch(() => false))) break; await n.click(); }
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const errs = (name, page) => { const e = page.errs.filter((x) => !/Dropped|auto-fix/.test(x)); if (e.length) bad(name + ': script errors: ' + e.slice(0, 2).join(' | ')); };

// ---- exam simulator ----
console.log('\n== exam simulator');
{
  const { ctx, page } = await open();
  await page.locator('#examBtn').click();
  await page.getByRole('button', { name: /Start exam/ }).click();
  await page.locator('#examContent').getByText(/Question 1 of/).waitFor({ timeout: 5000 }).then(() => ok('exam starts'), () => bad('exam did not show question 1'));
  for (let i = 0; i < 45; i++) {
    await page.locator('#examContent [role="radio"]').first().click();
    const finish = page.getByRole('button', { name: /^Finish$/ });
    if (await finish.count()) { await finish.click(); break; }
    await page.getByRole('button', { name: /Next/ }).click();
  }
  await page.locator('#examContent').getByText(/score|accuracy|%/i).first().waitFor({ timeout: 5000 }).then(() => ok('exam report shows'), () => bad('no exam report after finishing'));
  errs('exam', page);
  await ctx.close();
}

// ---- challenge ----
console.log('\n== challenge');
{
  const { ctx, page } = await open();
  await page.locator('#challengeBtn').click();
  await page.waitForTimeout(6500);
  const st = await page.evaluate(() => window.__game._state);
  if (st !== 'playing') bad('challenge did not start (state ' + st + ')'); else ok('challenge run is playing');
  await page.evaluate(() => window.__game.endRun());
  await page.waitForTimeout(2500);
  if (!(await page.locator('#screenPostRun.active').count())) bad('no results screen after a challenge'); else ok('challenge results show');
  errs('challenge', page);
  await ctx.close();
}

// ---- study picker: flashcards ----
console.log('\n== flashcards: choosing cards');
for (const [label, src] of [['My subjects', 'mine'], ['Due for review', 'due'], ['Cards I miss', 'missed'], ['New cards', 'fresh'], ['Pick subjects', 'subjects']]) {
  const { ctx, page } = await open();
  await page.locator('#flashcardBtn').click();
  await page.locator('.pick-source', { hasText: label }).click();
  if (src === 'subjects') await page.locator('.pick-chip', { hasText: 'Cardiology' }).first().click();
  await page.locator('.pick-chip', { hasText: /^10$/ }).click();
  await page.getByRole('button', { name: /Flip cards/ }).click();
  const started = await page.locator('#flashcardContent').getByText(/Card 1 of/).waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (!started) bad(src + ': flashcard session did not start'); else {
    const total = await page.locator('#flashcardContent').innerText();
    const m = total.match(/Card 1 of (\d+)/);
    ok(src + ': started' + (m ? ' with ' + m[1] + ' cards' : ''));
    if (m && Number(m[1]) > 10) bad(src + ': asked for 10 cards but got ' + m[1]);
  }
  errs('flashcards ' + src, page);
  await ctx.close();
}

// ---- hands-free ----
console.log('\n== hands-free audio');
{
  const { ctx, page } = await open();
  await page.locator('#flashcardBtn').click();
  await page.locator('.pick-source', { hasText: 'Cards I miss' }).click();
  await page.locator('.pick-chip', { hasText: /^10$/ }).click();
  await page.getByRole('button', { name: /Listen hands-free/ }).click();
  await page.locator('#flashcardContent').getByText(/Hands-free/).waitFor({ timeout: 4000 }).then(() => ok('hands-free started'), () => bad('hands-free did not start'));
  await page.waitForTimeout(1500);
  const spoken = await page.evaluate(() => window.__spoken.length);
  if (spoken < 1) bad('hands-free spoke nothing'); else ok('hands-free spoke ' + spoken + ' line(s)');
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.waitForTimeout(800);
  if (!(await page.locator('#flashcardContent').getByText(/finished/i).count())) bad('stopping did not finish the session'); else ok('stop works');
  errs('hands-free', page);
  await ctx.close();
}

// ---- weekly tournament ----
console.log('\n== weekly tournament');
{
  const { ctx, page } = await open();
  await page.locator('#tournamentBtn').click();
  await page.waitForTimeout(6500);
  const st = await page.evaluate(() => window.__game._state);
  const toast = await page.locator('body').innerText();
  if (st !== 'playing') bad('tournament did not start (state ' + st + ')' + (/tournament/i.test(toast) ? '' : ''));
  else ok('tournament run is playing');
  errs('tournament', page);
  await ctx.close();
}

await browser.close();
console.log(problems ? '\n' + problems + ' problem(s) found' : '\nNo problems found');
process.exit(problems ? 1 : 0);
