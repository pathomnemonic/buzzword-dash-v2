/**
 * accountui.js — the Account tab (sign up, sign in, cloud save) and the
 * "which save do you want?" dialog. Safe DOM only.
 */

import { enabledProviders, providerLabel, onlyAvailable } from './authproviders.js';
import { track } from './analytics/index.js';
import { createElement } from './dom.js';

var INPUT_STYLE = 'width:100%;padding:9px 11px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3);margin-bottom:8px;font-size:14px';

var _mode = 'signup'; // signup | signin | reset
var _recovery = false;
var _busyMessage = '';
var _external; // which providers Supabase has switched on (null: could not be read)
var _externalAsked = false;
var _externalDone = false;

/** Called by main.js when a password-reset link brings the player back. */
export function beginPasswordRecovery() {
  _recovery = true;
}

function input(type, label, autocomplete, placeholder) {
  var el = createElement('input', {
    attributes: { type: type, 'aria-label': label, autocomplete: autocomplete, placeholder: placeholder || label }
  });
  el.style.cssText = INPUT_STYLE;
  return el;
}

function button(label, onClick, className) {
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

function note(text, color) {
  var el = createElement('div', { className: 'mp-status', text: text });
  el.style.margin = '6px 0';
  if (color) el.style.color = color;
  return el;
}

function timeAgo(ms) {
  if (!ms) return 'not yet';
  var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  return Math.round(s / 3600) + ' h ago';
}

/**
 * Render the Account tab.
 * @param {HTMLElement} body
 * @param {object} deps - { leaderboard, cloudSync, toast, rerender }
 */
export function renderAccountPanel(body, deps) {
  var lb = deps.leaderboard;
  var status = lb.getStatus();

  if (!status.configured) {
    body.appendChild(note('Accounts are not set up for this copy of the game. Your progress is saved on this device only.'));
    return;
  }

  if (_recovery && status.authenticated) {
    renderRecovery(body, deps);
    return;
  }

  if (status.email && !status.anonymous) {
    renderSignedIn(body, deps, status);
  } else {
    renderGuest(body, deps, status);
  }
}

function renderRecovery(body, deps) {
  body.appendChild(note('Choose a new password for your account.'));
  var pw = input('password', 'New password', 'new-password', 'New password (8+ characters)');
  body.appendChild(pw);
  body.appendChild(button('Save new password', function () {
    return deps.leaderboard.updatePassword(pw.value).then(function (res) {
      if (res.success) {
        _recovery = false;
        deps.toast('Password updated.');
        deps.rerender();
      } else {
        deps.toast(res.error || 'Could not update your password.');
      }
    });
  }, 'btn-primary'));
}

function renderGuest(body, deps, status) {
  body.appendChild(note(
    'You are playing as a guest. Create a free account to keep your progress, name and friends safe in the cloud and pick up on any device.'
  ));
  if (status.pendingEmail) {
    body.appendChild(note('Waiting for you to confirm ' + status.pendingEmail + '. Open the link we emailed you, then come back.', 'var(--accent-gold)'));
  }

  var tabs = createElement('div');
  tabs.style.cssText = 'display:flex;gap:6px;margin:8px 0';
  [['signup', 'I am new'], ['signin', 'I have an account']].forEach(function (t) {
    var b = createElement('button', {
      className: 'btn btn-sm ' + (_mode === t[0] || (_mode === 'reset' && t[0] === 'signin') ? 'btn-primary' : 'btn-outline'),
      text: t[1],
      attributes: { type: 'button' }
    });
    b.addEventListener('click', function () { _mode = t[0]; _busyMessage = ''; deps.rerender(); });
    tabs.appendChild(b);
  });
  body.appendChild(tabs);

  // "Continue with Google / Apple": no password to make or remember. "I am new" upgrades this guest in place (so scores,
  // friends and groups stay); "I have an account" signs in to the one that exists.
  if (!_externalAsked && deps.leaderboard.getAuthSettings) {
    _externalAsked = true; // (asked once; the panel is drawn again with the answer)
    var settled = function (ext) { _external = ext; _externalDone = true; deps.rerender(); };
    deps.leaderboard.getAuthSettings().then(settled, function () { settled(null); });
  } else if (!deps.leaderboard.getAuthSettings) {
    _externalDone = true;
  }
  // (no buttons until it is known which work, so none appears and then vanishes)
  var providers = _mode === 'reset' || !_externalDone ? [] : onlyAvailable(enabledProviders(), _external);
  if (providers.length) {
    var row = createElement('div', { className: 'auth-providers' });
    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0';
    providers.forEach(function (p) {
      var pb = createElement('button', {
        className: 'btn btn-outline btn-block auth-provider',
        text: (p.icon ? p.icon + '  ' : '') + 'Continue with ' + p.label,
        attributes: { type: 'button', 'data-provider': p.id }
      });
      pb.addEventListener('click', function () {
        pb.disabled = true;
        track('account_event', { action: 'oauth_started', method: p.id });
        deps.leaderboard.signInWithProvider(p.id, { link: _mode === 'signup' }).then(function (res) {
          if (res.success) {
            _busyMessage = 'Opening ' + p.label + '…';
            deps.rerender();
            return;
          }
          pb.disabled = false;
          track('account_event', { action: 'oauth_failed', method: p.id });
          deps.toast(res.error || 'Could not sign in with ' + p.label + '.');
        });
      });
      row.appendChild(pb);
    });
    body.appendChild(row);
    var or = createElement('div', { text: 'or use your email' });
    or.style.cssText = 'text-align:center;font-size:12px;color:var(--text-muted);margin:6px 0';
    body.appendChild(or);
  }

  var form = createElement('form');
  form.setAttribute('novalidate', 'novalidate');
  var email = input('email', 'Email address', 'email', 'you@example.com');
  form.appendChild(email);

  var password = null;
  if (_mode !== 'reset') {
    password = input('password', 'Password', _mode === 'signup' ? 'new-password' : 'current-password',
      _mode === 'signup' ? 'Password (8+ characters)' : 'Password');
    form.appendChild(password);
  }

  var submitLabel = _mode === 'signup' ? 'Create account' : (_mode === 'signin' ? 'Sign in' : 'Email me a reset link');
  var submit = createElement('button', { className: 'btn btn-primary btn-block', text: submitLabel, attributes: { type: 'submit' } });
  form.appendChild(submit);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submit.disabled = true;
    var run;
    if (_mode === 'signup') {
      run = deps.leaderboard.signUp(email.value, password.value).then(function (res) {
        track('account_event', { action: res.success ? 'signup_ok' : 'signup_started', method: 'email', ok: !!res.success });
        if (!res.success) return deps.toast(res.error || 'Could not create the account.');
        if (res.needsConfirm) {
          _busyMessage = 'Almost there! We emailed ' + email.value.trim() + '. Open the link in that email to finish. Check spam if you do not see it.';
        } else {
          deps.toast('Account created. Your progress is now saved to it.');
        }
        deps.rerender();
      });
    } else if (_mode === 'signin') {
      run = deps.leaderboard.signIn(email.value, password.value).then(function (res) {
        track('account_event', { action: res.success ? 'signin_ok' : 'signin_failed', method: 'email', ok: !!res.success });
        if (!res.success) return deps.toast(res.error || 'Could not sign in.');
        deps.toast('Signed in.');
        _busyMessage = '';
        deps.rerender();
      });
    } else {
      run = deps.leaderboard.sendPasswordReset(email.value).then(function (res) {
        track('account_event', { action: 'password_reset', ok: !!res.success });
        if (!res.success) return deps.toast(res.error || 'Could not send the email.');
        _busyMessage = 'If an account exists for that email, a reset link is on its way.';
        deps.rerender();
      });
    }
    run.then(function () { submit.disabled = false; }, function () { submit.disabled = false; });
  });
  body.appendChild(form);

  // No password to remember: one tap on a link emailed to the address typed above
  if (_mode !== 'reset') {
    var linkBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '✉ Email me a sign-in link instead', attributes: { type: 'button', 'data-magic': '1' } });
    linkBtn.style.marginTop = '8px';
    linkBtn.addEventListener('click', function () {
      linkBtn.disabled = true;
      deps.leaderboard.sendSignInLink(email.value, { link: _mode === 'signup' }).then(function (res) {
        track('account_event', { action: res.success ? 'signin_link_sent' : 'signin_link_failed', method: 'email', ok: !!res.success });
        linkBtn.disabled = false;
        if (!res.success) return deps.toast(res.error || 'Could not send the email.');
        _busyMessage = 'We emailed ' + email.value.trim() + '. Open the link in that email to finish. Check spam if you do not see it.';
        deps.rerender();
      });
    });
    body.appendChild(linkBtn);
  }

  if (_mode === 'signin') {
    var forgot = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Forgot password?', attributes: { type: 'button' } });
    forgot.addEventListener('click', function () { _mode = 'reset'; _busyMessage = ''; deps.rerender(); });
    body.appendChild(forgot);
  }
  if (_mode === 'reset') {
    var back = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Back to sign in', attributes: { type: 'button' } });
    back.addEventListener('click', function () { _mode = 'signin'; _busyMessage = ''; deps.rerender(); });
    body.appendChild(back);
  }
  if (_busyMessage) body.appendChild(note(_busyMessage, 'var(--accent-green)'));

  body.appendChild(note('Signing in on a new device loads your saved progress there. We only use your email for sign-in and password resets.'));
  var guestData = createElement('div');
  guestData.style.marginTop = '10px';
  guestData.appendChild(deleteAccountButton(deps));
  guestData.lastChild.textContent = 'Delete my online data';
  guestData.lastChild.style.marginLeft = '0';
  body.appendChild(guestData);
}

