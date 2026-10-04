/**
 * cardleaks.js — does a clue give away the answer?
 *
 * A clue "leaks" when it contains the whole answer, or a word that is distinctive to the answer. The old
 * check matched any answer word of 5+ letters as a substring, which cut good clues: "Subdural fluid
 * collection risk" for "Post-Dural Puncture Headache" (dural is inside subdural), and anything with a common
 * word such as "acute", "syndrome", "tumor" or "pregnancy". This version matches whole words only and ignores
 * words that are common across the deck's answers (they name a category, not the answer), learned from the
 * cards themselves.
 */

/** Lowercase words of 3+ letters/digits, with parentheticals removed. */
export function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(function (w) { return w.length >= 3; });
}

/** Light stemming so plurals and common endings still match (neuropathies / neuropathy). */
export function stem(word) {
  return word
    .replace(/(ies)$/, 'y')
    .replace(/(es|s)$/, '')
    .replace(/(ic|al)$/, '');
}

/** A word shared by this many answers or more names a category, not the answer. */
export var GENERIC_ANSWER_WORD_COUNT = 8;

/**
 * Words that appear in many answers across the deck.
 * @param {string[]} answers
 * @returns {Set<string>} stems
 */
export function genericWords(answers) {
  var counts = {};
  answers.forEach(function (a) {
    var seen = {};
    words(a).forEach(function (w) { seen[stem(w)] = true; });
    Object.keys(seen).forEach(function (s) { counts[s] = (counts[s] || 0) + 1; });
  });
  var out = new Set();
  Object.keys(counts).forEach(function (s) { if (counts[s] >= GENERIC_ANSWER_WORD_COUNT) out.add(s); });
  return out;
}

/**
 * @param {string} clue
 * @param {string} answer
 * @param {string[]} distractors
 * @param {Set<string>} generic  from genericWords()
 * @returns {boolean}
 */
export function clueLeaksAnswer(clue, answer, distractors, generic) {
  var clueWords = words(clue);
  var clueStems = clueWords.map(stem);
  var phrase = words(answer);
  var phraseStems = phrase.map(stem);
  if (!phrase.length) return false;

  // The whole answer, in order, appears in the clue
  var joined = ' ' + clueStems.join(' ') + ' ';
  if (joined.indexOf(' ' + phraseStems.join(' ') + ' ') >= 0) return true;

  // A word distinctive to the answer appears in the clue. Words the distractors share are not distinctive
  // (the clue is then about the category), and neither are words common to many answers.
  var distractorStems = {};
  (distractors || []).forEach(function (d) { words(d).forEach(function (w) { distractorStems[stem(w)] = true; }); });
  for (var i = 0; i < phraseStems.length; i++) {
    var s = phraseStems[i];
    if (s.length < 4) continue;
    if (distractorStems[s] || (generic && generic.has(s))) continue;
    if (clueStems.indexOf(s) >= 0) return true;
  }
  return false;
}

