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
  // The in-app setting wins when it is on: a player who turned motion down in
  // Settings stays reduced even on a device whose OS setting says otherwise.
  if (storage.get('reducedMotion')) return true;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
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

// A stack, not a single slot: dialogs nest (a confirm over a sheet, the
// continue prompt over the game), and a single slot lost the outer trap
// the moment an inner one was set, and restored focus to the wrong place.
var _focusTrapStack = [];

export function trapFocus(container) {
  var previousFocusElement = document.activeElement;

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
  _focusTrapStack.push({ container: container, handler: handleKeyDown, previousFocusElement: previousFocusElement });

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
  var trap = _focusTrapStack.pop();
  if (trap) {
    trap.container.removeEventListener('keydown', trap.handler);
    if (trap.previousFocusElement && trap.previousFocusElement.focus) {
      try { trap.previousFocusElement.focus(); } catch (e) { /* element may have been removed */ }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// IN-APP DIALOGS
// ═══════════════════════════════════════════════════════════
// Native confirm/prompt/alert are silently suppressed by some browsers and
// web views (the backup restore flow already notes this) and they look
// foreign inside the app. These boxes are the in-app route for the flows
// that still used the native ones; they share the tutorial exit box's shell.

function dialogShell(title, text) {
  var overlay = document.createElement('div');
  overlay.className = 'tut-exit';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('data-no-swipe', '');
  var box = document.createElement('div');
  box.className = 'tut-exit-box';
  var h = document.createElement('h2');
  h.textContent = title;
  box.appendChild(h);
  if (text) {
    var p = document.createElement('p');
    p.textContent = text;
    box.appendChild(p);
  }
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return { overlay: overlay, box: box };
}

function dialogWire(overlay, settle) {
  var done = false;
  function finish(value) {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    settle(value);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(undefined); }
  }
  document.addEventListener('keydown', onKey, true);
  return finish;
}

function dialogButton(label, primary) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = primary ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  b.textContent = label;
  return b;
}

/**
 * Ask a yes or no question. Resolves true only when the confirm button is
 * tapped; the cancel button, Escape and the backdrop all resolve false.
 * @param {{title: string, text?: string, confirmLabel?: string, cancelLabel?: string}} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts) {
  return new Promise(function (resolve) {
    var parts = dialogShell(opts.title, opts.text);
    var finish = dialogWire(parts.overlay, function (v) { resolve(v === true); });
    var row = document.createElement('div');
    row.className = 'tut-buttons';
    var cancel = dialogButton(opts.cancelLabel || 'Cancel', false);
    cancel.addEventListener('click', function () { finish(false); });
    var ok = dialogButton(opts.confirmLabel || 'OK', true);
    ok.addEventListener('click', function () { finish(true); });
    row.appendChild(cancel);
    row.appendChild(ok);
    parts.box.appendChild(row);
    ok.focus();
  });
}

/**
 * Ask for a line of text. Resolves the entered string, or null when the
 * player cancels (button, Escape or backdrop).
 * @param {{title: string, text?: string, initial?: string, placeholder?: string, confirmLabel?: string}} opts
 * @returns {Promise<string|null>}
 */
export function promptDialog(opts) {
  return new Promise(function (resolve) {
    var parts = dialogShell(opts.title, opts.text);
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'dialog-input';
    input.value = opts.initial || '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    parts.box.appendChild(input);
    var finish = dialogWire(parts.overlay, function (v) { resolve(v === undefined ? null : v); });
    var row = document.createElement('div');
    row.className = 'tut-buttons';
    var cancel = dialogButton('Cancel', false);
    cancel.addEventListener('click', function () { finish(null); });
    var ok = dialogButton(opts.confirmLabel || 'OK', true);
    ok.addEventListener('click', function () { finish(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(input.value); } });
    row.appendChild(cancel);
    row.appendChild(ok);
    parts.box.appendChild(row);
    input.focus();
    input.select();
  });
}

/**
 * Show a message with one OK button. `copyText`, when given, is shown in a
 * read-only field the player can tap to select (a share code, a score).
 * @param {{title: string, text?: string, copyText?: string}} opts
 * @returns {Promise<void>}
 */
export function messageDialog(opts) {
  return new Promise(function (resolve) {
    var parts = dialogShell(opts.title, opts.text);
    if (opts.copyText) {
      var field = document.createElement('input');
      field.type = 'text';
      field.className = 'dialog-input';
      field.readOnly = true;
      field.value = opts.copyText;
      field.addEventListener('focus', function () { field.select(); });
      field.addEventListener('click', function () { field.select(); });
      parts.box.appendChild(field);
    }
    var finish = dialogWire(parts.overlay, function () { resolve(); });
    var row = document.createElement('div');
    row.className = 'tut-buttons';
    var ok = dialogButton('OK', true);
    ok.addEventListener('click', function () { finish(true); });
    row.appendChild(ok);
    parts.box.appendChild(row);
    ok.focus();
  });
}
