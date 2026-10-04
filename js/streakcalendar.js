/**
 * streakcalendar.js — the study streak calendar, on Home (tap the flame) and in the Profile.
 *
 * Twelve weeks, one square per day. The darker the square, the more cards were answered that day compared with the
 * daily goal; a tap on a day shows how many cards, how many were right and whether the goal was met. The model is
 * pure (buildCalendarModel) so the rules are tested directly; renderStreakCalendar only draws it.
 */

import { createElement, clearElement } from './dom.js';
import { storage } from './storage.js';
import { localDateKey } from './uihelpers.js';

export var CALENDAR_WEEKS = 12;
var DAY_MS = 24 * 60 * 60 * 1000;

/** 0 = nothing answered, 1 = a little, 2 = about half the goal, 3 = the goal, 4 = double the goal or more. */
export function intensityFor(count, goal) {
  if (!count || count <= 0) return 0;
  var g = Math.max(1, goal || 20);
  if (count >= g * 2) return 4;
  if (count >= g) return 3;
  if (count >= g / 2) return 2;
  return 1;
}

/**
 * @param {{counts:Object, correct:Object, goal:number, today:Date, weeks?:number}} input
 * @returns {{cells:Array, current:number, best:number, activeDays:number, total:number, goalDays:number}}
 */
export function buildCalendarModel(input) {
  var counts = input.counts || {};
  var correct = input.correct || {};
  var goal = input.goal || 20;
  var weeks = input.weeks || CALENDAR_WEEKS;
  var today = new Date(input.today);
  today.setHours(12, 0, 0, 0);
  // the grid ends on today's week, so it starts on a Sunday (weeks - 1) weeks before this week's Sunday
  var start = new Date(today.getTime() - ((weeks - 1) * 7 + today.getDay()) * DAY_MS);
  var todayKey = localDateKey(today);
  var cells = [];
  var total = 0, activeDays = 0, goalDays = 0, run = 0, best = 0;
  for (var i = 0; i < weeks * 7; i++) {
    var d = new Date(start.getTime() + i * DAY_MS);
    var key = localDateKey(d);
    var future = key > todayKey;
    var n = future ? 0 : (counts[key] || 0);
    var right = Math.min(n, correct[key] || 0);
    if (!future) {
      total += n;
      if (n > 0) { activeDays++; run++; if (run > best) best = run; } else run = 0;
      if (n >= goal) goalDays++;
    }
    cells.push({ key: key, date: d, count: n, correct: right, level: intensityFor(n, goal), future: future, today: key === todayKey, goalMet: n >= goal });
  }
  // the current run counts back from today (or from yesterday while today is still empty)
  var current = 0;
  for (var j = cells.length - 1; j >= 0; j--) {
    if (cells[j].future) continue;
    if (cells[j].count > 0) current++;
    else if (!cells[j].today) break;
  }
  return { cells: cells, current: current, best: best, activeDays: activeDays, total: total, goalDays: goalDays };
}

function dayName(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** What the player reads when a day is tapped. */
export function describeDay(cell, goal) {
  if (cell.future) return dayName(cell.date) + ': not yet';
  if (!cell.count) return dayName(cell.date) + ': no cards answered';
  var acc = cell.correct > 0 ? ', ' + Math.round(cell.correct / cell.count * 100) + '% right' : '';
  return dayName(cell.date) + ': ' + cell.count + (cell.count === 1 ? ' card' : ' cards') + acc + (cell.goalMet ? ' · goal met ✅' : ' · goal ' + goal);
}

/** Draw the calendar into `container` (cleared first). */
export function renderStreakCalendar(container) {
  if (!container) return;
  clearElement(container);
  var history = storage.data && storage.data.history || {};
  var goal = storage.get('dailyGoal') || 20;
  var model = buildCalendarModel({ counts: history.dailyCounts, correct: history.dailyCorrect, goal: goal, today: new Date() });
  // The flame, the Today sheet and the Profile all read the saved study streak (it counts shield-covered days too), so
  // the calendar shows the same number rather than recounting the squares
  var status = storage.getStreakStatus();
  model.current = status.streak;
  model.best = Math.max(model.best, status.best);

  var stats = createElement('div', { className: 'cal-stats' });
  [['🔥', model.current, 'current'], ['🏆', model.best, 'best'], ['🎯', model.goalDays, 'goal days'], ['📚', model.total, 'cards']].forEach(function (s) {
    var box = createElement('div', { className: 'cal-stat' });
    box.appendChild(createElement('div', { className: 'cal-stat-num', text: s[0] + ' ' + s[1] }));
    box.appendChild(createElement('div', { className: 'cal-stat-label', text: s[2] }));
    stats.appendChild(box);
  });
  container.appendChild(stats);

  var labels = createElement('div', { className: 'calendar-day-labels', attributes: { 'aria-hidden': 'true' } });
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (l) { labels.appendChild(createElement('span', { text: l })); });
  container.appendChild(labels);

  var info = createElement('div', { className: 'cal-info', attributes: { 'aria-live': 'polite' }, text: 'Tap a day to see how it went.' });
  var grid = createElement('div', { className: 'calendar-grid cal-grid', attributes: { role: 'group', 'aria-label': 'Study streak calendar, last 12 weeks' } });
  model.cells.forEach(function (c) {
    var btn = createElement('button', {
      className: 'calendar-day cal-day lvl-' + c.level + (c.today ? ' today' : '') + (c.future ? ' future' : '') + (c.goalMet ? ' goal-met' : ''),
      attributes: { type: 'button', 'aria-label': describeDay(c, goal) }
    });
    if (c.count > 0) btn.appendChild(createElement('span', { className: 'cal-n', text: c.count > 99 ? '99+' : String(c.count) }));
    btn.addEventListener('click', function () {
      info.textContent = describeDay(c, goal);
      grid.querySelectorAll('.cal-day.picked').forEach(function (b) { b.classList.remove('picked'); });
      btn.classList.add('picked');
    });
    grid.appendChild(btn);
  });
  container.appendChild(grid);
  container.appendChild(info);

  var legend = createElement('div', { className: 'cal-legend', attributes: { 'aria-hidden': 'true' } });
  legend.appendChild(createElement('span', { text: 'Less' }));
  [0, 1, 2, 3, 4].forEach(function (l) { legend.appendChild(createElement('span', { className: 'cal-swatch lvl-' + l })); });
  legend.appendChild(createElement('span', { text: 'More' }));
  container.appendChild(legend);
}
