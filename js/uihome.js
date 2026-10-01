/**
 * uihome.js — the Home popups (sheets): Challenge, Flashcards, Speed and Today.
 *
 * Home itself fits on one screen with no scrolling, so everything that is not the next tap lives in a
 * popup opened from it. These methods are attached to UI.prototype (see the end of ui.js).
 */

import { createElement, clearElement, setText } from './dom.js';
import { storage } from './storage.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';

export var SHEETS = ['challengeSheet', 'flashcardsSheet', 'filtersSheet', 'speedSheet', 'todaySheet'];

export var homeMethods = {

  /** Wire the buttons on Home that open a popup, and the buttons inside the popups. */
  bindHomeSheets() {
    var self = this;
    var challengeBtn = document.getElementById('homeChallengeBtn');
    if (challengeBtn) challengeBtn.addEventListener('click', function () { self.openSheet('challengeSheet'); });
    var flashcardsBtn = document.getElementById('homeFlashcardsBtn');
    if (flashcardsBtn) flashcardsBtn.addEventListener('click', function () { self.openSheet('flashcardsSheet'); });
    var filtersBtn = document.getElementById('filtersBtn');
    if (filtersBtn) filtersBtn.addEventListener('click', function () { self.openSheet('filtersSheet'); });
    var speedBtn = document.getElementById('speedBtn');
    if (speedBtn) speedBtn.addEventListener('click', function () { self.openSheet('speedSheet'); });
    // Anything changed in the filters (a subject chip, an exam, a toggle) refreshes the summary on Home
    var filtersSheet = document.getElementById('filtersSheet');
    if (filtersSheet) filtersSheet.addEventListener('click', function () { setTimeout(function () { self._renderFiltersSummary(); }, 0); });
    var goalBtn = document.getElementById('studyGoal');
    if (goalBtn) goalBtn.addEventListener('click', function () { self.openSheet('todaySheet'); });

    SHEETS.forEach(function (id) {
      var sheet = document.getElementById(id);
      if (!sheet) return;
      // tapping the dim area outside the card closes it; so does the Close button
      sheet.addEventListener('click', function (e) { if (e.target === sheet) self.closeSheets(); });
      sheet.querySelectorAll('.sheet-close').forEach(function (b) { b.addEventListener('click', function () { self.closeSheets(); }); });
    });

    // Challenge: choosing a mode closes the popup (main.js starts the run from the same buttons)
    var challenge = document.getElementById('challengeSheet');
    if (challenge) challenge.querySelectorAll('.sheet-entry').forEach(function (b) {
      b.addEventListener('click', function () { self.closeSheets(); });
    });

    // Flashcards: choosing which cards leads to the picker (flip or listen)
    var fc = document.getElementById('flashcardsSheet');
    if (fc) fc.querySelectorAll('.sheet-entry').forEach(function (b) {
      b.addEventListener('click', function () {
        self.closeSheets();
        var source = b.getAttribute('data-source');
        if (!source) return; // Browse cards and My cards open their own screens
        var pick = self._fcPick || (self._fcPick = { source: 'mine', subjects: [], count: 20 });
        pick.source = source;
        self.show('screenFlashcard');
      });
    });
  },

  openSheet(id) {
    this.closeSheets();
    var sheet = document.getElementById(id);
    if (!sheet) return;
    if (id === 'flashcardsSheet') this._renderFlashcardsSheet();
    if (id === 'todaySheet') this._renderToday(document.getElementById('todayContent'));
    sheet.classList.add('active');
    trapFocus(sheet);
    document.dispatchEvent(new CustomEvent('dx:attention-changed'));
  },

  /** Close any open Home popup. Returns true when one was open. */
  closeSheets() {
    var was = false;
    SHEETS.forEach(function (id) {
      var sheet = document.getElementById(id);
      if (sheet && sheet.classList.contains('active')) { sheet.classList.remove('active'); was = true; }
    });
    if (was) { releaseFocusTrap(); document.dispatchEvent(new CustomEvent('dx:attention-changed')); }
    return was;
  },

  /** Real counts in the Flashcards popup, so each entry says what is waiting. */
  _renderFlashcardsSheet() {
    var p = this._pickerPools();
    var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
    var set = function (id, text) { var el = document.getElementById(id); if (el) setText(el, text); };
    set('fcDueText', p.due.length ? plural(p.due.length, 'card is', 'cards are') + ' ready to see again, most overdue first.' : 'Nothing is due yet. Cards come back here after you study them.');
    set('fcMissedText', p.missed.length ? plural(p.missed.length, 'card', 'cards') + ' you get wrong the most.' : 'Cards you get wrong will collect here.');
    set('fcFreshText', p.fresh.length ? plural(p.fresh.length, 'card', 'cards') + ' in your subjects you have not seen yet.' : 'You have seen every card in your subjects.');
  },

  /** The compact goal strip on Home: today's progress and the streak, one tap from the full picture. */
  renderStudyGoal() {
    var el = document.getElementById('studyGoal');
    if (!el) return;
    clearElement(el);
    var goal = storage.get('dailyGoal') || 20;
    var done = storage.getStudiedToday();
    var pct = Math.min(100, Math.round(done / goal * 100));
    var streak = storage.getStreakStatus();
    var text = '🎯 Today ' + done + '/' + goal + (done >= goal ? ' ✅' : '') + (streak.streak > 0 ? '  ·  🔥 ' + streak.streak : '');
    var due = storage.getDueCount();
    if (due > 0) text += '  ·  🔁 ' + due + ' due';
    el.appendChild(createElement('div', { text: text }));
    var bar = createElement('div', {
      className: 'study-goal-bar',
      attributes: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.min(done, goal)), 'aria-label': 'Daily study goal' }
    });
    var fill = createElement('div', { className: 'study-goal-fill' });
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    el.appendChild(bar);
    el.setAttribute('aria-label', 'Today: ' + done + ' of ' + goal + ' cards. Open details.');
  },

  /** The full Today picture: goal, reviews, streak and the weekly reward. */
  _renderToday(el) {
    if (!el) return;
    var self = this;
    clearElement(el);
    var line = function (text) { el.appendChild(createElement('div', { className: 'today-line', text: text })); };
    var goal = storage.get('dailyGoal') || 20;
    var done = storage.getStudiedToday();
    line('🎯 ' + done + ' of ' + goal + ' cards today' + (done >= goal ? ' ✅' : ''));
    var due = storage.getDueCount();
    line(due > 0 ? '🔁 ' + due + ' card' + (due === 1 ? '' : 's') + ' due for review (Flashcards → Review due cards)' : '🔁 No reviews due');
    var streak = storage.getStreakStatus();
    line('🔥 Daily streak: ' + streak.streak + (streak.shields > 0 ? '  ·  🛡 ' + streak.shields + ' shield' + (streak.shields === 1 ? '' : 's') : ''));
    var week = storage.getWeeklyProgress();
    line('📆 This week: ' + week.daysMet + '/' + week.target + ' goal days' + (week.claimed ? ' ✅' : ''));
    if (week.daysMet >= week.target && !week.claimed) {
      var claim = createElement('button', { className: 'btn btn-gold btn-sm', text: '🎁 Claim ' + week.reward + ' coins', attributes: { type: 'button', id: 'claimWeeklyBtn' } });
      claim.addEventListener('click', function () {
        var res = storage.claimWeeklyGoal();
        self._showToast(res.success ? '🪙 +' + res.reward + ' coins for hitting your weekly goal!' : res.error);
        self.renderHome();
        self._renderToday(el);
      });
      el.appendChild(claim);
    }
  }
};
