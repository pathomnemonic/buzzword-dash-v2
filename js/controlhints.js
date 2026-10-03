/**
 * controlhints.js — wording for the controls that fits the device.
 *
 * A laptop or desktop gets keyboard instructions; a phone or tablet gets
 * swipe and tap instructions. A device counts as touch-first only when its
 * *primary* pointer is a finger, so laptops with touch screens (whose primary
 * pointer is still the trackpad or mouse) get the keyboard wording.
 */

import { isDefaultBindings, keysPhrase } from './keybindings.js';

/**
 * @param {{coarse?: boolean, fine?: boolean, touchPoints?: number}} [env] override for tests
 * @returns {boolean}
 */
export function isTouchFirst(env) {
  if (!env) {
    var win = typeof window !== 'undefined' ? window : null;
    var mm = win && win.matchMedia ? win.matchMedia.bind(win) : null;
    env = {
      coarse: !!(mm && mm('(pointer: coarse)').matches),
      fine: !!(mm && mm('(pointer: fine)').matches),
      touchPoints: (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0
    };
  }
  if (env.coarse) return true;
  if (env.fine) return false;
  return env.touchPoints > 0; // unknown pointer type: fall back to touch support
}

/** Sentences for each control, in the right style for this device. */
export function getControlText(touchFirst, dashControl) {
  if (touchFirst === undefined) touchFirst = isTouchFirst();
  if (touchFirst) {
    // The dash can be a double tap, an on-screen button, or off (Settings -> Look -> Dash control)
    var dash = dashControl === 'button'
      ? { rush: 'Tap the Dash button to rush', rushVerb: 'Tap the DASH button' }
      : dashControl === 'off'
        ? { rush: '', rushVerb: '' }
        : { rush: 'Double-tap to rush', rushVerb: 'Double-tap' };
    return {
      touch: true,
      move: 'Swipe left or right to switch lanes.',
      jump: 'Swipe up to jump',
      slide: 'Swipe down to slide',
      rush: dash.rush,
      rushVerb: dash.rushVerb,
      intro: 'swipe into the correct diagnosis gate'
    };
  }
  // (worded from the keys now in force, so a player's own choices in Settings show up in the instructions)
  if (isDefaultBindings()) {
    return {
      touch: false,
      move: 'Press the left or right arrow key (or A / D) to switch lanes.',
      jump: 'Press the up arrow (or W) to jump',
      slide: 'Press the down arrow (or S) to slide',
      rush: 'Press Shift or Space to rush',
      rushVerb: 'Press Shift or Space',
      intro: 'move into the correct diagnosis gate'
    };
  }
  return {
    touch: false,
    move: 'Press ' + keysPhrase('moveLeft') + ' or ' + keysPhrase('moveRight') + ' to switch lanes.',
    jump: 'Press ' + keysPhrase('jump') + ' to jump',
    slide: 'Press ' + keysPhrase('slide') + ' to slide',
    rush: 'Press ' + keysPhrase('rush') + ' to rush',
    rushVerb: 'Press ' + keysPhrase('rush'),
    intro: 'move into the correct diagnosis gate'
  };
}
