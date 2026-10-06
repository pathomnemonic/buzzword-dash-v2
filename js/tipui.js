/**
 * tipui.js — the tip jar sheet in the phone apps: a few amounts with the store's own prices, and a thank-you.
 * A tip unlocks nothing; the sheet says so.
 */

import { createElement, setText } from './dom.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';
import { tipProducts, buyTip } from './tipjar.js';
import { track } from './analytics/index.js';

/** Open the sheet. @param {function(string): void} [toast] */
export function openTipJar(toast) {
  if (typeof document === 'undefined') return null;
  var old = document.getElementById('tipJar');
  if (old) old.remove();
  track('tip_prompt', { step: 'opened_jar' });
  var opener = document.activeElement;
  var overlay = createElement('div', { className: 'report-overlay', attributes: { id: 'tipJar', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Support the developer' } });
  var box = createElement('div', { className: 'report-box' });
  box.appendChild(createElement('h2', { text: '☕ Support Dx Dash' }));
  box.appendChild(createElement('p', { text: 'Dx Dash is free and always will be. A tip helps keep it going. It is only a thank-you: it unlocks nothing and gives no coins.' }));
  var list = createElement('div', { className: 'tip-options' });
  list.style.cssText = 'display:grid;gap:8px;margin:10px 0';
  var status = createElement('div', { className: 'setting-sublabel', attributes: { role: 'status' }, text: 'Loading prices…' });
  box.appendChild(list);
  box.appendChild(status);
  var close = createElement('button', { className: 'btn btn-outline', text: 'Close', attributes: { type: 'button', id: 'tipJarClose' } });
  box.appendChild(close);
  overlay.appendChild(box);

  function shut() {
    releaseFocusTrap();
    overlay.remove();
    if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* gone */ } }
  }
  close.addEventListener('click', shut);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) shut(); });
  overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); shut(); } });

  tipProducts().then(function (products) {
    if (!products.length) { setText(status, 'Tips are not available right now. Please try again later.'); return; }
    setText(status, '');
    products.forEach(function (p) {
      var b = createElement('button', { className: 'btn btn-gold btn-block', text: p.label + (p.price ? '  ·  ' + p.price : ''), attributes: { type: 'button', 'data-product': p.id } });
      b.addEventListener('click', function () {
        [].forEach.call(list.children, function (x) { x.disabled = true; });
        setText(status, 'Opening the store…');
        buyTip(p.id).then(function (res) {
          [].forEach.call(list.children, function (x) { x.disabled = false; });
          if (res.ok) {
            setText(status, 'Thank you! 💜 It means a lot.');
            if (toast) toast('Thank you for the tip!');
          } else if (res.cancelled) setText(status, '');
          else setText(status, 'That did not go through. You have not been charged.');
        });
      });
      list.appendChild(b);
    });
  });

  document.body.appendChild(overlay);
  trapFocus(overlay);
  close.focus();
  return overlay;
}
