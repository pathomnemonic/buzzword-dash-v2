/**
 * firstweek.js — a short checklist for a new player's first two weeks.
 *
 * Seven small steps that show the parts of the game that make studying stick (a run, flashcards, the Daily 15,
 * an exam date, a trail, a three-day streak, a profile friends can find). Each step is done by doing the thing, not
 * by tapping a box; the checklist hides itself when it is finished, after two weeks, or when the player hides it.
 * Pure functions (the card is drawn in uihome.js), so the rules are tested directly.
 */

var DAY = 24 * 60 * 60 * 1000;
export var FIRST_WEEK_DAYS = 14;

export var STEPS = [
  { id: 'run', label: 'Finish your first run', action: 'play' },
  { id: 'flashcards', label: 'Try a flashcard session', action: 'flashcards' },
  { id: 'daily', label: 'Play the Daily 15', action: 'challenge' },
  { id: 'exam', label: 'Set your exam date in your profile', action: 'profile' },
  { id: 'trail', label: 'Equip a trail in the Locker', action: 'locker' },
  { id: 'streak', label: 'Study three days in a row', action: null },
  { id: 'profile', label: 'Make your profile visible so friends can find you', action: 'friends' }
];

/**
 * @param {object} s
 * @param {function(string): *} s.get storage.get
 * @param {number} [s.now]
 * @returns {{show: boolean, steps: {id: string, label: string, action: string|null, done: boolean}[], doneCount: number, next: string|null}}
 */
export function firstWeekState(s) {
  var now = s.now || Date.now();
  var get = s.get;
  var equipped = get('equipped') || {};
  var done = {
    run: (Number(get('totalEncounters')) || 0) > 0,
    flashcards: (Number(get('flashcardSessions')) || 0) > 0,
    daily: !!get('lastDaily'),
    exam: !!get('examDate'),
    trail: !!equipped.trail && equipped.trail !== 'trail_none',
    streak: (Number(get('bestStudyStreak')) || 0) >= 3 || (Number(get('studyStreak')) || 0) >= 3,
    profile: !!get('profileVisible') && !!get('profileName')
  };
  var steps = STEPS.map(function (st) { return { id: st.id, label: st.label, action: st.action, done: !!done[st.id] }; });
  var doneCount = steps.filter(function (st) { return st.done; }).length;
  var first = Number(get('firstRunAt')) || 0;
  var expired = first > 0 && now - first > FIRST_WEEK_DAYS * DAY;
  var next = null;
  for (var i = 0; i < steps.length; i++) if (!steps[i].done) { next = steps[i].id; break; }
  return { show: !get('firstWeekOff') && !expired && doneCount < steps.length, steps: steps, doneCount: doneCount, next: next };
}
