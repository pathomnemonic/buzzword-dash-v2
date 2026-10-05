/**
 * palui.js — draws the study buddy on the Home screen and lets it speak.
 * The rules (moods, lines) are in companions.js; this only reads the save and shows the result.
 */

import { storage } from './storage.js';
import { getPal, palMood, palLine, isPalMilestone, NO_PAL, DEFAULT_PAL } from './companions.js';

var bubbleTimer = null;
var pendingEvent = null;
var cheerSpoken = false;

function dateKey(d) {
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

/** The buddy the player has chosen (null for "no buddy"). */
export function currentPal() {
  var id = (storage.get('equipped') || {}).pal || DEFAULT_PAL;
  return id === NO_PAL ? null : getPal(id);
}

/** What the buddy feels right now, from the save. */
export function currentMood(now) {
  var d = now || new Date();
  var status = storage.getStreakStatus();
  return palMood({
    studiedToday: storage.getStudiedToday() > 0,
    streak: status.streak,
    lastStudyDate: storage.get('lastStudyDate') || null,
    today: dateKey(d),
    hour: d.getHours(),
    event: pendingEvent
  });
}

function say(text) {
  var bubble = document.getElementById('palBubble');
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.add('on');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(function () { bubble.classList.remove('on'); }, 3800);
}

/** Draw (or hide) the buddy. Call whenever Home is drawn. */
export function renderPal() {
  var btn = document.getElementById('palBuddy');
  if (!btn) return;
  var pal = currentPal();
  if (!pal) { btn.hidden = true; return; }
  var mood = currentMood();
  btn.hidden = false;
  btn.className = 'pal-buddy pal-' + mood;
  btn.setAttribute('aria-label', pal.name + ', your study buddy. Tap to hear it.');
  btn.innerHTML = '';
  var face = document.createElement('span');
  face.className = 'pal-emoji';
  face.setAttribute('aria-hidden', 'true');
  face.textContent = pal.emoji;
  btn.appendChild(face);
  var tag = document.createElement('span');
  tag.className = 'pal-tag';
  tag.setAttribute('aria-hidden', 'true');
  tag.textContent = mood === 'nap' ? '💤' : mood === 'cheer' ? '✨' : mood === 'happy' ? '💛' : mood === 'sleepy' ? '🌙' : '';
  btn.appendChild(tag);
  btn.onclick = function () { say(palLine(pal, currentMood(), storage.getStreakStatus().streak)); };
  // a cheer waiting from the last run is spoken once, when Home is on screen
  if (pendingEvent && !cheerSpoken && typeof document !== 'undefined' && document.body.getAttribute('data-screen') === 'screenHome') {
    cheerSpoken = true;
    say(palLine(pal, 'cheer', storage.getStreakStatus().streak));
    setTimeout(function () { pendingEvent = null; renderPal(); }, 4500);
  }
}

/**
 * Something worth cheering happened (a new best, a level, a streak milestone). The buddy cheers the next time Home is
 * showing (once), and then goes back to its usual mood.
 * @param {'best'|'levelup'|'milestone'} kind
 */
export function palCheer(kind) {
  if (!currentPal()) return;
  pendingEvent = kind;
  cheerSpoken = false;
}

/** Does the study streak just reached deserve a cheer? */
export function streakDeservesCheer(streak) { return isPalMilestone(streak); }
