// Turn the AI replies for a deck into a deck file (format 1), using the app's REAL reply parser (parseAiReply in
// js/importguide.js) so the test covers the path a player's own AI-helper import takes.
//
//   node tools/opendecks/build.mjs            -> tools/opendecks/out/<deckId>.candidates.json  (every card the parser kept)
//                                              and prompts under tools/opendecks/batches/<ref>.prompt.txt
//
// Inputs:  sections.json (header + section list), source/<deck>/<ref>.txt (passages), replies/<ref>.json (the AI reply per passage)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAiPrompt, parseAiReply } from '../../js/importguide.js';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'sections.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(here, 'source', cfg.deck, 'manifest.json'), 'utf8'));

/** The extra instruction appended to the app's own prompt: the two provenance fields the Open decks checks need. */
export const EXTRA_INSTRUCTIONS = [
  '',
  'Extra rules for this batch (the text below is a textbook passage, not flashcards; treat each fact worth a quiz question as a card):',
  '- Add two more fields to each object: "source_ref" (the passage id given below) and "evidence" (ONE sentence copied word for word from the passage that proves the answer).',
  '- "bw" is what a player reads while running: 1 to 3 short clues, each under 60 characters, 130 characters in total, and it must not contain the answer.',
  '- "ans" and each wrong answer must be under 50 characters. Exactly one answer may be defensible.',
  '- Never use a fact that is not in the passage.'
].join('\n');

export function promptFor(ref, passage) {
  return buildAiPrompt() + '\n' + EXTRA_INSTRUCTIONS + '\n\nPassage id: ' + ref + '\n\n' + passage;
}

const batches = join(here, 'batches');
mkdirSync(batches, { recursive: true });
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const dropFile = join(here, 'review-drops.json');
const drops = existsSync(dropFile) ? JSON.parse(readFileSync(dropFile, 'utf8')) : [];
const isDropped = (c) => !c.round && drops.some((d) => d.source_ref === c.source_ref && d.ans === c.ans && c.bw[0].startsWith(d.bw0)) || (c.round === 2 && drops.some((d) => d.source_ref === c.source_ref && d.ans === c.ans && c.bw[0].startsWith(d.bw0)));

const cards = [];
const stats = { sections: 0, replies: 0, parsed: 0, skippedByParser: 0, noReply: [] };
manifest.sections.forEach((s) => {
  const passage = readFileSync(join(here, 'source', cfg.deck, s.ref + '.txt'), 'utf8');
  writeFileSync(join(batches, s.ref + '.prompt.txt'), promptFor(s.ref, passage));
  stats.sections++;
  const rf = join(here, 'replies', s.ref + '.json');
  if (!existsSync(rf)) { stats.noReply.push(s.ref); return; }
  stats.replies++;
  const res = parseAiReply(readFileSync(rf, 'utf8'));
  if (res.error) { console.error(s.ref + ': ' + res.error); return; }
  // round 2: the AI is asked again for the cards the checks rejected (replies-r2/<ref>.json), same parser, same checks
  const rf2 = join(here, 'replies-r2', s.ref + '.json');
  let round2 = 0;
  if (existsSync(rf2)) {
    const r2 = parseAiReply(readFileSync(rf2, 'utf8'));
    if (!r2.error) { res.cards = res.cards.concat(r2.cards.map((c) => Object.assign(c, { round: 2 }))); round2 = r2.cards.length; res.skipped += r2.skipped; }
  }
  // round 3: cards rewritten after the independent review (replies-r3/<ref>.json); review-drops.json lists what they replace
  const rf3 = join(here, 'replies-r3', s.ref + '.json');
  if (existsSync(rf3)) {
    const r3 = parseAiReply(readFileSync(rf3, 'utf8'));
    if (!r3.error) { res.cards = res.cards.concat(r3.cards.map((c) => Object.assign(c, { round: 3 }))); stats.round3 = (stats.round3 || 0) + r3.cards.length; }
  }
  stats.round2 = (stats.round2 || 0) + round2;
  stats.parsed += res.cards.length;
  stats.skippedByParser += res.skipped;
  const root = cfg.tagRoots[s.ref.split('.')[0]] || 'Other';
  const topic = (s.ref + '_' + s.title).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  res.cards.forEach((c) => {
    if (c.round !== 3 && isDropped(c)) { stats.droppedAfterReview = (stats.droppedAfterReview || 0) + 1; return; }
    cards.push({
      subj: c.subj, bw: c.bw, ans: c.ans, d: c.d, tp: c.tp, ww: c.ww,
      tags: ['OpenStax_AP::' + root + '::' + topic],
      source_ref: c.source_ref || '', evidence: c.evidence || '',
      ...(c.round ? { round: c.round } : {})
    });
  });
});

const deck = Object.assign({}, cfg.header, { count: cards.length, cards });
writeFileSync(join(out, cfg.header.id + '.candidates.json'), JSON.stringify(deck, null, 1) + '\n');
console.log(JSON.stringify(stats));
console.log('candidates: ' + cards.length + ' -> tools/opendecks/out/' + cfg.header.id + '.candidates.json');
