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

    // Header
    var header = createElement('div', { className: 'post-header' });
    header.appendChild(createElement('h2', { text: '📋 Case Review' }));
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
      var weakEl = createElement('div', { text: '🎯 Focus area: ' + weakest.subj + ' (' + weakest.ok + '/' + weakest.n + ' correct)' });
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

    // Action buttons
    var actionRow = createElement('div');
    actionRow.style.cssText = 'display:flex;gap:6px;margin:12px 0 0';

    var againBtn = createElement('button', { className: 'btn btn-green', text: '▶ Again', attributes: { id: 'playAgainBtn' } });
    againBtn.style.flex = '1';
    actionRow.appendChild(againBtn);

    var homeBtn = createElement('button', { className: 'btn btn-primary', text: '🏠 Home', attributes: { id: 'goHomeBtn' } });
    homeBtn.style.flex = '1';
    homeBtn.addEventListener('click', function () { self.show('screenHome'); });
    actionRow.appendChild(homeBtn);
    content.appendChild(actionRow);

    var secRow = createElement('div', { className: 'post-secondary' });
    secRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px';
    content.appendChild(secRow);

    if (missed.length > 0) {
      var weakBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '🎯 Weakness Mode', attributes: { id: 'weaknessBtn' } });
            secRow.appendChild(weakBtn);

      var qrBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '📝 Quick Review' });
            qrBtn.addEventListener('click', function () { self.showQuickReview(missed); });
      secRow.appendChild(qrBtn);
    }

    var shareBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '📤 Share Score' });
        shareBtn.addEventListener('click', function () { self.shareScore(game); });
    secRow.appendChild(shareBtn);

    // Review sections (collapsed by default so the screen stays short)
    // Missed cards
    if (missed.length > 0) {
      var missedBody = self._collapsible(content, '❌ Missed Cards (' + missed.length + ')', false);

      missed.forEach(function (r) {
        var c = r.card;
        var card = createElement('div', { className: 'review-card' });

        var h4 = createElement('h4');
        setText(h4, '❌ ' + c.bw.join(' • '));
        card.appendChild(h4);

        var tagRow = createElement('div');
        var wrongTag = createElement('span', { className: 'tag tag-wrong' });
        setText(wrongTag, 'You: ' + r.choice);
        tagRow.appendChild(wrongTag);
        var correctTag = createElement('span', { className: 'tag tag-correct' });
        setText(correctTag, '✓ ' + c.ans);
        tagRow.appendChild(correctTag);
        var subjTag = createElement('span', { className: 'tag tag-subject' });
        setText(subjTag, c.subj);
        tagRow.appendChild(subjTag);
        card.appendChild(tagRow);

        var tpEl = createElement('p');
        setText(tpEl, '📖 Rule: ' + c.tp);
        tpEl.style.marginTop = '5px';
        card.appendChild(tpEl);

        // Why wrong (safe text)
        var whyWrong = (c.ww && c.ww[r.choice]) || '';
        if (whyWrong) {
          var wwEl = createElement('p');
          setText(wwEl, 'Why "' + r.choice + '" is wrong: ' + whyWrong);
          wwEl.style.marginTop = '4px';
          card.appendChild(wwEl);
        }

        // Report button (replaces global window.UI_reportCard)
        var reportBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: '📋 Report Card Issue' });
        reportBtn.style.marginTop = '6px';
        reportBtn.addEventListener('click', function () {
          var reason = prompt('Why are you reporting this card?\n\nOptions:\n- incorrect info\n- ambiguous\n- poor distractor\n- outdated\n- other');
          if (reason) {
            var text = prompt('Additional details (optional):') || '';
            if (storage.addCardReport) {
              storage.addCardReport(c.id, reason, text);
            }
            // Also send to the server when the leaderboard/account is available.
            import('./leaderboard.js').then(function (mod) {
              if (mod.leaderboard.isAuthenticated()) mod.leaderboard.reportCard(c.id, reason, text);
            }).catch(function () { /* offline: the local report is still saved and exportable */ });
            alert('Card reported — thank you for helping improve the game!');
          }
        });
        card.appendChild(reportBtn);

        missedBody.appendChild(card);
      });
    } else if (total > 0) {
      content.appendChild(createElement('h3', { text: '🎉 Perfect Run!' }));
      content.lastChild.style.cssText = 'margin:14px 0 6px;color:var(--accent-green)';
    }

    // Correct answers (collapsible, showing ALL) [2]
    if (correctAll.length > 0) {
      var correctSection = createElement('div', { className: 'collapsible-section' });
      correctSection.style.margin = '14px 0 6px';

      var correctToggle = createElement('button', { className: 'collapsible-toggle' });
      setText(correctToggle, '✅ Correct Answers (' + correctAll.length + ') ');
      var correctArrow = createElement('span', { className: 'collapse-arrow', text: '▸' });
      correctToggle.appendChild(correctArrow);
      correctSection.appendChild(correctToggle);

      var correctBody = createElement('div');
      correctBody.style.display = 'none';

      correctAll.forEach(function (r) {
        var c = r.card;
        var card = createElement('div', { className: 'review-card' });
        card.style.borderLeftColor = 'var(--accent-green)';

        var h4 = createElement('h4');
        setText(h4, '✓ ' + c.bw.join(' • '));
        card.appendChild(h4);

        var tagRow = createElement('div');
        var ansTag = createElement('span', { className: 'tag tag-correct' });
        setText(ansTag, c.ans);
        tagRow.appendChild(ansTag);
        var subjTag = createElement('span', { className: 'tag tag-subject' });
        setText(subjTag, c.subj);
        tagRow.appendChild(subjTag);
        card.appendChild(tagRow);

        var tp = createElement('p');
        setText(tp, c.tp);
        tp.style.cssText = 'margin-top:4px;font-size:10px;color:var(--text-muted)';
        card.appendChild(tp);

        correctBody.appendChild(card);
      });

      correctSection.appendChild(correctBody);
      content.appendChild(correctSection);

      correctToggle.addEventListener('click', function () {
        var isOpen = correctBody.style.display !== 'none';
        correctBody.style.display = isOpen ? 'none' : 'block';
        correctArrow.classList.toggle('open', !isOpen);
      });
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
