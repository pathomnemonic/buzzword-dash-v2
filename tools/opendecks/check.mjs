// Automatic checks for an Open decks file (format 1, see docs/OPEN-DECKS.md section 1).
//
//   node tools/opendecks/check.mjs <deck.json> --source <dir> [--write <checked.json>] [--report <report.json>]
//
// <dir> holds one <source_ref>.txt per source passage. Exit code 0 when every card passes, 1 when some failed (the
// failed ones are listed; --write saves a copy of the deck holding only the cards that passed).
//
// Also exports checkCard / checkDeck for tests and for package.mjs. Pure functions: no network, no app state.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCard, SUBJECTS } from '../../js/cardschema.js';

export const LIMITS = Object.freeze({
  clues: 3, clueChars: 60, hintChars: 130, ansChars: 50, distractorChars: 50, tpChars: 300, wwChars: 200, tags: 6, tagChars: 40,
  evidenceMin: 25, evidenceMax: 400
});

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'by', 'for', 'with', 'from', 'is', 'are', 'it', 'its', 'at', 'as', 'that', 'this', 'be', 'than']);

/** Lower-case, straighten quotes and dashes, collapse whitespace. */
export function norm(s) {
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Content words of a text as short stems ("inhibits"/"inhibited" meet; numbers stay whole). */
export function stems(s) {
  return norm(s).split(/[^a-z0-9]+/).filter(Boolean).filter((w) => !STOP.has(w)).map((w) => {
    if (/^\d+$/.test(w)) return w;
    if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
    return w.slice(0, 6);
  });
}

/** "Antidiuretic hormone (ADH)" -> ["Antidiuretic hormone", "ADH"]. */
function alternatives(ans) {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(ans);
  return m && m[1].trim() ? [m[1].trim(), m[2].trim()] : [ans];
}

/** Share of the answer's content stems found in the evidence, best of the full answer and its bracketed abbreviation. */
export function answerSupport(ans, evidence) {
  const have = new Set(stems(evidence));
  let best = 0;
  alternatives(ans).forEach((alt) => {
    const st = stems(alt);
    if (!st.length) return;
    best = Math.max(best, st.filter((w) => have.has(w)).length / st.length);
  });
  return best;
}

function wholeWord(hay, needle) {
  const n = norm(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return n.length > 0 && new RegExp('(^|[^a-z0-9])' + n + '($|[^a-z0-9])').test(norm(hay));
}

/** True when the hint gives the answer away: the answer (or its abbreviation) appears in it, or nearly all its words do. */
export function leaks(hintText, ans) {
  const alts = alternatives(ans);
  if (alts.some((a) => (a.length >= 2) && wholeWord(hintText, a))) return true;
  const st = stems(alts[0]);
  if (st.length >= 2 && st.length <= 4) {
    const have = new Set(stems(hintText));
    if (st.filter((w) => have.has(w)).length / st.length >= 0.8) return true;
  }
  return false;
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let i = 0;
  A.forEach((x) => { if (B.has(x)) i++; });
  return i / (A.size + B.size - i);
}

/** Two options read as the same thing: equal after normalising, nearly equal as text, or nearly the same words. */
export function nearSame(x, y) {
  const a = norm(x), b = norm(y);
  if (a === b) return true;
  if (lev(a, b) / Math.max(a.length, b.length) <= 0.15) return true;
  const sa = stems(x), sb = stems(y);
  return sa.length > 0 && sb.length > 0 && jaccard(sa, sb) >= 0.8;
}

const NONE_OF = /\b(all|none|both|neither)\s+(of\s+)?(the\s+)?(above|these|them)\b|\bn\/a\b|^\s*(a|b|c|d)\s*(and|&)\s*(a|b|c|d)\s*$/i;
const HTML = /<\/?[a-z][^>]*>|&[a-z]+;|&#\d+;/i;

/** Is `evidence` a single sentence? (A terminal stop followed by a capital letter or digit counts as a second one.) */
export function isOneSentence(evidence) {
  return !/[.!?]["')\]”]*\s+[A-Z0-9(]/.test(String(evidence).trim().replace(/\b(e\.g|i\.e|vs|Fig|Dr|approx|etc)\.\s/gi, '$1 '));
}

/**
 * @param {object} card a deck card
 * @param {{passage?: string|null}} ctx the source passage text (null when it could not be found)
 * @returns {{errors: {code: string, message: string}[], warnings: {code: string, message: string}[]}}
 */
export function checkCard(card, ctx) {
  const errors = [], warnings = [];
  const err = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });
  ctx = ctx || {};
  if (!card || typeof card !== 'object') { err('schema', 'not an object'); return { errors, warnings }; }

  // --- schema (the app's own validator) ---
  const asCustom = { id: 'check_' + Math.random().toString(36).slice(2, 8), subj: card.subj, bw: card.bw, ans: card.ans, d: card.d, tp: card.tp, ww: card.ww || {}, isCustom: true };
  if (SUBJECTS.indexOf(card.subj) < 0) err('schema', 'subject "' + card.subj + '" is not one of the app subjects');
  const v = validateCard(asCustom, { strict: false });
  if (!v.success) v.errors.forEach((e) => err('schema', e.code + ': ' + e.message));
  if (!Array.isArray(card.d) || card.d.length !== 2) err('schema', 'needs exactly two wrong answers');
  if (typeof card.ans !== 'string' || !card.ans.trim()) err('schema', 'missing answer');
  if (!Array.isArray(card.bw) || !card.bw.length) err('schema', 'missing hint');
  if (errors.length) return { errors, warnings }; // (the rest assumes a sane shape)

  const ans = card.ans, d = card.d, hint = card.bw.join(' ');

  // --- lengths (what a player can read at a glance while running) ---
  if (card.bw.length > LIMITS.clues) err('length', 'hint has ' + card.bw.length + ' clues, at most ' + LIMITS.clues);
  card.bw.forEach((c, i) => { if (typeof c !== 'string' || !c.trim()) err('length', 'empty clue ' + (i + 1)); else if (c.length > LIMITS.clueChars) err('length', 'clue ' + (i + 1) + ' is ' + c.length + ' characters, at most ' + LIMITS.clueChars); });
  if (card.bw.join(' ').length > LIMITS.hintChars) err('length', 'hint is ' + card.bw.join(' ').length + ' characters, at most ' + LIMITS.hintChars);
  if (ans.length > LIMITS.ansChars) err('length', 'answer is ' + ans.length + ' characters, at most ' + LIMITS.ansChars);
  d.forEach((x, i) => { if (typeof x !== 'string' || !x.trim()) err('length', 'empty wrong answer ' + (i + 1)); else if (x.length > LIMITS.distractorChars) err('length', 'wrong answer ' + (i + 1) + ' is ' + x.length + ' characters, at most ' + LIMITS.distractorChars); });
  if (typeof card.tp !== 'string' || !card.tp.trim()) err('length', 'missing teaching point'); else if (card.tp.length > LIMITS.tpChars) err('length', 'teaching point is ' + card.tp.length + ' characters, at most ' + LIMITS.tpChars);
  if (card.tags !== undefined) {
    if (!Array.isArray(card.tags) || card.tags.length > LIMITS.tags || card.tags.some((t) => typeof t !== 'string' || !t || t.length > LIMITS.tagChars)) err('length', 'tags: at most ' + LIMITS.tags + ' strings of at most ' + LIMITS.tagChars + ' characters');
  }

  // --- why-wrong keys ---
  const ww = card.ww || {};
  const wwKeys = Object.keys(ww);
  if (wwKeys.length !== 2 || d.some((x) => !(x in ww)) || d.some((x) => typeof ww[x] !== 'string' || !ww[x].trim())) err('schema', 'ww must have one non-empty reason for each of the two wrong answers (keys exactly equal to d)');
  else wwKeys.forEach((k) => { if (ww[k].length > LIMITS.wwChars) err('length', 'why-wrong text is longer than ' + LIMITS.wwChars + ' characters'); });

  // --- no HTML anywhere ---
  [card.bw.join(' '), ans, d.join(' '), card.tp, wwKeys.map((k) => ww[k]).join(' ')].forEach((t) => { if (HTML.test(String(t))) err('html', 'HTML or an HTML entity in the text'); });

  // --- answer options ---
  [ans].concat(d).forEach((t) => { if (NONE_OF.test(t)) err('options', '"' + t + '" is an all/none-of-the-above style answer'); });
  if (nearSame(ans, d[0])) err('options', 'wrong answer 1 is the answer or a near duplicate of it ("' + d[0] + '")');
  if (nearSame(ans, d[1])) err('options', 'wrong answer 2 is the answer or a near duplicate of it ("' + d[1] + '")');
  if (nearSame(d[0], d[1])) err('options', 'the two wrong answers are the same or near duplicates');

  // --- the hint must not give the answer away ---
  if (leaks(hint, ans)) err('leak', 'the hint contains the answer');
  d.forEach((x) => { if (leaks(hint, x)) warn('leak_distractor', 'the hint contains the wrong answer "' + x + '"'); });

  // --- provenance: evidence is a verbatim sentence of the source passage and supports the answer ---
  const ev = typeof card.evidence === 'string' ? card.evidence.trim() : '';
  if (!card.source_ref || typeof card.source_ref !== 'string') err('evidence', 'missing source_ref');
  if (!ev) err('evidence', 'missing evidence sentence');
  else {
    if (ev.length < LIMITS.evidenceMin || ev.length > LIMITS.evidenceMax * 2) err('evidence', 'evidence is ' + ev.length + ' characters (expected one sentence)');
    if (!isOneSentence(ev)) err('evidence', 'evidence is more than one sentence');
    if (ctx.passage == null) err('evidence', 'source passage "' + card.source_ref + '" not found');
    else if (norm(ctx.passage).indexOf(norm(ev)) < 0) err('evidence_not_found', 'evidence sentence does not appear in passage ' + card.source_ref);
    const sup = answerSupport(ans, ev);
    if (sup < 0.5) err('unsupported', 'answer words not found in the evidence sentence (overlap ' + sup.toFixed(2) + ')');
  }
  return { errors, warnings };
}

/** Is `b` a duplicate of the earlier card `a`? Same answer and a near-identical hint, or the same sentence for the same answer. */
export function duplicateOf(a, b) {
  if (norm(a.ans) !== norm(b.ans)) return false;
  if (a.evidence && norm(a.evidence) === norm(b.evidence) && jaccard(stems(a.bw.join(' ')), stems(b.bw.join(' '))) >= 0.5) return true;
  return jaccard(stems(a.bw.join(' ')), stems(b.bw.join(' '))) >= 0.8;
}

function readPassage(dir, ref) {
  if (!dir || !ref || !/^[\w.\-]+$/.test(ref)) return null;
  const f = join(dir, ref + '.txt');
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

const HEADER_FIELDS = ['id', 'title', 'source', 'licence', 'attribution', 'url', 'version'];

/**
 * @param {object} deck deck file (format 1)
 * @param {{sourceDir?: string}} [opts]
 * @returns {{header: string[], passed: object[], failed: {index: number, card: object, errors: object[], warnings: object[]}[], warned: number, byCode: Object<string, number>, total: number}}
 */
export function checkDeck(deck, opts) {
  opts = opts || {};
  const header = [];
  if (!deck || typeof deck !== 'object') return { header: ['not an object'], passed: [], failed: [], warned: 0, byCode: {}, total: 0 };
  if (deck.format !== 1) header.push('format must be 1');
  HEADER_FIELDS.forEach((f) => { if (!deck[f] || (typeof deck[f] !== 'string' && f !== 'licence')) header.push('missing or invalid header field: ' + f); });
  if (deck.id && !/^[a-z0-9-]{3,40}$/.test(deck.id)) header.push('id must match [a-z0-9-]{3,40}');
  if (!deck.licence || !deck.licence.name || !/^https:\/\//.test(deck.licence.url || '')) header.push('licence needs a name and an https url');
  if (deck.url && !/^https:\/\//.test(deck.url)) header.push('url must be https');
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  if (!cards.length) header.push('no cards');

  const passed = [], failed = [], byCode = {};
  let warned = 0;
  const cache = Object.create(null);
  cards.forEach((card, index) => {
    const ref = card && card.source_ref;
    if (!(ref in cache)) cache[ref] = readPassage(opts.sourceDir, ref);
    const r = checkCard(card, { passage: cache[ref] });
    if (r.warnings.length) warned++;
    if (!r.errors.length) {
      const dup = passed.find((p) => duplicateOf(p, card));
      if (dup) r.errors.push({ code: 'duplicate', message: 'near-duplicate of an earlier card ("' + dup.bw.join(' / ') + '")' });
    }
    if (r.errors.length) {
      failed.push({ index, card, errors: r.errors, warnings: r.warnings });
      new Set(r.errors.map((e) => e.code)).forEach((c) => { byCode[c] = (byCode[c] || 0) + 1; });
    } else passed.push(card);
  });
  return { header, passed, failed, warned, byCode, total: cards.length };
}

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  const source = arg('source');
  if (!file || file.startsWith('--') || !source) {
    console.error('usage: node tools/opendecks/check.mjs <deck.json> --source <dir of <source_ref>.txt> [--write checked.json] [--report report.json]');
    process.exit(2);
  }
  const deck = JSON.parse(readFileSync(file, 'utf8'));
  const res = checkDeck(deck, { sourceDir: source });
  console.log('deck ' + deck.id + ': ' + res.total + ' cards, ' + res.passed.length + ' pass, ' + res.failed.length + ' fail (' + (res.total ? (100 * res.passed.length / res.total).toFixed(1) : 0) + '% pass), ' + res.warned + ' with warnings');
  if (res.header.length) console.log('header problems:\n  ' + res.header.join('\n  '));
  console.log('failures by check: ' + JSON.stringify(res.byCode));
  res.failed.forEach((f) => console.log('  #' + f.index + ' ' + (f.card && f.card.ans) + ' [' + f.errors.map((e) => e.code).join(',') + '] ' + f.errors[0].message));
  if (arg('write')) writeFileSync(arg('write'), JSON.stringify(Object.assign({}, deck, { count: res.passed.length, cards: res.passed }), null, 1) + '\n');
  if (arg('report')) writeFileSync(arg('report'), JSON.stringify({ deck: deck.id, total: res.total, passed: res.passed.length, failed: res.failed.length, byCode: res.byCode, header: res.header, failures: res.failed.map((f) => ({ index: f.index, ans: f.card && f.card.ans, ref: f.card && f.card.source_ref, errors: f.errors })) }, null, 1) + '\n');
  process.exit(res.header.length || res.failed.length ? 1 : 0);
}
