/**
 * companions.js — the study buddy: a small pet that lives on the Home screen.
 *
 * A buddy reacts to how you are studying: it cheers at streak milestones and new bests, is happy when you have studied
 * today, naps when you have been away for a couple of days, and gets sleepy late at night. It speaks in a few short,
 * kind lines (its own personality each) and lends its voice to the daily reminder. It never scolds and never blocks
 * anything. Pure data and rules; palui.js draws it and the Locker sells it.
 */

export var NO_PAL = 'pal_none';
export var DEFAULT_PAL = 'pal_cat';

/**
 * Tones: how a buddy talks. Each tone has lines for every mood. {name} is the buddy's name, {n} the study streak.
 */
var TONES = {
  cheery: {
    greet: ['Hi hi! Ready to learn something?', 'You came back! Yay!', 'Let\'s go, {n} days strong!'],
    happy: ['{n} days in a row. I\'m so proud!', 'You\'re on a roll today!', 'Studying looks good on you.'],
    cheer: ['WOW! Look at you go!', 'That was amazing!', 'Best. Run. Ever. (So far!)'],
    nap: ['Zzz... oh! You\'re back!', '*yawn* I missed you!', 'I fell asleep waiting. Hi!'],
    sleepy: ['It\'s late... one more card?', 'Getting sleepy, but I\'m with you.', 'A short run, then bed?'],
    remind: ['{name} here! A few cards today keeps the {n}-day streak glowing.', 'Hi! {name} is waiting. Five minutes?']
  },
  sleepy: {
    greet: ['Mmm... hi. Let\'s study slowly.', 'Oh. You\'re here. Good.', 'Cozy day for cards.'],
    happy: ['{n} days. Not bad at all.', 'Nice and steady. I like it.', 'Good pace. Keep it gentle.'],
    cheer: ['Oh! That was pretty great.', 'Whoa. Okay, I\'m awake now.', 'Impressive, even for a nap-lover.'],
    nap: ['Zzz... huh? You\'re back.', '*stretches* Hello again.', 'Slept in. Missed you though.'],
    sleepy: ['Eyes heavy... you do you.', 'Late already. I\'m with you.', 'Maybe one more, then rest.'],
    remind: ['{name}: whenever you\'re ready, a couple of cards keeps your {n}-day streak cozy.', '{name} is awake just for you. A quick run?']
  },
  sassy: {
    greet: ['Oh, look who showed up.', 'Ready to be brilliant?', 'Let\'s make those cards nervous.'],
    happy: ['{n} days. Okay, I\'m impressed.', 'Look at you being consistent.', 'I knew you had it in you.'],
    cheer: ['Okay, show-off. I see you.', 'THAT is how it\'s done.', 'Tell the other cards to run.'],
    nap: ['I was napping, not worried. Hi.', 'Took your time, huh? Welcome back.', 'Zzz... fine, I missed you.'],
    sleepy: ['Studying at this hour? Bold.', 'Late-night genius mode, I respect it.', 'One more, then sleep. Deal?'],
    remind: ['{name}: your {n}-day streak isn\'t going to feed itself.', '{name} says: cards. You. Five minutes. Go.']
  },
  wise: {
    greet: ['Small steps, every day. Welcome.', 'Let\'s learn something true today.', 'The mind grows with practice.'],
    happy: ['{n} days of practice. Well done.', 'Steady work beats rushing.', 'You are building something lasting.'],
    cheer: ['Remarkable. Remember this feeling.', 'A fine run. Learn from it.', 'Excellence is a habit, and you have it.'],
    nap: ['I rested while you were away. Welcome back.', 'No shame in a pause. Shall we continue?', 'The path was waiting for you.'],
    sleepy: ['Rest is part of learning too.', 'A tired mind forgets. One more, then sleep.', 'The night is for consolidating memories.'],
    remind: ['{name}: a little practice today keeps your {n}-day streak alive.', '{name} suggests a short study session.']
  },
  bold: {
    greet: ['Let\'s crush some cards!', 'Time to run!', 'Today we level up!'],
    happy: ['{n} days! Unstoppable!', 'You\'re in beast mode!', 'Keep that fire burning!'],
    cheer: ['BOOM! Unreal!', 'LEGENDARY!', 'Absolutely crushed it!'],
    nap: ['*snort* I\'m awake! Let\'s go!', 'Back at last! Let\'s run!', 'I rested up for this. You ready?'],
    sleepy: ['Even heroes get sleepy. One more!', 'Night run? I\'m in.', 'A last sprint before bed!'],
    remind: ['{name}: {n} days strong! Don\'t let the streak slip. Let\'s run!', '{name} is ready to run. Are you?']
  }
};

