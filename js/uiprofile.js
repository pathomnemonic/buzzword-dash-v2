/**
 * uiprofile.js — Stats, profile, calendar and quests screens.
 *
 * Split out of ui.js. These methods are attached to UI.prototype (see the end of ui.js), so
 * `this` is the UI controller and nothing about how they are called has changed.
 */

import { setText, createElement, clearElement } from './dom.js';
import { SUBJECTS, CARDS } from './cardhub.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { customCards } from './customcards.js';
import { QUESTS, ACHIEVEMENTS } from './game/shopdata.js';
import { localDateKey } from './uihelpers.js';

export var profileMethods = {

  renderStats() {
    var tc = storage.get('totalCorrect');
    var tw = storage.get('totalWrong');
    var te = storage.get('totalEncounters');
    var acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;
    var container = document.getElementById('statsContent');
    if (!container) return;
    clearElement(container);

    this._renderStudyPlan(container);

    // Summary stats
    var summaryRow = createElement('div', { className: 'post-stats' });
    [
      { val: te, label: 'Cards' },
      { val: tc, label: 'Correct', color: 'var(--accent-green)' },
      { val: tw, label: 'Wrong', color: 'var(--accent-red)' }
    ].forEach(function (s) {
      var stat = createElement('div', { className: 'post-stat' });
      var valEl = createElement('div', { className: 'val', text: String(s.val) });
      if (s.color) valEl.style.color = s.color;
      stat.appendChild(valEl);
      stat.appendChild(createElement('div', { className: 'label', text: s.label }));
      summaryRow.appendChild(stat);
    });
    container.appendChild(summaryRow);

    var row2 = createElement('div', { className: 'post-stats' });
    row2.style.gridTemplateColumns = '1fr 1fr';
    [
      { val: acc + '%', label: 'Accuracy' },
      { val: String(storage.get('bestScore')), label: 'Best Score' }
    ].forEach(function (s) {
      var stat = createElement('div', { className: 'post-stat' });
      stat.appendChild(createElement('div', { className: 'val', text: s.val }));
      stat.appendChild(createElement('div', { className: 'label', text: s.label }));
      row2.appendChild(stat);
    });
    container.appendChild(row2);

    // By Subject
    var subHeading = createElement('h3', { text: '📊 By Subject' });
    subHeading.style.cssText = 'margin:14px 0 6px;font-size:14px';
    container.appendChild(subHeading);

    var subjectBox = createElement('div');
    subjectBox.style.cssText = 'background:var(--bg-card);border-radius:10px;padding:10px';
    var hasSubjectData = false;

    SUBJECTS.forEach(function (s) {
      var ss = storage.getSubjectStat(s);
      var total = ss.correct + ss.wrong;
      if (total === 0) return;
      hasSubjectData = true;
      var a = Math.round(ss.correct / total * 100);
      var color = a >= 70 ? 'var(--accent-green)' : 'var(--accent-red)';
      var mastered = total >= 50 && a >= 80;

      var row = createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.03)';

      var nameEl = createElement('span', { text: s + (mastered ? ' ⭐' : '') });
      nameEl.style.fontSize = '12px';
      row.appendChild(nameEl);

      var accEl = createElement('span', { text: a + '% (' + total + ')' });
      accEl.style.cssText = 'font-size:12px;font-weight:700;color:' + color;
      row.appendChild(accEl);

      subjectBox.appendChild(row);
    });

    if (!hasSubjectData) {
      subjectBox.appendChild(createElement('p', { text: 'No data yet.' }));
      subjectBox.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted)';
    }
    container.appendChild(subjectBox);

    // Weakest Concepts
    var weakHeading = createElement('h3', { text: '🎯 Weakest Concepts' });
    weakHeading.style.cssText = 'margin:14px 0 6px;font-size:14px';
    container.appendChild(weakHeading);

    var allCards = CARDS.concat(customCards.getAll());
    var weakCards = allCards.map(function (c) {
      var s = storage.getCardStat(c.id);
      if (s.seen < 2) return null;
      return { card: c, accuracy: s.correct / s.seen, seen: s.seen };
    }).filter(function (x) { return x !== null; }).sort(function (a, b) { return a.accuracy - b.accuracy; }).slice(0, 5);

    var weakBox = createElement('div');
    weakBox.style.cssText = 'background:var(--bg-card);border-radius:10px;padding:10px';

    if (weakCards.length > 0) {
      weakCards.forEach(function (w) {
        var row = createElement('div', { className: 'weak-concept-item' });

        var info = createElement('span');
        var accSpan = createElement('span', { text: Math.round(w.accuracy * 100) + '%' });
        accSpan.style.cssText = 'color:var(--accent-red);font-weight:700';
        info.appendChild(accSpan);

        // Use setText for the answer (untrusted custom card content)
        var ansText = document.createTextNode(' — ');
        info.appendChild(ansText);
        var ansSpan = createElement('span');
        setText(ansSpan, w.card.ans);
        info.appendChild(ansSpan);

        var subjSpan = createElement('span');
        setText(subjSpan, ' (' + w.card.subj + ')');
        subjSpan.style.color = 'var(--text-muted)';
        info.appendChild(subjSpan);

        info.style.fontSize = '11px';
        row.appendChild(info);

        var arrow = createElement('span', { className: 'review-arrow', text: '→' });
        row.appendChild(arrow);

        // Tapping a weak concept opens a quick review of it (then the next weakest ones)
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-label', 'Review ' + w.card.ans);
        row.style.cursor = 'pointer';
        var openReview = function () {
          var ordered = [w].concat(weakCards.filter(function (x) { return x !== w; }));
          self.showQuickReview(ordered.map(function (x) { return { card: x.card }; }));
        };
        row.addEventListener('click', openReview);
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReview(); }
        });

        weakBox.appendChild(row);
      });
    } else {
      weakBox.appendChild(createElement('p', { text: 'Play more to see weak areas.' }));
      weakBox.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted)';
    }
    container.appendChild(weakBox);
  },

  renderProfile() {
    var container = document.getElementById('profileContent');
    if (!container) return;
    clearElement(container);
    var self = this;

    var profileName = storage.get('profileName') || '';
    var profilePicture = storage.get('profilePicture') || 'avatar_intern';
    var profileVisible = storage.get('profileVisible') || false;
    var selectedBadges = storage.get('selectedBadges') || [];
    var achievements = storage.get('achievements') || [];
    var totalCards = storage.get('totalCardsStudied') || 0;
    var totalCorrect = storage.get('totalCorrect') || 0;
    var totalWrong = storage.get('totalWrong') || 0;
    var bestScore = storage.get('bestScore') || 0;
    var bestStreak = storage.get('bestStreak') || 0;
    var totalPlayTime = storage.get('totalPlayTime') || 0;
    var dailyStreak = storage.get('dailyStreak') || 0;
    var totalAcc = (totalCorrect + totalWrong) > 0 ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0;
    var playTimeMin = Math.round(totalPlayTime / 60);

    // Avatar display
    var avatarSection = createElement('div', { className: 'profile-header' });
    var avatarEl = createElement('div', { className: 'profile-avatar', text: '👤' });
    avatarSection.appendChild(avatarEl);

    // Profile picture selector
    var picSelector = createElement('div', { className: 'profile-picture-selector' });
    var ownedSkins = storage.get('ownedItems').filter(function (id) {
      return id.indexOf('avatar_') === 0;
    });
    ownedSkins.forEach(function (skinId) {
      var opt = createElement('div', {
        className: 'profile-pic-option' + (profilePicture === skinId ? ' active' : ''),
        text: skinId === 'avatar_intern' ? '🩺' : skinId === 'avatar_attending' ? '👨‍⚕️' : skinId === 'avatar_superhero' ? '🦸' : skinId === 'avatar_robot' ? '🤖' : skinId === 'avatar_wizard' ? '🧙' : skinId === 'avatar_zombie' ? '🧟' : skinId === 'avatar_golden' ? '🏆' : skinId === 'avatar_ambulance' ? '🚑' : skinId === 'avatar_racecar' ? '🏎️' : skinId === 'avatar_hearse' ? '⚰️' : skinId === 'avatar_nurse' ? '👩‍⚕️' : skinId === 'avatar_surgeon' ? '🔪' : skinId === 'avatar_skeleton' ? '💀' : '👤'
      });
      opt.addEventListener('click', function () {
        storage.set('profilePicture', skinId);
        self.renderProfile();
      });
      picSelector.appendChild(opt);
    });
    avatarSection.appendChild(picSelector);

    // Name input
    var nameInput = createElement('input', {
      className: 'profile-name-input',
      attributes: { type: 'text', placeholder: 'Enter display name', value: profileName, maxlength: '30' }
    });
    avatarSection.appendChild(nameInput);
    container.appendChild(avatarSection);

    // Stats grid
    var statsGrid = createElement('div', { className: 'profile-stats-grid' });
    [
      { val: totalCards, label: 'Cards Studied' },
      { val: totalAcc + '%', label: 'Accuracy' },
      { val: bestScore, label: 'Best Score' },
      { val: '🔥 ' + bestStreak, label: 'Best Streak' },
      { val: playTimeMin + 'm', label: 'Play Time' },
      { val: '📅 ' + dailyStreak, label: 'Daily Streak' }
    ].forEach(function (s) {
      var stat = createElement('div', { className: 'profile-stat' });
      stat.appendChild(createElement('div', { className: 'val', text: String(s.val) }));
      stat.appendChild(createElement('div', { className: 'label', text: s.label }));
      statsGrid.appendChild(stat);
    });
    container.appendChild(statsGrid);

    // Badges: every badge, earned or not. Earned ones can be pinned to the profile (up to 6); the ones
    // earned since the profile was last open wear a red dot until the player leaves this screen.
    var newBadges = storage.getNewAchievementIds();
    var badgeSection = createElement('div', { className: 'profile-badges', attributes: { id: 'profileBadges' } });
    var heading = createElement('h4', { text: '🏆 Badges (' + achievements.length + '/' + ACHIEVEMENTS.length + ')' });
    badgeSection.appendChild(heading);
    badgeSection.appendChild(createElement('div', { className: 'setting-sublabel', text: 'Tap a badge you have earned to pin it to your profile (up to 6).' }));
    var badgeList = createElement('div', { className: 'profile-badge-list' });

    ACHIEVEMENTS.forEach(function (ach) {
      var earned = achievements.indexOf(ach.id) >= 0;
      var isNew = newBadges.indexOf(ach.id) >= 0;
      var pinned = selectedBadges.indexOf(ach.id) >= 0;
      var item = createElement('div', {
        className: 'achievement-item ' + (earned ? 'unlocked' : 'locked') + (pinned ? ' pinned' : '') + (isNew ? ' is-new' : ''),
        dataset: { badge: ach.id }
      });
      item.appendChild(createElement('div', { className: 'achievement-icon', text: earned ? ach.icon : '🔒' }));
      var info = createElement('div', { className: 'achievement-info' });
      info.appendChild(createElement('div', { className: 'achievement-name', text: ach.name }));
      info.appendChild(createElement('div', { className: 'achievement-desc', text: ach.desc }));
      item.appendChild(info);
      if (isNew) {
        var dot = createElement('span', { className: 'nav-dot', attributes: { 'aria-label': 'New badge' } });
        item.appendChild(dot);
      }
      if (earned) {
        var pin = createElement('div', { className: 'badge-pin', text: pinned ? '📌' : '' });
        item.appendChild(pin);
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-pressed', pinned ? 'true' : 'false');
        var toggle = function () {
          var badges = storage.get('selectedBadges') || [];
          var idx = badges.indexOf(ach.id);
          if (idx >= 0) {
            badges.splice(idx, 1);
          } else {
            if (badges.length >= 6) {
              self._showToast('You can pin up to 6 badges. Unpin one first.');
              return;
            }
            badges.push(ach.id);
          }
          storage.set('selectedBadges', badges);
          var on = badges.indexOf(ach.id) >= 0;
          item.classList.toggle('pinned', on);
          item.setAttribute('aria-pressed', on ? 'true' : 'false');
          pin.textContent = on ? '📌' : '';
        };
        item.addEventListener('click', toggle);
        item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      }
      badgeList.appendChild(item);
    });
    badgeSection.appendChild(badgeList);
    container.appendChild(badgeSection);

    // Visibility toggle
    var visRow = createElement('div', { className: 'setting-row' });
    visRow.style.marginTop = '14px';
    visRow.appendChild(createElement('div', { text: '👁 Profile Visible' }));
    visRow.firstChild.style.fontSize = '13px';
    var visToggle = createElement('div', { className: 'toggle' + (profileVisible ? ' on' : '') });
    visToggle.addEventListener('click', function () {
      var newVal = !storage.get('profileVisible');
      storage.set('profileVisible', newVal);
      visToggle.classList.toggle('on');
    });
    visRow.appendChild(visToggle);
    container.appendChild(visRow);

    // Save button
    var saveBtn = createElement('button', { className: 'btn btn-primary btn-block', text: '💾 Save Profile' });
    saveBtn.style.marginTop = '10px';
    saveBtn.addEventListener('click', function () {
      var name = nameInput.value.trim();
      storage.set('profileName', name);
      self._showToast('Profile saved!');
    });
    container.appendChild(saveBtn);
  },

  renderCalendar() {
    var grid = document.getElementById('calendarGrid');
    if (!grid) return;
    clearElement(grid);
    var calData = storage.get('calendarData') || {};
    var questDates = storage.get('questCompletionDates') || {};
    var today = new Date();
    var startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 27);

    // Alignment placeholders
    var startDayOfWeek = startDate.getDay();
    for (var p = 0; p < startDayOfWeek; p++) {
      var placeholder = createElement('div', { className: 'calendar-day' });
      placeholder.style.cssText = 'opacity:0;pointer-events:none';
      grid.appendChild(placeholder);
    }

    for (var i = 0; i < 28; i++) {
      var d = new Date(startDate);
      d.setDate(d.getDate() + i);
      var key = localDateKey(d);
      var day = createElement('div', { className: 'calendar-day' });

      if (Object.prototype.hasOwnProperty.call(calData, key)) {
        if (calData[key] >= 70) day.classList.add('played-great');
        else if (calData[key] >= 40) day.classList.add('played-ok');
        else day.classList.add('played-bad');
      }

      if (questDates[key]) {
        setText(day, '⭐');
        day.style.cssText = 'font-size:8px;display:flex;align-items:center;justify-content:center';
      }

      if (localDateKey(d) === localDateKey(today)) day.classList.add('today');
      grid.appendChild(day);
    }
  },

  renderQuests() {
    var container = document.getElementById('questList');
    if (!container) return;
    clearElement(container);
    var self = this;
    var today = localDateKey(new Date());
    var allComplete = true;

    QUESTS.forEach(function (q) {
      var progress = Math.min(storage.getQuestProgress(q.id), q.target);
      var pct = Math.round(progress / q.target * 100);
      var isComplete = progress >= q.target;
      if (!isComplete) allComplete = false;

      var questEl = createElement('div', { className: 'quest-item' });

      var titleEl = createElement('div', { className: 'quest-title', text: q.title + ': ' + q.desc });
      questEl.appendChild(titleEl);

      var barEl = createElement('div', { className: 'quest-bar' });
      var fillEl = createElement('div', { className: 'quest-fill' });
      fillEl.style.width = pct + '%';
      barEl.appendChild(fillEl);
      questEl.appendChild(barEl);

      var rewardEl = createElement('div', { className: 'quest-reward', text: progress + '/' + q.target + ' — 🪙 ' + q.reward });
      questEl.appendChild(rewardEl);

      // Quest claiming button (Section 14.6) [2]
      if (isComplete) {
        var claimed = storage.isQuestClaimed(q.id, today);

        if (!claimed) {
          var claimBtn = createElement('button', {
            className: 'btn btn-gold btn-sm',
            text: '🎁 Claim ' + q.reward + ' coins'
          });
          claimBtn.style.marginTop = '4px';
          claimBtn.addEventListener('click', function () {
            var claim = storage.claimQuest(q.id, today);
            if (claim.success) {
              audio.play('coin');
              self._showToast('🪙 +' + claim.reward + ' coins!');
            } else if (claim.alreadyClaimed) {
              self._showToast('Quest reward already claimed.');
            } else {
              self._showToast(claim.error || 'Could not claim reward.');
            }
            self.renderQuests();
            self.renderHome();
            document.dispatchEvent(new CustomEvent('dx:attention-changed'));
          });
          questEl.appendChild(claimBtn);
        } else {
          var claimedLabel = createElement('div', { text: '✅ Claimed' });
          claimedLabel.style.cssText = 'font-size:10px;color:var(--accent-green);margin-top:4px;font-weight:700';
          questEl.appendChild(claimedLabel);
        }
      }

      container.appendChild(questEl);
    });

    // Mark all quests complete for calendar
    if (allComplete && storage.markQuestsComplete) {
      storage.markQuestsComplete(today);
    }
  },
};
