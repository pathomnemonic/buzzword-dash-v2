/**
 * proui.js — the screens for Dx Dash Pro: the paywall, the "unlock all cards" banner and the Settings row. Nothing here
 * shows unless Pro is live (see pro.js proLive: switched on and something can actually be bought).
 */

import { createElement, setText } from './dom.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';
import { isNative } from './native.js';
import { openExternal } from './platform.js';
import { track } from './analytics/index.js';
import { variant } from './analytics/index.js';
import { getIap } from './iap.js';
import { proLive, isPro, proStatus, proPlans, buyPlan, restorePro, redeemCode, refreshPro, proWebUrl, webCheckoutEnabled, webPlans, webBuy, webManage, PRO_FEATURES, libraryUnlocked } from './pro.js';
import { libraryCounts } from './cardhub.js';

var _lb = null;       // the leaderboard service, once it is ready (for codes and the server's answer)
var _toast = function () {};

/** Hand the screens what they need from the rest of the app. */
export function setProUiDeps(deps) {
  if (deps.lb !== undefined) _lb = deps.lb;
  if (deps.toast) _toast = deps.toast;
}

function planLine(p) {
  if (/lifetime/.test(p.id)) return p.price + ' once';
  var per = /^P1Y$/.test(p.period) ? ' / year' : /^P1M$/.test(p.period) ? ' / month' : /^P3M$/.test(p.period) ? ' for 3 months' : '';
  return p.price + per;
}

/** "about $3.33 a month" for a yearly or 3-month plan (only when the currency is known). */
function perMonth(p) {
  var months = /^P1Y$/.test(p.period) ? 12 : /^P3M$/.test(p.period) ? 3 : 0;
  if (!months || !p.micros) return '';
  var each = p.micros / 1000000 / months;
  try { return 'about ' + new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency || 'USD' }).format(each) + ' a month'; } catch (e) { return ''; }
}


/** The "what Pro gets you" list; the feature the player just tapped (if any) goes first and is marked. */
function featureList(hit) {
  var ul = createElement('ul', { className: 'pro-features' });
  var items = PRO_FEATURES.slice().sort(function (a, b) { return (b.id === hit ? 1 : 0) - (a.id === hit ? 1 : 0); });
  items.forEach(function (f) {
    var li = createElement('li', { className: 'pro-feature' + (f.id === hit ? ' pro-feature-hit' : '') });
    li.appendChild(createElement('span', { className: 'pro-feature-icon', text: f.icon, attributes: { 'aria-hidden': 'true' } }));
    var body = createElement('div');
    var t = createElement('div', { className: 'pro-feature-title', text: f.title });
    if (f.id === hit) t.appendChild(createElement('span', { className: 'pro-feature-tag', text: 'You tapped this' }));
    body.appendChild(t);
    body.appendChild(createElement('div', { className: 'pro-feature-detail', text: f.detail + ' ' + f.free + '.' }));
    li.appendChild(body);
    ul.appendChild(li);
  });
  return ul;
}

/**
 * Open the Pro screen. Does nothing while Pro is dormant.
 * @param {{trigger?: string, feature?: string}} [o]
 */
