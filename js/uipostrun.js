/**
 * uipostrun.js — Post-run summary and quick review screens.
 *
 * Split out of ui.js. These methods are attached to UI.prototype (see the end of ui.js), so
 * `this` is the UI controller and nothing about how they are called has changed.
 */

import { setText, createElement, clearElement } from './dom.js';
import { storage } from './storage.js';
import { describeRules } from './rules.js';
import { runVerdict } from './flavor.js';
import { localDateKey, trapFocus, releaseFocusTrap } from './uihelpers.js';

export var postRunMethods = {

  showPostRun(game) {
    var self = this;
    var total = game.correct + game.wrong;
    var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
    var missed = game.runCards.filter(function (r) { return !r.ok; });
    var correctAll = game.runCards.filter(function (r) { return r.ok; });

    var content = document.getElementById('postRunContent');
    clearElement(content);

    // Two small buttons, one in each top corner: share the score as text (left), save it as an image (right,
    // added by main.js into #postImageSlot)
    var corners = createElement('div', { className: 'post-corners' });
    var shareBtn = createElement('button', { className: 'btn btn-outline btn-sm post-corner-btn', text: '📤 Share', attributes: { type: 'button', id: 'shareScoreBtn', 'aria-label': 'Share your score' } });
    shareBtn.addEventListener('click', function () { self.shareScore(game); });
    corners.appendChild(shareBtn);
    corners.appendChild(createElement('span', { attributes: { id: 'postImageSlot' } }));
    content.appendChild(corners);

    // Header
    var header = createElement('div', { className: 'post-header' });
    header.appendChild(createElement('h2', { className: 'post-title', text: '📋 Case Review' }));
    var scoreBig = createElement('div', { className: 'score-big', text: String(game.score) });
    header.appendChild(scoreBig);
    var verdict = createElement('p', { className: 'post-verdict', text: runVerdict(game.correct, game.wrong) });
    verdict.style.cssText = 'color:var(--accent-cyan);font-weight:800;font-size:14px;margin:2px 0';
    header.appendChild(verdict);
    var skinInfo = game.currentSkin ? ' • Track: ' + game.currentSkin.name : '';
    var runSummary = game.getRunSummary ? game.getRunSummary() : null;
    var customNote = runSummary && runSummary.custom ? ' • Custom rules: ' + describeRules(runSummary.rules && Object.assign({ custom: true }, runSummary.rules)) + ' (not ranked)' : '';
    var metaP = createElement('p', { text: 'Speed: ' + game.userSpeed + '×' + skinInfo + (game.continued ? ' (continued)' : '') + customNote });
    metaP.style.cssText = 'color:var(--text-muted);font-size:12px';
    header.appendChild(metaP);
    content.appendChild(header);

    // Weakest subject this run (needs a few encounters to be meaningful)
    var bySubject = {};
    game.runCards.forEach(function (r) {
      var subj = r.card && r.card.subj;
      if (!subj) return;
      bySubject[subj] = bySubject[subj] || { n: 0, ok: 0 };
      bySubject[subj].n++;
      if (r.ok) bySubject[subj].ok++;
    });
    var weakest = null;
    Object.keys(bySubject).forEach(function (subj) {
      var st = bySubject[subj];
      if (st.n < 2 || st.ok === st.n) return;
      var a = st.ok / st.n;
      if (!weakest || a < weakest.acc) weakest = { subj: subj, acc: a, n: st.n, ok: st.ok };
    });
    if (weakest) {
      var weakEl = createElement('div', { className: 'focus-area', text: '🎯 Focus area: ' + weakest.subj + ' (' + weakest.ok + '/' + weakest.n + ' correct)' });
      weakEl.style.cssText = 'text-align:center;font-size:12px;font-weight:700;color:var(--accent-gold);margin:6px 0';
      content.appendChild(weakEl);
    }

    // Golden doctor notice
    if (game.wrong === 0 && game.correct >= 20 && storage.hasAchievement('ach_golden_doctor')) {
      var goldenNotice = createElement('div');
      goldenNotice.style.cssText = 'text-align:center;padding:12px;margin:10px 0;background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,170,0,0.1));border:2px solid var(--accent-gold);border-radius:12px';
      goldenNotice.appendChild(createElement('div', { text: '🏆' }));
      goldenNotice.firstChild.style.fontSize = '24px';
      var goldenText = createElement('div', { text: 'Golden Doctor Unlocked!' });
      goldenText.style.cssText = 'font-size:14px;font-weight:800;color:var(--accent-gold)';
      goldenNotice.appendChild(goldenText);
      goldenNotice.appendChild(createElement('div', { text: 'Perfect run with 20+ correct! Check the Locker.' }));
      goldenNotice.lastChild.style.cssText = 'font-size:11px;color:var(--text-secondary)';
      content.appendChild(goldenNotice);
    }

    // Stats (one compact row)
    var statsRow = createElement('div', { className: 'post-stats' });
    statsRow.style.gridTemplateColumns = 'repeat(5, 1fr)';
    [
      { val: acc + '%', label: 'Accuracy', color: 'var(--accent-green)' },
      { val: game.correct, label: 'Correct', color: 'var(--accent-green)' },
      { val: game.wrong, label: 'Wrong', color: 'var(--accent-red)' },
      { val: '🪙 ' + game.coins, label: 'Coins', color: 'var(--accent-gold)' },
      { val: '🔥 ' + game.bestStreak, label: 'Streak' }
    ].forEach(function (st) {
      var stat = createElement('div', { className: 'post-stat' });
      var valEl = createElement('div', { className: 'val', text: String(st.val) });
      if (st.color) valEl.style.color = st.color;
      stat.appendChild(valEl);
      stat.appendChild(createElement('div', { className: 'label', text: st.label }));
      statsRow.appendChild(stat);
    });
    content.appendChild(statsRow);

    // The review: two big buttons under the numbers. Each opens the cards in a full-screen pop-up, so the page
    // itself stays one calm screen (nothing is expanded until the player asks)
    var review = createElement('div', { className: 'post-review' });
    var tabs = createElement('div', { className: 'post-review-tabs', attributes: { 'aria-label': 'Review your answers' } });
    function addOpen(key, icon, label, count, tone) {
      var b = createElement('button', { className: 'post-review-tab post-review-open ' + tone, attributes: { type: 'button', 'data-tab': key, 'aria-haspopup': 'dialog', 'aria-label': label + ': ' + count + '. Open to review in full screen.' } });
      b.appendChild(createElement('span', { className: 'post-review-count', text: String(count) }));
      b.appendChild(createElement('span', { className: 'post-review-label', text: icon + ' ' + label }));
      b.appendChild(createElement('span', { className: 'post-review-cta', text: count ? 'Tap to review ›' : (key === 'missed' ? 'Perfect!' : 'None yet') }));
      b.addEventListener('click', function () { self.openReviewPopup(key, missed, correctAll, total); });
      tabs.appendChild(b);
    }
    addOpen('missed', '❌', 'Missed', missed.length, 'is-missed');
    addOpen('correct', '✅', 'Correct', correctAll.length, 'is-correct');
    review.appendChild(tabs);
    content.appendChild(review);

    // Actions: the two main ones, and the follow-ups beside them
    var actionRow = createElement('div', { className: 'post-actions' });
    // Playing again is the big, obvious button; Home is small and quiet, and the filters can be changed right here
    var FIXED_CARDS = ['daily', 'challenge', 'tournament', 'versus', 'mp_highscore', 'mp_suddendeath', 'mp_race', 'exam'];
    if (FIXED_CARDS.indexOf(game.mode) < 0) {
      var filtersBtn = createElement('button', { className: 'btn btn-outline btn-sm post-small-btn', text: '🎚 Filters', attributes: { id: 'postFiltersBtn', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'filtersSheet' } });
      filtersBtn.addEventListener('click', function () { self.openSheet('filtersSheet'); });
      actionRow.appendChild(filtersBtn);
    } else {
      actionRow.classList.add('no-filters');
    }
    var againBtn = createElement('button', { className: 'btn btn-green post-again', text: '▶ Play again', attributes: { id: 'playAgainBtn' } });
    actionRow.appendChild(againBtn);
    var homeBtn = createElement('button', { className: 'btn btn-outline btn-sm post-small-btn', text: '🏠 Home', attributes: { id: 'goHomeBtn' } });
    homeBtn.addEventListener('click', function () { self.show('screenHome'); });
    actionRow.appendChild(homeBtn);
    content.appendChild(actionRow);

    if (missed.length > 0) {
      var secRow = createElement('div', { className: 'post-secondary' });
      var weakBtn = createElement('button', { className: 'btn btn-outline btn-sm btn-block', text: '🎯 Weakness', attributes: { id: 'weaknessBtn' } });
      secRow.appendChild(weakBtn);
      var qrBtn = createElement('button', { className: 'btn btn-outline btn-sm btn-block', text: '📝 Quick Review' });
      qrBtn.addEventListener('click', function () { self.showQuickReview(missed); });
      secRow.appendChild(qrBtn);
      content.appendChild(secRow);
    }

    this.show('screenPostRun');
    this._animateNumbers(content);

    // Speed timer cleanup
    var timerEl = document.getElementById('hudSpeedTimer');
    if (timerEl) timerEl.style.display = 'none';

    // Confetti on new best
    if (game.isNewBest) this.showConfetti();

    // Calendar update
    if (total > 0) {
      var calData = storage.get('calendarData') || {};
      var todayKey = localDateKey(new Date());
      calData[todayKey] = Math.round(game.correct / total * 100);
      storage.set('calendarData', calData);
    }

    this.updateRushVignette(0);
  },

  /** One card of the review: what was asked, what the player chose, the right answer, and why. */
  _reviewCard(r, ok) {
    var c = r.card;
    var card = createElement('div', { className: 'review-card' });
    if (ok) card.style.borderLeftColor = 'var(--accent-green)';
    var h4 = createElement('h4');
    setText(h4, (ok ? '✓ ' : '❌ ') + c.bw.join(' • '));
    card.appendChild(h4);
    var tagRow = createElement('div');
    if (!ok) {
      var wrongTag = createElement('span', { className: 'tag tag-wrong' });
      setText(wrongTag, 'You: ' + r.choice);
      tagRow.appendChild(wrongTag);
    }
    var ansTag = createElement('span', { className: 'tag tag-correct' });
    setText(ansTag, (ok ? '' : '✓ ') + c.ans);
    tagRow.appendChild(ansTag);
    var subjTag = createElement('span', { className: 'tag tag-subject' });
    setText(subjTag, c.subj);
    tagRow.appendChild(subjTag);
    card.appendChild(tagRow);
    var tpEl = createElement('p');
    setText(tpEl, ok ? c.tp : '📖 Rule: ' + c.tp);
    tpEl.style.marginTop = '5px';
    if (ok) tpEl.style.cssText = 'margin-top:4px;font-size:11px;color:var(--text-muted)';
    card.appendChild(tpEl);
    if (!ok) {
      var whyWrong = (c.ww && c.ww[r.choice]) || '';
      if (whyWrong) {
        var wwEl = createElement('p');
        setText(wwEl, 'Why "' + r.choice + '" is wrong: ' + whyWrong);
        wwEl.style.marginTop = '4px';
        card.appendChild(wwEl);
      }
      // A small flag in the corner of the card, so reports stay rare and deliberate
      var reportBtn = createElement('button', { className: 'review-flag', text: '🚩', attributes: { type: 'button', 'aria-label': 'Report a problem with this card', title: 'Report a problem with this card' } });
      reportBtn.addEventListener('click', function () {
        var reason = prompt('Why are you reporting this card?\n\nOptions:\n- incorrect info\n- ambiguous\n- poor distractor\n- outdated\n- other');
        if (reason) {
          var text = prompt('Additional details (optional):') || '';
          if (storage.addCardReport) storage.addCardReport(c.id, reason, text);
          // Also send to the server when the leaderboard/account is available.
          import('./leaderboard.js').then(function (mod) {
            if (mod.leaderboard.isAuthenticated()) mod.leaderboard.reportCard(c.id, reason, text);
          }).catch(function () { /* offline: the local report is still saved and exportable */ });
          alert('Card reported — thank you for helping improve the game!');
        }
      });
      card.appendChild(reportBtn);
    }
    return card;
  },

  /**
   * The full-screen review: the missed cards and the correct cards, a tab each, one list that scrolls.
   * @param {string} start 'missed' or 'correct'
   */
  openReviewPopup(start, missed, correctAll, total) {
    var self = this;
    var overlay = document.getElementById('reviewOverlay');
    if (!overlay) return;
    var tabs = document.getElementById('reviewFullTabs');
    var list = document.getElementById('reviewFullList');
    var title = document.getElementById('reviewFullTitle');
    var closeBtn = document.getElementById('reviewFullClose');
    var opener = document.activeElement;
    clearElement(tabs);
    var tabBtns = {};
    function addTab(key, icon, label, count, tone) {
      var b = createElement('button', { className: 'post-review-tab ' + tone, attributes: { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': key } });
      b.appendChild(createElement('span', { className: 'post-review-count', text: String(count) }));
      b.appendChild(createElement('span', { className: 'post-review-label', text: icon + ' ' + label }));
      b.addEventListener('click', function () { select(key); });
      tabs.appendChild(b);
      tabBtns[key] = b;
    }
    addTab('missed', '❌', 'Missed', missed.length, 'is-missed');
    addTab('correct', '✅', 'Correct', correctAll.length, 'is-correct');
    function select(key) {
      Object.keys(tabBtns).forEach(function (k) {
        var on = k === key;
        tabBtns[k].classList.toggle('active', on);
        tabBtns[k].setAttribute('aria-selected', on ? 'true' : 'false');
      });
      setText(title, key === 'missed' ? 'Questions you missed' : 'Questions you got right');
      clearElement(list);
      var rows = key === 'missed' ? missed : correctAll;
      if (!rows.length) {
        list.appendChild(createElement('div', { className: 'post-review-empty', text: key === 'missed' ? (total > 0 ? '🎉 Nothing missed. A perfect run!' : 'No answers this run.') : 'No correct answers this run.' }));
      } else {
        rows.forEach(function (r) { list.appendChild(self._reviewCard(r, key === 'correct')); });
      }
      list.scrollTop = 0;
    }
    function close() {
      overlay.classList.remove('active');
      releaseFocusTrap();
      if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* the button may be gone */ } }
    }
    closeBtn.onclick = close;
    select(start === 'correct' ? 'correct' : 'missed');
    overlay.classList.add('active');
    trapFocus(overlay);
    closeBtn.focus();
  },

  showQuickReview(missedCards) {
    if (!missedCards || missedCards.length === 0) return;
    var overlay = document.getElementById('quickReviewOverlay');
    if (!overlay) return;
    var idx = 0;
    var cards = missedCards;

    function showCard() {
      setText(document.getElementById('qrCounter'), (idx + 1) + ' / ' + cards.length);
      setText(document.getElementById('qrBuzzwords'), cards[idx].card.bw.join(' • '));
      setText(document.getElementById('qrAnswer'), '✓ ' + cards[idx].card.ans);
      setText(document.getElementById('qrTeaching'), cards[idx].card.tp);
      var qrDivider = document.getElementById('qrDivider');
      if (qrDivider) qrDivider.style.display = 'none';
      var qrReveal = document.getElementById('qrRevealBtn');
      if (qrReveal) qrReveal.style.display = 'inline-flex';
      var qrNext = document.getElementById('qrNextBtn');
      if (qrNext) qrNext.style.display = 'none';
    }

    overlay.classList.add('active');
    trapFocus(overlay);
    showCard();

    var revealBtn = document.getElementById('qrRevealBtn');
    var nextBtn = document.getElementById('qrNextBtn');
    var closeBtn = document.getElementById('qrCloseBtn');

    if (revealBtn) {
      revealBtn.onclick = function () {
        var qrDivider = document.getElementById('qrDivider');
        if (qrDivider) qrDivider.style.display = 'block';
        revealBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'inline-flex';
      };
    }
    if (nextBtn) {
      nextBtn.onclick = function () {
        idx++;
        if (idx >= cards.length) { overlay.classList.remove('active'); releaseFocusTrap(); }
        else { showCard(); }
      };
    }
    if (closeBtn) {
      closeBtn.onclick = function () { overlay.classList.remove('active'); releaseFocusTrap(); };
    }
  },
};
