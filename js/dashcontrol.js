/**
 * dashcontrol.js — how the player dashes: a double tap, an on-screen button, or not at all.
 *
 * The setting is 'auto' until the player chooses. Auto means the on-screen button on a touch-first device
 * (double taps there fire by accident) and the double tap everywhere else (the keyboard always dashes too).
 * After a few games the player is asked once whether they would rather dash with a double tap.
 */

import { storage } from './storage.js';
import { isTouchFirst } from './controlhints.js';

export var DASH_PROMPT_AFTER_RUNS = 3;

/** @returns {'double'|'button'|'off'} */
export function resolveDashControl(setting, touchFirst) {
  if (setting === 'double' || setting === 'button' || setting === 'off') return setting;
  return touchFirst ? 'button' : 'double';
}

/** The control in use right now. */
export function getDashControl() {
  return resolveDashControl(storage.get('dashControl'), isTouchFirst());
}

/**
 * Offer the double tap once, after enough games, to players who were given the button by default.
 * @param {{setting: string, touchFirst: boolean, runs: number, asked: boolean}} i
 */
export function shouldAskDoubleTap(i) {
  return !i.asked && i.touchFirst && (i.setting === 'auto' || !i.setting) && i.runs >= DASH_PROMPT_AFTER_RUNS;
}

/**
 * The card on the results screen. It stays (on every results screen) until one of its two buttons is pressed:
 * "Turn on double-tap" stores that choice and "Keep the button" keeps the default. Either answer is final: the
 * question is never asked again. (Just looking at the card, or leaving the screen, is not an answer.)
 * @returns {boolean} whether the card was added
 */
export function attachDashPrompt(container, toast) {
  if (!container) return false;
  if (!shouldAskDoubleTap({ setting: storage.get('dashControl'), touchFirst: isTouchFirst(), runs: storage.get('runsFinished') || 0, asked: !!storage.get('dashPromptSeen') })) return false;
  var box = document.createElement('div');
  box.className = 'prompt-card dash-prompt';
  var text = document.createElement('div');
  text.className = 'prompt-text';
  text.textContent = 'Want to dash by double-tapping the screen instead of using the Dash button? It can trigger by accident while you swipe. You can switch back any time in Settings → Look → Dash control.';
  box.appendChild(text);
  var row = document.createElement('div');
  row.className = 'prompt-row';
  var on = document.createElement('button');
  on.type = 'button';
  on.className = 'btn btn-sm btn-gold';
  on.textContent = '👆👆 Turn on double-tap';
  on.addEventListener('click', function () {
    storage.set('dashPromptSeen', true);
    storage.set('dashControl', 'double');
    document.dispatchEvent(new CustomEvent('dx:controls-changed'));
    if (toast) toast('Double-tap to dash is on. Change it in Settings → Look.');
    box.remove();
  });
  var keep = document.createElement('button');
  keep.type = 'button';
  keep.className = 'btn btn-sm btn-outline';
  keep.textContent = 'Keep the button';
  keep.addEventListener('click', function () {
    storage.set('dashPromptSeen', true);
    box.remove();
  });
  row.appendChild(on);
  row.appendChild(keep);
  box.appendChild(row);
  container.insertBefore(box, container.children[1] || null);
  return true;
}
