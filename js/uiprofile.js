/**
 * uiprofile.js — Stats, profile, calendar and quests screens.
 *
 * Split out of ui.js. These methods are attached to UI.prototype (see the end of ui.js), so
 * `this` is the UI controller and nothing about how they are called has changed.
 */

import { ICON_GROUPS, iconFor, iconId, heroPictureId, parseHeroPicture, fillProfilePicture, portraitUrl } from './profileicons.js';
import { CHARACTER_MODELS } from './game/modelcatalog.js';
import { createElement, clearElement } from './dom.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { renderPerformance } from './statsview.js';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, ACHIEVEMENT_GROUPS, QUESTS } from './game/shopdata.js';
import { localDateKey } from './uihelpers.js';
import { renderStreakCalendar } from './streakcalendar.js';
import { renderLevelChip } from './rewardsui.js';
import { levelFromXp, rankForLevel } from './progress.js';

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
    var topRow = createElement('div', { className: 'profile-top' });
    var avatarEl = createElement('div', { className: 'profile-avatar' });
    fillProfilePicture(avatarEl, profilePicture);
    topRow.appendChild(avatarEl);

    // Name input
    var nameInput = createElement('input', {
      className: 'profile-name-input',
      attributes: { type: 'text', placeholder: 'Enter display name', 'aria-label': 'Display name', value: profileName, maxlength: '30' }
    });
    // name, and under it the level and rank (these used to sit on Home)
    var nameCol = createElement('div', { className: 'profile-top-fields' });
    nameCol.appendChild(nameInput);
    var levelRow = createElement('div', { className: 'profile-level', attributes: { id: 'profileLevel' } });
    renderLevelChip(levelRow);
    var lvNow = levelFromXp(storage.get('xp') || 0);
    var rankNow = rankForLevel(lvNow.level);
    levelRow.appendChild(createElement('span', { className: 'profile-rank', text: rankNow.icon + ' ' + rankNow.label }));
    nameCol.appendChild(levelRow);
    topRow.appendChild(nameCol);
    avatarSection.appendChild(topRow);
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

    // The badges you have pinned, where people can see them (the full list is in the Badges row below)
    var showcaseHost = createElement('div', { attributes: { id: 'profileShowcaseHost' } });
    function fillShowcase() {
      clearElement(showcaseHost);
      var pins = storage.get('selectedBadges') || [];
      var have = storage.get('achievements') || [];
      var list = pins.map(function (id) { return ACHIEVEMENTS.filter(function (a) { return a.id === id; })[0]; }).filter(function (a) { return a && have.indexOf(a.id) >= 0; });
      if (!list.length) return;
      var showcase = createElement('div', { className: 'profile-showcase', attributes: { id: 'profileShowcase', role: 'list', 'aria-label': 'Pinned badges' } });
      list.forEach(function (a) {
        var chip = createElement('div', { className: 'showcase-badge', attributes: { role: 'listitem', title: a.name + ': ' + a.desc, 'aria-label': a.name + ': ' + a.desc } });
        chip.appendChild(createElement('span', { className: 'showcase-icon', text: a.icon }));
        chip.appendChild(createElement('span', { className: 'showcase-name', text: a.name }));
        showcase.appendChild(chip);
      });
      showcaseHost.appendChild(showcase);
      document.dispatchEvent(new CustomEvent('dx:attention-changed')); // (the screen refits to its new height)
    }
    fillShowcase();
    container.appendChild(showcaseHost);

    // Account: sign up, sign in, sign out (filled in by main.js once the account service is ready)
    // (one folded row: the account form only opens when the player wants it, so the page stays one calm screen)
    var accountBox = createElement('details', { className: 'profile-fold profile-account-box', attributes: { id: 'profileAccountBox' } });
    var accountSum = createElement('summary', { className: 'profile-fold-sum' });
    accountSum.appendChild(createElement('span', { className: 'profile-fold-title', text: '☁ Account' }));
    accountSum.appendChild(createElement('span', { className: 'profile-fold-state', attributes: { id: 'profileAccountState' }, text: 'Guest' }));
    accountBox.appendChild(accountSum);
    var accountSection = createElement('div', { className: 'profile-account', attributes: { id: 'profileAccount' } });
    accountBox.appendChild(accountSection);

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

    // Visibility toggle and Save, on one line
    var actions = createElement('div', { className: 'profile-actions' });
    var visRow = createElement('div', { className: 'profile-vis' });
    visRow.appendChild(createElement('span', { text: '👁 Visible to friends' }));
    var visToggle = createElement('div', { className: 'toggle' + (profileVisible ? ' on' : ''), attributes: { role: 'switch', tabindex: '0', 'aria-label': 'Profile visible to friends', 'aria-checked': profileVisible ? 'true' : 'false' } });
    function flipVisible() {
      var newVal = !storage.get('profileVisible');
      storage.set('profileVisible', newVal);
      visToggle.classList.toggle('on');
      visToggle.setAttribute('aria-checked', newVal ? 'true' : 'false');
    }
    visToggle.addEventListener('click', flipVisible);
    visToggle.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipVisible(); } });
    visRow.appendChild(visToggle);
    actions.appendChild(visRow);
    var saveBtn = createElement('button', { className: 'btn btn-primary', text: '💾 Save', attributes: { type: 'button', 'aria-label': 'Save profile' } });
    saveBtn.addEventListener('click', function () {
      var name = nameInput.value.trim();
      storage.set('profileName', name);
      self._showToast('Profile saved!');
    });
    actions.appendChild(saveBtn);
    container.appendChild(actions);
    container.appendChild(accountBox);

    // Badges: every badge, earned or not. Earned ones can be pinned to the profile (up to 6); the ones
    // earned since the profile was last open wear a red dot until the player leaves this screen.
    // Study streak calendar, just above the badges
    var calendarBox = createElement('details', { className: 'profile-fold', attributes: { id: 'streakBox' } });
    var calSum = createElement('summary', { className: 'profile-fold-sum' });
    calSum.appendChild(createElement('span', { className: 'profile-fold-title', text: '📅 Study streak' }));
    calSum.appendChild(createElement('span', { className: 'profile-fold-state', text: '🔥 ' + dailyStreak + (dailyStreak === 1 ? ' day' : ' days') }));
    calendarBox.appendChild(calSum);
    var calendar = createElement('div', { className: 'streak-calendar', attributes: { id: 'streakCalendar' } });
    calendarBox.appendChild(calendar);
    container.appendChild(calendarBox);

    var newBadges = storage.getNewAchievementIds();
    var badgeSection = createElement('details', { className: 'profile-fold profile-badges', attributes: { id: 'profileBadges' } });
    // it opens by itself when there is a new badge to see; otherwise it stays folded so the page fits on one screen
    if (newBadges.length) badgeSection.open = true;
    var heading = createElement('summary', { className: 'profile-fold-sum' });
    heading.appendChild(createElement('span', { className: 'profile-fold-title', text: '🏆 Badges (' + achievements.length + '/' + ACHIEVEMENTS.length + ')' }));
    if (newBadges.length) heading.appendChild(createElement('span', { className: 'nav-dot', attributes: { 'aria-label': 'New badge' } }));
    badgeSection.appendChild(heading);
    badgeSection.appendChild(createElement('div', { className: 'setting-sublabel', text: 'Tap a badge to read it. Earned badges can be pinned to your profile (up to 6).' }));
    // The badge you tapped: its name and what it takes
    var detail = createElement('div', { className: 'badge-detail', attributes: { role: 'status', 'aria-live': 'polite' } });
    detail.textContent = 'Tap a badge to see what it is for.';
    badgeSection.appendChild(detail);

    var byId = {};
    ACHIEVEMENTS.forEach(function (a) { byId[a.id] = a; });
    ACHIEVEMENT_GROUPS.forEach(function (group) {
      var list = group.keys.map(function (k) { return byId[ACHIEVEMENT_IDS[k]]; }).filter(Boolean);
      if (!list.length) return;
      var earnedHere = list.filter(function (a) { return achievements.indexOf(a.id) >= 0; }).length;
      var hasNew = list.some(function (a) { return newBadges.indexOf(a.id) >= 0; });
      var section = createElement('details', { className: 'badge-group', attributes: { 'data-group': group.id } });
      // groups with something new open on their own; the rest stay folded so the whole list fits on a screen
      if (hasNew) section.open = true;
      var sum = createElement('summary', { className: 'badge-group-title' });
      sum.appendChild(createElement('span', { text: group.icon + ' ' + group.title }));
      sum.appendChild(createElement('span', { className: 'badge-group-count', text: earnedHere + '/' + list.length }));
      if (hasNew) sum.appendChild(createElement('span', { className: 'nav-dot', attributes: { 'aria-label': 'New badge' } }));
      section.appendChild(sum);
      var badgeList = createElement('div', { className: 'profile-badge-list' });

      list.forEach(function (ach) {
        var earned = achievements.indexOf(ach.id) >= 0;
        var isNew = newBadges.indexOf(ach.id) >= 0;
        var pinned = selectedBadges.indexOf(ach.id) >= 0;
        var item = createElement('div', {
          className: 'achievement-item ' + (earned ? 'unlocked' : 'locked') + (pinned ? ' pinned' : '') + (isNew ? ' is-new' : ''),
          dataset: { badge: ach.id },
          attributes: { role: 'button', tabindex: '0', 'aria-label': ach.name + (earned ? ', earned' : ', not yet earned') + ': ' + ach.desc, 'aria-pressed': pinned ? 'true' : 'false' }
        });
        item.appendChild(createElement('div', { className: 'achievement-icon', text: earned ? ach.icon : '🔒' }));
        item.appendChild(createElement('div', { className: 'achievement-name', text: ach.name }));
        if (isNew) item.appendChild(createElement('span', { className: 'nav-dot', attributes: { 'aria-label': 'New badge' } }));
        var pin = createElement('div', { className: 'badge-pin', text: pinned ? '📌' : '' });
        item.appendChild(pin);
        var activate = function () {
          detail.textContent = (earned ? ach.icon : '🔒') + ' ' + ach.name + ': ' + ach.desc + (earned ? '' : ' (not yet earned)');
          if (!earned) return;
          var badges = storage.get('selectedBadges') || [];
          var idx = badges.indexOf(ach.id);
          if (idx >= 0) {
            badges.splice(idx, 1);
          } else {
            if (badges.length >= 6) { self._showToast('You can pin up to 6 badges. Unpin one first.'); return; }
            badges.push(ach.id);
          }
          storage.set('selectedBadges', badges);
          var on = badges.indexOf(ach.id) >= 0;
          item.classList.toggle('pinned', on);
          item.setAttribute('aria-pressed', on ? 'true' : 'false');
          pin.textContent = on ? '📌' : '';
          fillShowcase();
        };
        item.addEventListener('click', activate);
        item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
        badgeList.appendChild(item);
      });
      section.appendChild(badgeList);
      badgeSection.appendChild(section);
    });
    container.appendChild(badgeSection);

    this.renderCalendar();
    document.dispatchEvent(new CustomEvent('dx:profile-opened')); // main.js fills the account section
  },

  renderCalendar() {
    renderStreakCalendar(document.getElementById('streakCalendar'));
  },

  renderQuests() {
    var container = document.getElementById('questList');
    if (!container) return;
    clearElement(container);
    var self = this;
    var today = localDateKey(new Date());
    var allComplete = true;

    // Rewards earned on a recent day that were never collected
    var missed = storage.getUnclaimedPastQuests();
    if (missed.length) {
      var missedBox = createElement('div', { className: 'quest-item' });
      missedBox.appendChild(createElement('div', { className: 'quest-title', text: '\uD83C\uDF81 Rewards waiting from earlier days' }));
      missed.forEach(function (m) {
        var def = QUESTS.filter(function (x) { return x.id === m.id; })[0];
        if (!def) return;
        var b = createElement('button', { className: 'btn btn-gold btn-sm', text: 'Claim ' + def.reward + ' coins \u00B7 ' + def.title, attributes: { type: 'button' } });
        b.style.cssText = 'display:block;margin-top:4px';
        b.addEventListener('click', function () {
          var claim = storage.claimQuest(m.id, m.dateKey);
          if (claim.success) { audio.play('coin'); self._showToast('\uD83E\uDE99 +' + claim.reward + ' coins!'); }
          self.renderQuests();
          self.renderHome();
          document.dispatchEvent(new CustomEvent('dx:attention-changed'));
        });
        missedBox.appendChild(b);
      });
      container.appendChild(missedBox);
    }

    var todays = storage.getDailyQuests();
    var doneCount = todays.filter(function (q) { return storage.getQuestProgress(q.id) >= q.target; }).length;
    container.appendChild(createElement('p', {
      className: 'quest-intro',
      text: 'New every day \u00B7 ' + doneCount + ' of ' + todays.length + ' done \u00B7 all six earn a gold calendar day'
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

      // Reward line: progress and coins, and the Claim button (or "Claimed") at its end once the quest is done
      var rewardRow = createElement('div', { className: 'quest-claim-row' });
      rewardRow.appendChild(rewardEl);
      if (isComplete) {
        var claimed = storage.isQuestClaimed(q.id, today);
        if (!claimed) {
          var claimBtn = createElement('button', { className: 'btn btn-gold btn-sm', text: '🎁 Claim ' + q.reward, attributes: { type: 'button', 'aria-label': 'Claim ' + q.reward + ' coins for ' + q.title } });
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
          questEl.classList.add('has-claim');
          rewardRow.appendChild(claimBtn);
        } else {
          var claimedLabel = createElement('div', { text: '✅ Claimed' });
          claimedLabel.style.cssText = 'font-size:10px;color:var(--accent-green);font-weight:700';
          rewardRow.appendChild(claimedLabel);
        }
      }
      questEl.appendChild(rewardRow);

      container.appendChild(questEl);
    });

    // Mark all quests complete for calendar
    if (allComplete && storage.markQuestsComplete) {
      storage.markQuestsComplete(today);
    }
  },
};
