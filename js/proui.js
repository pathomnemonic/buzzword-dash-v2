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
import { proLive, isPro, checkGate, proStatus, proPlans, buyPlan, restorePro, redeemCode, refreshPro, proWebUrl, webCheckoutEnabled, webPlans, webBuy, webManage, hasAccount, canCancel, cancelSubscription, trialAvailable, subscriptionState, proGiftState, PRO_FEATURES, libraryUnlocked } from './pro.js';
import { libraryCounts } from './cardhub.js';

var _lb = null;       // the leaderboard service, once it is ready (for codes and the server's answer)
var _toast = function () {};
var _openAccount = function () {};

/** Hand the screens what they need from the rest of the app. */
export function setProUiDeps(deps) {
  if (deps.lb !== undefined) _lb = deps.lb;
  if (deps.toast) _toast = deps.toast;
  if (deps.openAccount) _openAccount = deps.openAccount;
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
  hit = hit === 'mp_suddendeath' || hit === 'mp_race' ? 'mp_modes' : hit;
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
  var st0 = proStatus();
  // Someone on the free trial still needs a way to buy: they see the plans too, with their trial's end date
  var needsPlan = !isPro() || !!st0.trial;
  // Two steps: first what Pro gets you (with the free trial and a "See pricing" button), then the plans
  var pricing = needsPlan && !!o.pricing;
  var features = needsPlan && !pricing;
  var counts = libraryCounts();
  if (isPro() && st0.trial) {
    var daysLeft = st0.until ? Math.max(0, Math.ceil((st0.until - Date.now()) / 86400000)) : 0;
    var tl = createElement('p', { text: 'Your free trial is on' + (daysLeft ? ': ' + daysLeft + (daysLeft === 1 ? ' day' : ' days') + ' left' : '') + (st0.until ? ' (ends ' + new Date(st0.until).toLocaleDateString() + ')' : '') + '. Pick a plan to keep everything when it ends.' });
    tl.style.fontWeight = '800';
    box.appendChild(tl);
  } else if (isPro()) {
    box.appendChild(createElement('p', { text: 'You have Pro. Thank you for supporting Dx Dash! 💜' }));
  } else if (pricing) {
    box.appendChild(createElement('p', { text: 'Choose your plan', className: 'pro-step-title' }));
  } else {
    var headline = createElement('p', { text: counts.total ? 'Go Pro for ' + moreCards(counts) + ' cards, plus every mode and study tool.' : 'Study smarter with every card, every mode and every study tool.' });
    headline.style.cssText = 'font-weight:800;font-size:16px';
    box.appendChild(headline);
  }
  var list = createElement('div');
  list.style.cssText = 'display:grid;gap:8px;margin:10px 0';
  var status = createElement('div', { className: 'setting-sublabel', attributes: { role: 'status' } });
  box.appendChild(list);
  box.appendChild(status);
  if (features) {
    var whatHead = createElement('h3', { text: 'WHAT YOU GET' });
    whatHead.style.cssText = 'margin:14px 0 2px;font-size:13px;letter-spacing:1px;color:var(--accent-gold,#ffd24a)';
    box.appendChild(whatHead);
    if (counts.total) box.appendChild(createElement('p', { className: 'setting-sublabel', text: 'Free has ' + counts.free + ' of ' + counts.total.toLocaleString() + ' cards. Pro opens all of them.' }));
    box.appendChild(featureList(o.feature));
    var thanks = createElement('p', { text: 'Pro also keeps a solo developer making the game. 💜' });
    thanks.style.cssText = 'font-size:12px;opacity:.8;margin:2px 0 6px';
    box.appendChild(thanks);
  }

  var cleanup = function () { releaseFocusTrap(); overlay.remove(); if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* gone */ } } };
  var act = function (action, extra) { track('paywall_action', Object.assign({ action: action, trigger: trigger }, extra || {})); };

  var needsAccount = needsPlan && !hasAccount(_lb);
  if (features) {
    track('paywall_viewed', { trigger: trigger, feature: o.feature || '', plans: [], variant: variant('pro_paywall'), pro: isPro() });
    // the free trial is a button of its own, so nobody can miss it
    if (!isPro() && (needsAccount || trialAvailable())) {
      var trialBtn = createElement('button', { className: 'btn btn-green btn-block pro-trial-btn', attributes: { type: 'button', id: 'proTrialBtn' } });
      trialBtn.appendChild(createElement('span', { className: 'pro-plan-main', text: '🎁 START YOUR 7-DAY FREE TRIAL' }));
      trialBtn.appendChild(createElement('span', { className: 'pro-plan-sub', text: needsAccount ? 'Free account, no card, nothing to cancel' : 'No card, nothing to cancel' }));
      trialBtn.addEventListener('click', function () {
        if (needsAccount) { act('trial_account', {}); cleanup(); _openAccount(); return; }
        act('trial_start', {});
        trialBtn.disabled = true;
        setText(status, 'Starting your trial…');
        refreshPro({ lb: _lb }).then(function (st) { trialBtn.disabled = false; if (st.active) { act('trial_started', {}); _toast('Your free 7-day Pro trial has started! 🎉'); cleanup(); } else setText(status, 'Could not start the trial just now. Please try again.'); });
      });
      list.appendChild(trialBtn);
    }
    var seePricing = createElement('button', { className: 'btn btn-gold btn-block', text: '💳 SEE PRICING', attributes: { type: 'button', id: 'proSeePricing' } });
    seePricing.addEventListener('click', function () { act('see_pricing', {}); openPaywall(Object.assign({}, o, { pricing: true })); });
    list.appendChild(seePricing);
  }
  if (pricing) {
    var back = createElement('button', { className: 'btn btn-outline btn-sm', text: '‹ What you get', attributes: { type: 'button', id: 'proBack' } });
    back.addEventListener('click', function () { openPaywall(Object.assign({}, o, { pricing: false })); });
    box.insertBefore(back, box.firstChild.nextSibling);
    if (needsAccount) {
      // buying needs a real account (not a guest): the plans stay out of sight until there is one
      track('paywall_viewed', { trigger: trigger, feature: o.feature || '', plans: [], variant: variant('pro_paywall'), pro: false });
      var gate = createElement('div', { className: 'pro-account-gate' });
      gate.appendChild(createElement('strong', { text: 'Create a free account to start' }));
      gate.appendChild(createElement('span', { text: 'So your Pro follows you to every device. A new account gets a free 7-day trial first: no card, nothing to cancel. It takes under a minute.' }));
      var mk = createElement('button', { className: 'btn btn-gold btn-block', text: 'Create free account + start trial', attributes: { type: 'button', id: 'proCreateAccount' } });
      mk.addEventListener('click', function () { act('account_needed', {}); cleanup(); _openAccount(); });
      gate.appendChild(mk);
      list.appendChild(gate);
    } else if (isNative()) {
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
  } else if (!needsPlan) {
    track('paywall_viewed', { trigger: trigger, feature: o.feature || '', plans: [], variant: variant('pro_paywall'), pro: true });
    var paidSub = canCancel();
    var subLine = createElement('p', { className: 'setting-sublabel pro-sub-line' });
    box.appendChild(subLine);
    fillSubscriptionLine(subLine);
    var manageable = isNative() || (webCheckoutEnabled() && proStatus().source === 'server' && paidSub);
    if (manageable) {
      if (paidSub) {
        var cancelBtn = createElement('button', { className: 'btn btn-outline btn-block pro-cancel', text: 'Cancel subscription', attributes: { type: 'button', id: 'proCancel' } });
        cancelBtn.addEventListener('click', function () {
          act('cancel_opened', {});
          cancelBtn.disabled = true;
          setText(status, 'Opening the cancel page…');
          cancelSubscription(_lb).then(function (r) { cancelBtn.disabled = false; setText(status, r && r.ok ? 'Cancel any time. You keep Pro until the end of what you have paid for.' : (r && r.error) || 'Could not open the cancel page.'); });
        });
        box.appendChild(cancelBtn);
        box.appendChild(createElement('p', { className: 'setting-sublabel', text: 'Cancelling is one tap here. You keep Pro until the end of the period you paid for, and nothing is charged after that.' }));
      }
      var manage = createElement('button', { className: 'btn btn-outline btn-block', text: 'Manage subscription', attributes: { type: 'button' } });
      manage.addEventListener('click', function () {
        act('manage_opened', {});
        if (isNative()) { getIap().manage(); return; }
        manage.disabled = true;
        webManage(_lb).then(function (r) { manage.disabled = false; if (!r.ok) setText(status, r.error); });
      });
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
  overlay.scrollTop = 0; box.scrollTop = 0; setTimeout(function () { overlay.scrollTop = 0; box.scrollTop = 0; }, 0); // (focusing the last button must not scroll the list of benefits out of sight)
  return overlay;
}

/** Fill in whether the subscription renews or is set to end, from the billing system itself (never from what we assume). */
function fillSubscriptionLine(el) {
  if (!canCancel()) return;
  subscriptionState(_lb).then(function (v) {
    if (!v || !v.known || v.none) return;
    var when = v.endsAt ? new Date(v.endsAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    if (v.cancelling) { setText(el, '⚠ Cancelled: Pro ends ' + (when || 'at the end of the period you paid for') + '. You keep everything until then.'); el.classList.add('pro-sub-ending'); }
    else if (v.renewing) setText(el, 'Renews ' + (when ? 'on ' + when : 'automatically') + '.');
  });
}

/**
 * The "Dx Dash Pro" page in Settings, for everyone: what Pro gets you (with the free trial) for a free player, or the
 * membership, the gift and billing for a member.
 */
export function renderProTab(container) {
  if (!container) return;
  if (!proLive()) { container.appendChild(createElement('p', { className: 'setting-sublabel', text: 'Dx Dash Pro is not available right now.' })); return; }
  var st = proStatus();
  var box = createElement('div', { className: 'pro-tab' });
  var counts = libraryCounts();
  if (st.active && !st.trial) {
    box.appendChild(createElement('p', { className: 'pro-step-title', text: '⚡ You have Dx Dash Pro. Thank you! 💜' }));
    var sub = createElement('p', { className: 'setting-sublabel pro-sub-line' });
    box.appendChild(sub);
    fillSubscriptionLine(sub);
    var gs = proGiftState();
    if (gs.eligible) box.appendChild(createElement('p', { className: 'setting-sublabel', text: gs.available ? '🎁 Your Pro gift is waiting: open the Locker and tap 🎁 FREE on any item.' : '🎁 You have used your Pro gift.' }));
    if (canCancel()) {
      var cancel = createElement('button', { className: 'btn btn-outline btn-block pro-cancel', text: 'Cancel subscription', attributes: { type: 'button', id: 'proSettingsCancel' } });
      cancel.addEventListener('click', function () { cancel.disabled = true; cancelSubscription(_lb).then(function (r) { cancel.disabled = false; if (!(r && r.ok)) _toast((r && r.error) || 'Could not open the cancel page.'); }); });
      box.appendChild(cancel);
      var mg = createElement('button', { className: 'btn btn-outline btn-block', text: 'Manage subscription', attributes: { type: 'button' } });
      mg.addEventListener('click', function () { openPaywall({ trigger: 'settings_tab' }); });
      box.appendChild(mg);
    }
    box.appendChild(createElement('h3', { text: 'WHAT YOU HAVE', className: 'pro-what' }));
  } else {
    if (st.active && st.trial) {
      var daysLeft = st.until ? Math.max(0, Math.ceil((st.until - Date.now()) / 86400000)) : 0;
      box.appendChild(createElement('p', { className: 'pro-step-title', text: 'Your free trial is on' + (daysLeft ? ': ' + daysLeft + (daysLeft === 1 ? ' day' : ' days') + ' left' : '') + '.' }));
    } else {
      box.appendChild(createElement('p', { className: 'pro-step-title', text: counts.total ? 'Go Pro for ' + moreCards(counts) + ' cards, plus every mode and study tool.' : 'Study smarter with every card, every mode and every study tool.' }));
    }
    var get = createElement('button', { className: 'btn btn-gold btn-block', text: st.active ? '💳 SEE PRICING' : '⚡ GET PRO', attributes: { type: 'button', id: 'proTabGet' } });
    get.addEventListener('click', function () { openPaywall({ trigger: 'settings_tab', pricing: st.active }); });
    box.appendChild(get);
    box.appendChild(createElement('h3', { text: 'WHAT YOU GET', className: 'pro-what' }));
  }
  box.appendChild(featureList(''));
  container.appendChild(box);
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
  if (canCancel()) {
    var cancel = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Cancel', attributes: { type: 'button', id: 'proSettingsCancel', 'aria-label': 'Cancel my Pro subscription' } });
    cancel.addEventListener('click', function () { cancel.disabled = true; cancelSubscription(_lb).then(function (r) { cancel.disabled = false; if (!(r && r.ok)) _toast((r && r.error) || 'Could not open the cancel page.'); }); });
    row.appendChild(cancel);
  }
  container.appendChild(row);
}

/** The wide gold button on Home: shows while Pro can be bought (or a trial is running), says what Pro is worth, and opens the Pro popup. */
export function mountProButton() {
  if (typeof document === 'undefined') return null;
  var btn = document.getElementById('homeProBanner');
  if (!btn || btn.getAttribute('data-mounted')) return btn;
  btn.setAttribute('data-mounted', '1');
  var title = document.getElementById('homeProTitle');
  var sub = document.getElementById('homeProSub');
  var paint = function () {
    var live = proLive();
    var st = proStatus();
    btn.hidden = !live || (!!st.active && !st.trial);
    markProLocks();
    if (btn.hidden) return;
    if (st.active && st.trial) {
      var days = st.until ? Math.max(0, Math.ceil((st.until - Date.now()) / 86400000)) : 0;
      if (title) setText(title, 'PRO TRIAL' + (days ? ' · ' + days + (days === 1 ? ' DAY' : ' DAYS') + ' LEFT' : ''));
      if (sub) setText(sub, 'Keep 10× more cards and every study tool');
      btn.setAttribute('aria-label', 'Dx Dash Pro trial: keep Pro');
    } else {
      if (title) setText(title, 'GO PRO');
      if (sub) setText(sub, '10× more cards and every study tool');
      btn.setAttribute('aria-label', 'Go Pro: 10 times more cards and every study tool');
    }
  };
  btn.addEventListener('click', function () { openPaywall({ trigger: 'home_button' }); });
  ['dx:pro-changed', 'dx:pro-trial-started'].forEach(function (ev) { document.addEventListener(ev, paint); });
  paint();
  setTimeout(paint, 1500);
  setTimeout(paint, 6000);
  return btn;
}

/** "10× more" (the whole bank against the free part of it). */
function moreCards(counts) {
  var n = counts && counts.free > 0 ? Math.round(counts.total / counts.free) : 10;
  return (n >= 2 ? n : 10) + '× more';
}

var _locks = [];
/**
 * Tag a button as part of Pro: a small gold "🔒 PRO" on it while the feature is closed to this player ("⚡ PRO" while
 * it is open with a limit), and nothing once it is fully open. Repainted whenever Pro changes.
 */
export function applyProLock(btn, feature) {
  if (!btn) return btn;
  if (!_locks.some(function (l) { return l.btn === btn; })) _locks.push({ btn: btn, feature: feature });
  paintLock(btn, feature);
  return btn;
}
function paintLock(btn, feature) {
  var old = btn.querySelector(':scope > .pro-lock');
  if (old) old.remove();
  btn.classList.remove('has-pro-lock', 'pro-locked');
  if (!proLive()) return;
  var g = checkGate(feature);
  if (g.mode === 'open') return;
  var blocked = !g.allowed;
  var tag = createElement('span', { className: 'pro-lock' + (blocked ? '' : ' pro-lock-soft'), text: blocked ? '🔒 PRO' : '⚡ PRO', attributes: { 'aria-hidden': 'true' } });
  btn.classList.add('has-pro-lock');
  if (blocked) btn.classList.add('pro-locked');
  btn.appendChild(tag);
  btn.setAttribute('data-pro-feature', feature);
}
var STATIC_LOCKS = { '#examBtn': 'exam_sim', '#addCardBtn': 'custom_cards', '#flashcardsSheet [data-source="missed"]': 'missed_cards', '#cardBrowserBtn': 'browse_cards', '#myCardsBtn': 'my_cards', '#challengeSheet [data-mode="study"]': 'mode_study', '#challengeSheet [data-mode="weakness"]': 'mode_weakness' };
/** The fixed buttons that open Pro features, and any made since. */
export function markProLocks() {
  if (typeof document === 'undefined') return;
  Object.keys(STATIC_LOCKS).forEach(function (sel) { var b = document.querySelector(sel); if (b) applyProLock(b, STATIC_LOCKS[sel]); });
  _locks = _locks.filter(function (l) { return l.btn.isConnected; });
  _locks.forEach(function (l) { paintLock(l.btn, l.feature); });
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
  text.appendChild(createElement('span', { text: 'Go Pro for ' + moreCards(counts) + ' cards and every study tool.' }));
  box.appendChild(text);
  var btn = createElement('button', { className: 'btn btn-gold btn-sm', text: 'UNLOCK', attributes: { type: 'button' } });
  btn.addEventListener('click', function () { openPaywall({ trigger: trigger || 'library_banner', feature: 'card_library' }); });
  box.appendChild(btn);
  container.insertBefore(box, container.firstChild);
  return box;
}