/** The buddies. `tone` picks how they talk. */
export var PALS = [
  { id: 'pal_cat', name: 'Triage', emoji: '🐱', tone: 'sassy', price: 0, color: 0xffb066, desc: 'A cat who has seen everything' },
  { id: 'pal_dog', name: 'Stetho', emoji: '🐶', tone: 'cheery', price: 400, color: 0xd9a066, desc: 'Loyal, loud and always ready' },
  { id: 'pal_bunny', name: 'Bandage', emoji: '🐰', tone: 'cheery', price: 600, color: 0xffb3d1, desc: 'Fast, fluffy and full of encouragement' },
  { id: 'pal_fox', name: 'Suture', emoji: '🦊', tone: 'sassy', price: 800, color: 0xff8a3f, desc: 'Clever and a little cheeky' },
  { id: 'pal_panda', name: 'Pill', emoji: '🐼', tone: 'sleepy', price: 1000, color: 0xdddddd, desc: 'Takes it slow and steady' },
  { id: 'pal_owl', name: 'Night Shift', emoji: '🦉', tone: 'wise', price: 1200, color: 0xc9a06a, desc: 'Awake at all hours, full of wisdom' },
  { id: 'pal_frog', name: 'Ribbit-al', emoji: '🐸', tone: 'bold', price: 1500, color: 0x6fdc6f, desc: 'Leaps at every question' },
  { id: 'pal_octopus', name: 'Dr. Octo', emoji: '🐙', tone: 'wise', price: 2000, color: 0xff7ab8, desc: 'Eight arms for eight patients' },
  { id: 'pal_dragon', name: 'Defib', emoji: '🐲', tone: 'bold', price: 3500, color: 0x6fd47a, desc: 'Breathes fire on forgotten facts' }
];

export function getPal(id) {
  for (var i = 0; i < PALS.length; i++) if (PALS[i].id === id) return PALS[i];
  return null;
}

/** Whole days between two YYYY-MM-DD dates (b minus a); 0 when either is missing. */
function daysBetweenKeys(a, b) {
  if (!a || !b) return 0;
  var da = new Date(a + 'T12:00:00');
  var db = new Date(b + 'T12:00:00');
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.round((db - da) / 86400000);
}

/**
 * How the buddy is feeling.
 * @param {{studiedToday: boolean, streak: number, lastStudyDate: string|null, today: string, hour: number, event?: string}} s
 *   event: 'milestone' | 'best' | 'levelup' for a moment worth cheering
 * @returns {'cheer'|'nap'|'sleepy'|'happy'|'greet'}
 */
export function palMood(s) {
  if (s.event === 'milestone' || s.event === 'best' || s.event === 'levelup') return 'cheer';
  var away = s.lastStudyDate ? daysBetweenKeys(s.lastStudyDate, s.today) : 0;
  if (!s.studiedToday && away >= 2) return 'nap';
  if (s.hour >= 22 || s.hour < 5) return 'sleepy';
  if (s.studiedToday && s.streak >= 1) return 'happy';
  return 'greet';
}

/** Is this streak one the buddy celebrates? */
export function isPalMilestone(streak) {
  return streak === 3 || streak === 7 || streak === 14 || streak === 30 || streak === 50 || streak === 100 || (streak > 100 && streak % 100 === 0);
}

function fill(text, pal, streak) {
  return text.replace(/\{name\}/g, pal.name).replace(/\{n\}/g, String(Math.max(0, streak || 0)));
}

/**
 * A short line for the buddy to say.
 * @param {object} pal
 * @param {string} mood greet | happy | cheer | nap | sleepy
 * @param {number} streak
 * @param {function(): number} [rand]
 */
export function palLine(pal, mood, streak, rand) {
  var tone = TONES[pal.tone] || TONES.cheery;
  var list = tone[mood] || tone.greet;
  return fill(list[Math.floor((rand || Math.random)() * list.length) % list.length], pal, streak);
}

/** The daily reminder in the buddy's voice. */
export function palReminder(pal, streak, rand) {
  var tone = TONES[pal.tone] || TONES.cheery;
  var list = streak >= 1 ? tone.remind : [pal.name + ' is waiting. A few cards today?'];
  return fill(list[Math.floor((rand || Math.random)() * list.length) % list.length], pal, streak);
}

/** For tests: every line a tone can say. */
export function allLines() {
  var out = [];
  Object.keys(TONES).forEach(function (t) { Object.keys(TONES[t]).forEach(function (m) { TONES[t][m].forEach(function (l) { out.push({ tone: t, mood: m, line: l }); }); }); });
  return out;
}
