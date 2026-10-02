/**
 * friendsdom.js — small building blocks shared by the Friends screens (buttons, notes and rows).
 * Everything is built with safe DOM calls: remote values only ever go through textContent.
 */

import { createElement } from './dom.js';

export function btn(label, onClick, className) {
  var b = createElement('button', {
    className: 'btn btn-sm ' + (className || 'btn-outline'),
    text: label,
    attributes: { type: 'button' }
  });
  b.addEventListener('click', function () {
    b.disabled = true;
    Promise.resolve(onClick()).then(function () { b.disabled = false; }, function () { b.disabled = false; });
  });
  return b;
}

export function note(text, color) {
  var el = createElement('div', { className: 'mp-status', text: text });
  if (color) el.style.color = color;
  return el;
}

export function rowShell() {
  var row = createElement('div', { className: 'setting-row' });
  row.style.gap = '8px';
  return row;
}

export function nameBlock(name, sub) {
  var block = createElement('div');
  block.style.flex = '1';
  block.style.minWidth = '0';
  var n = createElement('div', { text: name || 'Anonymous' });
  n.style.fontSize = '13px';
  n.style.fontWeight = '700';
  n.style.overflow = 'hidden';
  n.style.textOverflow = 'ellipsis';
  block.appendChild(n);
  if (sub) {
    var s = createElement('div', { text: sub });
    s.style.fontSize = '10px';
    s.style.color = 'var(--text-muted)';
    block.appendChild(s);
  }
  return block;
}
