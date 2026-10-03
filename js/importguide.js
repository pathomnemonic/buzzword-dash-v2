/**
 * importguide.js — the plain-language instructions for bringing your own cards in (Anki, CSV, or an AI helper).
 *
 * Kept as data and one function so the screens, the tests and the docs all show the same thing. The AI prompt is
 * built from the real list of subjects, so it cannot drift away from what the importer accepts.
 */

import { SUBJECTS } from './cardschema.js';

/** The ways in, shortest first. Each has a title and the numbered steps to show. */
export var IMPORT_PATHS = [
  {
    id: 'flashcards',
    title: 'Quickest: Anki or spreadsheet cards as flashcards',
    steps: [
      'In Anki desktop: File › Export. Choose "Notes in Plain Text (.txt)" (or "Anki Deck Package (.apkg)").',
      'Upload that file below, or paste the text. Two columns: front, then back (tab or comma separated).',
      'Tap "Import as flashcards". They appear in Flashcard mode, with your own spaced-repetition schedule.'
    ]
  },
  {
    id: 'quiz',
    title: 'Better: turn them into runner questions with an AI chat',
    steps: [
      'Tap "Copy AI prompt" below.',
      'Open any AI chat (ChatGPT, Claude, Gemini). Paste the prompt, then paste your cards underneath it.',
      'Copy the AI’s reply (a block of JSON) and paste it into "Paste the AI’s reply", then tap "Import quiz cards".',
      'Quiz cards need two wrong answers each. The AI invents them, so skim the cards for mistakes before relying on them.'
    ]
  }
];

/** What a row of a plain file should look like, shown under the file picker. */
export var FORMAT_HELP = [
  'One card per line. Front, a tab (or comma), then back.',
  'Wrap text in "quotes" when it contains the separator or spans lines.',
  'A first line of "Front,Back" is skipped automatically. Extra columns from Anki (GUID, deck, tags) are ignored.',
  'Fill-in-the-blank notes like {{c1::answer}} become one card per blank.'
];

export var FORMAT_EXAMPLE = 'Fever, new murmur, Janeway lesions\tInfective endocarditis\nWhat is the antidote for acetaminophen?\tN-acetylcysteine';

/** One finished quiz card, as the AI should write it. */
export var QUIZ_CARD_EXAMPLE = {
  subj: 'Cardiology',
  bw: ['Fever', 'New murmur', 'Janeway lesions'],
  ans: 'Infective Endocarditis',
  d: ['Rheumatic Fever', 'Atrial Myxoma'],
  tp: 'Janeway lesions are painless; Osler nodes are painful. Blood cultures before antibiotics.',
  ww: { 'Rheumatic Fever': 'Migratory arthritis and Jones criteria, not embolic skin lesions.', 'Atrial Myxoma': 'Positional dyspnea and a tumor plop.' }
};

/**
 * The text to paste into an AI chat. The user pastes their cards after it.
 * @returns {string}
 */
export function buildAiPrompt() {
  return [
    'You are converting my flashcards into multiple-choice quiz cards for a medical-exam study game (USMLE / COMLEX).',
    '',
    'I will paste my cards after this message, one per line (front, then back) or as free text. Turn each real card into ONE JSON object and reply with ONE JSON array and nothing else (no commentary, no code fences).',
    '',
    'Each object has exactly these fields:',
    '- "subj": one of ' + SUBJECTS.map(function (s) { return '"' + s + '"'; }).join(', ') + '. Use "Multisystem / Mixed" if unsure.',
    '- "bw": 1 to 4 short clues (strings) that point to the answer, like exam buzzwords. Taken from my card; do not invent facts.',
    '- "ans": the correct answer, short (a diagnosis, drug, mechanism, or next step). Under 80 characters. Plain text.',
    '- "d": exactly 2 wrong answers: plausible look-alikes of the same kind as the answer (two other diagnoses, two other drugs). Never "N/A", never "None of the above", never the correct answer.',
    '- "tp": a one or two sentence teaching point, from my card where possible.',
    '- "ww": an object whose keys are exactly the two wrong answers in "d" and whose values say in one short sentence why each is wrong.',
    '',
    'Rules:',
    '- Plain text only: no HTML, no markdown, no line breaks inside strings.',
    '- If a card is not a clear question with one short answer (long lists, images, definitions with no single answer), skip it and keep going.',
    '- If a cloze like {{c1::answer}} appears, the hidden part is the answer.',
    '- Do not change medical facts. If you are unsure a fact is right, skip that card.',
    '',
    'Example of one object:',
    JSON.stringify(QUIZ_CARD_EXAMPLE),
    '',
    'My cards:'
  ].join('\n');
}

