/* eslint-disable no-unused-vars, no-empty -- one-off conversion tool; kept for reproducibility */
// Stage 2-3 builder: AI conversions (conv/*.txt, one line per sampled row) -> candidate cards in deck format 1.
//   node tools/opendecks/medalpaca/build.mjs <workdir>      (workdir holds sample.json, conv/*.txt, optional ww.json)
// conv line:  n|hint|answer|wrong1|wrong2[|S=Subj]   keep      n|X|reason   exclude
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDeck, answerSupport, norm } from '../check.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const work = process.argv[2];
const sample = JSON.parse(readFileSync(join(work, 'sample.json'), 'utf8'));
const byN = new Map(sample.map((r) => [r.n, r]));
const ABBR = { Neu: 'Neurology', Car: 'Cardiology', Neph: 'Nephrology', Psy: 'Psychiatry', GI: 'Gastroenterology', Pul: 'Pulmonology', ID: 'Infectious Disease', Endo: 'Endocrinology', HO: 'Hematology/Oncology', Rheum: 'Rheumatology', OB: 'Obstetrics/Gynecology', Peds: 'Pediatrics', Surg: 'Surgery', EM: 'Emergency Medicine', Multi: 'Multisystem / Mixed' };
const wwFile = join(work, 'ww.json');
const ww = existsSync(wwFile) ? JSON.parse(readFileSync(wwFile, 'utf8')) : {};
const convDir = join(work, 'conv');
const excluded = []; const cards = [];
function sentences(t) { return t.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/).map((s) => s.trim()).filter(Boolean); }
function cleanTp(raw, q) {
  let t = raw.trim();
  const qi = t.indexOf(q);
  if (qi === 0) t = t.slice(q.length).trim();
  t = t.replace(/^(As per|According to) the information provided,\s*/i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function splitHint(h) {
  const c = h.indexOf(': ');
  if (c > 3 && c < h.length - 4 && h.slice(0, c).length <= 60 && h.slice(c + 2).length <= 60) return [h.slice(0, c), h.slice(c + 2)];
  if (h.length <= 60) return [h];
  const mid = h.length / 2; let best = -1;
  [': ', ', ', ' - ', ' and ', ' with '].forEach((sep) => { let i = h.indexOf(sep); while (i >= 0) { if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i; i = h.indexOf(sep, i + 1); } });
  return best > 0 ? [h.slice(0, best).replace(/[:,]$/, '').trim(), h.slice(best).replace(/^[:, ]+(and |with )?/, (m) => m.includes('with') || m.includes('and') ? '' : '').trim()] : [h];
}
const lines = new Map();
readdirSync(convDir).filter((f) => f.endsWith('.txt')).sort().forEach((f) => readFileSync(join(convDir, f), 'utf8').split('\n').filter(Boolean).forEach((l) => lines.set(+l.split('|')[0], l)));
[...lines.values()].forEach((line) => {
  const p = line.split('|'); const n = +p[0]; const r = byN.get(n); if (!r) return;
  if (p[1] === 'X') { excluded.push({ n, row: r.row, reason: p[2] }); return; }
  let subj = r.subj; const hintRaw = p[1]; const ans = p[2]; const d = [p[3], p[4]];
  const sx = p.slice(5).find((x) => x.startsWith('S='));
  if (sx) subj = ABBR[sx.slice(2)] || sx.slice(2);
  const raw = r.a.replace(/^.*\?\s+(?=[A-Z])/, (m) => (r.a.startsWith(r.q) ? '' : m));
  const sents = sentences(r.a.startsWith(r.q) ? r.a.slice(r.q.length).trim() : r.a);
  let ev = sents[0] || r.a, bestS = -1;
  sents.forEach((s) => { const a = answerSupport(ans, s); if (a > bestS + 1e-9) { bestS = a; ev = s; } });
  const tpFull = cleanTp(r.a, r.q);
  const tp = tpFull.length <= 300 && sentences(tpFull).length <= 2 ? tpFull : cleanTp(ev, r.q).slice(0, 300);
  const key = 'mp' + r.row;
  const w = ww[key] || ['Not supported by the source sentence.', 'Not supported by the source sentence.'];
  cards.push({ subj, bw: splitHint(hintRaw), ans, d, tp, ww: { [d[0]]: w[0], [d[1]]: w[1] }, source_ref: key, evidence: ev, tags: ['medalpaca', r.disc], n });
});
const deck = {
  format: 1, id: 'medalpaca', title: 'Medical flashcards (MedAlpaca)',
  source: 'MedAlpaca medical flashcards (Han et al., 2023)',
  licence: { name: 'cc, variant not specified on the dataset card', url: 'https://huggingface.co/datasets/medalpaca/medical_meadow_medical_flashcards' },
  attribution: 'UNVERIFIED PROVENANCE. Derived from medalpaca/medical_meadow_medical_flashcards (Han et al., MedAlpaca, 2023), whose rows the authors derived from a community-made Anki medical curriculum deck and rephrased with GPT-3.5. The dataset card lists the licence as "cc" without a variant, so redistribution rights are unclear. Questions converted to runner format by an AI and checked automatically; not reviewed by a clinician.',
  url: 'https://huggingface.co/datasets/medalpaca/medical_meadow_medical_flashcards',
  author: 'Han et al. (MedAlpaca, 2023); runner conversion by Dx Dash',
  version: '0.1.0', unverified: true, count: cards.length, cards
};
mkdirSync(join(work, 'source'), { recursive: true });
cards.forEach((c) => { const r = sample.find((x) => 'mp' + x.row === c.source_ref); writeFileSync(join(work, 'source', c.source_ref + '.txt'), r.q + '\n' + r.a + '\n'); });
writeFileSync(join(work, 'candidates.json'), JSON.stringify(deck, null, 1));
writeFileSync(join(work, 'excluded.json'), JSON.stringify(excluded, null, 1));
const res = checkDeck(deck, { sourceDir: join(work, 'source') });
console.log(JSON.stringify({ kept: cards.length, excluded: excluded.length, pass: res.passed.length, fail: res.failed.length, byCode: res.byCode, header: res.header, warned: res.warned }));
writeFileSync(join(work, 'check-fails.json'), JSON.stringify(res.failed.map((f) => ({ n: f.card.n, ans: f.card.ans, bw: f.card.bw, errors: f.errors.map((e) => e.code + ': ' + e.message) })), null, 1));
