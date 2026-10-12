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
    'You are converting my flashcards into quick-fire multiple-choice cards for a medical-exam game (USMLE / COMLEX). In the game the player sees 2-4 short clues for about 3 seconds, then must pick the right answer from THREE options (the answer plus two wrong ones). So every card must be answerable from the clues alone, with exactly one defensible option.',
    '',
    'Reply with ONE JSON array and nothing else (no commentary, no code fences). One object per usable card, with exactly these fields:',
    '- "subj": one of ' + SUBJECTS.map(function (s) { return '"' + s + '"'; }).join(', ') + '. Use "Multisystem / Mixed" if unsure.',
    '- "bw": 2 to 4 clues, each 1-8 words, taken from my card (no invented facts). Together they must point to ONE answer. Rules for clues:',
    '  * Never put the answer, or its key words, in a clue.',
    '  * Name the thing being asked about, and what is asked, when the card asks a property: "Pseudomonas aeruginosa", "Oxygen requirement" (not just vague symptoms that fit many organisms).',
    '  * Use specific buzzwords (findings, numbers, named signs), not generic words like "serious", "common", "treatment".',
    '- "ans": a TERM, not a sentence: a diagnosis, organism, drug, test, structure, receptor, mechanism, or number, normally 1-4 words (never more than 8). If my card\'s back is a sentence or explanation, extract its key term. If the card asks "what is X?" and the back describes X, flip it: put the description in "bw" and the NAME in "ans".',
    '- "d": exactly 2 wrong answers. Each must be a real term of the same kind and similar length as "ans" that a student could actually confuse with it (sibling diagnoses, drugs of the same class, nearby numbers, other items from the same list). Never opposites ("increased / decreased / no change"), never silly or a different category, never "N/A" or "None of the above", and never something that is also correct.',
    '- "tp": one or two sentences of teaching point, using only facts from my card.',
    '- "ww": an object whose keys are exactly the two wrong answers in "d"; each value is one short sentence on why it is wrong here (state what it actually is or does, not just "not the answer").',
    '',
    'Make a card when my card boils down to: one fact -> one short term (name the organism, drug, test, mechanism, cause, number, classic association, or a vignette -> diagnosis).',
    'SKIP the card (no object at all) when it is: a list, steps or sequence; a definition or "explain / what are the consequences / how does it differ" question; yes/no; two questions in one; "which is NOT / wrong pair" with options missing; an image; or when the back is vague, contradicts itself, or you are not sure it is medically correct. Do not rewrite facts. One card per fact: do not make two cards with the same answer and distractors.',
    'Ignore HTML tags and tags/subject columns. If a cloze like {{c1::answer}} appears, the hidden part is the answer.',
    '',
    'Bad vs good (same fact):',
    '- Bad: bw ["Narrowed descending aorta","Hypertension"], ans "Narrowing of the descending aorta beyond the great vessels" (answer is in the clue, and is a sentence).',
    '  Good: bw ["Arm hypertension","Weak leg pulses","Leg cramps"], ans "Coarctation of the aorta", d ["Aortic valve stenosis","Patent ductus arteriosus"].',
    '- Bad: bw ["Menorrhagia"], ans "More than 80 ml", d ["Less than 20 ml","Less than 40 ml"] (both wrong answers are absurd for heavy bleeding).',
    '  Good: ans "More than 80 ml", d ["More than 40 ml","More than 120 ml"].',
    '- Bad: bw ["Volatile anesthetics","Rigidity"], ans "Hypermetabolic muscle crisis triggered by volatile anesthetics".',
    '  Good: ans "Malignant hyperthermia", d ["Neuroleptic malignant syndrome","Serotonin syndrome"].',
    '- Bad: bw ["Lung infections","Weak immunity"], ans "Obligate aerobe" (clues fit dozens of organisms; the question being asked is never named).',
    '  Good: bw ["Pseudomonas aeruginosa","Oxygen requirement"], ans "Obligate aerobe", d ["Obligate anaerobe","Microaerophile"].',
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
  // Optional provenance, written by the Open decks generator (tools/opendecks): the passage the card came from and one
  // sentence of it that supports the answer. Players' own AI replies simply do not have them.
  var ref = clean(raw.source_ref || raw.sourceRef || '');
  var ev = clean(raw.evidence || '');
  if (ref) card.source_ref = ref;
  if (ev) card.evidence = ev;
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
  var reasons = {};
  var seen = {};
  function skip(why) { skipped++; reasons[why] = (reasons[why] || 0) + 1; }
  parsed.forEach(function (raw) {
    var card = normalizeAiCard(raw);
    var ok = card && card.bw.length && card.ans && card.d.length === 2 &&
      card.d.every(function (x) { return x.toLowerCase() !== card.ans.toLowerCase() && !/^(n\/a|none of the above|all of the above)$/i.test(x); }) &&
      card.d[0].toLowerCase() !== card.d[1].toLowerCase();
    if (!ok) { skip('missing clues, an answer or two different wrong answers'); return; }
    // Quality screens: a free chat AI often ignores parts of the prompt; these catch the three commonest ways a card becomes unplayable.
    if (wordCount(card.ans) > MAX_ANSWER_WORDS) { skip('the answer was a whole sentence'); return; }
    if (answerInClues(card)) { skip('a clue gave the answer away'); return; }
    var key = card.ans.toLowerCase() + '|' + card.d.map(function (x) { return x.toLowerCase(); }).sort().join('|');
    if (seen[key]) { skip('a duplicate card'); return; }
    seen[key] = true;
    cards.push(card);
  });
  if (!cards.length) return { cards: [], error: 'No usable cards in that reply (each needs clues, an answer and exactly two different wrong answers).', skipped: skipped, reasons: reasons };
  return { cards: cards, error: null, skipped: skipped, reasons: reasons };
}

var MAX_ANSWER_WORDS = 8;
var STOP_WORDS = /^(the|and|with|from|that|this|than|more|less|into|over|under|about|of|in|on|to|a|an|is|are|for|by|or|as|at|it|its|not|no)$/i;

function wordCount(text) { return String(text).trim().split(/\s+/).filter(Boolean).length; }

function keyWords(text) {
  return String(text).toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(function (w) { return w.length >= 4 && !STOP_WORDS.test(w); });
}

/** True when the clues contain the answer, or most of its key words (the card would give itself away). */
function answerInClues(card) {
  var clues = card.bw.join(' ').toLowerCase();
  var ans = card.ans.toLowerCase();
  if (ans.length >= 4 && clues.indexOf(ans) >= 0) return true;
  var words = keyWords(card.ans);
  if (!words.length) return false;
  var hit = words.filter(function (w) { return clues.indexOf(w) >= 0; }).length;
  return words.length === 1 ? hit === 1 : hit / words.length > 0.6;
}
