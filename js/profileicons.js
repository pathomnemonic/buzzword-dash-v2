/**
 * profileicons.js — the symbols a player can pick as their profile picture.
 *
 * A choice is stored as "icon:<symbol>", or as "hero:<hero id>:<face|body>" for a picture of one of the heroes.
 * Older saves hold a character id such as "avatar_intern"; those still show the symbol they always did
 * (see iconFor).
 *
 * A hero picture costs nothing to store or send: it is a short text (under 30 characters, the same field a symbol
 * uses) and the image itself is one of the small portraits shipped with the app (public/portraits, made by
 * tools/make-portraits.mjs from the default colors), never uploaded by anyone. Only hero ids the app knows are
 * accepted, so a made-up or damaged value from another player can only fall back to a symbol, and a player on an
 * older version who has not got the portraits sees the hero's own emoji (or a plain person) instead.
 */

import { CHARACTER_MODELS } from './game/modelcatalog.js';

export var ICON_GROUPS = [
  { name: 'Medicine', icons: ['🩺', '💉', '💊', '🩸', '🧬', '🦠', '🧪', '🔬', '🩻', '🩹', '🏥', '🚑', '⚕️', '🫀', '🫁', '🧠', '🦴', '🦷', '👁️', '🧫'] },
  { name: 'People', icons: ['👩‍⚕️', '👨‍⚕️', '🧑‍⚕️', '🧑‍🔬', '🧑‍🎓', '🦸', '🦸‍♀️', '🧙', '🧙‍♀️', '🥷', '🧛', '🧟', '🤖', '👽', '👻', '🧑‍🚀'] },
  { name: 'Animals', icons: ['🐶', '🐱', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🦉', '🦄', '🐙', '🦈', '🐢', '🦋', '🐝'] },
  { name: 'Cool', icons: ['🔥', '⚡', '🌟', '💎', '👑', '🏆', '🚀', '🎯', '🎮', '🎧', '🕶️', '🛡️', '⚔️', '🌈', '🍀', '☕'] },
  { name: 'Food and fun', icons: ['🍕', '🍔', '🌮', '🍩', '🍪', '🍓', '🥑', '🍉', '🎸', '🎨', '⚽', '🏀', '🏎️', '🛹', '🎲', '🧩'] }
];

/** Every choosable symbol. */
export function allIcons() {
  var out = [];
  ICON_GROUPS.forEach(function (g) { out = out.concat(g.icons); });
  return out;
}

var LEGACY = {
  avatar_intern: '🩺', avatar_attending: '👨‍⚕️', avatar_superhero: '🦸', avatar_robot: '🤖', avatar_wizard: '🧙',
  avatar_zombie: '🧟', avatar_golden: '🏆', avatar_ambulance: '🚑', avatar_racecar: '🏎️', avatar_hearse: '⚰️',
  avatar_nurse: '👩‍⚕️', avatar_surgeon: '🔪', avatar_skeleton: '💀'
};

export var HERO_PICTURE_STYLES = ['face', 'body'];

var HERO_PICTURE = /^hero:([a-z0-9_]{1,40}):(face|body)$/;

function heroModel(id) {
  for (var i = 0; i < CHARACTER_MODELS.length; i++) if (CHARACTER_MODELS[i].id === id) return CHARACTER_MODELS[i];
  return null;
}

/** The value to store for a picture of a hero's face or body. */
export function heroPictureId(heroId, style) {
  return 'hero:' + heroId + ':' + (style === 'body' ? 'body' : 'face');
}

/**
 * What a stored picture value means: a hero picture of a known hero, or null.
 * @returns {{id: string, style: 'face'|'body', name: string, symbol: string}|null}
 */
export function parseHeroPicture(picture) {
  if (typeof picture !== 'string' || picture.length > 64) return null;
  var m = HERO_PICTURE.exec(picture);
  if (!m) return null;
  var model = heroModel(m[1]);
  return model ? { id: m[1], style: m[2], name: model.name, symbol: model.icon || '👤' } : null;
}

/** Where a hero's portrait image lives. */
export function portraitUrl(heroId, style) {
  var base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  return base + 'portraits/' + heroId + '-' + (style === 'body' ? 'body' : 'face') + '.webp';
}

/** The symbol for a stored profile picture value (for a hero picture: that hero's own emoji). */
export function iconFor(picture) {
  var hero = parseHeroPicture(picture);
  if (hero) return hero.symbol;
  if (typeof picture === 'string' && picture.indexOf('icon:') === 0 && picture.length > 5 && picture.length <= 32) return picture.slice(5);
  return LEGACY[picture] || '👤';
}

/**
 * Show a stored picture in an element: the hero's portrait, or the symbol (also while a portrait is missing or
 * fails to load, so there is never a broken-image box).
 * @param {HTMLElement} el
 * @param {string} picture
 */
export function fillProfilePicture(el, picture) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
  var hero = parseHeroPicture(picture);
  el.classList.toggle('has-portrait', !!hero);
  if (!hero) { el.textContent = iconFor(picture); return; }
  var img = document.createElement('img');
  img.className = 'pp-img ' + hero.style;
  img.alt = '';
  img.decoding = 'async';
  img.src = portraitUrl(hero.id, hero.style);
  img.addEventListener('error', function () {
    el.classList.remove('has-portrait');
    el.textContent = hero.symbol;
  });
  el.setAttribute('aria-label', hero.name + ' (' + hero.style + ')');
  el.appendChild(img);
}

/** The value to store for a symbol. */
export function iconId(symbol) {
  return 'icon:' + symbol;
}
