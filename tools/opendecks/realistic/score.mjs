/* eslint-disable no-unused-vars -- one-off conversion tool; kept for reproducibility */
// Scores raw AI replies (as a player would paste them) with the app's own parser.
// usage: node tools/opendecks/realistic/score.mjs [repliesDir] [promptsDir]
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { parseAiReply } from '../../../js/importguide.js';
const rdir = process.argv[2] || '/tmp/realistic/replies';
const pdir = process.argv[3] || '/tmp/realistic/prompts';
const rows = [];
const all = [];
for (const f of readdirSync(rdir).filter((x) => x.endsWith('.txt')).sort()) {
  const text = readFileSync(rdir + '/' + f, 'utf8');
  const batch = f.replace(/^[a-z]+-/, '').replace('.txt', '');
  const p = pdir + '/' + batch + '.txt';
  const mf = existsSync(pdir + '/manifest.json') ? JSON.parse(readFileSync(pdir + '/manifest.json', 'utf8')) : [];
  const inputCards = (mf.find((m) => m.name === batch) || {}).count || 0;
  const t = text.trim();
  const pureJson = (() => { try { return Array.isArray(JSON.parse(t)); } catch (e) { return false; } })();
  const r = parseAiReply(text);
  const leaks = r.cards.filter((c) => c.bw.some((b) => c.ans.length > 3 && b.toLowerCase().includes(c.ans.toLowerCase()))).length;
  const wwOk = r.cards.filter((c) => c.d.every((d) => c.ww[d])).length;
  const longAns = r.cards.filter((c) => c.ans.length > 60).length;
  const longClue = r.cards.filter((c) => c.bw.join(' ').length > 120).length;
  rows.push({ file: f, input: inputCards, usable: r.cards.length, skippedByParser: r.skipped, error: r.error ? r.error.slice(0, 60) : '', pureJsonNoCommentary: pureJson, answerInClue: leaks, whyWrongForBoth: wwOk, ansOver60: longAns, clueOver120: longClue });
  r.cards.forEach((c) => all.push({ file: f, ...c }));
}
console.table(rows);
writeFileSync('/tmp/realistic/parsed.json', JSON.stringify(all, null, 1));
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log('input cards', sum('input'), 'usable cards', sum('usable'), 'yield', (sum('usable') / Math.max(1, sum('input')) * 100).toFixed(0) + '%');