/** Permanent deletion, behind a clear confirmation (required by the app stores). */
function deleteAccountButton(deps) {
  var b = button('Delete my account', function () {
    var ok = window.confirm('Delete your account and all online data (profile, scores, friends, groups and cloud save)? A subscription that is still billing is cancelled with it, and Pro and items you bought are lost. This cannot be undone. Progress saved on this device stays.');
    if (!ok) return Promise.resolve();
    return deps.leaderboard.deleteAccount().then(function (res) {
      track('account_event', { action: 'delete_requested', ok: !!res.success });
      deps.toast(res.success ? 'Your account and online data were deleted.' : (res.error || 'Could not delete the account.'));
      deps.rerender();
    });
  }, 'btn-outline');
  b.style.cssText = 'color:var(--accent-red);border-color:var(--accent-red);margin-left:8px';
  return b;
}

function renderSignedIn(body, deps, status) {
  body.appendChild(note('Signed in as ' + status.email + (providerLabel(status.provider) ? ' with ' + providerLabel(status.provider) : ''), 'var(--accent-green)'));
  if (status.pendingEmail) {
    body.appendChild(note('Confirm ' + status.pendingEmail + ' from the email we sent to finish changing your address.', 'var(--accent-gold)'));
  }

  var sync = deps.cloudSync ? deps.cloudSync.getStatus() : null;
  if (sync) {
    var line;
    if (sync.state === 'syncing') line = '☁ Saving…';
    else if (sync.state === 'error') line = '⚠ Could not sync: ' + (sync.error || 'unknown error') + '. Your progress is safe on this device.';
    else line = '☁ Progress is saved to your account · last synced ' + timeAgo(sync.lastSyncedAt) + (sync.dirty ? ' · changes waiting' : '');
    body.appendChild(note(line, sync.state === 'error' ? 'var(--accent-red)' : null));
    body.appendChild(button('Sync now', function () {
      return deps.cloudSync.sync().then(function () { deps.rerender(); });
    }));
    body.appendChild(button('Restore my biggest earlier save', function () {
      return deps.cloudSync.restoreEarlierCloudSave().then(function (r) {
        deps.toast(r === 'none' ? 'No earlier save is kept for this account yet.' : 'Restored your biggest earlier save.');
        deps.rerender();
      }).catch(function (e) { deps.toast((e && e.message) || 'Could not restore.'); });
    }));
  }

  var heading = createElement('div', { text: 'Change password' });
  heading.style.cssText = 'margin:14px 0 6px;font-weight:700;font-size:13px';
  body.appendChild(heading);
  var pw = input('password', 'New password', 'new-password', 'New password (8+ characters)');
  body.appendChild(pw);
  body.appendChild(button('Update password', function () {
    return deps.leaderboard.updatePassword(pw.value).then(function (res) {
      deps.toast(res.success ? 'Password updated.' : (res.error || 'Could not update your password.'));
      if (res.success) pw.value = '';
    });
  }));

  var out = createElement('div');
  out.style.marginTop = '16px';
  out.appendChild(deleteAccountButton(deps));
  out.appendChild(button('Sign out', function () {
    var flush = deps.cloudSync ? deps.cloudSync.sync() : Promise.resolve();
    return flush.then(function () { return deps.leaderboard.signOut(); }).then(function (res) {
      track('account_event', { action: 'signout', ok: !!res.success });
      deps.toast(res.success ? 'Signed out. Your progress stays on this device.' : (res.error || 'Could not sign out.'));
      deps.rerender();
    });
  }));
  body.appendChild(out);
}

