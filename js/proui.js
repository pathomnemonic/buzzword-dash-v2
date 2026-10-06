/**
 * proui.js — the screens for Dx Dash Pro: the paywall, and the Settings row. Dormant until Pro is switched on
 * (see pro.js): `installProUi` does nothing and `renderProSettings` adds nothing while it is off.
 */

import { createElement, setText } from './dom.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';
import { isNative } from './native.js';
import { openExternal } from './platform.js';
import { track } from './analytics/index.js';
import { variant } from './analytics/index.js';
import { getIap } from './iap.js';
import { proEnabled, isPro, proStatus, proPlans, buyPlan, restorePro, redeemCode, refreshPro, proWebUrl, PRO_BENEFITS } from './pro.js';

var _lb = null;       // the leaderboard service, once it is ready (for codes and the server's answer)
var _toast = function () {};

/** Hand the screens what they need from the rest of the app. */
export function setProUiDeps(deps) {
  if (deps.lb !== undefined) _lb = deps.lb;
  if (deps.toast) _toast = deps.toast;
}

function planLine(p) {
  var per = /^P1Y$/.test(p.period) ? ' / year' : /^P1M$/.test(p.period) ? ' / month' : /^P3M$/.test(p.period) ? ' for 3 months' : '';
  return p.price + per;
}

/**
 * Open the Pro screen. Does nothing while Pro is dormant.
 * @param {{trigger?: string, feature?: string}} [o]
 */
export function openPaywall(o) {
  if (!proEnabled() || typeof document === 'undefined') return null;
  o = o || {};
  var old = document.getElementById('proPaywall');
  if (old) old.remove();
  var opener = document.activeElement;
  var trigger = o.trigger || 'settings';
  var overlay = createElement('div', { className: 'report-overlay', attributes: { id: 'proPaywall', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Dx Dash Pro' } });
  var box = createElement('div', { className: 'report-box' });
  box.appendChild(createElement('h2', { text: '⚡ Dx Dash Pro' }));
  if (isPro()) {
    box.appendChild(createElement('p', { text: 'You have Pro. Thank you for supporting Dx Dash! 💜' }));
  } else {
    box.appendChild(createElement('p', { text: 'Study smarter, and keep the game free for everyone.' }));
    var ul = createElement('ul');
    ul.style.cssText = 'margin:6px 0 10px 18px;padding:0;text-align:left;font-size:13px;line-height:1.5';
    PRO_BENEFITS.forEach(function (t) { ul.appendChild(createElement('li', { text: t })); });
    box.appendChild(ul);
  }
  var list = createElement('div');
  list.style.cssText = 'display:grid;gap:8px;margin:10px 0';
  var status = createElement('div', { className: 'setting-sublabel', attributes: { role: 'status' } });
  box.appendChild(list);
  box.appendChild(status);

  var cleanup = function () { releaseFocusTrap(); overlay.remove(); if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* gone */ } } };
  var act = function (action, extra) { track('paywall_action', Object.assign({ action: action, trigger: trigger }, extra || {})); };

  if (!isPro()) {
    if (isNative()) {
      setText(status, 'Loading prices…');
      proPlans().then(function (plans) {
        track('paywall_viewed', { trigger: trigger, feature: o.feature || '', plans: plans.map(function (p) { return p.id; }), variant: variant('pro_paywall'), pro: false });
        if (!plans.length) { setText(status, 'Pro is not available right now. Please try again later.'); return; }
        setText(status, plans.some(function (p) { return p.trialDays > 0; }) ? 'Cancel any time in your store account. Free trial applies to new subscribers.' : 'Cancel any time in your store account.');
        plans.forEach(function (p, i) {
          var label = p.label + '  ·  ' + planLine(p) + (p.trialDays ? '  ·  ' + p.trialDays + '-day free trial' : '');
          var b = createElement('button', { className: 'btn ' + (i === 0 ? 'btn-gold' : 'btn-primary') + ' btn-block', text: label, attributes: { type: 'button', 'data-plan': p.id } });
          b.addEventListener('click', function () {
            var d = { plan: p.id, price: p.price, micros: p.micros, currency: p.currency, trial_days: p.trialDays };
            act('plan_selected', d);
            [].forEach.call(list.children, function (x) { x.disabled = true; });
            setText(status, 'Opening the store…');
            act('purchase_started', d);
            buyPlan(p.id, { lb: _lb }).then(function (res) {
              [].forEach.call(list.children, function (x) { x.disabled = false; });
              if (res.ok) { act('purchased', d); setText(status, 'Welcome to Pro! 🎉'); _toast('Welcome to Dx Dash Pro!'); setTimeout(cleanup, 1200); }
              else if (res.cancelled) { act('cancelled', d); setText(status, ''); }
              else { act('failed', d); setText(status, 'That did not go through. You have not been charged.'); }
            });
          });
          list.appendChild(b);
        });
      });
    } else {
      track('paywall_viewed', { trigger: trigger, feature: o.feature || '', plans: [], variant: variant('pro_paywall'), pro: false });
      var url = proWebUrl(_lb && _lb.getUserId ? _lb.getUserId() : '');
      if (url) {
        var web = createElement('button', { className: 'btn btn-gold btn-block', text: 'Get Pro on the web', attributes: { type: 'button' } });
        web.addEventListener('click', function () { act('web_opened', {}); openExternal(url); setText(status, 'After you pay, come back and tap Check again.'); });
        list.appendChild(web);
        var again = createElement('button', { className: 'btn btn-outline btn-block', text: 'Check again', attributes: { type: 'button' } });
        again.addEventListener('click', function () { refreshPro({ lb: _lb }).then(function (st) { setText(status, st.active ? 'Pro is on. Thank you! 💜' : 'Not showing yet. It can take a minute after paying.'); if (st.active) setTimeout(cleanup, 1000); }); });
        list.appendChild(again);
      } else {
        setText(status, 'Pro is available in the Dx Dash app on Android and iPhone.');
      }
    }

    // codes, and purchases made before
    var codeRow = createElement('div');
    codeRow.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    var input = createElement('input', { attributes: { type: 'text', placeholder: 'Have a code?', 'aria-label': 'Promo code', maxlength: '32', autocapitalize: 'characters', autocomplete: 'off' } });
    input.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
    var redeem = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Redeem', attributes: { type: 'button' } });
    redeem.addEventListener('click', function () {
      if (!input.value.trim()) return;
      redeem.disabled = true;
      redeemCode(input.value, _lb).then(function (r) {
        redeem.disabled = false;
        if (r && r.ok) { act('code_ok', {}); setText(status, 'Code accepted. Pro is on! 🎉'); setTimeout(cleanup, 1200); }
        else { act('code_failed', {}); setText(status, (r && r.error) || 'That code is not valid.'); }
      });
    });
    codeRow.appendChild(input); codeRow.appendChild(redeem);
    box.appendChild(codeRow);
    if (isNative()) {
      var restore = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Restore purchases', attributes: { type: 'button' } });
      restore.style.marginTop = '6px';
      restore.addEventListener('click', function () {
        act('restore_started', {});
        restore.disabled = true;
        restorePro({ lb: _lb }).then(function (r) {
          restore.disabled = false;
          act(r.active ? 'restore_ok' : 'restore_none', {});
          setText(status, r.active ? 'Pro restored. 🎉' : 'No earlier purchase found for this store account.');
          if (r.active) setTimeout(cleanup, 1200);
        });
      });
      box.appendChild(restore);
    }
  } else {
    track('paywall_viewed', { trigger: trigger, feature: o.feature || '', plans: [], variant: variant('pro_paywall'), pro: true });
    if (isNative()) {
      var manage = createElement('button', { className: 'btn btn-outline btn-block', text: 'Manage subscription', attributes: { type: 'button' } });
      manage.addEventListener('click', function () { act('manage_opened', {}); getIap().manage(); });
      box.appendChild(manage);
    }
  }

  var terms = createElement('div', { className: 'setting-sublabel' });
  terms.style.marginTop = '8px';
  terms.appendChild(createElement('a', { text: 'Terms', attributes: { href: 'terms.html', target: '_blank', rel: 'noopener' } }));
  terms.appendChild(document.createTextNode(' · '));
  terms.appendChild(createElement('a', { text: 'Privacy', attributes: { href: 'privacy.html', target: '_blank', rel: 'noopener' } }));
  box.appendChild(terms);

  var close = createElement('button', { className: 'btn btn-outline', text: 'Not now', attributes: { type: 'button', id: 'proPaywallClose' } });
  close.style.marginTop = '8px';
  close.addEventListener('click', function () { act('closed', {}); cleanup(); });
  box.appendChild(close);
  overlay.appendChild(box);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) { act('closed', {}); cleanup(); } });
  overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); act('closed', {}); cleanup(); } });
  document.body.appendChild(overlay);
  trapFocus(overlay);
  close.focus();
  return overlay;
}

