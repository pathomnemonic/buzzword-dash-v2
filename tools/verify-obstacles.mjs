/* global localStorage, window */
// tools/verify-obstacles.mjs — obstacles must never sit in the right answer's lane or arrive before the answer is locked;
// staffed (animated) obstacles must animate.   node tools/verify-obstacles.mjs [http://localhost:4190]
import { chromium } from '@playwright/test';
const base = process.argv[2] || 'http://localhost:4190';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { const k = 'buzzword_dash_v1'; const d = JSON.parse(localStorage.getItem(k) || 'null'); if (d) { d.settings.quality = 'high'; localStorage.setItem(k, JSON.stringify(d)); } } catch { /* ignore */ } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(base + '/?debug=1');
for (let i = 0; i < 10; i++) { const n = page.locator('#obNextBtn'); if (!(await n.isVisible().catch(() => false))) break; await n.click(); }
const dr = page.locator('#dailyReward button');
await dr.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
for (let i = 0; i < 3 && (await dr.isVisible().catch(() => false)); i++) { await dr.click(); await page.waitForTimeout(1300); }
await page.reload();
for (let i = 0; i < 10; i++) { const n = page.locator('#obNextBtn'); if (!(await n.isVisible().catch(() => false))) break; await n.click(); }
await page.waitForTimeout(1200);
await page.locator('.btn-play').click();
await page.waitForTimeout(7000);
const res = await page.evaluate(() => {
  const g = window.__game;
  const out = { spawned: 0, inCorrectLane: 0, tooEarly: 0, staffed: 0, lanes: [0, 0, 0] };
  for (let i = 0; i < 400; i++) {
    const before = g.obstacleMeshes.length;
    g._transitionToNextEncounter();
    if (g.obstacleMeshes.length > before) {
      const ob = g.obstacleMeshes[g.obstacleMeshes.length - 1];
      out.spawned++;
      out.lanes[ob.userData.lane]++;
      const correct = g.gates.findIndex((x) => x.correct);
      if (ob.userData.lane === correct) out.inCorrectLane++;
      if (ob.position.z >= g.gateZ) out.tooEarly++;
      if (ob.userData.staff) out.staffed++;
    }
    g.obstacleMeshes.forEach((m) => g.scene.remove(m)); g.obstacleMeshes.length = 0;
  }
  return out;
});
console.log(JSON.stringify(res));
let problems = 0;
if (res.spawned < 50) { problems++; console.log('  PROBLEM  too few obstacles spawned to test (' + res.spawned + ')'); }
if (res.inCorrectLane) { problems++; console.log('  PROBLEM  ' + res.inCorrectLane + ' obstacles in the correct lane'); }
if (res.tooEarly) { problems++; console.log('  PROBLEM  ' + res.tooEarly + ' obstacles ahead of the gate'); }
if (!res.staffed) console.log('  note: no staffed obstacle appeared (models may not have loaded yet)');
// a staffed obstacle animates
await page.waitForTimeout(3000);
const anim = await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 400; i++) {
    g._transitionToNextEncounter();
    const ob = g.obstacleMeshes.find((m) => m.userData.staff);
    if (ob) {
      const a = ob.userData.staff.userData.animator;
      return { has: true, clip: a && a.current && a.current.getClip().name, lane: ob.userData.lane };
    }
    g.obstacleMeshes.forEach((m) => g.scene.remove(m)); g.obstacleMeshes.length = 0;
  }
  return { has: false };
});
console.log(JSON.stringify(anim));
if (!anim.has) { problems++; console.log('  PROBLEM  no staffed obstacle could be created'); }
else if (!anim.clip) { problems++; console.log('  PROBLEM  staff member has no animation playing'); }
if (errs.length) { problems++; console.log('  PROBLEM  script errors: ' + errs.slice(0, 2).join(' | ')); }
await page.waitForTimeout(2500);
await page.screenshot({ path: (process.env.TEMP || '.') + '/staff.png' });
await browser.close();
console.log(problems ? problems + ' problem(s)' : 'No problems found');
process.exit(problems ? 1 : 0);
