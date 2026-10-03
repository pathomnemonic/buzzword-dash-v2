/**
 * uihelpers.js — small DOM helpers shared by ui.js and the screens split out of it.
 */

import { storage } from './storage.js';

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/** Returns YYYY-MM-DD for local date */
export function localDateKey(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/** Check if user prefers reduced motion */
export function prefersReducedMotion() {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return storage.get('reducedMotion') || false;
}

/** Debounce utility */
export function debounce(fn, delay) {
  var timer = null;
  return function () {
    var args = arguments;
    var self = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      fn.apply(self, args);
    }, delay);
  };
}

// ═══════════════════════════════════════════════════════════
// FOCUS TRAP for modals (Section 21.3) [2]
// ═══════════════════════════════════════════════════════════

var _activeFocusTrap = null;
var _previousFocusElement = null;

export function trapFocus(container) {
  _previousFocusElement = document.activeElement;

  function getFocusable() {
    var elements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    var visible = [];
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].offsetParent !== null && !elements[i].disabled) {
        visible.push(elements[i]);
      }
    }
    return visible;
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      var focusable = getFocusable();
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown);
  _activeFocusTrap = { container: container, handler: handleKeyDown };

  // Move focus into the container
  var focusable = getFocusable();
  if (focusable.length > 0) {
    focusable[0].focus();
  } else {
    container.setAttribute('tabindex', '-1');
    container.focus();
  }
}

export function releaseFocusTrap() {
  if (_activeFocusTrap) {
    _activeFocusTrap.container.removeEventListener('keydown', _activeFocusTrap.handler);
    _activeFocusTrap = null;
  }
  if (_previousFocusElement && _previousFocusElement.focus) {
    try { _previousFocusElement.focus(); } catch (e) { /* element may have been removed */ }
  }
  _previousFocusElement = null;
}
