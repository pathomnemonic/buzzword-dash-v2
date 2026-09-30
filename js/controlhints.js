/**
 * controlhints.js — wording for the controls that fits the device.
 *
 * A laptop or desktop gets keyboard instructions; a phone or tablet gets
 * swipe and tap instructions. A device counts as touch-first only when its
 * *primary* pointer is a finger, so laptops with touch screens (whose primary
 * pointer is still the trackpad or mouse) get the keyboard wording.
 */

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
export function getControlText(touchFirst) {
  if (touchFirst === undefined) touchFirst = isTouchFirst();
  if (touchFirst) {
    return {
      touch: true,
      move: 'Swipe left or right to switch lanes.',
      jump: 'Swipe up to jump',
      slide: 'Swipe down to slide',
      rush: 'Double-tap to rush',
      rushVerb: 'Double-tap',
      intro: 'swipe into the correct diagnosis gate'
    };
  }
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
