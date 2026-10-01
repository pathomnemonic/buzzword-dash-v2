/* global localStorage, window, document, getComputedStyle */
// tools/verify-multiplayer.mjs — checks that two players can really connect.
// Opens two separate browsers, hosts a room in one, joins it from the other, and
// prints what each lobby shows. Needs internet (PeerJS public signaling server).
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/verify-multiplayer.mjs [http://localhost:4190]

import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:4190';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });

async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(base + '/?debug=1');
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#obNextBtn');
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
  await page.waitForTimeout(1500);
  await page.evaluate((n) => { const k = 'buzzword_dash_v1'; const d = JSON.parse(localStorage.getItem(k)); d.profile = d.profile || {}; d.profile.name = n; localStorage.setItem(k, JSON.stringify(d)); }, name);
  return page;
}
const lobby = (p) => p.locator('#mpContent').innerText().catch(() => '(no lobby)');

const host = await player('Hosty');
const guest = await player('Guesty');
await host.locator('#multiplayerBtn').click();
await host.locator('#mpHostBtn').click();
await host.locator('.mp-room-code').waitFor({ timeout: 20000 });
const code = (await host.locator('.mp-room-code').innerText()).trim();
console.log('room code:', code);

await guest.locator('#multiplayerBtn').click();
await guest.locator('#mpJoinCode').fill(code);
await guest.locator('#mpJoinBtn').click();
await guest.waitForTimeout(8000);
console.log('--- host lobby ---\n' + await lobby(host));
console.log('--- guest lobby ---\n' + await lobby(guest));
await host.screenshot({ path: process.env.TEMP + '/mp-host.png' });
await guest.screenshot({ path: process.env.TEMP + '/mp-guest.png' });

// Both ready up, the match starts, and the two runs see each other
await host.locator('#mpReadyBtn').click();
await guest.locator('#mpReadyBtn').click();
await host.locator('#mpStartMatchBtn').click({ timeout: 15000 });
await host.waitForTimeout(12000);
const hud = (p) => p.evaluate(() => ({
  running: !!(window.__game && window.__game.running),
  mode: window.__game && window.__game.mode,
  opponentVisible: !document.getElementById('opponentHud').hidden, oppText: document.getElementById('opponentHud').innerText.split(String.fromCharCode(10)).join(' '), oppDisplay: getComputedStyle(document.getElementById('opponentHud')).display,
  me: document.getElementById('hudScore').textContent
}));
console.log('host in match:', JSON.stringify(await hud(host)));
console.log('guest in match:', JSON.stringify(await hud(guest)));
await host.waitForTimeout(25000);
console.log('host after 25s:', JSON.stringify(await hud(host)), 'opp score', await host.locator('#opponentScore').innerText());
console.log('guest after 25s:', JSON.stringify(await hud(guest)), 'opp score', await guest.locator('#opponentScore').innerText());
await host.screenshot({ path: process.env.TEMP + '/mp-host-run.png' });
// The host quits: the guest should be told
await host.locator('#pauseBtn').click();
await host.locator('#endRunBtn').click();
await guest.waitForTimeout(6000);
console.log('guest after host quits: ' + (await guest.evaluate(() => document.body.innerText.slice(0, 400).split(/\s+/).join(' '))));
await guest.screenshot({ path: process.env.TEMP + '/mp-guest-end.png' });
await browser.close();