/** An answer without any parenthetical, lower-cased: "Ascending Cholangitis (Reynolds Pentad)" and "Ascending Cholangitis" match. */
export function answerKey(ans) {
  return String(ans || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
}

/** The cards with only the first one for each diagnosis (some diagnoses have several cards; a deck should not repeat one). */
export function uniqueByAnswer(cards) {
  var seen = {};
  return cards.filter(function (c) {
    var key = answerKey(c.ans);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

// ===========================================================================================================
// The strict check (from-scratch audit). The check above is the one the game uses while loading; this one is meant
// to be stricter, and is what the audit tool and the card tests use. It exists because the first check let this
// through:   answer "CLL Rai Staging", clues "CLL staging" and "Rai staging system".
//   - it ignored every word under 4 letters, which hid exactly the distinctive tokens: "CLL" and "Rai",
//   - it ignored the brackets after an answer, where the acronym usually is,
//   - it never looked at initials ("DIC" for "Disseminated Intravascular Coagulation").
// ===========================================================================================================

var STOP = {};
('the of and in for with to a an on by vs or due type from at as into is are be not no non pre post per via one two three first second ' +
  'its it this that than then also but if all any can has had have may more most only other such very who how what when where which ' +
  'sign signs test tests disease diseases disorder disorders syndrome syndromes sd').split(' ').forEach(function (w) { STOP[w] = true; });

/**
 * Plain descriptive words that are not what a question is about ("acute", "management", "low"). They never count as
 * the distinctive part of an answer on their own, but any other word of the answer still does.
 */
var MODIFIERS = {};
('low high acute chronic early late adult adults young old central peripheral primary secondary severe mild moderate major minor ' +
  'bacterial viral fungal pediatric neonatal infant chest pain assessment management treatment therapy risk trial score criteria scale ' +
  'index emergency emergent initial stable unstable standard classic atypical effects effect side use used for indications indication ' +
  'complication complications findings finding workup evaluation diagnosis prevention prophylaxis screening stratification resuscitation ' +
  'level levels rule rules vs versus patient patients agent agents drug drugs medication').split(' ').forEach(function (w) { MODIFIERS[w] = true; });

/** Lowercase alphanumeric tokens, keeping short ones (acronyms and eponyms), without stop words. Brackets are kept as aliases. */
export function strictTokens(text) {
  return String(text || '').toLowerCase().replace(/[()\[\]]/g, ' ').split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 2 && !STOP[w]; });
}

/** Words that appear in many answers across the deck (category words), at any length. */
export function deckGenericWords(answers, threshold) {
  var counts = {};
  answers.forEach(function (a) {
    var seen = {};
    strictTokens(a).forEach(function (w) { seen[stem(w)] = true; });
    Object.keys(seen).forEach(function (s) { counts[s] = (counts[s] || 0) + 1; });
  });
  var out = new Set();
  Object.keys(counts).forEach(function (s) { if (counts[s] >= (threshold || 12)) out.add(s); });
  return out;
}

/** The initials of a multi-word answer ("Disseminated Intravascular Coagulation" is "dic"), 3 letters or more. */
export function initialsOf(answer) {
  var ws = String(answer || '').replace(/\([^)]*\)/g, ' ').split(/[^A-Za-z0-9]+/).filter(function (w) { return w && !STOP[w.toLowerCase()]; });
  var s = ws.map(function (w) { return w[0].toLowerCase(); }).join('');
  return s.length >= 3 ? s : '';
}

/**
 * Why a clue gives the answer away, or '' when it does not.
 * @param {string} clue
 * @param {{ans: string, d: string[]}} card
 * @param {Set<string>} generic  from deckGenericWords()
 */
export function strictClueLeak(clue, card, generic) {
  var clueTokens = strictTokens(clue);
  if (!clueTokens.length) return '';
  var clueStems = {};
  clueTokens.forEach(function (t) { clueStems[stem(t)] = true; clueStems[t] = true; });
  var ans = card.ans || '';
  // Words in the distractors name the category the question is about ("staging"), so they are not the answer
  var shared = {};
  (card.d || []).forEach(function (d) { strictTokens(d).forEach(function (t) { shared[stem(t)] = true; shared[t] = true; }); });
  var answerTokens = strictTokens(ans);
  var key = answerTokens.filter(function (t) { var s = stem(t); return !shared[s] && !shared[t] && !MODIFIERS[t] && !MODIFIERS[s] && !(generic && generic.has(s)); });
  for (var i = 0; i < key.length; i++) {
    if (clueStems[key[i]] || clueStems[stem(key[i])]) return 'contains "' + key[i] + '"';
  }
  // the whole answer (without brackets) as a phrase
  var phrase = strictTokens(ans.replace(/\([^)]*\)/g, ' ')).map(stem).join(' ');
  if (phrase && (' ' + clueTokens.map(stem).join(' ') + ' ').indexOf(' ' + phrase + ' ') >= 0) return 'contains the whole answer';
  // the initials
  var ini = initialsOf(ans);
  if (ini && clueStems[ini]) return 'contains the initials "' + ini + '"';
  // an acronym in the answer, spelled out in the clue ("SBP Prophylaxis" / "Spontaneous bacterial peritonitis prophylaxis")
  var acronyms = (ans.match(/\b[A-Za-z]*[A-Z][A-Za-z]*[A-Z][A-Za-z]*\b/g) || []).map(function (a) { return a.toLowerCase(); }).filter(function (a) { return a.length >= 3 && a.length <= 7; });
  if (acronyms.length) {
    var seq = '';
    clueTokens.forEach(function (t) { seq += t.length <= 3 && /^[a-z0-9]+$/.test(t) && t === t.toUpperCase().toLowerCase() && t.length > 1 ? t : t[0]; });
    var plain = '';
    clueTokens.forEach(function (t) { plain += t[0]; });
    for (var a = 0; a < acronyms.length; a++) {
      if (seq.indexOf(acronyms[a]) >= 0 || plain.indexOf(acronyms[a]) >= 0) return 'spells out "' + acronyms[a] + '"';
    }
  }
  return '';
}

/**
 * @returns {{leaking: Array<{clue: string, why: string}>, remaining: number}}
 */
export function strictLeakReport(card, generic) {
  var leaking = [];
  (card.bw || []).forEach(function (clue) {
    var why = strictClueLeak(clue, card, generic);
    if (why) leaking.push({ clue: clue, why: why });
  });
  return { leaking: leaking, remaining: (card.bw || []).length - leaking.length };
}
