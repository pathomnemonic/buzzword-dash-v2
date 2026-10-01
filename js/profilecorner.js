/**
 * profilecorner.js — the profile button in the top right of Home, and the panel it opens.
 *
 * The panel is where a player creates an account (email and password), signs in, resets a password,
 * signs out or deletes their account. It works even when the leaderboard's guest sign-in failed,
 * because creating or signing in to an account does not need a guest session first.
 */

import { createElement, clearElement } from './dom.js';
import { renderAccountPanel } from './accountui.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';

/** Short text for the button: the account's name, or an invitation to sign in. */
export function cornerLabel(status, profileName) {
  if (status && status.email && !status.anonymous) {
    var base = profileName || status.email.split('@')[0];
    return base.length > 12 ? base.slice(0, 11) + '…' : base;
  }
  return 'Sign in';
}

/** One character for the round avatar. */
export function cornerInitial(status, profileName) {
  if (status && status.email && !status.anonymous) {
    return ((profileName || status.email).charAt(0) || '?').toUpperCase();
  }
  return '👤';
}

/**
 * @param {object} deps
 * @param {function(): (object|null)} deps.getLeaderboard  the leaderboard service, once loaded
 * @param {function(): (object|null)} deps.getCloudSync
 * @param {object} deps.storage
 * @param {function(string): void} deps.toast
 * @param {function(): void} deps.openProfileScreen  the full Profile screen (name, avatar, ...)
 * @returns {{refresh: function(): void, open: function(): void, close: function(): void}}
 */
export function mountProfileCorner(deps) {
  var button = document.getElementById('profileCornerBtn');
  var overlay = document.getElementById('accountOverlay');
  var card = document.getElementById('accountCard');
  if (!button || !overlay || !card) return { refresh: function () {}, open: function () {}, close: function () {} };

  function status() {
    var lb = deps.getLeaderboard();
    return lb ? lb.getStatus() : null;
  }

  function refresh() {
    var st = status();
    var name = deps.storage.get('profileName') || '';
    var label = document.getElementById('profileCornerLabel');
    var avatar = document.getElementById('profileCornerAvatar');
    if (label) label.textContent = cornerLabel(st, name);
    if (avatar) avatar.textContent = cornerInitial(st, name);
    button.classList.toggle('signed-in', !!(st && st.email && !st.anonymous));
  }

  function isOpen() { return overlay.classList.contains('active'); }

  function close() {
    if (!isOpen()) return;
    overlay.classList.remove('active');
    clearElement(card);
    releaseFocusTrap();
    refresh();
  }

  function render() {
    clearElement(card);
    card.appendChild(createElement('h2', { text: '👤 Profile & account' }));

    var name = deps.storage.get('profileName') || 'Guest';
    var summary = createElement('div', { className: 'account-summary' });
    summary.appendChild(createElement('strong', { text: name }));
    var full = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Edit name & avatar', attributes: { type: 'button', id: 'accountProfileBtn' } });
    full.addEventListener('click', function () { close(); deps.openProfileScreen(); });
    summary.appendChild(full);
    card.appendChild(summary);

    var newBadges = deps.storage.getNewAchievementIds ? deps.storage.getNewAchievementIds().length : 0;
    if (newBadges > 0) {
      var badgeBtn = createElement('button', {
        className: 'btn btn-gold btn-sm',
        text: '🏆 ' + newBadges + (newBadges === 1 ? ' new badge' : ' new badges') + ' to see',
        attributes: { type: 'button', id: 'accountBadgesBtn' }
      });
      badgeBtn.style.marginBottom = '10px';
      badgeBtn.addEventListener('click', function () { close(); deps.openProfileScreen(); });
      card.appendChild(badgeBtn);
    }

    var body = createElement('div', { className: 'account-body', attributes: { id: 'accountBody' } });
    card.appendChild(body);

    var lb = deps.getLeaderboard();
    if (!lb) {
      body.appendChild(createElement('div', { className: 'mp-status', text: 'Loading…' }));
    } else {
      renderAccountPanel(body, {
        leaderboard: lb,
        cloudSync: deps.getCloudSync(),
        toast: deps.toast,
        rerender: function () { if (isOpen()) render(); refresh(); }
      });
    }

    var closeBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '✕ Close', attributes: { type: 'button', id: 'accountCloseBtn' } });
    closeBtn.addEventListener('click', close);
    card.appendChild(closeBtn);
  }

  function open() {
    render();
    overlay.classList.add('active');
    trapFocus(overlay);
  }

  button.addEventListener('click', open);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

  // The leaderboard module loads after the page; redraw if the panel is already open, and keep the button current.
  var subscribed = false;
  function watchAuth() {
    var lb = deps.getLeaderboard();
    if (!lb) return;
    if (!subscribed && lb.onAuthEvent) {
      subscribed = true;
      lb.onAuthEvent(function () { refresh(); if (isOpen()) render(); });
    }
    refresh();
    if (isOpen()) render();
  }

  refresh();
  return { refresh: refresh, open: open, close: close, onLeaderboardReady: watchAuth };
}
