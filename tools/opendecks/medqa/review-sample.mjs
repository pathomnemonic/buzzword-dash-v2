// Stage 4 helper: seeded random sample of kept cards, printed next to the ORIGINAL vignette for an independent re-read.
import { readFileSync } from 'node:fs';
var a = JSON.parse(readFileSync(process.argv[2], 'utf8')).passed, sample = {};
JSON.parse(readFileSync(process.argv[3], 'utf8')).forEach(function (r) { sample[r.i] = r; });
var n = +(process.argv[4] || 80), seed = 20261013;
function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var r = rng(seed), idx = a.map(function (_, i) { return i; });
for (var i = idx.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
var from = +(process.argv[5] || 0);
idx.slice(from, from + n).forEach(function (k) {
  var c = a[k], s = sample[c.i];
  console.log('=== #' + c.i + ' ' + c.tags[1] + '\nORIG: ' + s.question + '\n  ' + Object.keys(s.options).map(function (L) { return L + ') ' + s.options[L]; }).join(' | ') + ' KEY=' + s.answer_idx);
  console.log('CARD: ' + c.bw.join(' / ') + ' => ' + c.ans + ' | wrong: ' + c.d.join(' ; ') + '\n  tp: ' + c.tp);
});