export function openPaywall(o) {
  if (!proLive() || typeof document === 'undefined') return null;
  o = o || {};
  var old = document.getElementById('proPaywall');
  if (old) old.remove();
  var opener = document.activeElement;
  var trigger = o.trigger || 'settings';
  var overlay = createElement('div', { className: 'report-overlay', attributes: { id: 'proPaywall', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Dx Dash Pro' } });
  var box = createElement('div', { className: 'report-box' });
  box.appendChild(createElement('h2', { text: '⚡ Dx Dash Pro' }));
  if (isPro()) {
    var st0 = proStatus();
    box.appendChild(createElement('p', { text: st0.trial ? 'Your free trial is on. Enjoy every card and tool!' + (st0.until ? ' It ends ' + new Date(st0.until).toLocaleDateString() + '.' : '') : 'You have Pro. Thank you for supporting Dx Dash! 💜' }));
  } else {
    var counts = libraryCounts();
    box.appendChild(createElement('p', { text: counts.total ? 'Free gives you ' + counts.free + ' of ' + counts.total.toLocaleString() + ' cards. Pro opens the whole bank and every study tool.' : 'Study smarter with every card and every study tool.' }));
    box.appendChild(featureList(o.feature));
    var thanks = createElement('p', { text: 'Pro also keeps a solo developer making the game. 💜' });
    thanks.style.cssText = 'font-size:12px;opacity:.8;margin:2px 0 6px';
    box.appendChild(thanks);
    if (!(_lb && _lb.isAuthenticated && _lb.isAuthenticated()) || (_lb.isGuest && _lb.isGuest())) {
      var tr = createElement('p', { text: '🎁 New here? Create a free account (Friends → Account) and get a 7-day Pro trial: no card, nothing to cancel.' });
      tr.style.cssText = 'font-size:13px;font-weight:800;margin:6px 0';
      box.appendChild(tr);
    }
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
          var lines = [(p.blurb === 'BEST VALUE' ? '★ ' : '') + p.label + '  ·  ' + planLine(p)];
          var sub = [p.trialDays ? p.trialDays + '-DAY FREE TRIAL' : '', perMonth(p), p.blurb && p.blurb !== 'BEST VALUE' ? p.blurb : (p.blurb ? 'BEST VALUE' : '')].filter(Boolean).join('  ·  ');
          if (sub) lines.push(sub);
          var b = createElement('button', { className: 'btn ' + (i === 0 ? 'btn-gold' : 'btn-primary') + ' btn-block pro-plan', attributes: { type: 'button', 'data-plan': p.id } });
          lines.forEach(function (t, li) { b.appendChild(createElement('span', { className: li ? 'pro-plan-sub' : 'pro-plan-main', text: t })); });
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
    } else if (webCheckoutEnabled()) {
      // the website: real prices from Stripe, and a hop to Stripe's own payment page
      setText(status, 'Loading prices…');
      var guest = !!(_lb && _lb.isGuest && _lb.isGuest());
      webPlans(_lb).then(function (res) {
        var plans = res.plans;
        track('paywall_viewed', { trigger: trigger, feature: o.feature || '', plans: plans.map(function (p) { return p.id; }), variant: variant('pro_paywall'), pro: false });
        if (!plans.length) { setText(status, res.error ? 'Pro is not available right now. ' + res.error : 'Pro is not available right now. Please try again later.'); return; }
        var notes = ['Payment is handled by Stripe. Subscriptions renew automatically; cancel any time from Settings → Dx Dash Pro → Manage.'];
        if (plans.some(function (p) { return p.trialDays > 0; })) notes.unshift('Free trial applies to new subscribers.');
        if (guest) notes.push('Tip: create an account (Friends → Account) first, so Pro follows you to other devices.');
        setText(status, notes.join(' '));
        var buy = function (productId, d) {
          act('plan_selected', d);
          act('purchase_started', d);
          [].forEach.call(list.children, function (x) { x.disabled = true; });
          setText(status, 'Taking you to the payment page…');
          webBuy(productId, _lb).then(function (r) {
            if (r.ok) { act('web_opened', d); return; } // the page is leaving for Stripe
            [].forEach.call(list.children, function (x) { x.disabled = false; });
            act('failed', d);
            setText(status, r.error || 'That did not go through. You have not been charged.');
          });
        };
        plans.forEach(function (p, i) {
          var lines = [(p.blurb === 'BEST VALUE' ? '★ ' : '') + p.label + '  ·  ' + planLine(p)];
          var sub = [p.trialDays ? p.trialDays + '-DAY FREE TRIAL' : '', perMonth(p), p.blurb && p.blurb !== 'BEST VALUE' ? p.blurb : (p.blurb ? 'BEST VALUE' : '')].filter(Boolean).join('  ·  ');
          if (sub) lines.push(sub);
          var b = createElement('button', { className: 'btn ' + (i === 0 ? 'btn-gold' : 'btn-primary') + ' btn-block pro-plan', attributes: { type: 'button', 'data-plan': p.id } });
          lines.forEach(function (t, li) { b.appendChild(createElement('span', { className: li ? 'pro-plan-sub' : 'pro-plan-main', text: t })); });
          b.addEventListener('click', function () { buy(p.id, { plan: p.id, price: p.price, micros: p.micros, currency: p.currency, trial_days: p.trialDays }); });
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
    } else if (webCheckoutEnabled() && proStatus().source === 'server') {
      var wmanage = createElement('button', { className: 'btn btn-outline btn-block', text: 'Manage subscription', attributes: { type: 'button' } });
      wmanage.addEventListener('click', function () {
        act('manage_opened', {});
        wmanage.disabled = true;
        webManage(_lb).then(function (r) { wmanage.disabled = false; if (!r.ok) setText(status, r.error); });
      });
      box.appendChild(wmanage);
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
  overlay.scrollTop = 0; box.scrollTop = 0; setTimeout(function () { overlay.scrollTop = 0; box.scrollTop = 0; }, 0); // (focusing the last button must not scroll the list of benefits out of sight)
  return overlay;
}

/** Settings → About & help: "Dx Dash Pro" with the status, only once Pro is switched on. */
export function renderProSettings(container) {
  if (!proLive() || !container) return;
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

/** The small gold button on Home: shows while Pro can be bought or owned, turns green when Pro is on, and opens the Pro popup. */
export function mountProButton() {
  if (typeof document === 'undefined') return null;
  var btn = document.getElementById('homeProBtn');
  if (!btn || btn.getAttribute('data-mounted')) return btn;
  btn.setAttribute('data-mounted', '1');
  var text = document.getElementById('homeProText');
  var paint = function () {
    var live = proLive();
    btn.hidden = !live;
    if (!live) return;
    var st = proStatus();
    btn.classList.toggle('pro-on', !!st.active);
    var label = st.active ? (st.trial ? 'Trial' : 'Pro') : 'Go Pro';
    if (text) setText(text, label);
    btn.setAttribute('aria-label', st.active ? (st.trial ? 'Dx Dash Pro trial: see details' : 'Dx Dash Pro: active') : 'Go Pro: see what Pro gets you');
  };
  btn.addEventListener('click', function () { openPaywall({ trigger: 'home_button' }); });
  ['dx:pro-changed', 'dx:pro-trial-started'].forEach(function (ev) { document.addEventListener(ev, paint); });
  paint();
  setTimeout(paint, 1500);
  setTimeout(paint, 6000);
  return btn;
}

var _installed = false;
/** Listen for gates being hit, and keep the screens in step. Call once at start-up. */
export function installProUi(deps) {
  if (deps) setProUiDeps(deps);
  if (_installed || typeof document === 'undefined') return;
  _installed = true;
  mountProButton();
  document.addEventListener('dx:pro-gate', function (e) {
    var d = (e && e.detail) || {};
    openPaywall({ trigger: 'gate_' + String(d.trigger || d.feature || 'feature').slice(0, 20), feature: d.feature });
  });
}


/**
 * A small "unlock all the cards" strip: shows how many cards are free and opens the paywall. Adds nothing when the whole
 * library is open (Pro owned, or nothing to buy).
 * @param {HTMLElement} container
 * @param {string} [trigger] what to call it in analytics
 * @returns {HTMLElement|null}
 */
export function renderLibraryBanner(container, trigger) {
  if (!container || !proLive() || libraryUnlocked()) return null;
  var counts = libraryCounts();
  if (!counts.total) return null;
  var old = container.querySelector('.library-banner');
  if (old) old.remove();
  var box = createElement('div', { className: 'library-banner', attributes: { role: 'note' } });
  var text = createElement('div', { className: 'library-banner-text' });
  text.appendChild(createElement('strong', { text: '🔒 ' + counts.free + ' of ' + counts.total.toLocaleString() + ' cards free' }));
  text.appendChild(createElement('span', { text: 'Unlock the whole bank and every study tool.' }));
  box.appendChild(text);
  var btn = createElement('button', { className: 'btn btn-gold btn-sm', text: 'UNLOCK', attributes: { type: 'button' } });
  btn.addEventListener('click', function () { openPaywall({ trigger: trigger || 'library_banner', feature: 'card_library' }); });
  box.appendChild(btn);
  container.insertBefore(box, container.firstChild);
  return box;
}
