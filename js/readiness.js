/**
 * readiness.js — mastery levels per subject, and a pace to an exam date.
 *
 * Mastery is deliberately plain: it comes from how many cards you have answered in a subject and how often you got
 * them right, the same numbers shown next to it, so it is always obvious where a level comes from.
 */

import { DAY_MS } from './fsrs.js';

/**
 * A plain level for a subject from the cards answered and the share answered correctly.
 * New (under 10 answers), Learning, Solid (25+ answers, 70%+), Mastered (50+ answers, 85%+).
 * @param {number} correct
 * @param {number} wrong
 * @returns {'New'|'Learning'|'Solid'|'Mastered'}
 */
export function masteryLevel(correct, wrong) {
  var total = (correct || 0) + (wrong || 0);
  if (total < 10) return 'New';
  var acc = correct / total;
  if (total >= 50 && acc >= 0.85) return 'Mastered';
  if (total >= 25 && acc >= 0.7) return 'Solid';
  return 'Learning';
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
