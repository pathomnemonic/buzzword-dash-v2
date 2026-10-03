/**
 * promptui.js — the small card on the results screen that asks to share, rate, or make an account.
 * What to ask, and when, is decided in prompts.js.
 */

import { choosePrompt, recordPrompt } from './prompts.js';
import { isNative, APP_SCHEME } from './native.js';
import { appPublicUrl } from './publicurl.js';
import { shareText, canShareNatively, copyText, openExternal } from './platform.js';

/** Where to rate the app: a build-time link, or the Play Store page inside the Android app. '' means nowhere (the web). */
export function getReviewUrl() {
  /** @type {Record<string, any>} */
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  var url = env.VITE_REVIEW_URL || '';
  if (/^https:\/\//.test(url)) return url;
  return isNative() ? 'https://play.google.com/store/apps/details?id=' + APP_SCHEME : '';
}

/** The link to send friends to: always an address a friend can open (see publicurl.js). */
export function getShareUrl() {
  return appPublicUrl();
}

var SHARE_TEXT = 'I have been studying with Dx Dash, a free endless runner for USMLE and COMLEX questions. Come run the list with me.';

/** Share the game: the system share sheet if there is one, otherwise copy the link. @returns {Promise<'shared'|'copied'|'failed'>} */
export function shareGame() {
  var url = getShareUrl();
  return shareText({ title: 'Dx Dash', text: SHARE_TEXT, url: url || undefined });
}

export function canShareGame() {
  return canShareNatively() || !!getShareUrl();
}

var _bannerDismissed = false;

/**
 * On the Profile tab: while signed out, a card at the top invites the player to make an account.
 * "Not now" hides it until the app is reopened; it never appears once they are signed in.
 * @returns {boolean} whether the card was added
 */
export function attachAccountBanner(deps) {
  if (_bannerDismissed || deps.signedIn || !deps.accountsAvailable || !deps.container) return false;
  if (deps.container.querySelector('.account-banner')) return false;
  var box = document.createElement('div');
  box.className = 'prompt-card account-banner';
  var text = document.createElement('div');
  text.className = 'prompt-text';
  text.textContent = 'Create a free account to keep your progress safe, sync it between devices and join the leaderboards.';
  box.appendChild(text);
  var row = document.createElement('div');
  row.className = 'prompt-row';
  var go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn btn-sm btn-gold';
  go.textContent = '👤 Create account';
  go.addEventListener('click', function () { deps.openAccount(); });
  var later = document.createElement('button');
  later.type = 'button';
  later.className = 'btn btn-sm btn-outline';
  later.textContent = 'Not now';
  later.addEventListener('click', function () { _bannerDismissed = true; box.remove(); });
  row.appendChild(go);
  row.appendChild(later);
  box.appendChild(row);
  deps.container.insertBefore(box, deps.container.firstChild);
  return true;
}

var COPY = {
  account: {
    text: 'Your progress is saved on this device only. Make a free account to keep it safe and to appear on the leaderboards.',
    action: '👤 Make an account'
  },
  share: {
    text: 'Know someone who is studying for boards? Send them Dx Dash. It is free.',
    action: '📣 Share with a friend'
  },
  review: {
    text: 'If Dx Dash is helping, a quick rating on the store helps other students find it.',
    action: '⭐ Rate Dx Dash'
  }
};

/**
 * Show at most one ask on the results screen.
 * @param {object} deps
 * @param {HTMLElement} deps.container
 * @param {object} deps.storage
 * @param {object} deps.run  { correct, accuracy, newBest }
 * @param {boolean} deps.signedIn
 * @param {boolean} deps.accountsAvailable
 * @param {function(): void} deps.openAccount
 * @param {function(string): void} deps.toast
 * @returns {string|null} the kind that was shown
 */
export function attachPromptCard(deps) {
  var storage = deps.storage;
  var now = Date.now();
  var firstRunAt = storage.get('firstRunAt') || 0;
  var state = storage.get('promptState') || {};
  var kind = choosePrompt({
    now: now,
    totalRuns: storage.get('runsFinished') || 0,
    firstRunAt: firstRunAt,
    correct: deps.run.correct,
    accuracy: deps.run.accuracy,
    newBest: !!deps.run.newBest,
    streak: (storage.getStreakStatus && storage.getStreakStatus().streak) || 0,
    signedIn: deps.signedIn,
    accountsAvailable: deps.accountsAvailable,
    canShare: canShareGame(),
    reviewUrl: getReviewUrl(),
    state: state
  });
  if (!kind) return null;
  storage.set('promptState', recordPrompt(state, kind, 'shown', now));

  var copy = COPY[kind];
  var box = document.createElement('div');
  box.className = 'prompt-card';
  box.setAttribute('data-prompt', kind);
  var text = document.createElement('div');
  text.className = 'prompt-text';
  text.textContent = copy.text;
  box.appendChild(text);
  var row = document.createElement('div');
  row.className = 'prompt-row';
  function button(label, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    row.appendChild(b);
  }
  function finish(event) {
    if (event) storage.set('promptState', recordPrompt(storage.get('promptState') || {}, kind, event, Date.now()));
    box.remove();
  }
  button(copy.action, 'btn-gold', function () {
    if (kind === 'account') { finish('done'); deps.openAccount(); return; }
    if (kind === 'review') {
      openExternal(getReviewUrl());
      finish('done');
      return;
    }
    shareGame().then(function (result) {
      if (result === 'copied') deps.toast('Link copied. Paste it to a friend!');
      if (result === 'failed') { deps.toast('Could not share from here.'); return; }
      finish('done');
    });
  });
  button('Not now', 'btn-outline', function () { finish(null); });
  button('Don’t ask again', 'btn-outline', function () { finish('never'); });
  box.appendChild(row);
  deps.container.appendChild(box);
  return kind;
}
