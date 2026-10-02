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