/**
 * Ask which save to keep when this device and the account both have progress.
 * @returns {Promise<'cloud'|'local'|null>} null if dismissed
 */
export function askWhichSave(localSummary, cloudSummary) {
  return new Promise(function (resolve) {
    var overlay = createElement('div', { attributes: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose which progress to keep' } });
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(5,8,25,.85);display:flex;align-items:center;justify-content:center;padding:16px';
    var card = createElement('div');
    card.style.cssText = 'max-width:380px;width:100%;background:rgba(20,14,50,.98);border:2px solid var(--accent-cyan);border-radius:16px;padding:18px';
    card.appendChild(createElement('h3', { text: 'Which progress do you want?' }));
    var intro = createElement('p', { text: 'This device and your account both have progress. Pick one to keep. The other will be replaced.' });
    intro.style.cssText = 'font-size:12px;color:var(--text-secondary);margin:6px 0 12px';
    card.appendChild(intro);

    function option(title, summary, choice, cls) {
      var b = createElement('button', { className: 'btn btn-block ' + cls, attributes: { type: 'button' } });
      b.style.cssText = 'margin-bottom:8px;text-align:left';
      b.appendChild(createElement('div', { text: title }));
      var sub = createElement('div', {
        text: summary.answered.toLocaleString() + ' questions answered · ' + summary.coins.toLocaleString() + ' coins earned · best score ' + summary.best.toLocaleString()
      });
      sub.style.cssText = 'font-size:11px;font-weight:400;opacity:.85';
      b.appendChild(sub);
      b.addEventListener('click', function () { overlay.remove(); resolve(choice); });
      card.appendChild(b);
    }
    option('☁ Use my account progress', cloudSummary, 'cloud', 'btn-primary');
    option('📱 Keep this device’s progress', localSummary, 'local', 'btn-outline');

    var later = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Decide later', attributes: { type: 'button' } });
    later.addEventListener('click', function () { overlay.remove(); resolve(null); });
    card.appendChild(later);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}
