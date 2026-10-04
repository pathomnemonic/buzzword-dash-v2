#!/usr/bin/env node
/**
 * audit-leaks.mjs — a strict, from-scratch check for clues that give the answer away.
 *
 *   node tools/audit-leaks.mjs [--json out.json] [--limit N]
 *
 * Reads every card's ORIGINAL clues (before the load-time filter touches them) and flags:
 *   leak       a clue contains a word, acronym or eponym that is distinctive to the answer (any length, so "CLL" and
 *              "Rai" count), the whole answer, the answer's initials, or a name given in brackets after the answer
 *   title      a clue that is just the answer's name or almost all of it (say "CLL staging" for "CLL Rai Staging")
 *   thin       fewer than 3 clues are left once the leaking ones are taken away
 * It prints a summary by subject and the worst offenders, and writes the full list as JSON.
 */
import { writeFileSync } from 'node:fs';
import { strictLeakReport, deckGenericWords } from '../js/cardleaks.js';
import { CARDIOLOGY_CARDS } from '../js/cards/cardiology.js';
import { EM_CARDS } from '../js/cards/emergency.js';
import { ENDO_CARDS } from '../js/cards/endocrinology.js';
import { GASTRO_CARDS } from '../js/cards/gastroenterology.js';
import { HEMEONC_CARDS } from '../js/cards/hemeonc.js';
import { ID_CARDS } from '../js/cards/infectious.js';
import { MULTI_CARDS } from '../js/cards/multisystem.js';
import { NEPHROLOGY_CARDS } from '../js/cards/nephrology.js';
import { NEUROLOGY_CARDS } from '../js/cards/neurology.js';
import { OBGYN_CARDS } from '../js/cards/obgyn.js';
import { PEDS_CARDS } from '../js/cards/pediatrics.js';
import { PSYCHIATRY_CARDS } from '../js/cards/psychiatry.js';
import { PULM_CARDS } from '../js/cards/pulmonology.js';
import { RHEUM_CARDS } from '../js/cards/rheumatology.js';
import { SURGERY_CARDS } from '../js/cards/surgery.js';

const ALL = [].concat(CARDIOLOGY_CARDS, EM_CARDS, ENDO_CARDS, GASTRO_CARDS, HEMEONC_CARDS, ID_CARDS, MULTI_CARDS, NEPHROLOGY_CARDS, NEUROLOGY_CARDS, OBGYN_CARDS, PEDS_CARDS, PSYCHIATRY_CARDS, PULM_CARDS, RHEUM_CARDS, SURGERY_CARDS);
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const limit = args.indexOf('--limit') >= 0 ? Number(args[args.indexOf('--limit') + 1]) : 40;

const generic = deckGenericWords(ALL.map((c) => c.ans));
const flagged = [];
for (const c of ALL) {
  const r = strictLeakReport(c, generic);
  if (r.leaking.length) flagged.push({ id: c.id, subj: c.subj, ans: c.ans, clues: c.bw.length, leaking: r.leaking, remaining: r.remaining, thin: r.remaining < 3 });
}
const bySubj = {};
flagged.forEach((f) => { bySubj[f.subj] = (bySubj[f.subj] || 0) + 1; });
console.log(`cards: ${ALL.length}  flagged: ${flagged.length}  with fewer than 3 clues left: ${flagged.filter((f) => f.thin).length}`);
console.log('by subject:', JSON.stringify(bySubj));
flagged.slice(0, limit).forEach((f) => console.log(`${f.id} [${f.ans}] ${f.leaking.map((l) => '"' + l.clue + '" (' + l.why + ')').join('; ')}${f.thin ? '  <-- THIN' : ''}`));
if (jsonAt >= 0) writeFileSync(args[jsonAt + 1], JSON.stringify(flagged, null, 1));
