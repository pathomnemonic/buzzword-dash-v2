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
 * The grid starts on the player's first study day and grows with them: on day 5 there are five squares, never a wall of
 * empty ones. It stops growing at `weeks` rows (twelve) and then shows the latest twelve weeks; `page` 1, 2... looks
 * further back, a page at a time.
 * @param {{counts:Object, correct:Object, goal:number, today:Date, weeks?:number, first?:string, page?:number}} input
 * @returns {{cells:Array, current:number, best:number, activeDays:number, total:number, goalDays:number, page:number, pages:number, rangeLabel:string}}
 */
export function buildCalendarModel(input) {
  var counts = input.counts || {};
  var correct = input.correct || {};
  var goal = input.goal || 20;
  var weeks = input.weeks || CALENDAR_WEEKS;
  var today = new Date(input.today);
  today.setHours(12, 0, 0, 0);
  var todayKey = localDateKey(today);
  // the first day shown: the first day anything was answered (or today, for someone who has not started)
  var firstKey = input.first;
  if (!firstKey) {
    var keys = Object.keys(counts).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k) && counts[k] > 0 && k <= todayKey; }).sort();
    firstKey = keys.length ? keys[0] : todayKey;
  }
  if (firstKey > todayKey) firstKey = todayKey;
  var thisSunday = new Date(today.getTime() - today.getDay() * DAY_MS);
  var firstDate = new Date(Number(firstKey.slice(0, 4)), Number(firstKey.slice(5, 7)) - 1, Number(firstKey.slice(8, 10)), 12, 0, 0, 0);
  var firstSunday = new Date(firstDate.getTime() - firstDate.getDay() * DAY_MS);
  var totalWeeks = Math.round((thisSunday.getTime() - firstSunday.getTime()) / (7 * DAY_MS)) + 1;
  var pages = Math.max(1, Math.ceil(totalWeeks / weeks));
  var page = Math.min(Math.max(0, input.page || 0), pages - 1);
  // the newest week on this page, and how many weeks it shows (fewer on the oldest page)
  var endWeeksBack = page * weeks;
  var rows = Math.min(weeks, totalWeeks - endWeeksBack);
  var start = new Date(thisSunday.getTime() - (endWeeksBack + rows - 1) * 7 * DAY_MS);
  var cells = [];
  var total = 0, activeDays = 0, goalDays = 0, run = 0, best = 0;
  for (var i = 0; i < rows * 7; i++) {
    var d = new Date(start.getTime() + i * DAY_MS);
    var key = localDateKey(d);
    if (key > todayKey) break; // nothing after today is drawn
    var before = key < firstKey; // the days before the first study day of the first week: a blank, not an empty square
    var n = before ? 0 : (counts[key] || 0);
    var right = Math.min(n, correct[key] || 0);
    if (!before) {
      total += n;
      if (n > 0) { activeDays++; run++; if (run > best) best = run; } else run = 0;
      if (n >= goal) goalDays++;
    }
    cells.push({ key: key, date: d, count: n, correct: right, level: intensityFor(n, goal), future: false, before: before, today: key === todayKey, goalMet: n >= goal });
  }
  // the current run counts back from today (or from yesterday while today is still empty)
  var current = 0;
  for (var j = cells.length - 1; j >= 0; j--) {
    if (cells[j].before) break;
    if (cells[j].count > 0) current++;
    else if (!cells[j].today) break;
  }
  var shown = cells.filter(function (c) { return !c.before; });
  var fmt = function (c) { return c.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  var rangeLabel = shown.length ? fmt(shown[0]) + ' – ' + fmt(shown[shown.length - 1]) : '';
  return { cells: cells, current: current, best: best, activeDays: activeDays, total: total, goalDays: goalDays, page: page, pages: pages, rangeLabel: rangeLabel };
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

/** Draw the calendar into `container` (cleared first). `page` 0 is the latest twelve weeks (or fewer, for a newer player). */
export function renderStreakCalendar(container, page) {
  if (!container) return;
  clearElement(container);
  page = page || 0;
  var history = storage.data && storage.data.history || {};
  var goal = storage.get('dailyGoal') || 20;
  var args = { counts: history.dailyCounts, correct: history.dailyCorrect, goal: goal, today: new Date() };
  var model = buildCalendarModel(Object.assign({ page: page }, args));
  // The numbers on top cover everything the player has done, not just the page on show
  var all = buildCalendarModel(Object.assign({ weeks: 100000 }, args));
  // The flame, the Today sheet and the Profile all read the saved study streak (it counts shield-covered days too), so
  // the calendar shows the same number rather than recounting the squares
  var status = storage.getStreakStatus();
  var current = status.streak;
  var best = Math.max(all.best, status.best);

  var stats = createElement('div', { className: 'cal-stats' });
  [['🔥', current, 'current'], ['🏆', best, 'best'], ['🎯', all.goalDays, 'goal days'], ['📚', all.total, 'cards']].forEach(function (s) {
    var box = createElement('div', { className: 'cal-stat' });
    box.appendChild(createElement('div', { className: 'cal-stat-num', text: s[0] + ' ' + s[1] }));
    box.appendChild(createElement('div', { className: 'cal-stat-label', text: s[2] }));
    stats.appendChild(box);
  });
  container.appendChild(stats);

  // Paging: only once there is more than one page of history
  if (model.pages > 1) {
    var nav = createElement('div', { className: 'cal-nav' });
    var older = createElement('button', { className: 'btn btn-outline btn-sm', text: '◀ Earlier', attributes: { type: 'button', 'aria-label': 'Show earlier weeks' } });
    older.disabled = model.page >= model.pages - 1;
    older.addEventListener('click', function () { renderStreakCalendar(container, model.page + 1); });
    var newer = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Later ▶', attributes: { type: 'button', 'aria-label': 'Show later weeks' } });
    newer.disabled = model.page <= 0;
    newer.addEventListener('click', function () { renderStreakCalendar(container, model.page - 1); });
    nav.appendChild(older);
    nav.appendChild(createElement('span', { className: 'cal-range', text: model.rangeLabel, attributes: { 'aria-live': 'polite' } }));
    nav.appendChild(newer);
    container.appendChild(nav);
  }

  var labels = createElement('div', { className: 'calendar-day-labels', attributes: { 'aria-hidden': 'true' } });
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (l) { labels.appendChild(createElement('span', { text: l })); });
  container.appendChild(labels);

  var info = createElement('div', { className: 'cal-info', attributes: { 'aria-live': 'polite' }, text: 'Tap a day to see how it went.' });
  var grid = createElement('div', { className: 'calendar-grid cal-grid', attributes: { role: 'group', 'aria-label': 'Study streak calendar' } });
  model.cells.forEach(function (c) {
    if (c.before) { grid.appendChild(createElement('span', { className: 'cal-blank', attributes: { 'aria-hidden': 'true' } })); return; }
    var btn = createElement('button', {
      className: 'calendar-day cal-day lvl-' + c.level + (c.today ? ' today' : '') + (c.goalMet ? ' goal-met' : ''),
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
