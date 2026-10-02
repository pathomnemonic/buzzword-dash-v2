/**
 * readiness.js — how well you remember what you have studied, and a pace to an exam date.
 *
 * Readiness is an estimate of memory, not a prediction of an exam score. For every card the player has seen it
 * works out the chance of remembering it today (FSRS retrievability, see fsrs.js) and averages that by
 * subject. Cards never seen count as zero for "coverage" but are kept out of the memory figure, so a new
 * player is not told they are doing badly.
 */

import { currentRetrievability, DAY_MS } from './fsrs.js';

export var READINESS_NOTE = 'An estimate of how well you remember what you have studied. It is not a prediction of your exam score.';

/**
 * @param {object} input
 * @param {object} input.cardStats
 * @param {object[]} input.cards live cards (id, subj)
 * @param {number} [input.now]
 * @returns {{overall: number|null, coverage: number, studied: number, total: number,
 *   subjects: {subject: string, memory: number|null, coverage: number, studied: number, total: number}[]}}
 */
export function estimateReadiness(input) {
  var now = input.now || Date.now();
  var stats = input.cardStats || {};
  var by = {};
  var studied = 0;
  var sum = 0;
  input.cards.forEach(function (c) {
    var b = by[c.subj] || (by[c.subj] = { total: 0, studied: 0, sum: 0 });
    b.total++;
    var s = stats[c.id];
    if (!s || !s.seen) return;
    var r = s.stability > 0 ? currentRetrievability(s, now) : (s.correct >= s.wrong ? 0.7 : 0.3); // an old card not yet converted
    b.studied++;
    b.sum += r;
    studied++;
    sum += r;
  });
  var subjects = Object.keys(by).map(function (k) {
    var b = by[k];
    return { subject: k, total: b.total, studied: b.studied, coverage: b.total ? b.studied / b.total : 0, memory: b.studied >= 5 ? b.sum / b.studied : null };
  }).sort(function (a, b) { return (a.memory === null ? 2 : a.memory) - (b.memory === null ? 2 : b.memory); });
  return {
    overall: studied >= 20 ? sum / studied : null,
    coverage: input.cards.length ? studied / input.cards.length : 0,
    studied: studied,
    total: input.cards.length,
    subjects: subjects
  };
}

/** Whole days from `now` to a YYYY-MM-DD date (0 for today, negative if it has passed, null if not a date). */
export function daysUntil(dateKey, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return null;
  var parts = dateKey.split('-').map(Number);
  var target = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  var d = new Date(now || Date.now());
  var today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((target - today) / DAY_MS);
}

/**
 * A pace for the days left: how many new cards a day finishes the player's subjects, and a short line to say it.
 * @param {{examDate: string, unseen: number, due: number, dailyGoal: number, now?: number}} input
 */
export function examPace(input) {
  var left = daysUntil(input.examDate, input.now);
  if (left === null) return null;
  if (left < 0) return { daysLeft: left, perDay: 0, text: 'Your exam date has passed. Set a new one in Settings.' };
  if (left === 0) return { daysLeft: 0, perDay: 0, text: 'Exam day. Review what is due and rest.' };
  // keep the last two days for review only, once there is time for that
  var teaching = left > 4 ? left - 2 : left;
  var perDay = Math.ceil((input.unseen || 0) / teaching);
  var text = left + ' day' + (left === 1 ? '' : 's') + ' to go. ';
  if ((input.unseen || 0) === 0) text += 'You have met every card: keep reviewing what is due.';
  else text += 'About ' + perDay + ' new card' + (perDay === 1 ? '' : 's') + ' a day covers the rest' + (left > 4 ? ', leaving the last two days for review.' : '.');
  if (perDay > Math.max(input.dailyGoal || 20, 20) * 3) text += ' That is a lot: consider choosing fewer subjects.';
  return { daysLeft: left, perDay: perDay, text: text };
}
