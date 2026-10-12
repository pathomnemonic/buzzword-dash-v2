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

/**
 * Popular decks, each with the page that is the official place to get it. Dx Dash never downloads them for you:
 * AnkiWeb needs a login and limits bulk downloads, AnkiHub is a subscription, and the decks are licensed for personal
 * study only (see docs/ANKING-INTEGRATION.md). The player gets their own copy, exports it from Anki and drops the file here.
 * `verified` says whether the link was a real deck page when it was checked (false = a search page on the site).
 */
export var POPULAR_DECKS = [
  {
    id: 'anking-step',
    name: 'AnKing Step Deck (Step 1, 2 and 3)',
    blurb: '30,000+ cards tagged by Sketchy, Boards & Beyond, First Aid, Pathoma and UWorld. Tags look like #AK_Step1_v12::#B&B::\u2026',
    site: 'AnkiHub',
    url: 'https://www.ankihub.net/step-deck',
    verified: true,
    tip: 'Free AnkiHub account to look around; a paid plan keeps the deck synced in Anki.'
  },
  {
    id: 'zanki',
    name: 'Zanki (Step 1)',
    blurb: 'A large community deck combining the usual Step 1 resources (Boards & Beyond, Pathoma, Sketchy, First Aid).',
    site: 'AnkiWeb',
    url: 'https://ankiweb.net/shared/decks?search=zanki',
    verified: false,
    tip: 'Search results: pick the version by the original author, and the newest one.'
  },
  {
    id: 'lightyear',
    name: 'Lightyear (Step 1 / Step 2)',
    blurb: 'A condensed community deck drawing on Boards & Beyond, Pathoma, First Aid and Sketchy.',
    site: 'AnkiWeb',
    url: 'https://ankiweb.net/shared/decks?search=lightyear',
    verified: false,
    tip: 'Search results: pick the version by the original author, and the newest one.'
  },
  {
    id: 'pepper',
    name: 'Pepper (Step 1)',
    blurb: 'A community Step 1 deck.',
    site: 'AnkiWeb',
    url: 'https://ankiweb.net/shared/decks?search=pepper%20step',
    verified: false,
    tip: 'Search results: pick the version by the original author, and the newest one.'
  },
  {
    id: 'dirty-medicine',
    name: 'Dirty Medicine',
    blurb: 'Community decks that go with the Dirty Medicine study material.',
    site: 'AnkiWeb',
    url: 'https://ankiweb.net/shared/decks?search=dirty%20medicine',
    verified: false,
    tip: 'Search results: some of these decks are only sold by their authors.'
  },
  {
    id: 'own',
    name: 'Any deck of your own',
    blurb: 'Anything you have in Anki: a class deck, a friend\u2019s deck, your own cards.',
    site: 'Anki',
    url: 'https://docs.ankiweb.net/manual/exporting',
    verified: true,
    tip: 'Anki\u2019s own guide to exporting.'
  }
];

/** The same three steps for every deck. */
export var POPULAR_DECK_STEPS = [
  'Tap the deck\u2019s button to open its official page and get the deck into your own Anki (an account or subscription may be needed).',
  'In Anki on a computer: File \u203A Export, format \u201CAnki Deck Package (*.apkg)\u201D, pick the deck, keep \u201CInclude tags\u201D ticked. Scheduling and media are not needed.',
  'Come back here, choose that file (or drop it on the box), then tick the tags you want and tap Import.'
];

/** Why there is no one-tap download. Shown on request. */
export var NO_AUTO_DOWNLOAD = [
  'AnkiWeb asks you to sign in and limits bulk downloads on purpose, and its pages do not allow other websites to read them. A web app cannot fetch a deck from there.',
  'AnkiHub is a subscription service that syncs decks through the Anki add-on.',
  'Shared decks are licensed for your own study, not for redistribution, so Dx Dash does not bundle or mirror them. You download your own copy; this app only reads it on your device.'
];

/**
 * The short blurb at the top of the "Open decks" list (shown in a <details>, open on first view). Data, so the screen,
 * the tests and docs/OPEN-DECKS.md all say the same thing.
 */
export var OPEN_DECKS_INTRO = {
  whyTitle: 'Why these decks?',
  why: [
    'These are the decks we can give you with one tap: each is published under an open licence, needs no account, and credits its authors.',
    'Popular decks such as AnKing, Zanki, Pepper and Lightyear need a login or are for personal use only, and many are built on paid resources, so we cannot bundle or auto-download them.',
    'Some decks may come from community datasets; every deck shows its source and licence.',
    'None of them is checked for exam accuracy. Check anything important against a trusted source.'
  ],
  ownTitle: 'Add your own',
  ownSteps: [
    'Download any deck yourself: AnKing from its official page, any other .apkg, or an Anki text export.',
    'Tap \u201CChoose file\u201D in the importer below, or drag the file in.',
    'Filter by tags, then import. Cards stay on your device.',
    'AI helper: copy the prompt and paste the reply to turn your notes into runner questions.'
  ]
};

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