var SUBJECT_BY_LOWER = {};
SUBJECTS.forEach(function (s) { SUBJECT_BY_LOWER[s.toLowerCase()] = s; });

function clean(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Accept the long names an AI sometimes uses (subject, buzzwords, answer...) and tidy the values. */
export function normalizeAiCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var bw = raw.bw || raw.buzzwords || raw.clues || raw.front;
  if (typeof bw === 'string') bw = [bw];
  var d = raw.d || raw.distractors || raw.wrong || raw.wrongAnswers;
  var ww = raw.ww || raw.whyWrong || {};
  var ans = clean(raw.ans || raw.answer || raw.back);
  var subj = SUBJECT_BY_LOWER[String(raw.subj || raw.subject || '').trim().toLowerCase()] || 'Multisystem / Mixed';
  var card = {
    subj: subj,
    bw: Array.isArray(bw) ? bw.map(clean).filter(Boolean).slice(0, 8) : [],
    ans: ans,
    d: Array.isArray(d) ? d.map(clean).filter(Boolean) : [],
    tp: clean(raw.tp || raw.teachingPoint || raw.explanation || '') || ans,
    ww: {}
  };
  Object.keys(ww && typeof ww === 'object' ? ww : {}).forEach(function (k) { card.ww[clean(k)] = clean(ww[k]); });
  return card;
}

/**
 * Pull the cards out of whatever the AI replied with: bare JSON, JSON inside a code fence, JSON with a sentence
 * before it, or an object like {"cards": [...]}.
 * @param {string} text
 * @returns {{cards: object[], error: string|null, skipped: number}}
 */
export function parseAiReply(text) {
  var t = String(text || '').trim();
  if (!t) return { cards: [], error: 'Paste the AI’s reply first.', skipped: 0 };
  t = t.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
  var parsed = null;
  var tries = [t];
  var a = t.indexOf('[');
  var b = t.lastIndexOf(']');
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  var o = t.indexOf('{');
  var c = t.lastIndexOf('}');
  if (o >= 0 && c > o) tries.push(t.slice(o, c + 1));
  for (var i = 0; i < tries.length && parsed === null; i++) {
    try { parsed = JSON.parse(tries[i]); } catch (e) { parsed = null; }
  }
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
    parsed = parsed.cards || parsed.items || parsed.data || [parsed];
  }
  if (!Array.isArray(parsed)) {
    return { cards: [], error: 'That does not look like the JSON the prompt asks for. Ask the AI: "Reply again with only the JSON array."', skipped: 0 };
  }
  var cards = [];
  var skipped = 0;
  parsed.forEach(function (raw) {
    var card = normalizeAiCard(raw);
    var ok = card && card.bw.length && card.ans && card.d.length === 2 &&
      card.d.every(function (x) { return x.toLowerCase() !== card.ans.toLowerCase() && !/^(n\/a|none of the above|all of the above)$/i.test(x); }) &&
      card.d[0].toLowerCase() !== card.d[1].toLowerCase();
    if (ok) cards.push(card); else skipped++;
  });
  if (!cards.length) return { cards: [], error: 'No usable cards in that reply (each needs clues, an answer and exactly two different wrong answers).', skipped: skipped };
  return { cards: cards, error: null, skipped: skipped };
}
