/**
 * cardreport.js — "Report a problem with this card", from the results screen and from the Card Browser.
 *
 * A small dialog (not a browser prompt): it shows the card, offers the usual reasons as buttons (including "the clue
 * gives away the answer"), and takes an optional note. The report is saved on the device (and can be exported from
 * Settings) and also sent to the server when the player is signed in.
 */

import { createElement, setText } from './dom.js';
import { storage } from './storage.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';

/** The reasons, as [stored text, label]. */
export var REPORT_REASONS = [
  ['clue gives away the answer', '🎯 A clue gives away the answer'],
  ['incorrect info', '❌ The information is wrong'],
  ['ambiguous', '🤔 More than one answer could be right'],
  ['poor distractor', '🪤 A wrong answer is silly or obviously wrong'],
  ['outdated', '📅 Out of date'],
  ['other', '💬 Something else']
];

/**
 * Open the report dialog for a card.
 * @param {object} card
 * @param {function(string): void} [toast]
 * @returns {HTMLElement|null} the dialog
 */
export function openCardReport(card, toast) {
  if (!card || typeof document === 'undefined') return null;
  var old = document.getElementById('cardReportDialog');
  if (old) old.remove();
  var opener = document.activeElement;
  var overlay = createElement('div', { className: 'report-overlay', attributes: { id: 'cardReportDialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Report a problem with this card' } });
  var box = createElement('div', { className: 'report-box' });
  box.appendChild(createElement('h2', { text: '🚩 Report this card' }));

  // The card, so the report is about what is on screen
  var shown = createElement('div', { className: 'report-card' });
  var clues = createElement('div', { className: 'report-clues' });
  setText(clues, (card.bw || []).join(' • '));
  shown.appendChild(clues);
  var ans = createElement('div', { className: 'report-answer' });
  setText(ans, '✓ ' + card.ans);
  shown.appendChild(ans);
  if (card.d && card.d.length) {
    var wrong = createElement('div', { className: 'report-wrong' });
    setText(wrong, 'Other choices: ' + card.d.join(' · '));
    shown.appendChild(wrong);
  }
  box.appendChild(shown);

  var chosen = '';
  var buttons = createElement('div', { className: 'report-reasons', attributes: { role: 'radiogroup', 'aria-label': 'What is wrong?' } });
  REPORT_REASONS.forEach(function (r) {
    var b = createElement('button', { className: 'btn btn-outline report-reason', text: r[1], attributes: { type: 'button', role: 'radio', 'aria-checked': 'false' } });
    b.addEventListener('click', function () {
      chosen = r[0];
      [].forEach.call(buttons.children, function (x) { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('on');
      b.setAttribute('aria-checked', 'true');
      send.disabled = false;
    });
    buttons.appendChild(b);
  });
  box.appendChild(buttons);

  var note = createElement('textarea', { className: 'report-note', attributes: { rows: '2', maxlength: '500', placeholder: 'Anything else we should know? (optional)', 'aria-label': 'Details (optional)' } });
  box.appendChild(note);

  var row = createElement('div', { className: 'report-actions' });
  var cancel = createElement('button', { className: 'btn btn-outline', text: 'Cancel', attributes: { type: 'button' } });
  var send = createElement('button', { className: 'btn btn-primary', text: 'Send report', attributes: { type: 'button' } });
  send.disabled = true;
  row.appendChild(cancel);
  row.appendChild(send);
  box.appendChild(row);
  overlay.appendChild(box);

  function close() {
    overlay.remove();
    releaseFocusTrap();
    if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* the opener may be gone */ } }
  }
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  send.addEventListener('click', function () {
    if (!chosen) return;
    var text = note.value.trim().slice(0, 500);
    if (storage.addCardReport) storage.addCardReport(card.id, chosen, text);
    // Also send to the server when the leaderboard/account is available.
    import('./leaderboard.js').then(function (mod) {
      if (mod.leaderboard.isAuthenticated()) mod.leaderboard.reportCard(card.id, chosen, text);
    }).catch(function () { /* offline: the local report is still saved and exportable */ });
    close();
    if (toast) toast('Thanks! Card reported.');
  });

  document.body.appendChild(overlay);
  trapFocus(overlay);
  var first = buttons.firstChild;
  if (first && first.focus) first.focus();
  return overlay;
}
