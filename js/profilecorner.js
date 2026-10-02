/**
 * profilecorner.js — the profile button in the top right of Home, and the account section of the Profile tab.
 *
 * The button is only a shortcut to the Profile tab (the right-hand tab), so nothing is duplicated. The
 * account section there is where a player creates an account (email and password), signs in, resets a
 * password, signs out or deletes their account. It works even when the leaderboard's guest sign-in failed,
 * because creating or signing in to an account does not need a guest session first.
 */

import { clearElement } from './dom.js';
import { renderAccountPanel } from './accountui.js';
import { iconFor, fillProfilePicture, parseHeroPicture } from './profileicons.js';

/** Short text for the button: the account's name, or an invitation to sign in. */
export function cornerLabel(status, profileName) {
  if (status && status.email && !status.anonymous) {
    var base = profileName || status.email.split('@')[0];
    return base.length > 12 ? base.slice(0, 11) + '…' : base;
  }
  return 'Sign in';
}

/** One character for the round avatar. */
export function cornerInitial(status, profileName, picture) {
  if (typeof picture === 'string' && (picture.indexOf('icon:') === 0 || parseHeroPicture(picture))) return iconFor(picture);
  if (status && status.email && !status.anonymous) {
    return ((profileName || status.email).charAt(0) || '?').toUpperCase();
  }
  return '👤';
}

/**
 * Fill the account section of the Profile tab.
 * @param {HTMLElement} container
 * @param {object} deps  getLeaderboard, getCloudSync, toast, rerender
 */
export function renderAccountSection(container, deps) {
  if (!container) return;
  clearElement(container);
  var lb = deps.getLeaderboard();
  if (!lb) {
    var loading = document.createElement('div');
    loading.className = 'mp-status';
    loading.textContent = 'Loading…';
    container.appendChild(loading);
    return;
  }
  renderAccountPanel(container, { leaderboard: lb, cloudSync: deps.getCloudSync(), toast: deps.toast, rerender: deps.rerender });
}

/**
 * The corner button: shows who you are, and takes you to the Profile tab.
 * @param {object} deps
 * @param {function(): (object|null)} deps.getLeaderboard  the leaderboard service, once loaded
 * @param {object} deps.storage
 * @param {function(): void} deps.openProfileScreen
 * @param {function(): void} deps.onAuthChange  called when the account changes (so an open Profile can redraw)
 */
export function mountProfileCorner(deps) {
  var button = document.getElementById('profileCornerBtn');
  if (!button) return { refresh: function () {}, onLeaderboardReady: function () {} };

  function refresh() {
    var lb = deps.getLeaderboard();
    var st = lb ? lb.getStatus() : null;
    var name = deps.storage.get('profileName') || '';
    var label = document.getElementById('profileCornerLabel');
    var avatar = document.getElementById('profileCornerAvatar');
    if (label) label.textContent = cornerLabel(st, name);
    var picture = deps.storage.get('profilePicture');
    if (avatar && parseHeroPicture(picture)) fillProfilePicture(avatar, picture);
    else if (avatar) { avatar.classList.remove('has-portrait'); avatar.textContent = cornerInitial(st, name, picture); }
    button.classList.toggle('signed-in', !!(st && st.email && !st.anonymous));
  }

  button.addEventListener('click', function () { deps.openProfileScreen(); });
  document.addEventListener('dx:profile-changed', refresh);

  var subscribed = false;
  function watchAuth() {
    var lb = deps.getLeaderboard();
    if (!lb) return;
    if (!subscribed && lb.onAuthEvent) {
      subscribed = true;
      lb.onAuthEvent(function () { refresh(); deps.onAuthChange(); });
    }
    refresh();
    deps.onAuthChange();
  }

  refresh();
  return { refresh: refresh, onLeaderboardReady: watchAuth };
}
