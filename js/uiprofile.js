/**
 * uiprofile.js — Stats, profile, calendar and quests screens.
 *
 * Split out of ui.js. These methods are attached to UI.prototype (see the end of ui.js), so
 * `this` is the UI controller and nothing about how they are called has changed.
 */

import { ICON_GROUPS, iconFor, iconId, heroPictureId, parseHeroPicture, fillProfilePicture, portraitUrl } from './profileicons.js';
import { CHARACTER_MODELS } from './game/modelcatalog.js';
import { setText, createElement, clearElement } from './dom.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { renderPerformance } from './statsview.js';
import { ACHIEVEMENTS, questGoTarget } from './game/shopdata.js';
import { localDateKey } from './uihelpers.js';

export var profileMethods = {

  renderStats() {
    var container = document.getElementById('statsContent');
    if (!container) return;
    clearElement(container);
    renderPerformance(container, this);
  },

  /** Keep the picture chooser open after it redraws (so picking a hero or switching face/whole hero does not close it). */
  _reopenPicBox() {
    var box = document.querySelector('.profile-pic-box');
    if (box) box.open = true;
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
    var avatarEl = createElement('div', { className: 'profile-avatar' });
    fillProfilePicture(avatarEl, profilePicture);
    avatarSection.appendChild(avatarEl);

    // Name input
    var nameInput = createElement('input', {
      className: 'profile-name-input',
      attributes: { type: 'text', placeholder: 'Enter display name', 'aria-label': 'Display name', value: profileName, maxlength: '30' }
    });
    avatarSection.appendChild(nameInput);
    // Profile picture: any symbol from the groups below
    var picBox = createElement('details', { className: 'profile-pic-box' });
    picBox.appendChild(createElement('summary', { text: '✏️ Change symbol' }));
    avatarSection.appendChild(picBox);
    var current = iconFor(profilePicture);
    var currentHero = parseHeroPicture(profilePicture);

    // Your heroes: the face or the whole figure of any hero you own (small pictures that come with the app)
    var owned = CHARACTER_MODELS.filter(function (m) { return storage.ownsItem(m.id); });
    if (owned.length) {
      var style = self._picStyle || (currentHero ? currentHero.style : 'face');
      picBox.appendChild(createElement('div', { className: 'profile-pic-group', text: 'Your heroes' }));
      var styleRow = createElement('div', { className: 'pp-style', attributes: { role: 'group', 'aria-label': 'Face or whole figure' } });
      [['face', 'Face'], ['body', 'Whole hero']].forEach(function (st) {
        var b = createElement('button', {
          className: 'btn btn-sm ' + (style === st[0] ? 'btn-primary' : 'btn-outline'),
          text: st[1],
          attributes: { type: 'button', 'aria-pressed': style === st[0] ? 'true' : 'false' }
        });
        b.addEventListener('click', function () { self._picStyle = st[0]; picBox.open = true; self.renderProfile(); self._reopenPicBox(); });
        styleRow.appendChild(b);
      });
      picBox.appendChild(styleRow);
      var heroSel = createElement('div', { className: 'profile-picture-selector pp-heroes', attributes: { role: 'group', 'aria-label': 'Hero pictures' } });
      owned.forEach(function (m) {
        var active = !!currentHero && currentHero.id === m.id && currentHero.style === style;
        var opt = createElement('button', {
          className: 'profile-pic-option pp-hero' + (active ? ' active' : ''),
          attributes: { type: 'button', 'aria-label': 'Use ' + m.name + ' (' + style + ')', 'aria-pressed': active ? 'true' : 'false', title: m.name, 'data-hero': m.id }
        });
        var img = createElement('img', { attributes: { src: portraitUrl(m.id, style), alt: '', loading: 'lazy', decoding: 'async' } });
        img.className = 'pp-img ' + style;
        img.addEventListener('error', function () { img.remove(); opt.textContent = m.icon || '👤'; });
        opt.appendChild(img);
        opt.addEventListener('click', function () {
          storage.set('profilePicture', heroPictureId(m.id, style));
          self.renderProfile();
          self._reopenPicBox();
          document.dispatchEvent(new CustomEvent('dx:profile-changed'));
        });
        heroSel.appendChild(opt);
      });
      picBox.appendChild(heroSel);
      picBox.appendChild(createElement('div', { className: 'profile-pic-group', text: 'Symbols' }));
    }
    ICON_GROUPS.forEach(function (group) {
      picBox.appendChild(createElement('div', { className: 'profile-pic-group', text: group.name }));
      var picSelector = createElement('div', { className: 'profile-picture-selector', attributes: { role: 'group', 'aria-label': group.name + ' symbols' } });
      group.icons.forEach(function (symbol) {
        var opt = createElement('button', {
          className: 'profile-pic-option' + (current === symbol ? ' active' : ''),
          text: symbol,
          attributes: { type: 'button', 'aria-label': 'Use ' + symbol, 'aria-pressed': current === symbol ? 'true' : 'false' }
        });
        opt.addEventListener('click', function () {
          storage.set('profilePicture', iconId(symbol));
          self.renderProfile();
          document.dispatchEvent(new CustomEvent('dx:profile-changed'));
        });
        picSelector.appendChild(opt);
      });
      picBox.appendChild(picSelector);
    });

    container.appendChild(avatarSection);

    // Account: sign up, sign in, sign out (filled in by main.js once the account service is ready)
    var accountSection = createElement('div', { className: 'profile-account', attributes: { id: 'profileAccount' } });
    container.appendChild(accountSection);

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
    saveBtn.style.margin = '10px 0 14px';
    saveBtn.addEventListener('click', function () {
      var name = nameInput.value.trim();
      storage.set('profileName', name);
      self._showToast('Profile saved!');
    });
    container.appendChild(saveBtn);

    // Badges: every badge, earned or not. Earned ones can be pinned to the profile (up to 6); the ones
    // earned since the profile was last open wear a red dot until the player leaves this screen.
    // Study streak calendar, just above the badges
    var calendar = createElement('div', { className: 'streak-calendar', attributes: { id: 'streakCalendar' } });
    calendar.appendChild(createElement('h4', { text: '📅 Study Streak' }));
    var dayLabels = createElement('div', { className: 'calendar-day-labels', attributes: { 'aria-hidden': 'true' } });
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (d) { dayLabels.appendChild(createElement('span', { text: d })); });
    calendar.appendChild(dayLabels);
    calendar.appendChild(createElement('div', { className: 'calendar-grid', attributes: { id: 'calendarGrid', role: 'img', 'aria-label': 'Study streak calendar' } }));
    container.appendChild(calendar);

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

    this.renderCalendar();
    document.dispatchEvent(new CustomEvent('dx:profile-opened')); // main.js fills the account section
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

    var todays = storage.getDailyQuests();
    var doneCount = todays.filter(function (q) { return storage.getQuestProgress(q.id) >= q.target; }).length;
    container.appendChild(createElement('p', {
      className: 'quest-intro',
      text: 'A fresh set every day \u00B7 ' + doneCount + ' of ' + todays.length + ' done. Finish them all for a gold calendar day.'
    }));
    var CATEGORY_ICON = { accuracy: '\uD83C\uDFAF', volume: '\uD83D\uDCDA', skill: '\uD83C\uDFC3', explore: '\uD83E\uDDED', mode: '\uD83C\uDFAE', speed: '\u26A1' };

    todays.forEach(function (q) {
      var progress = Math.min(storage.getQuestProgress(q.id), q.target);
      var pct = Math.round(progress / q.target * 100);
      var isComplete = progress >= q.target;
      if (!isComplete) allComplete = false;

      var questEl = createElement('div', { className: 'quest-item' });

      var titleEl = createElement('div', { className: 'quest-title', text: (CATEGORY_ICON[q.category] || '') + ' ' + q.title + ': ' + q.desc });
      questEl.appendChild(titleEl);

      var barEl = createElement('div', { className: 'quest-bar' });
      var fillEl = createElement('div', { className: 'quest-fill' });
      fillEl.style.width = pct + '%';
      barEl.appendChild(fillEl);
      questEl.appendChild(barEl);

      var rewardEl = createElement('div', { className: 'quest-reward', text: progress + '/' + q.target + ' — 🪙 ' + q.reward });
      questEl.appendChild(rewardEl);

      // A way in: start the kind of run this quest needs
      if (!isComplete) {
        var goBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Go \u203A', attributes: { type: 'button', 'aria-label': 'Start: ' + q.title } });
        goBtn.style.marginTop = '4px';
        goBtn.addEventListener('click', function () {
          document.dispatchEvent(new CustomEvent('dx:start-quest', { detail: { target: questGoTarget(q) } }));
        });
        questEl.appendChild(goBtn);
      }

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
