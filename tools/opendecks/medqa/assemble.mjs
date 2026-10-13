// Stage 3: turn the distilled batch files (b*.jsonl, one line per sample row) into deck cards, write the per-card
// source passages (vignette + options + keyed answer) and run tools/opendecks/check.mjs on them.
// Usage: node assemble.mjs <workdir with sample.json and b/> <out deck.json> [--source <passage dir>]
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { checkCard, duplicateOf } from '../check.mjs';
var wd = process.argv[2], outFile = process.argv[3];
var srcDir = process.argv.indexOf('--source') > 0 ? process.argv[process.argv.indexOf('--source') + 1] : 'source';
mkdirSync(srcDir, { recursive: true });
var sample = {}; JSON.parse(readFileSync(wd + '/sample.json', 'utf8')).forEach(function (r) { sample[r.i] = r; });

/** "Context a, context b: what is asked?" -> 1-3 clues of <=60 chars. */
export function hintToClues(h) {
  var m = /^(.*?):\s*([^:]*\?)$/.exec(h), ctx, q;
  if (m) { ctx = m[1]; q = m[2]; } else if (/\?$/.test(h)) { var k = h.lastIndexOf(', '); ctx = h; q = null; } else { ctx = h; q = null; }
  var items = ctx.split(/,\s+/);
  var clues = [];
  if (items.length <= 2 || !q) clues = items.slice(0, q ? 2 : 3);
  else { clues = [items.slice(0, Math.ceil(items.length / 2)).join(', '), items.slice(Math.ceil(items.length / 2)).join(', ')]; }
  if (q) clues.push(q.charAt(0).toUpperCase() + q.slice(1));
  return clues.map(function (c) { return c.charAt(0).toUpperCase() + c.slice(1); });
}

function sentences(t) { return t.replace(/\s+/g, ' ').split(/(?<=[.?!])\s+(?=[A-Z0-9(])/); }

var lines = [];
readdirSync(wd + '/b').filter(function (f) { return /^b\d+\.jsonl$/.test(f); }).sort().forEach(function (f) {
  readFileSync(wd + '/b/' + f, 'utf8').trim().split('\n').forEach(function (l) { if (l.trim()) lines.push(JSON.parse(l)); });
});
var fixes = {}; try { readFileSync(wd + '/b/fix.jsonl', 'utf8').trim().split('\n').forEach(function (l) { if (l.trim()) { var f = JSON.parse(l); fixes[f.i] = Object.assign(fixes[f.i] || {}, f); } }); } catch (e) {}
var cards = [], log = { excluded: [], kept: 0, fail: {} }, byIdx = {};
lines.forEach(function (x) {
  if (fixes[x.i]) { x = Object.assign({}, x, fixes[x.i]); if (fixes[x.i].bw) delete x.h; if (fixes[x.i].x === undefined && x.x && fixes[x.i].a) delete x.x; }
  if (x.x) { log.excluded.push({ i: x.i, reason: x.x }); return; }
  var r = sample[x.i]; if (!r) { log.fail['missing row'] = (log.fail['missing row'] || 0) + 1; return; }
  var opt = r.options, keyed = opt[r.answer_idx];
  var ans = x.a || keyed;
  var d = typeof x.d === 'string' ? x.d.split('').map(function (L) { return opt[L]; }) : x.d;
  var bw = x.bw || hintToClues(x.h);
  var ref = 'medqa-' + x.i;
  var passage = r.question + '\nOptions: ' + Object.keys(opt).map(function (L) { return L + ') ' + opt[L]; }).join('; ') + '.\nThe keyed answer is ' + r.answer_idx + ') ' + keyed + '.\n';
  writeFileSync(srcDir + '/' + ref + '.txt', passage);
  var keyedLine = 'The keyed answer is ' + r.answer_idx + ') ' + keyed + '.';
  // evidence: the vignette sentence that supports the answer best, else the keyed-answer line
  var cands = sentences(r.question).concat([keyedLine]);
  var ev = keyedLine;
  var ww = {}; (x.w || []).forEach(function (t, k) { ww[d[k]] = t; });
  var card = {
    subj: x.s, bw: bw, ans: ans, d: d, tp: x.p, ww: ww, source_ref: ref, evidence: ev,
    tags: ['medqa', r.meta_info === 'step1' ? 'step1' : 'step2-3'], exams: r.meta_info === 'step1' ? ['step1'] : ['step2', 'step3'],
    questionType: undefined
  };
  card.i = x.i; card.rw = x.rw ? 1 : 0;
  cards.push(card);
});
var passed = [], failed = [];
cards.forEach(function (c) {
  var res = checkCard(c, { passage: readFileSync(srcDir + '/' + c.source_ref + '.txt', 'utf8') });
  var errs = res.errors;
  if (!errs.length) { var dup = passed.find(function (p) { return duplicateOf(p, c); }); if (dup) errs = [{ code: 'duplicate', message: 'dup of ' + dup.i }]; }
  if (errs.length) failed.push({ c: c, errors: errs }); else passed.push(c);
});
writeFileSync(outFile, JSON.stringify({ passed: passed, failed: failed, excluded: log.excluded }, null, 1));
var by = {}; failed.forEach(function (f) { new Set(f.errors.map(function (e) { return e.code; })).forEach(function (k) { by[k] = (by[k] || 0) + 1; }); });
console.log('lines ' + lines.length + ' | excluded ' + log.excluded.length + ' | cards ' + cards.length + ' | pass ' + passed.length + ' | fail ' + failed.length + ' ' + JSON.stringify(by));
