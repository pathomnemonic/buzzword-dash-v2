/* global window, document */
// tools/verify-ranked.mjs — plays a ranked match end to end between two real browsers.
//
// The browsers talk to each other over PeerJS (needs internet). The "server" is the
// real database/schema.sql running in PGlite inside this script, so the matchmaking,
// trophy and league rules are the real ones. Not covered: the live Supabase service.
//
//   npm run build && npx vite preview --port 4190 &   (then)
//   node tools/verify-ranked.mjs [http://localhost:4190]

import { chromium } from '@playwright/test';

const dismissDaily = async (pg) => {
  const overlay = pg.locator('#dailyReward');
  try { await overlay.waitFor({ state: 'visible', timeout: 3000 }); } catch { return; }
  for (let i = 0; i < 3 && (await overlay.isVisible().catch(() => false)); i++) {
    await overlay.locator('button').click();
    await pg.waitForTimeout(1200);
  }
};
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:4190';
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const names = { [A]: 'Ada', [B]: 'Bo' };

// ----- the database -----
const db = new PGlite();
await db.exec(`
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE anon NOLOGIN;
  CREATE PUBLICATION supabase_realtime;
`);
await db.exec(readFileSync('database/schema.sql', 'utf8'));
await db.exec(readFileSync('database/policies.sql', 'utf8'));
await db.exec(`
  GRANT USAGE ON SCHEMA public, auth TO authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  INSERT INTO auth.users VALUES ('${A}'), ('${B}');
  INSERT INTO player_profiles (user_id, player_name) VALUES ('${A}', 'Ada'), ('${B}', 'Bo');
`);
const setTrophies = (n) => db.query('INSERT INTO player_trophies (user_id, trophies) VALUES ($1,$3),($2,$3) ON CONFLICT (user_id) DO UPDATE SET trophies = $3', [A, B, n]);

let chain = Promise.resolve();
async function rpc(user, name, args) {
  const run = async () => {
    await db.exec(`SET app.uid = '${user}'; SET ROLE authenticated;`);
    try {
      let res;
      const a = args || {};
      if (name === 'ranked_find_match') res = await db.query('SELECT ranked_find_match($1) AS r', [a.p_room_code]);
      else if (name === 'ranked_poll_match') res = await db.query('SELECT ranked_poll_match() AS r');
      else if (name === 'ranked_cancel') res = await db.query('SELECT ranked_cancel() AS r');
      else if (name === 'ranked_report') res = await db.query('SELECT ranked_report($1, $2) AS r', [a.p_match, a.p_outcome]);
      else if (name === 'ranked_settle_stale') res = await db.query('SELECT ranked_settle_stale() AS r');
      else if (name === 'ranked_my_stats') res = await db.query('SELECT to_jsonb(t) AS r FROM ranked_my_stats() t');
      else if (name === 'ranked_top') return { data: (await db.query('SELECT * FROM ranked_top($1)', [a.p_limit])).rows, error: null };
      else throw new Error('unknown rpc ' + name);
      return { data: res.rows[0].r, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    } finally {
      await db.exec('RESET ROLE');
    }
  };
  const p = chain.then(run);
  chain = p.catch(() => null);
  return p;
}

// ----- the browsers -----
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });

async function player(user) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.exposeFunction('__rpc', (name, args) => rpc(user, name, args));
  await page.goto(base + '/?debug=1');
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#tutSkipBtn');
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
  await page.waitForTimeout(1500);
  await dismissDaily(page);
  await page.evaluate(() => {
    window.__useRankedTestClient({ rpc: (name, args) => window.__rpc(name, args) });
  });
  return page;
}

async function play(label, trophies) {
  await setTrophies(trophies);
  const a = await player(A);
  const b = await player(B);
  for (const p of [a, b]) {
    await p.locator('#multiplayerBtn').click();
    await p.locator('#mpRankedBtn').waitFor({ timeout: 15000 });
  }
  console.log(label + ': league card:', (await a.locator('#rkCard').innerText()).split('\n').join(' | '));
  await a.screenshot({ path: process.env.TEMP + '/ranked-lobby-' + label + '.png' });
  await a.locator('#mpRankedBtn').click();
  await a.waitForTimeout(1500);
  await b.locator('#mpRankedBtn').click();
  // both runs start on their own after the match is found
  await a.waitForTimeout(12000);
  console.log(label + ': Ada lobby:', (await a.locator('#mpContent').innerText().catch(() => '?')).split(/\n/).join(' | '));
  console.log(label + ': Bo lobby:', (await b.locator('#mpContent').innerText().catch(() => '?')).split(/\n/).join(' | '));
  console.log(label + ': queue/matches:', JSON.stringify((await db.query('SELECT (SELECT count(*) FROM ranked_queue) q, (SELECT count(*) FROM ranked_matches) m')).rows[0]));
  await a.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 60000 });
  await b.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 60000 });
  await a.waitForTimeout(8000);
  const info = (p) => p.evaluate(() => ({
    mode: window.__game.mode,
    speed: window.__game.userSpeed,
    disabled: window.__game._rules.disabledPowerups,
    heartEvery: window.__game._leagueRules.heartEvery,
    tier: window.__game._leagueRules.name
  }));
  console.log(label + ': Ada run:', JSON.stringify(await info(a)));
  console.log(label + ': Bo run:', JSON.stringify(await info(b)));
  await a.screenshot({ path: process.env.TEMP + '/ranked-run-' + label + '.png' });

  // Ada quits (forfeits), so Bo wins
  await a.locator('#pauseBtn').click();
  await a.locator('#endRunBtn').click();
  await b.locator('#rankedResult').waitFor({ timeout: 30000 });
  await a.locator('#rankedResult').waitFor({ timeout: 30000 });
  console.log(label + ': Ada sees:', (await a.locator('#rankedResult').innerText()).split('\n').join(' | '));
  await b.waitForFunction(() => document.getElementById('rankedResult').innerText.includes('+'), null, { timeout: 30000 }).catch(() => null);
  console.log(label + ': Bo sees:', (await b.locator('#rankedResult').innerText()).split('\n').join(' | '));
  await b.waitForTimeout(1500);
  await b.screenshot({ path: process.env.TEMP + '/ranked-result-' + label + '.png' });
  const rows = (await db.query('SELECT user_id, trophies, wins, losses FROM player_trophies ORDER BY user_id')).rows;
  console.log(label + ': database:', JSON.stringify(rows.map((r) => ({ name: names[r.user_id], trophies: r.trophies, wins: r.wins, losses: r.losses }))));
  await a.context().close();
  await b.context().close();
}

await play('intern', 0);
await db.exec('DELETE FROM ranked_reports; DELETE FROM ranked_matches; DELETE FROM ranked_queue;');
await play('attending', 1250);
await db.exec('DELETE FROM ranked_reports; DELETE FROM ranked_matches; DELETE FROM ranked_queue;');
await play('dean', 2800);
await browser.close();
await db.close();
