/**
 * studyplan.js — pure calculations behind the weak-spot dashboard.
 *
 * Takes the player's card statistics and works out what is due, what is
 * weakest, and a short plan for today. No DOM and no storage access here so
 * it can be unit-tested.
 */

var DAY = 24 * 60 * 60 * 1000;

/**
 * @param {object} input
 * @param {object} input.cardStats - { [cardId]: {seen, correct, wrong, due} }
 * @param {object[]} input.cards - card objects (id, subj, questionType)
 * @param {object} input.subjectStats - { [subject]: {correct, wrong} }
 * @param {number} input.goal - daily card goal
 * @param {number} input.studiedToday
 * @param {number} [input.now]
 */
/** Percentages are only shown once there are at least this many answers behind them (one lucky answer is not 100%). */
export var MIN_ANSWERS_FOR_STATS = 10;

export function buildStudyPlan(input) {
  var now = input.now || Date.now();
  var byId = {};
  input.cards.forEach(function (c) { byId[c.id] = c; });

  // ---- due cards and 7-day forecast ----
  var dueIds = [];
  var forecast = [0, 0, 0, 0, 0, 0, 0];
  Object.keys(input.cardStats).forEach(function (id) {
    var s = input.cardStats[id];
    if (!s || !s.seen || typeof s.due !== 'number' || !byId[id]) return;
    if (s.due <= now) {
      dueIds.push(id);
    } else {
      var days = Math.floor((s.due - now) / DAY);
      if (days >= 0 && days < 7) forecast[days]++;
    }
  });
  // Most overdue first
  dueIds.sort(function (a, b) { return input.cardStats[a].due - input.cardStats[b].due; });

  // ---- accuracy by question type ----
  var types = {};
  Object.keys(input.cardStats).forEach(function (id) {
    var s = input.cardStats[id];
    var c = byId[id];
    if (!s || !s.seen || !c) return;
    var t = c.questionType || 'buzzword_dx';
    types[t] = types[t] || { seen: 0, correct: 0 };
    types[t].seen += s.seen;
    types[t].correct += s.correct;
  });
  var typeAccuracy = Object.keys(types).map(function (t) {
    return { type: t, seen: types[t].seen, accuracy: Math.round(types[t].correct / types[t].seen * 100) };
  }).sort(function (a, b) { return a.accuracy - b.accuracy; });

  // ---- weakest subject (needs a minimum of data) ----
  /** @type {{subject: string, accuracy: number, total: number} | null} */
  var weakest = null;
  Object.keys(input.subjectStats || {}).forEach(function (subj) {
    var s = input.subjectStats[subj];
    var total = (s.correct || 0) + (s.wrong || 0);
    if (total < MIN_ANSWERS_FOR_STATS) return;
    var acc = (s.correct || 0) / total;
    if (!weakest || acc < weakest.accuracy) weakest = { subject: subj, accuracy: acc, total: total };
  });

  // ---- today's plan ----
  var remaining = Math.max(0, (input.goal || 20) - (input.studiedToday || 0));
  /** @type {Array<{kind: string, label: string, count?: number, subject?: string}>} */
  var steps = [];
  if (dueIds.length > 0) steps.push({ kind: 'due', count: Math.min(dueIds.length, 20), label: 'Review ' + Math.min(dueIds.length, 20) + ' due card' + (Math.min(dueIds.length, 20) === 1 ? '' : 's') });
  if (weakest) steps.push({ kind: 'weak', subject: weakest.subject, label: 'Drill ' + weakest.subject + ' (' + Math.round(weakest.accuracy * 100) + '% correct)' });
  if (remaining > 0) steps.push({ kind: 'goal', count: remaining, label: 'Study ' + remaining + ' more card' + (remaining === 1 ? '' : 's') + ' to hit your daily goal' });

  return {
    dueIds: dueIds,
    dueCount: dueIds.length,
    forecast: forecast,
    typeAccuracy: typeAccuracy,
    weakestSubject: weakest,
    remainingToGoal: remaining,
    steps: steps
  };
}
