/**
 * keybindings.js — which keys do what on a computer, and the player's own choices.
 *
 * Every action has up to two keys. The defaults are the arrows and WASD for moving, Shift or Space to dash,
 * Ctrl to use the Auto-Pilot in hand and Escape to pause. Players can change any of them in Settings; only the
 * changes are saved, so a new default added later still reaches everyone who has not touched that action.
 *
 * Keys are stored the way the browser names them (`KeyboardEvent.key`), with letters in lower case so Caps Lock
 * and Shift do not matter.
 */

import { storage } from './storage.js';

/** The actions, in the order Settings lists them. */
export var KEY_ACTIONS = [
  { id: 'moveLeft', label: 'Move left' },
  { id: 'moveRight', label: 'Move right' },
  { id: 'jump', label: 'Jump' },
  { id: 'slide', label: 'Slide' },
  { id: 'rush', label: 'Dash' },
  { id: 'autoPilot', label: 'Auto-Pilot' },
  { id: 'pause', label: 'Pause' }
];

export var DEFAULT_KEY_BINDINGS = Object.freeze({
  moveLeft: ['ArrowLeft', 'a'],
  moveRight: ['ArrowRight', 'd'],
  jump: ['ArrowUp', 'w'],
  slide: ['ArrowDown', 's'],
  rush: ['Shift', ' '],
  autoPilot: ['Control'],
  pause: ['Escape']
});

/** Keys that cannot be given to an action: they move around the page, confirm things or belong to the system. */
var RESERVED = ['Tab', 'Enter', 'Meta', 'OS', 'ContextMenu', 'Dead', 'Unidentified', 'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen', 'F5', 'F11', 'F12'];

/** A key as it is compared and stored: single letters lower-cased. */
export function normalizeKey(key) {
  if (typeof key !== 'string' || !key) return '';
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Why a key cannot be used, or '' when it can. */
export function keyProblem(action, key) {
  var k = normalizeKey(key);
  if (!k) return 'That key cannot be used.';
  if (RESERVED.indexOf(k) >= 0) return 'That key is used by the page itself. Pick another.';
  if (k === 'Escape' && action !== 'pause') return 'Escape is for pausing. Pick another key.';
  return '';
}

/** What a key is called on a button: arrows as arrows, Space as Space, Control as Ctrl, letters in capitals. */
export function keyLabel(key) {
  var k = normalizeKey(key);
  var names = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Space', Control: 'Ctrl', Escape: 'Esc', Backspace: 'Backspace', Delete: 'Del' };
  if (names[k]) return names[k];
  return k.length === 1 ? k.toUpperCase() : k;
}

function cleanList(list) {
  var out = [];
  (Array.isArray(list) ? list : []).forEach(function (k) {
    var n = normalizeKey(k);
    if (n && out.indexOf(n) < 0 && out.length < 2) out.push(n);
  });
  return out;
}

/**
 * The keys now in force: the defaults, with whatever the player has changed laid over them.
 * @returns {Object<string, string[]>}
 */
export function getKeyBindings() {
  var saved = storage.get('keyBindings');
  var out = {};
  KEY_ACTIONS.forEach(function (a) {
    var mine = saved && typeof saved === 'object' && Object.prototype.hasOwnProperty.call(saved, a.id) ? cleanList(saved[a.id]) : null;
    out[a.id] = mine !== null ? mine : cleanList(DEFAULT_KEY_BINDINGS[a.id]);
  });
  return out;
}

/** True when nothing has been changed from the defaults. */
export function isDefaultBindings() {
  var now = getKeyBindings();
  return KEY_ACTIONS.every(function (a) { return now[a.id].join('|') === cleanList(DEFAULT_KEY_BINDINGS[a.id]).join('|'); });
}

/** The action a key is bound to now, or null. */
export function actionForKey(key) {
  var k = normalizeKey(key);
  var now = getKeyBindings();
  for (var i = 0; i < KEY_ACTIONS.length; i++) if (now[KEY_ACTIONS[i].id].indexOf(k) >= 0) return KEY_ACTIONS[i].id;
  return null;
}

function save(bindings) {
  storage.set('keyBindings', bindings);
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dx:keys-changed'));
}

/**
 * Give a key to an action (in slot 0 or 1). A key can only do one thing, so if another action had it, that
 * action loses it. Returns what happened, so Settings can say so.
 * @returns {{ok: boolean, message?: string, tookFrom?: string}}
 */
export function setKey(action, slot, key) {
  var problem = keyProblem(action, key);
  if (problem) return { ok: false, message: problem };
  if (!KEY_ACTIONS.some(function (a) { return a.id === action; })) return { ok: false, message: 'Unknown action.' };
  var k = normalizeKey(key);
  var now = getKeyBindings();
  var tookFrom = null;
  KEY_ACTIONS.forEach(function (a) {
    if (a.id === action) return;
    var at = now[a.id].indexOf(k);
    if (at >= 0) { now[a.id].splice(at, 1); tookFrom = a.id; }
  });
  var mine = now[action].filter(function (x) { return x !== k; });
  var at2 = Math.min(Math.max(0, slot | 0), 1);
  // slot 0 is the first key, slot 1 the second; filling a free slot never moves the other key
  var slots = [now[action][0] || '', now[action][1] || ''];
  slots[at2] = k;
  if (slots[1 - at2] === k) slots[1 - at2] = '';
  mine = slots.filter(Boolean);
  now[action] = mine;
  save(now);
  return { ok: true, tookFrom: tookFrom || undefined };
}

/** Take a key away from an action (leaving it without that key). */
export function clearKey(action, slot) {
  var now = getKeyBindings();
  var slots = [now[action][0] || '', now[action][1] || ''];
  slots[Math.min(Math.max(0, slot | 0), 1)] = '';
  now[action] = slots.filter(Boolean);
  save(now);
}

/** Back to the defaults for everything. */
export function resetKeyBindings() {
  save({});
}

/** "Press Shift or Space": the keys of an action in a sentence. */
export function keysPhrase(action) {
  var keys = getKeyBindings()[action] || [];
  if (!keys.length) return 'the ' + action + ' key (not set)';
  return keys.map(keyLabel).join(' or ');
}