/** Settings → About & help: "Dx Dash Pro" with the status, only once Pro is switched on. */
export function renderProSettings(container) {
  if (!proEnabled() || !container) return;
  var row = createElement('div', { className: 'setting-row', attributes: { 'data-setting': 'pro' } });
  var label = createElement('div');
  label.style.flex = '1';
  label.appendChild(createElement('div', { text: '⚡ Dx Dash Pro' }));
  var st = proStatus();
  label.appendChild(createElement('span', { className: 'setting-sublabel', text: st.active ? 'Active' + (st.trial ? ' (trial)' : '') + '. Thank you!' : 'Unlimited custom cards, every explanation, full exam reports and more.' }));
  row.appendChild(label);
  var btn = createElement('button', { className: 'btn btn-gold btn-sm', text: st.active ? 'Manage' : 'See Pro', attributes: { type: 'button' } });
  btn.addEventListener('click', function () { openPaywall({ trigger: 'settings' }); });
  row.appendChild(btn);
  container.appendChild(row);
}

var _installed = false;
/** Listen for gates being hit, and keep the screens in step. Call once at start-up. */
export function installProUi(deps) {
  if (deps) setProUiDeps(deps);
  if (_installed || typeof document === 'undefined') return;
  _installed = true;
  document.addEventListener('dx:pro-gate', function (e) {
    var d = (e && e.detail) || {};
    openPaywall({ trigger: 'gate_' + String(d.trigger || d.feature || 'feature').slice(0, 20), feature: d.feature });
  });
}
