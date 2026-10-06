/**
 * feedback.js — "Not really? Tell us what went wrong", and Settings > Send feedback.
 *
 * A message goes to the owner's inbox in the backend. If that cannot be reached (offline, not set up, a server
 * error) it is not lost: the player is offered an email with the message filled in, and if even that cannot open
 * the message is copied so it can be pasted anywhere.
 */

import { track } from './analytics/index.js';
import { getNativePlatform } from './native.js';
import { openUrl, copyText } from './platform.js';

function env() {
  /** @type {Record<string, any>} */
  var e = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return e;
}

export function feedbackContext() {
  return {
    version: (typeof __APP_VERSION__ !== 'undefined') ? String(__APP_VERSION__).slice(0, 20) : '',
    platform: getNativePlatform()
  };
}

/** The address feedback emails go to ('' when none is set for this build). */
export function supportEmail(override) {
  var e = override !== undefined ? override : String(env().VITE_SUPPORT_EMAIL || '');
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : '';
}

/** The text of the email (or the copied message). */
export function feedbackBody(fb, ctx) {
  return String(fb.message || '').trim() + '\n\n—\nDx Dash ' + (ctx.version || '') + ' on ' + ctx.platform + (fb.contact ? '\nReply to: ' + fb.contact : '');
}

/**
 * @param {{mood: string, message: string, contact?: string}} fb
 * @param {{submit?: function(object): Promise<{success: boolean}>, email?: string}} deps
 * @returns {Promise<{how: 'sent'|'email'|'copied'|'failed'}>}
 */
export function sendFeedback(fb, deps) {
  deps = deps || {};
  var message = String(fb.message || '').trim();
  if (!message) return Promise.resolve({ how: 'failed', error: 'Please write a few words first.' });
  var ctx = feedbackContext();
  var payload = { mood: fb.mood || 'unhappy', message: message, contact: fb.contact || '', version: ctx.version, platform: ctx.platform };

  function viaBackend() {
    if (!deps.submit) return Promise.resolve(false);
    return Promise.resolve().then(function () { return deps.submit(payload); }).then(
      function (res) { return !!(res && res.success); },
      function () { return false; }
    );
  }
  function viaEmail() {
    var to = supportEmail(deps.email);
    if (!to) return Promise.resolve(false);
    var url = 'mailto:' + to + '?subject=' + encodeURIComponent('Dx Dash feedback') + '&body=' + encodeURIComponent(feedbackBody(payload, ctx));
    return openUrl(url);
  }

  var mood = payload.mood === 'idea' || payload.mood === 'bug' ? payload.mood : 'unhappy';
  var report = function (res) {
    track('feedback_sent', { mood: mood, length: message.length, has_contact: !!payload.contact, ok: res.how !== 'failed' });
    return res;
  };
  return viaBackend().then(function (sent) {
    if (sent) return report({ how: 'sent' });
    return viaEmail().then(function (emailed) {
      if (emailed) return report({ how: 'email' });
      return copyText(feedbackBody(payload, ctx)).then(function (ok) { return report({ how: ok ? 'copied' : 'failed' }); });
    });
  });
}

/**
 * The small form: a text box, an optional way to reply, Send and Skip.
 * @param {object} o
 * @param {string} o.mood
 * @param {string} o.prompt what to ask
 * @param {function(object): Promise<{success: boolean}>} [o.submit]
 * @param {function(string): void} o.toast
 * @param {function(): void} o.onDone called after a successful send or when skipped
 * @returns {HTMLElement}
 */
export function buildFeedbackForm(o) {
  var box = document.createElement('div');
  box.className = 'feedback-form';
  var label = document.createElement('div');
  label.className = 'prompt-text';
  label.textContent = o.prompt;
  box.appendChild(label);
  var area = document.createElement('textarea');
  area.rows = 4;
  area.maxLength = 1000;
  area.className = 'feedback-text';
  area.setAttribute('aria-label', 'Your feedback');
  area.placeholder = 'What went wrong, or what would make it better?';
  area.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;border-radius:8px;background:rgba(20,10,50,.6);color:#fff;border:1px solid rgba(187,102,255,.25);font:inherit;font-size:13px;margin:6px 0';
  box.appendChild(area);
  var contact = document.createElement('input');
  contact.type = 'text';
  contact.className = 'feedback-contact';
  contact.maxLength = 120;
  contact.setAttribute('aria-label', 'Your email, if you would like a reply (optional)');
  contact.placeholder = 'Your email, if you want a reply (optional)';
  contact.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;border-radius:8px;background:rgba(20,10,50,.6);color:#fff;border:1px solid rgba(187,102,255,.25);font:inherit;font-size:13px;margin-bottom:6px';
  box.appendChild(contact);
  var row = document.createElement('div');
  row.className = 'prompt-row';
  var send = document.createElement('button');
  send.type = 'button';
  send.className = 'btn btn-sm btn-gold';
  send.textContent = 'Send feedback';
  var skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn btn-sm btn-outline';
  skip.textContent = 'Skip';
  row.appendChild(send);
  row.appendChild(skip);
  box.appendChild(row);
  var status = document.createElement('div');
  status.className = 'prompt-text';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  box.appendChild(status);

  send.addEventListener('click', function () {
    if (!area.value.trim()) { status.textContent = 'Please write a few words first.'; area.focus(); return; }
    send.disabled = true;
    status.textContent = 'Sending…';
    sendFeedback({ mood: o.mood, message: area.value, contact: contact.value }, { submit: o.submit }).then(function (res) {
      if (res.how === 'sent') { o.toast('Thank you. We read every message.'); o.onDone(); return; }
      if (res.how === 'email') { o.toast('Your email app opened with your message ready to send.'); o.onDone(); return; }
      if (res.how === 'copied') { o.toast('Could not reach us from here, so your message was copied. Please paste it into an email or message to the developer.'); o.onDone(); return; }
      send.disabled = false;
      status.textContent = 'Could not send that from here. Please try again later.';
    });
  });
  skip.addEventListener('click', function () { o.onDone(); });
  return box;
}
