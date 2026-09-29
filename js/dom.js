/**
 * dom.js — Safe DOM utilities for Buzzword Dash
 *
 * This module provides the canonical safe DOM manipulation functions
 * required by the architecture contract (Section 16) [2].
 *
 * All untrusted content (custom cards, imported cards, profile names,
 * leaderboard entries, friend names, card reports, search input,
 * remote error messages) MUST be rendered through these utilities
 * rather than raw innerHTML interpolation [2].
 *
 * Exports:
 *   escapeHTML(value)
 *   setText(element, value)
 *   createElement(tag, options)
 *   clearElement(element)
 *   delegate(root, eventName, selector, handler)
 */

// ═══════════════════════════════════════════════════════════
// escapeHTML
// ═══════════════════════════════════════════════════════════

/**
 * Escape a string so it is safe to embed in HTML markup.
 * Converts the five characters that have special meaning in HTML
 * to their entity equivalents.
 *
 * This is provided as a fallback for the rare case where static
 * source-controlled markup templates need a safe interpolation.
 * Prefer setText() or createElement({ text }) for all dynamic content.
 *
 * @param {*} value — any value; coerced to string
 * @returns {string} escaped string safe for HTML context
 */
export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  var str = String(value);
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    switch (ch) {
      case 38:  out += '&amp;';  break; // &
      case 60:  out += '&lt;';   break; // <
      case 62:  out += '&gt;';   break; // >
      case 34:  out += '&quot;'; break; // "
      case 39:  out += '&#39;';  break; // '
      default:  out += str[i];   break;
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
// setText
// ═══════════════════════════════════════════════════════════

/**
 * Safely set the text content of a DOM element.
 * Uses textContent which cannot execute scripts or inject markup.
 *
 * @param {HTMLElement} element — target element
 * @param {*} value — any value; coerced to string
 */
export function setText(element, value) {
  if (!element) return;
  element.textContent = (value === null || value === undefined) ? '' : String(value);
}

// ═══════════════════════════════════════════════════════════
// createElement
// ═══════════════════════════════════════════════════════════

/**
 * Create a DOM element with safe defaults.
 *
 * Supported options shape (Section 16.1) [2]:
 *
 *   {
 *     className,      — space-separated class string
 *     text,           — safe textContent (never innerHTML)
 *     attributes,     — { key: value } set via setAttribute
 *     dataset,        — { key: value } set via element.dataset
 *     children,       — array of child Nodes or Elements to append
 *     on              — { eventName: handler } set via addEventListener
 *   }
 *
 * @param {string} tag — HTML tag name (e.g. 'div', 'button', 'span')
 * @param {object} [options] — configuration object
 * @returns {HTMLElement} the created element
 */
export function createElement(tag, options) {
  var el = document.createElement(tag);
  if (!options) return el;

  // className
  if (options.className) {
    el.className = options.className;
  }

  // Safe text content — never innerHTML
  if (options.text !== undefined && options.text !== null) {
    el.textContent = String(options.text);
  }

  // HTML attributes (aria-*, type, role, id, etc.)
  if (options.attributes) {
    var attrs = options.attributes;
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = attrs[key];
      if (val === null || val === undefined || val === false) {
        // Skip falsy attributes (but allow empty string and 0)
        continue;
      }
      if (val === true) {
        // Boolean attributes like disabled, checked
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(val));
      }
    }
  }

  // Dataset (data-* attributes)
  if (options.dataset) {
    var data = options.dataset;
    var dataKeys = Object.keys(data);
    for (var d = 0; d < dataKeys.length; d++) {
      var dk = dataKeys[d];
      if (data[dk] !== undefined && data[dk] !== null) {
        el.dataset[dk] = String(data[dk]);
      }
    }
  }

  // Child elements
  if (options.children) {
    var children = options.children;
    for (var c = 0; c < children.length; c++) {
      if (children[c]) {
        el.appendChild(children[c]);
      }
    }
  }

  // Event listeners
  if (options.on) {
    var events = options.on;
    var eventKeys = Object.keys(events);
    for (var e = 0; e < eventKeys.length; e++) {
      var evName = eventKeys[e];
      var handler = events[evName];
      if (typeof handler === 'function') {
        el.addEventListener(evName, handler);
      }
    }
  }

  return el;
}

// ═══════════════════════════════════════════════════════════
// clearElement
// ═══════════════════════════════════════════════════════════

/**
 * Remove all child nodes from an element.
 * Safer and more explicit than setting innerHTML = ''.
 *
 * @param {HTMLElement} element — target element to clear
 */
export function clearElement(element) {
  if (!element) return;
  while (element.lastChild) {
    element.removeChild(element.lastChild);
  }
}

// ═══════════════════════════════════════════════════════════
// delegate
// ═══════════════════════════════════════════════════════════

/**
 * Attach a delegated event listener to a root element.
 * When an event fires, the handler is called only if the event
 * target (or an ancestor up to root) matches the CSS selector.
 *
 * This replaces the need for inline onclick attributes and
 * per-element listeners on dynamically generated lists [2].
 *
 * @param {HTMLElement} root — the ancestor element to listen on
 * @param {string} eventName — e.g. 'click', 'input', 'change'
 * @param {string} selector — CSS selector to match against
 * @param {function} handler — called with (event, matchedElement)
 * @returns {function} cleanup function that removes the listener
 */
export function delegate(root, eventName, selector, handler) {
  if (!root || !eventName || !selector || typeof handler !== 'function') {
    return function () {};
  }

  function listener(event) {
    var target = event.target;
    while (target && target !== root) {
      if (target.matches && target.matches(selector)) {
        handler(event, target);
        return;
      }
      target = target.parentElement;
    }
    // Also check root itself
    if (target === root && root.matches && root.matches(selector)) {
      handler(event, root);
    }
  }

  root.addEventListener(eventName, listener);

  // Return cleanup function
  return function () {
    root.removeEventListener(eventName, listener);
  };
}
