/**
 * analyticsui.js — the player-facing side of analytics: the first-run question and the Settings controls.
 * What the app collects is written once here (COLLECTED / NEVER) and shown in both places.
 */

import { createElement, setText } from './dom.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';
import { analytics } from './analytics/index.js';
import { analyticsEndpoint } from './analytics/backend.js';

export var COLLECTED = [
  'How you play: which modes, how long, how many questions, scores and how fast you answer.',
  'Which cards were shown and whether you got them right (so weak questions can be fixed).',
  'What you open, buy or equip in the app, and which settings you use.',
  'Your device type, screen size, language, app version and how smoothly the game runs.',
  'Crashes and errors: where they happened and a short message.',
  'Where you found the app (a campaign tag or the website that linked to it).'
];
export var NEVER = [
  'Your name, e-mail, password, contacts or location.',
  'Anything you type (custom card text, notes, feedback).',
  'Advertising IDs, or anything shared with ad companies. Nothing is sold.'
];

/** True when this build can send analytics at all (a project is configured). */
export function analyticsAvailable() { return !!analyticsEndpoint(); }

function list(items) {
  var ul = createElement('ul', { className: 'analytics-list' });
  ul.style.cssText = 'margin:4px 0 8px 18px;padding:0;text-align:left;font-size:13px;line-height:1.4';
  items.forEach(function (t) { ul.appendChild(createElement('li', { text: t })); });
  return ul;
}

/**
 * The first-run question. Calls onDone() once it is answered (or at once when there is nothing to ask).
 * @param {function(): void} onDone
 */
export function maybeAskConsent(onDone) {
  if (!analyticsAvailable() || !analytics.needsPrompt() || typeof document === 'undefined') { if (onDone) onDone(); return null; }
  var opener = document.activeElement;
  var overlay = createElement('div', { className: 'report-overlay', attributes: { id: 'analyticsConsent', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Help improve Dx Dash' } });
  var box = createElement('div', { className: 'report-box' });
  box.appendChild(createElement('h2', { text: '📊 Help improve Dx Dash?' }));
  box.appendChild(createElement('p', { text: 'Share anonymous usage so we can fix hard questions, balance the game and find bugs. It is tied to a random ID on this device, never to your name.' }));
  var signals = analytics.signals();
  if (signals.doNotTrack || signals.gpc) box.appendChild(createElement('p', { text: 'Your browser asks sites not to track you, so this stays off unless you say yes.' }));
  var more = createElement('details');
  more.appendChild(createElement('summary', { text: 'What is shared?' }));
  more.appendChild(createElement('strong', { text: 'Shared:' }));
  more.appendChild(list(COLLECTED));
  more.appendChild(createElement('strong', { text: 'Never shared:' }));
  more.appendChild(list(NEVER));
  more.appendChild(createElement('p', { text: 'Change your mind any time in Settings → Data, including deleting what was sent.' }));
  box.appendChild(more);
  var row = createElement('div', { className: 'report-actions' });
  var no = createElement('button', { className: 'btn btn-outline', text: 'No thanks', attributes: { type: 'button', id: 'analyticsNo' } });
  var yes = createElement('button', { className: 'btn btn-primary', text: 'Share anonymously', attributes: { type: 'button', id: 'analyticsYes' } });
  row.appendChild(no); row.appendChild(yes);
  box.appendChild(row);
  overlay.appendChild(box);
  function close(granted) {
    analytics.setConsent(granted, 'prompt');
    releaseFocusTrap();
    overlay.remove();
    if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* gone */ } }
    if (onDone) onDone();
  }
  yes.addEventListener('click', function () { close(true); });
  no.addEventListener('click', function () { close(false); });
  document.body.appendChild(overlay);
  trapFocus(overlay);
  analytics.countPromptShown('first_run');
  yes.focus();
  return overlay;
}

/**
 * The Settings → Data section: the switch, what is shared, and deleting what was sent.
 * @param {HTMLElement} container
 * @param {function(string): void} toast
 */
export function renderAnalyticsSettings(container, toast) {
  var row = createElement('div', { className: 'setting-row', attributes: { 'data-setting': 'analytics' } });
  var label = createElement('div');
  label.style.flex = '1';
  label.appendChild(createElement('div', { className: 'setting-label-text', text: '📊 Share anonymous usage' }));
  var sub = createElement('span', { className: 'setting-sublabel', text: 'Helps improve the game: how it is played, which questions are too hard, crashes. Tied to a random ID, never your name. ' });
  label.appendChild(sub);
  var state = createElement('span', { className: 'setting-sublabel' });
  label.appendChild(state);
  row.appendChild(label);
  var on = analytics.consentState() === 'granted';
  var toggle = createElement('div', { className: 'toggle' + (on ? ' on' : ''), attributes: { role: 'switch', tabindex: '0', 'aria-label': 'Share anonymous usage', 'aria-checked': on ? 'true' : 'false' } });
  function paint() {
    var granted = analytics.consentState() === 'granted';
    toggle.classList.toggle('on', granted);
    toggle.setAttribute('aria-checked', granted ? 'true' : 'false');
    setText(state, analyticsAvailable() ? (granted ? 'Currently on.' : 'Currently off.') : 'Not available in this build.');
  }
  toggle.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle.click(); } });
  toggle.addEventListener('click', function () {
    if (!analyticsAvailable()) { toast('Usage sharing is not available in this build.'); return; }
    analytics.setConsent(analytics.consentState() !== 'granted', 'settings');
    paint();
  });
  paint();
  row.appendChild(toggle);
  container.appendChild(row);

  var more = createElement('details');
  more.style.cssText = 'margin:6px 0 10px';
  more.appendChild(createElement('summary', { className: 'setting-sublabel', text: 'What is shared?' }));
  more.appendChild(createElement('strong', { text: 'Shared:' }));
  more.appendChild(list(COLLECTED));
  more.appendChild(createElement('strong', { text: 'Never shared:' }));
  more.appendChild(list(NEVER));
  container.appendChild(more);

  var del = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Delete my analytics data', attributes: { type: 'button', id: 'analyticsDelete' } });
  del.addEventListener('click', function () {
    if (!analyticsAvailable()) { toast('Nothing has been sent from this build.'); return; }
    del.disabled = true;
    analytics.deleteMyData().then(function (ok) {
      del.disabled = false;
      toast(ok ? 'Your analytics data was deleted.' : 'Could not reach the server. Try again when you are online.');
      paint();
    }, function () { del.disabled = false; toast('Could not reach the server. Try again when you are online.'); });
  });
  container.appendChild(del);
}
