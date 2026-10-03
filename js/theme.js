/**
 * theme.js — the look of the menus: a fun, campy arcade (grape purple, candy pink, bright accents) that
 * picks up a light tint from the season and the time of day.
 *
 * The playful look is always there (the bolder worlds, Ocean to Rose, change the whole color of the room). The season only nudges the colors (winter is a cooler indigo with
 * ice-blue accents, spring an orchid with blossom pink and lime, summer a magenta with coral and
 * sunshine, autumn a plum with pumpkin and berry) and the time of day makes it lighter or darker and a
 * touch warmer or cooler (dawn, day, dusk, night). There are no falling leaves or snowflakes: it is a
 * skin, not a scene. Everything is derived from a few hues, so every combination keeps readable contrast
 * (tests check it). Players can pick a season by hand, or Classic (the original purple), in Settings.
 *
 * Pure functions here; applyTheme writes CSS variables on the page root.
 */

// ---------- color helpers ----------

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = l - c / 2;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  function hex(v) { var n = Math.round((v + m) * 255); return (n < 16 ? '0' : '') + n.toString(16); }
  return '#' + hex(r) + hex(g) + hex(b);
}

/** Move hue a toward hue b by t (0..1) along the short way round. */
function mixHue(a, b, t) {
  var d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/** WCAG contrast ratio between two #rrggbb colors (exported for tests). */
export function contrast(c1, c2) {
  function lum(c) {
    var v = [1, 3, 5].map(function (i) {
      var x = parseInt(c.slice(i, i + 2), 16) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  var a = lum(c1), b = lum(c2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * A background color that white text can sit on: lowers the lightness (a little at a
 * time) until the contrast reaches `min`. Yellow-greens look much brighter than blues at
 * the same lightness, so each hue needs its own amount.
 */
function darkEnough(h, s, l, min) {
  var c = hsl(h, s, l);
  for (var i = 0; i < 60 && contrast('#ffffff', c) < min; i++) {
    l -= 0.01;
    c = hsl(h, s, l);
  }
  return c;
}

/** A light color that dark ink can sit on: raises the lightness until the contrast reaches `min`. */
function lightEnough(h, s, l, ink, min) {
  var c = hsl(h, s, l);
  for (var i = 0; i < 60 && contrast(ink, c) < min; i++) {
    l += 0.01;
    c = hsl(h, s, l);
  }
  return c;
}

// ---------- the worlds ----------

/**
 * base: main hue (always in the grape-purple family). a1/a2/a3: accent hues (the pink, cyan and purple
 * slots). The seasons differ in their accents far more than in their base.
 */
var WORLDS = {
  winter: { name: 'Winter', base: 248, a1: 335, a2: 195, a3: 275 },
  spring: { name: 'Spring', base: 282, a1: 340, a2: 120, a3: 300 },
  summer: { name: 'Summer', base: 296, a1: 12, a2: 48, a3: 175 },
  autumn: { name: 'Autumn', base: 262, a1: 28, a2: 45, a3: 350 },
  // The bolder looks, only for Surprise me and for picking by hand: a different color of room altogether
  ocean:  { name: 'Ocean',  base: 205, a1: 18,  a2: 52,  a3: 275 },
  forest: { name: 'Forest', base: 150, a1: 322, a2: 48,  a3: 275 },
  ember:  { name: 'Ember',  base: 6,   a1: 46,  a2: 190, a3: 300 },
  amber:  { name: 'Amber',  base: 36,  a1: 350, a2: 195, a3: 275 },
  rose:   { name: 'Rose',   base: 330, a1: 52,  a2: 172, a3: 265 }
};

/** How bright and warm each time of day makes a world (the warm tint is gentle: the playful look stays). */
var DAYPARTS = {
  dawn:  { name: 'dawn',  warm: { hue: 40, t: 0.16 },  sat: 0.62, top: 0.36, bottom: 0.2,  panel: 0.3 },
  day:   { name: 'day',   warm: null,                  sat: 0.78, top: 0.46, bottom: 0.3,  panel: 0.34 },
  dusk:  { name: 'dusk',  warm: { hue: 330, t: 0.16 }, sat: 0.58, top: 0.3,  bottom: 0.15, panel: 0.25 },
  night: { name: 'night', warm: { hue: 235, t: 0.15 }, sat: 0.55, top: 0.19, bottom: 0.07, panel: 0.16 }
};

/** Every CSS variable the theme sets (so a change can clear the old ones). */
var MANAGED = [
  '--ink', '--panel', '--panel-2', '--alt-a', '--alt-b', '--alt-hi', '--deep',
  '--screen-top', '--screen-bottom', '--nav-top', '--nav-bottom', '--bg-fallback', '--glow',
  '--text-secondary', '--text-muted', '--accent-pink', '--accent-cyan', '--accent-purple',
  '--grad-primary', '--tile-1', '--tile-2', '--tile-3', '--tile-4', '--lane-1', '--lane-2', '--lane-3'
];

/**
 * All the variables for one world at one time of day.
 * @returns {Object<string,string>}
 */
export function paletteFor(worldId, daypart) {
  var w = WORLDS[worldId];
  var d = DAYPARTS[daypart] || DAYPARTS.night;
  var h = d.warm ? mixHue(w.base, d.warm.hue, d.warm.t) : w.base;
  var s = d.sat;
  var night = daypart === 'night';
  var ink = hsl(h, 0.55, night ? 0.04 : 0.06);
  var p = d.panel;
  var vars = {
    '--ink': ink,
    '--panel': darkEnough(h, s, p, 4.8),
    '--panel-2': darkEnough(h, s, p + 0.07, 4.6),
    '--alt-a': darkEnough(h + 6, s, p + 0.1, 4.6),
    '--alt-b': darkEnough(h + 6, s, p + 0.03, 4.8),
    '--alt-hi': darkEnough(h + 10, s, p + 0.15, 4.5),
    '--deep': darkEnough(h, s, p - 0.04, 5),
    '--screen-top': darkEnough(h, s, d.top, 3.4),
    '--screen-bottom': darkEnough(h, s * 0.9, d.bottom, 4),
    '--nav-top': darkEnough(h, s, d.top - 0.04, 4.5),
    '--nav-bottom': darkEnough(h, s * 0.9, d.bottom - 0.03, 5),
    '--bg-fallback': darkEnough(h, s * 0.9, d.bottom, 4),
    '--glow': hsl(w.a1, 0.95, night ? 0.45 : 0.62) + (night ? '55' : '66'),
    '--text-secondary': hsl(h, 0.75, 0.92),
    '--text-muted': hsl(h, 0.35, 0.74),
    '--accent-pink': darkEnough(w.a1, 0.9, 0.5, 3.2),
    '--accent-cyan': hsl(w.a2, 0.95, 0.62),
    '--accent-purple': hsl(w.a3, 0.8, 0.6),
    '--grad-primary': 'linear-gradient(180deg, ' + darkEnough(h + 8, 0.9, 0.62, 3.2) + ', ' + darkEnough(h + 8, 0.85, 0.46, 4) + ')',
    '--tile-1': 'linear-gradient(180deg, ' + hsl(w.a2, 0.95, 0.72) + ', ' + hsl(w.a2, 0.9, 0.56) + ')',
    '--tile-2': 'linear-gradient(180deg, ' + hsl(w.a1, 0.95, 0.75) + ', ' + hsl(w.a1, 0.9, 0.6) + ')',
    '--tile-3': 'linear-gradient(180deg, ' + hsl(h + 25, 0.9, 0.72) + ', ' + hsl(h + 25, 0.85, 0.56) + ')',
    '--tile-4': 'linear-gradient(180deg, ' + hsl(w.a3, 0.9, 0.76) + ', ' + hsl(w.a3, 0.8, 0.62) + ')',
    '--lane-1': lightEnough(w.a1, 0.95, 0.78, ink, 7),
    '--lane-2': lightEnough(w.a2, 0.95, 0.7, ink, 7),
    '--lane-3': lightEnough(h + 25, 0.9, 0.74, ink, 7)
  };
  return vars;
}

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

/** The choices for Settings -> Colors: [id, label]. */
export var THEME_CHOICES = [
  ['surprise', 'Surprise me (a new look after each run)'],
  ['auto', 'Seasonal (follows the date)'],
  ['classic', 'Classic'],
  ['winter', 'Winter'],
  ['spring', 'Spring'],
  ['summer', 'Summer'],
  ['autumn', 'Autumn'],
  ['ocean', 'Ocean'],
  ['forest', 'Forest'],
  ['ember', 'Ember'],
  ['amber', 'Amber'],
  ['rose', 'Rose']
];

/** A random world other than `exclude` (so a reroll always looks different). */
export function rollWorld(exclude, rand) {
  var r = rand || Math.random;
  var ids = Object.keys(WORLDS).filter(function (id) { return id !== exclude; });
  return ids[Math.min(ids.length - 1, Math.floor(r() * ids.length))];
}

/** A new look after every run (or whenever Home is shown after a few minutes). */
export var REROLL_EVERY_RUNS = 1;
export var REROLL_EVERY_MS = 4 * 60 * 1000;
export function rerollDue(runsSinceRoll, lastRollAt, now) {
  return runsSinceRoll >= REROLL_EVERY_RUNS || (now - lastRollAt) >= REROLL_EVERY_MS;
}

/**
 * @param {Date} date
 * @param {string} mode 'surprise' (a rolled world, passed as `rolled`), 'auto' (the season), 'classic', or a season id to pick by hand (it still follows the time of day)
 * @param {string} [rolled] the world a 'surprise' look currently uses
 * @returns {{mode: string, world: string, daypart: string, season: string, name: string, vars: Object<string,string>}}
 */
export function pickTheme(date, mode, rolled) {
  if (mode === 'classic') return { mode: 'classic', world: 'classic', daypart: 'night', season: 'classic', name: 'Classic', vars: {} };
  var d = date || new Date();
  var daypart = daypartOf(d.getHours());
  var surprise = mode === 'surprise';
  var world = WORLDS[mode] ? mode : (surprise && WORLDS[rolled] ? rolled : seasonOf(d.getMonth() + 1));
  return {
    mode: WORLDS[mode] ? mode : (surprise ? 'surprise' : 'auto'),
    world: world,
    daypart: daypart,
    season: world,
    name: WORLDS[world].name + ' ' + daypart,
    vars: paletteFor(world, daypart)
  };
}

/** Write the theme onto the page: CSS variables and data attributes . */
export function applyTheme(root, theme) {
  MANAGED.forEach(function (k) { root.style.removeProperty(k); });
  Object.keys(theme.vars).forEach(function (k) { root.style.setProperty(k, theme.vars[k]); });
  root.setAttribute('data-daypart', theme.daypart);
  root.setAttribute('data-season', theme.season);
  root.setAttribute('data-world', theme.world);
  root.removeAttribute('data-holiday');
}

/** The managed variable names (for tests). */
export function managedVariables() {
  return MANAGED.slice();
}

/** World ids (for tests). */
export function worldIds() {
  return Object.keys(WORLDS);
}
