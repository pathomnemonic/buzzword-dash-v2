// Stage 5: choose the final deck from the cards that passed assemble.mjs and write tools/opendecks/out/medqa-runner.json
// Usage: node build-deck.mjs <assembled.json> <passages dir> <out deck.json> <out source dir> [target=500]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
var a = JSON.parse(readFileSync(process.argv[2], 'utf8')).passed;
var pass = process.argv[3], out = process.argv[4], srcOut = process.argv[5], target = +(process.argv[6] || 500);
var REVIEW_DROP = { 8138: 'D2 blockers also defensible', 989: 'two ultrasound options defensible', 7056: 'dabigatran defensible after lead-in', 8715: 'vague cytokine item' };
var pool = a.filter(function (c) { return !c.rw && !REVIEW_DROP[c.i]; });
function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var r = rng(77);
// trim to target by dropping random cards from the largest (subject x step) cells
while (pool.length > target) {
  var cells = {}; pool.forEach(function (c, k) { var key = c.subj + '|' + c.tags[1]; (cells[key] = cells[key] || []).push(k); });
  var big = Object.keys(cells).sort(function (x, y) { return cells[y].length - cells[x].length; })[0];
  var ks = cells[big]; pool.splice(ks[Math.floor(r() * ks.length)], 1);
}
pool.sort(function (x, y) { return x.i - y.i; });
mkdirSync(srcOut, { recursive: true });
var cards = pool.map(function (c) {
  copyFileSync(pass + '/' + c.source_ref + '.txt', srcOut + '/' + c.source_ref + '.txt');
  return { subj: c.subj, bw: c.bw, ans: c.ans, d: c.d, tp: c.tp, ww: c.ww, source_ref: c.source_ref, evidence: c.evidence, tags: c.tags, exams: c.exams };
});
var deck = {
  format: 1, id: 'medqa', title: 'USMLE-style concepts (MedQA)',
  source: 'MedQA-USMLE-4-options (Jin et al.), AI-distilled',
  licence: { name: 'CC BY 4.0 (as listed on the dataset card)', url: 'https://creativecommons.org/licenses/by/4.0/' },
  provenance: 'The Hugging Face dataset card for GBaker/MedQA-USMLE-4-options lists CC BY 4.0 (the original MedQA authors do not state a licence in the paper). The origin of the underlying exam questions has not been verified, and the maintainer chose to accept that risk for this pilot. Each card was distilled by an AI from one vignette; source_ref points to the vignette, its options and the keyed answer (the "evidence" sentence is the dataset keyed answer, not a textbook source).',
  attribution: 'Adapted from the MedQA dataset: Jin, D., Pan, E., Oufattole, N., Weng, W.-H., Fang, H., Szolovits, P. "What Disease does this Patient Have? A Large-scale Open Domain Question Answering Dataset from Medical Exams" (arXiv:2009.13081, 2020), as redistributed at huggingface.co/datasets/GBaker/MedQA-USMLE-4-options. Cards are AI-distilled concepts, not verified for exam accuracy and not reviewed by a clinician.',
  url: 'https://huggingface.co/datasets/GBaker/MedQA-USMLE-4-options',
  author: 'Jin et al. (MedQA); cards distilled by Dx Dash',
  version: '1.0.0', count: cards.length, cards: cards
};
writeFileSync(out, JSON.stringify(deck, null, 1) + '\n');
var bySub = {}, byStep = {}; cards.forEach(function (c) { bySub[c.subj] = (bySub[c.subj] || 0) + 1; byStep[c.tags[1]] = (byStep[c.tags[1]] || 0) + 1; });
console.log(cards.length + ' cards', JSON.stringify(byStep), JSON.stringify(bySub));
