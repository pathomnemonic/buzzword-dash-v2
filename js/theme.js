/**
 * theme.js — colors that follow the clock and the calendar, so the game never
 * looks quite the same two days running.
 *
 * Time of day sets the mood of the backgrounds and panels (a warm dawn, a
 * bright day, a magenta dusk, a deep night). The season (and a couple of
 * holidays) picks the highlight colors and a small emoji next to the tagline.
 * Players can turn it off in Settings ("Classic" keeps the original night look).
 *
 * Pure functions here; applyTheme writes CSS variables on the page root.
 */

/** Variables each time of day sets. Night is the classic look (the CSS defaults). */
var DAYPARTS = {
  dawn: {
    '--panel': '#5a2570', '--panel-2': '#75338f', '--alt-a': '#8a3fa0', '--alt-b': '#6a2f87', '--alt-hi': '#a24cb8',
    '--deep': '#4a1f66', '--screen-top': '#5a2470', '--screen-bottom': '#2e1048', '--nav-top': '#5a2470', '--nav-bottom': '#2e1048',
    '--bg-fallback': '#2e1048'
  },
  day: {
    '--panel': '#2450b8', '--panel-2': '#2f63d6', '--alt-a': '#3d78e6', '--alt-b': '#2d5fc4', '--alt-hi': '#4f8bf0',
    '--deep': '#1f449c', '--screen-top': '#2a5fd0', '--screen-bottom': '#17338f', '--nav-top': '#2a5fd0', '--nav-bottom': '#17338f',
    '--bg-fallback': '#17338f'
  },
  dusk: {
    '--panel': '#7a2a8e', '--panel-2': '#9a3aa8', '--alt-a': '#b04aa8', '--alt-b': '#8a3590', '--alt-hi': '#c85bb0',
    '--deep': '#5f1f78', '--screen-top': '#7a2a8e', '--screen-bottom': '#3d1160', '--nav-top': '#7a2a8e', '--nav-bottom': '#3d1160',
    '--bg-fallback': '#3d1160'
  },
  night: {}
};

/** Highlight colors by season. */
var SEASONS = {
  winter: { name: 'Winter', emoji: '❄️', vars: { '--accent-pink': '#4aa8ff', '--accent-cyan': '#b8f0ff' } },
  spring: { name: 'Spring', emoji: '🌸', vars: { '--accent-pink': '#ff7ac0', '--accent-cyan': '#7dffb0' } },
  summer: { name: 'Summer', emoji: '☀️', vars: { '--accent-pink': '#ff8a3d', '--accent-cyan': '#3df0e0' } },
  autumn: { name: 'Autumn', emoji: '🍂', vars: { '--accent-pink': '#e8742a', '--accent-cyan': '#ffcf5a' } }
};

/** Short holiday windows that override the season. */
var HOLIDAYS = [
  { id: 'halloween', name: 'Halloween', emoji: '🎃', from: [10, 24], to: [10, 31], vars: { '--accent-pink': '#ff7a1a', '--accent-cyan': '#b57bff' } },
  { id: 'winter-holidays', name: 'Winter holidays', emoji: '🎄', from: [12, 15], to: [12, 26], vars: { '--accent-pink': '#e0353f', '--accent-cyan': '#7dffb0' } }
];

/** Every variable the theme can set (so a change can clear the old ones). */
var MANAGED = (function () {
  var keys = {};
  [DAYPARTS.dawn, DAYPARTS.day, DAYPARTS.dusk].forEach(function (p) { Object.keys(p).forEach(function (k) { keys[k] = true; }); });
  Object.keys(SEASONS).forEach(function (s) { Object.keys(SEASONS[s].vars).forEach(function (k) { keys[k] = true; }); });
  HOLIDAYS.forEach(function (h) { Object.keys(h.vars).forEach(function (k) { keys[k] = true; }); });
  return Object.keys(keys);
})();

export function daypartOf(hour) {
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** Northern-hemisphere seasons by month (Dec to Feb winter, and so on). */
export function seasonOf(month) {   // month: 1..12
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

function inWindow(month, day, from, to) {
  var v = month * 100 + day;
  return v >= from[0] * 100 + from[1] && v <= to[0] * 100 + to[1];
}

/**
 * @param {Date} date
 * @param {'auto'|'classic'} mode
 * @returns {{mode: string, daypart: string, season: string, holiday: string|null, emoji: string, vars: Object<string,string>}}
 */
export function pickTheme(date, mode) {
  if (mode === 'classic') return { mode: 'classic', daypart: 'night', season: 'classic', holiday: null, emoji: '', vars: {} };
  var d = date || new Date();
  var month = d.getMonth() + 1;
  var daypart = daypartOf(d.getHours());
  var seasonId = seasonOf(month);
  var season = SEASONS[seasonId];
  var holiday = null;
  for (var i = 0; i < HOLIDAYS.length; i++) {
    if (inWindow(month, d.getDate(), HOLIDAYS[i].from, HOLIDAYS[i].to)) holiday = HOLIDAYS[i];
  }
  var vars = {};
  var dayVars = DAYPARTS[daypart];
  Object.keys(dayVars).forEach(function (k) { vars[k] = dayVars[k]; });
  var accent = holiday ? holiday.vars : season.vars;
  Object.keys(accent).forEach(function (k) { vars[k] = accent[k]; });
  return {
    mode: 'auto',
    daypart: daypart,
    season: seasonId,
    holiday: holiday ? holiday.id : null,
    emoji: holiday ? holiday.emoji : season.emoji,
    vars: vars
  };
}

/** Write the theme onto the page: CSS variables plus data attributes for CSS hooks. */
export function applyTheme(root, theme) {
  MANAGED.forEach(function (k) { root.style.removeProperty(k); });
  Object.keys(theme.vars).forEach(function (k) { root.style.setProperty(k, theme.vars[k]); });
  root.setAttribute('data-daypart', theme.daypart);
  root.setAttribute('data-season', theme.season);
  if (theme.holiday) root.setAttribute('data-holiday', theme.holiday);
  else root.removeAttribute('data-holiday');
}

/** The managed variable names (for tests). */
export function managedVariables() {
  return MANAGED.slice();
}
