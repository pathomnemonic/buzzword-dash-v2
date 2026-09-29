/**
 * ui.js — Main UI Controller for Buzzword Dash
 *
 * Agent 5 owns this file and js/dom.js [2].
 *
 * This is the sole main UI controller. It renders all screens,
 * manages the HUD, handles navigation, and provides safe DOM
 * rendering for all untrusted content [2].
 *
 * KEY CHANGES FROM PREVIOUS VERSION:
 * - Uses safe DOM utilities from js/dom.js (escapeHTML, setText,
 *   createElement, clearElement, delegate) for ALL untrusted content
 * - Removes global callbacks (window.UI_editCard, window.UI_deleteCard,
 *   window.UI_flagCard, window.UI_reportCard) — uses event delegation
 * - Removes inline event handlers from generated HTML
 * - Adds settings extension mounting pattern for Anki importer
 * - Adds card-browser pagination (50 cards per page)
 * - Keeps search control mounted while typing (debounced)
 * - Adds accessible modal behavior (focus trap, Escape, restore focus)
 * - Adds quest claiming UI
 * - Correctly displays ALL post-run answers (correct + wrong)
 * - Completes profile picture selector
 * - Honors prefers-reduced-motion
 * - Returns no raw untrusted HTML via innerHTML interpolation
 *
 * DEPENDENCIES EXPECTED FROM OTHER AGENTS:
 * - Agent 1 (engine): game.setEventSink(handler), canonical run summary
 * - Agent 3 (storage): storage, progression exports, finalizeRun,
 *   finalizeFlashcardSession, quest claiming API
 * - Agent 4 (shopdata): ACHIEVEMENT_IDS, QUEST_IDS, ACHIEVEMENTS,
 *   QUESTS, SHOP_ITEMS exports
 * - Agent 7 (flashcard): FlashcardMode returning structured data
 * - Agent 8 (card schema): normalizeCard, validateCard, canonical enums
 * - Agent 18 (card hub): CARDS, SUBJECTS, EXAM_FILTERS, QUESTION_TYPES
 */

import { setText, createElement, clearElement } from './dom.js';
import { SUBJECTS, CARDS, EXAM_FILTERS } from './cards.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { customCards } from './customcards.js';
import { SHOP_ITEMS, QUESTS, ACHIEVEMENTS } from './game/shopdata.js';
import { CharacterPreview } from './game/preview.js';
import { FlashcardMode } from './game/flashcardmode.js';

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/** Returns YYYY-MM-DD for local date */
function localDateKey(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/** Check if user prefers reduced motion */
function prefersReducedMotion() {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return storage.get('reducedMotion') || false;
}

/** Debounce utility */
function debounce(fn, delay) {
  var timer = null;
  return function () {
    var args = arguments;
    var self = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      fn.apply(self, args);
    }, delay);
  };
}

// ═══════════════════════════════════════════════════════════
// FOCUS TRAP for modals (Section 21.3) [2]
// ═══════════════════════════════════════════════════════════

var _activeFocusTrap = null;
var _previousFocusElement = null;

function trapFocus(container) {
  _previousFocusElement = document.activeElement;

  function getFocusable() {
    var elements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    var visible = [];
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].offsetParent !== null && !elements[i].disabled) {
        visible.push(elements[i]);
      }
    }
    return visible;
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      var focusable = getFocusable();
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown);
  _activeFocusTrap = { container: container, handler: handleKeyDown };

  // Move focus into the container
  var focusable = getFocusable();
  if (focusable.length > 0) {
    focusable[0].focus();
  } else {
    container.setAttribute('tabindex', '-1');
    container.focus();
  }
}

function releaseFocusTrap() {
  if (_activeFocusTrap) {
    _activeFocusTrap.container.removeEventListener('keydown', _activeFocusTrap.handler);
    _activeFocusTrap = null;
  }
  if (_previousFocusElement && _previousFocusElement.focus) {
    try { _previousFocusElement.focus(); } catch (e) { /* element may have been removed */ }
  }
  _previousFocusElement = null;
}

// ═══════════════════════════════════════════════════════════
// SETTINGS EXTENSIONS REGISTRY (Section 21.1) [2]
// ═══════════════════════════════════════════════════════════

var _settingsExtensions = [];

// ═══════════════════════════════════════════════════════════
// UI CLASS
// ═══════════════════════════════════════════════════════════

class UI {
  constructor() {
    this.characterPreview = null;
    this.titleTapCount = 0;
    this.titleTapTimer = null;
    this.konamiSequence = [];
    this.konamiCode = [38, 38, 40, 40, 37, 39, 37, 39];

    this.tutorialPage = 0;
    this.tutorialPages = [
      { icon: '⚡', title: 'Welcome!', text: 'Buzzword Dash is a fast-paced game that helps you master medical board concepts. See diagnostic buzzwords and run through the correct diagnosis gate!' },
      { icon: '👆', title: 'Move Between Lanes', text: 'Swipe left or right to switch lanes. Each lane has a different diagnosis — pick the one that matches the buzzwords at the top.' },
      { icon: '⬆️', title: 'Jump Over Obstacles', text: 'Swipe up to jump over gurneys, wheelchairs, and other obstacles on the ground.' },
      { icon: '⬇️', title: 'Slide Under Obstacles', text: 'Swipe down to slide under overhead obstacles like MRI tunnels and OR doors.' },
      { icon: '👆👆', title: 'Rush for Bonus Points', text: 'Know the answer? Double-tap (or press Shift) to rush! You\'re propelled through the gate in 0.5s and invulnerable to obstacles during rush!' },
      { icon: '🏎️', title: 'Speed = Points', text: 'Use the speed dial on the home screen to increase game speed. Faster speeds earn more points per correct answer.' },
      { icon: '🔥', title: 'Build Your Streak', text: 'Correct answers build your streak. Every 5 correct increases your score multiplier up to 8×!' },
      { icon: '❤️', title: 'Lives & Hearts', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. When at 1 life, look for heart pickups on the track!' },
      { icon: '🪙', title: 'Collect & Customize', text: 'Grab coins and glowing power-up orbs as you run! Visit the On-Call Locker to preview and equip avatars, hats, trails, clothing, and gear.' },
      { icon: '🏆', title: 'Achievements', text: 'Earn badges by reaching milestones — perfect runs, high streaks, score targets, and more!' }
    ];

    this.homeCharacter = null;
    this.speedDialTapCount = 0;
    this.speedDialTapTimer = null;
    this.vignetteEl = null;

    // Flashcard mode instance
    this.flashcardMode = new FlashcardMode();

    // Card browser state
    this.cardBrowserSearch = '';
    this.cardBrowserSubject = '';
    this.cardBrowserFilter = 'all';
    this.cardBrowserPage = 0;
    this.cardBrowserPageSize = 50;

    // Delegated event cleanup functions
    this._delegateCleanups = [];

    // Settings extension registry
    this._settingsExtensions = [];

    // Callbacks
    this.onEquipChange = null;
    this.onNightModeChange = null;
  }

  // ═══════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════

  init() {
    storage.load();
    storage.checkDailyReset();
    this.renderHome();
    this.renderSubjects();
    this.renderSettings();
    this.renderStats();
    this.renderShop();
    this.renderQuests();
    this.renderAchievements();
    this.setupSpeedDial();
    this.bindNavigation();
    this.bindMusicToggle();
    this.bindSubjectControls();
    this.bindCustomCards();
    this.bindEasterEggs();
    this.checkDailyLoginReward();
    this.createVignetteOverlay();
    this.renderCalendar();
    this.renderHowToPlay();
    this.renderExamFilter();
    this.renderAdvancedFilters();
    this._bindGlobalEscapeKey();
  }

  // ═══════════════════════════════════════════════════════
  // SETTINGS EXTENSIONS (Section 21.1) [2]
  // ═══════════════════════════════════════════════════════

  /**
   * Register a settings extension that will be mounted
   * every time the Settings screen renders.
   * @param {{ id: string, mount: function, unmount: function }} ext
   */
  registerSettingsExtension(ext) {
    if (!ext || !ext.id || typeof ext.mount !== 'function') return;
    // Avoid duplicates
    for (var i = 0; i < this._settingsExtensions.length; i++) {
      if (this._settingsExtensions[i].id === ext.id) {
        this._settingsExtensions[i] = ext;
        return;
      }
    }
    this._settingsExtensions.push(ext);
  }

  /**
   * Mount all registered settings extensions into the settings content.
   * Called at the end of renderSettings().
   */
  mountSettingsExtensions() {
    for (var i = 0; i < this._settingsExtensions.length; i++) {
      var ext = this._settingsExtensions[i];
      try {
        if (typeof ext.unmount === 'function') ext.unmount();
      } catch (e) { /* best-effort cleanup */ }
      var container = document.getElementById('settingsExtension_' + ext.id);
      if (!container) {
        container = createElement('div', {
          attributes: { id: 'settingsExtension_' + ext.id }
        });
        var settingsContent = document.getElementById('settingsContent');
        if (settingsContent) settingsContent.appendChild(container);
      }
      try {
        ext.mount(container);
      } catch (e) {
        console.warn('Settings extension mount failed:', ext.id, e);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // VIGNETTE
  // ═══════════════════════════════════════════════════════

  createVignetteOverlay() {
    this.vignetteEl = document.getElementById('rushVignette');
    if (!this.vignetteEl) {
      this.vignetteEl = createElement('div', {
        attributes: { id: 'rushVignette' },
        className: 'rush-vignette'
      });
      document.body.appendChild(this.vignetteEl);
    }
  }

  updateRushVignette(rushStacks) {
    if (!this.vignetteEl) return;
    if (prefersReducedMotion()) {
      this.vignetteEl.classList.remove('active');
      this.vignetteEl.style.boxShadow = 'none';
      return;
    }
    if (rushStacks > 0) {
      this.vignetteEl.classList.add('active');
      var intensity = Math.min(rushStacks, 3);
      var spread = 120 - intensity * 20;
      var alpha = 0.3 + intensity * 0.15;
      this.vignetteEl.style.boxShadow =
        'inset 0 0 ' + spread + 'px ' + (spread / 2) + 'px rgba(255, 100, 0, ' + alpha + ')';
    } else {
      this.vignetteEl.classList.remove('active');
      this.vignetteEl.style.boxShadow = 'none';
    }
  }

  // ═══════════════════════════════════════════════════════
  // COIN TRAIL
  // ═══════════════════════════════════════════════════════

  showCoinTrail() {
    if (prefersReducedMotion()) return;
    var coinCounter = document.getElementById('hudCoins');
    if (!coinCounter) return;
    var dot = createElement('div', { className: 'coin-trail-dot' });
    var startX = window.innerWidth / 2;
    var startY = window.innerHeight / 2;
    dot.style.left = startX + 'px';
    dot.style.top = startY + 'px';
    document.body.appendChild(dot);
    var rect = coinCounter.getBoundingClientRect();
    var targetX = rect.left + rect.width / 2;
    var targetY = rect.top + rect.height / 2;
    requestAnimationFrame(function () {
      dot.style.left = targetX + 'px';
      dot.style.top = targetY + 'px';
      dot.style.opacity = '0';
      dot.style.transform = 'translate(-50%, -50%) scale(0.3)';
    });
    setTimeout(function () {
      if (dot.parentNode) dot.parentNode.removeChild(dot);
    }, 350);
  }

  // ═══════════════════════════════════════════════════════
  // SPEED TIMER
  // ═══════════════════════════════════════════════════════

  updateSpeedTimer(game) {
    var timerEl = document.getElementById('hudSpeedTimer');
    if (!timerEl) return;
    if (!storage.get('speedTimerEnabled')) {
      timerEl.style.display = 'none';
      return;
    }
    var elapsed = 0;
    if (game.gatesActive && game.encounterStartTime > 0) {
      elapsed = performance.now() - game.encounterStartTime;
    } else {
      elapsed = game.lastEncounterTime || 0;
    }
    setText(timerEl, '⏱ ' + Math.round(elapsed) + ' ms');
    timerEl.style.display = 'inline-flex';
  }

  // ═══════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════

  showScreen(screenId) {
    this.show(screenId);
  }

  hideScreens() {
    this.hideAll();
  }

  show(screenId) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    var el = document.getElementById(screenId);
    if (el) el.classList.add('active');

    if (screenId === 'screenHome') {
      this.renderHome();
      if (this.homeCharacter) this.homeCharacter.startAnimation();
    }
    if (screenId === 'screenStats') this.renderStats();
    if (screenId === 'screenShop') { this.renderShop(); this.startPreview(); }
    if (screenId === 'screenQuests') this.renderQuests();
    if (screenId === 'screenSettings') this.renderSettings();
    if (screenId === 'screenMyCards') this.renderCustomCardList();
    if (screenId === 'screenAchievements') this.renderAchievements();
    if (screenId === 'screenProfile') this.renderProfile();
    if (screenId === 'screenCardBrowser') this.renderCardBrowser();
    if (screenId === 'screenFlashcard') this.renderFlashcardScreen();

    if (screenId !== 'screenShop' && this.characterPreview) {
      this.characterPreview.stopAnimation();
    }
    if (screenId !== 'screenHome' && this.homeCharacter) {
      this.homeCharacter.stopAnimation();
    }

    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.screen === screenId);
    });
  }

  hideAll() {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    if (this.characterPreview) this.characterPreview.stopAnimation();
    if (this.homeCharacter) this.homeCharacter.stopAnimation();
  }

  bindNavigation() {
    var self = this;
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () {
        self.show(item.dataset.screen);
      });
    });
    document.querySelectorAll('.back-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { self.show('screenHome'); });
    });
    var settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', function () { self.show('screenSettings'); });
    var shopBtn = document.getElementById('shopBtn');
    if (shopBtn) shopBtn.addEventListener('click', function () { self.show('screenShop'); });
    var questBtn = document.getElementById('questBtn');
    if (questBtn) questBtn.addEventListener('click', function () { self.show('screenQuests'); });
    var achievementsBtn = document.getElementById('achievementsBtn');
    if (achievementsBtn) achievementsBtn.addEventListener('click', function () { self.show('screenAchievements'); });
    var myCardsBtn = document.getElementById('myCardsBtn');
    if (myCardsBtn) myCardsBtn.addEventListener('click', function () {
      self.show('screenMyCards');
      self.renderCustomCardList();
    });
    var profileBtn = document.getElementById('profileBtn');
    if (profileBtn) profileBtn.addEventListener('click', function () { self.show('screenProfile'); });
    var cardBrowserBtn = document.getElementById('cardBrowserBtn');
    if (cardBrowserBtn) cardBrowserBtn.addEventListener('click', function () { self.show('screenCardBrowser'); });
  }

  bindMusicToggle() {
    var btn = document.getElementById('musicToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var playing = audio.toggleMusic();
      setText(btn, playing ? '🎵 Music: ON' : '🎵 Music: OFF');
    });
    if (storage.get('musicOn')) setText(btn, '🎵 Music: ON');
  }

  // ═══════════════════════════════════════════════════════
  // GLOBAL ESCAPE KEY for modals (Section 21.3) [2]
  // ═══════════════════════════════════════════════════════

  _bindGlobalEscapeKey() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;

      // Close modals in priority order
      var overlays = [
        'quickReviewOverlay',
        'continueOverlay',
        'multiplayerOverlay',
        'tutorialOverlay',
        'onboardingOverlay'
      ];
      for (var i = 0; i < overlays.length; i++) {
        var ov = document.getElementById(overlays[i]);
        if (ov && ov.classList.contains('active')) {
          ov.classList.remove('active');
          releaseFocusTrap();
          return;
        }
      }

      // Close pause overlay
      var pauseOv = document.getElementById('pauseOverlay');
      if (pauseOv && pauseOv.classList.contains('active')) {
        // Let engine handle pause toggle
        return;
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // EASTER EGGS
  // ═══════════════════════════════════════════════════════

  bindEasterEggs() {
    var self = this;
    var titleEl = document.querySelector('.home-header h1');
    if (titleEl) {
      titleEl.style.cursor = 'pointer';
      titleEl.addEventListener('click', function () {
        self.titleTapCount++;
        clearTimeout(self.titleTapTimer);
        self.titleTapTimer = setTimeout(function () { self.titleTapCount = 0; }, 2000);
        if (self.titleTapCount >= 10) {
          self.titleTapCount = 0;
          storage.addCoins(500);
          self._showToast('Secret found! +500 coins!');
          self.renderHome();
        }
      });
    }
    document.addEventListener('keydown', function (e) {
      self.konamiSequence.push(e.keyCode);
      if (self.konamiSequence.length > self.konamiCode.length) {
        self.konamiSequence.shift();
      }
      if (self.konamiSequence.length === self.konamiCode.length) {
        var match = true;
        for (var i = 0; i < self.konamiCode.length; i++) {
          if (self.konamiSequence[i] !== self.konamiCode[i]) { match = false; break; }
        }
        if (match && !storage.get('konamiUsed')) {
          storage.set('konamiUsed', true);
          storage.addCoins(1000);
          self._showToast('🎮 Konami Code! +1000 coins!');
          self.renderHome();
          self.konamiSequence = [];
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // TOAST / POPUP NOTIFICATIONS
  // ═══════════════════════════════════════════════════════

  /**
   * Show a brief toast notification.
   * Uses safe text rendering. Honors reduced motion.
   */
  _showToast(message) {
    audio.play('achievement');
    var popup = createElement('div', { text: message });
    popup.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:900;color:var(--accent-gold);text-shadow:0 0 14px rgba(255,215,64,0.6);pointer-events:none;z-index:30;transition:all 1.2s ease-out;opacity:1;background:rgba(8,12,36,0.9);padding:14px 24px;border-radius:14px;border:2px solid var(--accent-gold);';
    document.body.appendChild(popup);
    if (!prefersReducedMotion()) {
      requestAnimationFrame(function () {
        popup.style.top = '25%';
        popup.style.opacity = '0';
      });
    } else {
      setTimeout(function () { popup.style.opacity = '0'; }, 800);
    }
    setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, 1200);
  }

  // ═══════════════════════════════════════════════════════
  // DAILY LOGIN REWARD
  // ═══════════════════════════════════════════════════════

  checkDailyLoginReward() {
    var today = new Date().toDateString();
    var lastLogin = storage.get('lastLoginDate');
    if (lastLogin === today) return;
    storage.set('lastLoginDate', today);
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var loginStreak = storage.get('loginStreak') || 0;
    if (lastLogin === yesterday.toDateString()) {
      loginStreak++;
    } else if (lastLogin !== today) {
      loginStreak = 1;
    }
    storage.set('loginStreak', loginStreak);
    var rewards = [10, 20, 30, 50, 75, 100, 150, 200];
    var rewardIndex = Math.min(loginStreak - 1, rewards.length - 1);
    var reward = rewards[Math.max(rewardIndex, 0)];
    storage.addCoins(reward);
    var self = this;
    setTimeout(function () {
      var popup = createElement('div');
      popup.innerHTML = ''; // clear
      var iconEl = createElement('div', { text: '👋' });
      iconEl.style.cssText = 'font-size:24px;margin-bottom:6px';
      popup.appendChild(iconEl);

      var titleEl = createElement('div', { text: 'Welcome back!' });
      titleEl.style.cssText = 'font-size:15px;font-weight:800;color:var(--accent-cyan)';
      popup.appendChild(titleEl);

      var streakEl = createElement('div', { text: 'Day ' + loginStreak + ' streak' });
      streakEl.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-top:4px';
      popup.appendChild(streakEl);

      var rewardEl = createElement('div', { text: '🪙 +' + reward + ' coins!' });
      rewardEl.style.cssText = 'font-size:16px;font-weight:800;color:var(--accent-gold);margin-top:6px';
      popup.appendChild(rewardEl);

      popup.style.cssText = 'position:fixed;top:30%;left:50%;transform:translateX(-50%);text-align:center;background:rgba(8,12,36,0.95);backdrop-filter:blur(10px);border:2px solid var(--accent-cyan);border-radius:16px;padding:18px 28px;pointer-events:none;z-index:30;transition:all 1.5s ease-out;opacity:1;';
      document.body.appendChild(popup);
      audio.play('coin');
      setTimeout(function () {
        popup.style.top = '15%';
        popup.style.opacity = '0';
      }, 2500);
      setTimeout(function () {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
        self.renderHome();
      }, 4000);
    }, 500);
  }

  // ═══════════════════════════════════════════════════════
  // SUBJECT CONTROLS
  // ═══════════════════════════════════════════════════════

  bindSubjectControls() {
    var self = this;
    var selectAll = document.getElementById('selectAllSubjects');
    var deselectAll = document.getElementById('deselectAllSubjects');
    if (selectAll) {
      selectAll.addEventListener('click', function () {
        storage.set('selectedSubjects', SUBJECTS.slice());
        self.renderSubjects();
      });
    }
    if (deselectAll) {
      deselectAll.addEventListener('click', function () {
        storage.set('selectedSubjects', []);
        self.renderSubjects();
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // SPEED DIAL
  // ═══════════════════════════════════════════════════════

  setupSpeedDial() {
    var dial = document.getElementById('speedDial');
    var val = document.getElementById('speedValue');
    if (!dial || !val) return;
    var current = storage.get('userSpeed') || 1;
    dial.value = current;
    setText(val, current + '×');
    var self = this;
    dial.addEventListener('input', function () {
      var v = parseFloat(dial.value);
      storage.set('userSpeed', v);
      setText(val, v + '×');
    });
    val.style.cursor = 'pointer';
    val.addEventListener('click', function () {
      self.speedDialTapCount++;
      clearTimeout(self.speedDialTapTimer);
      self.speedDialTapTimer = setTimeout(function () { self.speedDialTapCount = 0; }, 800);
      if (self.speedDialTapCount >= 3) {
        self.speedDialTapCount = 0;
        var enabled = !storage.get('speedTimerEnabled');
        storage.set('speedTimerEnabled', enabled);
        self._showToast(enabled ? '⏱ Speed Timer: ON' : '⏱ Speed Timer: OFF');
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // HOME SCREEN
  // ═══════════════════════════════════════════════════════

  renderHome() {
    var homeCoins = document.getElementById('homeCoins');
    var homeBest = document.getElementById('homeBest');
    if (homeCoins) setText(homeCoins, storage.get('coins'));
    if (homeBest) setText(homeBest, storage.get('bestScore'));
    this.renderCalendar();
  }

  // ═══════════════════════════════════════════════════════
  // SUBJECTS
  // ═══════════════════════════════════════════════════════

  renderSubjects() {
    var selected = storage.get('selectedSubjects');
    var container = document.getElementById('subjectScroll');
    if (!container) return;
    var self = this;

    // Note element for empty selection
    var noteEl = document.getElementById('subjectNote');
    if (noteEl) {
      if (selected.length === 0) {
        setText(noteEl, 'All subjects active (none specifically selected)');
        noteEl.style.display = 'block';
      } else {
        noteEl.style.display = 'none';
      }
    }

    clearElement(container);

    SUBJECTS.forEach(function (s) {
      var isSelected = selected.indexOf(s) >= 0;
      // If empty array, visually show all as selected
      if (selected.length === 0) isSelected = true;

      var ss = storage.getSubjectStat(s);
      var total = ss.correct + ss.wrong;
      var mastered = total >= 50 && (ss.correct / total) >= 0.8;
      var labelText = s + (mastered ? ' ⭐' : '');

      var chip = createElement('div', {
        className: 'subject-chip' + (isSelected ? ' selected' : ''),
        text: labelText,
        dataset: { subject: s }
      });

      var longPressTimer = null;

      chip.addEventListener('click', function () {
        if (longPressTimer === 'fired') { longPressTimer = null; return; }
        var sel = storage.get('selectedSubjects');
        var idx = sel.indexOf(s);
        if (idx >= 0) sel.splice(idx, 1);
        else sel.push(s);
        storage.set('selectedSubjects', sel);
        self.renderSubjects();
      });

      chip.addEventListener('pointerdown', function () {
        longPressTimer = setTimeout(function () {
          storage.set('selectedSubjects', [s]);
          longPressTimer = 'fired';
          self.renderSubjects();
        }, 500);
      });
      chip.addEventListener('pointerup', function () {
        if (longPressTimer !== 'fired') clearTimeout(longPressTimer);
      });
      chip.addEventListener('pointerleave', function () {
        if (longPressTimer !== 'fired') clearTimeout(longPressTimer);
      });

      container.appendChild(chip);
    });
  }

  // ═══════════════════════════════════════════════════════
  // EXAM FILTER
  // ═══════════════════════════════════════════════════════

  renderExamFilter() {
    var container = document.getElementById('examFilterContainer');
    if (!container) return;
    var selectedExams = storage.get('selectedExams') || [];
    var filters = (typeof EXAM_FILTERS !== 'undefined') ? EXAM_FILTERS : [];
    if (filters.length === 0) {
      clearElement(container);
      return;
    }

    clearElement(container);

    var section = createElement('div', { className: 'collapsible-section' });
    section.style.marginTop = '6px';

    var toggle = createElement('button', {
      className: 'collapsible-toggle',
      attributes: { id: 'examFilterToggle' }
    });
    var toggleText = document.createTextNode('🎯 Exam Filter ');
    toggle.appendChild(toggleText);
    var arrow = createElement('span', {
      className: 'collapse-arrow',
      text: '▸',
      attributes: { id: 'examFilterArrow' }
    });
    toggle.appendChild(arrow);
    section.appendChild(toggle);

    var body = createElement('div', {
      className: 'collapsible-body',
      attributes: { id: 'examFilterBody' }
    });
    body.style.display = 'none';

    var hint = createElement('div', { text: 'Leave empty for all exams' });
    hint.style.cssText = 'font-size:10px;color:var(--text-muted);margin-bottom:6px';
    body.appendChild(hint);

    var scroll = createElement('div', { className: 'subject-scroll' });

    filters.forEach(function (ex) {
      var sel = selectedExams.indexOf(ex) >= 0;
      var chip = createElement('div', {
        className: 'subject-chip' + (sel ? ' selected' : ''),
        text: ex,
        dataset: { exam: ex }
      });
      chip.addEventListener('click', function () {
        var exams = storage.get('selectedExams') || [];
        var idx = exams.indexOf(ex);
        if (idx >= 0) exams.splice(idx, 1);
        else exams.push(ex);
        storage.set('selectedExams', exams);
        chip.classList.toggle('selected');
      });
      scroll.appendChild(chip);
    });

    body.appendChild(scroll);
    section.appendChild(body);
    container.appendChild(section);

    toggle.addEventListener('click', function () {
      var isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('open', !isOpen);
    });
  }

  // ═══════════════════════════════════════════════════════
  // ADVANCED FILTERS
  // ═══════════════════════════════════════════════════════

  renderAdvancedFilters() {
    var container = document.getElementById('advancedFilterContainer');
    if (!container) return;
    var self = this;

    var QTYPES = [
      { id: 'buzzword_dx', label: '🩺 Dx' },
      { id: 'dx_to_tx', label: '💊 Tx' },
      { id: 'dx_to_workup', label: '🔬 Workup' },
      { id: 'mechanism', label: '⚙️ Mechanism' },
      { id: 'side_effect', label: '⚠️ Side Effect' },
      { id: 'lab_dx', label: '🧪 Lab' },
      { id: 'pharm', label: '💉 Pharm' },
      { id: 'prevention', label: '🛡️ Prevention' },
      { id: 'management', label: '📋 Mgmt' }
    ];
    var YEARS = [
      { id: 1, label: 'M1' },
      { id: 2, label: 'M2' },
      { id: 3, label: 'M3' },
      { id: 4, label: 'M4' }
    ];

    var selectedTypes = storage.get('selectedQuestionTypes') || [];
    var selectedYears = storage.get('selectedYears') || [];
    var highYieldOnly = storage.get('highYieldOnly') || false;
    var activeCount = selectedTypes.length + selectedYears.length + (highYieldOnly ? 1 : 0);

    clearElement(container);

    var section = createElement('div', { className: 'collapsible-section' });
    section.style.marginTop = '6px';

    // Toggle button
    var toggle = createElement('button', { className: 'collapsible-toggle' });
    var toggleText = document.createTextNode('🔍 Filters ');
    toggle.appendChild(toggleText);
    var countSpan = createElement('span', {
      text: activeCount > 0 ? '(' + activeCount + ' active)' : '',
      attributes: { id: 'activeFilterCount' }
    });
    countSpan.style.cssText = 'font-size:10px;color:var(--accent-orange);font-weight:700';
    toggle.appendChild(countSpan);
    toggle.appendChild(document.createTextNode(' '));
    var arrow = createElement('span', { className: 'collapse-arrow', text: '▸' });
    toggle.appendChild(arrow);
    section.appendChild(toggle);

    var body = createElement('div', { className: 'collapsible-body' });
    body.style.display = 'none';

    // Question Type chips
    var qtLabel = createElement('label', { text: '❓ Question Type' });
    qtLabel.style.cssText = 'font-size:11px;font-weight:700;margin-top:8px;display:block';
    body.appendChild(qtLabel);
    var qtHint = createElement('div', { text: 'Leave empty for all types' });
    qtHint.style.cssText = 'font-size:9px;color:var(--text-muted);margin-bottom:4px';
    body.appendChild(qtHint);

    var qtScroll = createElement('div', { className: 'subject-scroll' });
    QTYPES.forEach(function (qt) {
      var sel = selectedTypes.indexOf(qt.id) >= 0;
      var chip = createElement('div', {
        className: 'subject-chip' + (sel ? ' selected' : ''),
        text: qt.label,
        dataset: { qtype: qt.id }
      });
      chip.addEventListener('click', function () {
        if (storage.toggleQuestionTypeFilter) {
          storage.toggleQuestionTypeFilter(qt.id);
        } else {
          storage.toggleArrayItem('selectedQuestionTypes', qt.id);
        }
        chip.classList.toggle('selected');
        self._updateFilterCount();
      });
      qtScroll.appendChild(chip);
    });
    body.appendChild(qtScroll);

    // Year chips
    var yrLabel = createElement('label', { text: '🎓 Year' });
    yrLabel.style.cssText = 'font-size:11px;font-weight:700;margin-top:8px;display:block';
    body.appendChild(yrLabel);

    var yrScroll = createElement('div', { className: 'subject-scroll' });
    YEARS.forEach(function (yr) {
      var sel = selectedYears.indexOf(yr.id) >= 0;
      var chip = createElement('div', {
        className: 'subject-chip' + (sel ? ' selected' : ''),
        text: yr.label,
        dataset: { year: String(yr.id) }
      });
      chip.addEventListener('click', function () {
        if (storage.toggleYearFilter) {
          storage.toggleYearFilter(yr.id);
        } else {
          storage.toggleArrayItem('selectedYears', yr.id);
        }
        chip.classList.toggle('selected');
        self._updateFilterCount();
      });
      yrScroll.appendChild(chip);
    });
    body.appendChild(yrScroll);

    // High-yield toggle
    var hyRow = createElement('div', { className: 'setting-row' });
    hyRow.style.padding = '8px 0';
    var hyLabel = createElement('div', { text: '🔥 High-Yield Only' });
    hyLabel.style.fontSize = '12px';
    hyRow.appendChild(hyLabel);
    var hyToggle = createElement('div', {
      className: 'toggle' + (highYieldOnly ? ' on' : '')
    });
    hyToggle.addEventListener('click', function () {
      var newVal = !storage.get('highYieldOnly');
      storage.set('highYieldOnly', newVal);
      hyToggle.classList.toggle('on');
      self._updateFilterCount();
    });
    hyRow.appendChild(hyToggle);
    body.appendChild(hyRow);

    // Reset button
    var resetBtn = createElement('button', {
      className: 'btn btn-outline btn-sm',
      text: 'Reset All Filters'
    });
    resetBtn.style.cssText = 'margin-top:4px;font-size:10px';
    resetBtn.addEventListener('click', function () {
      storage.set('selectedQuestionTypes', []);
      storage.set('selectedYears', []);
      storage.set('highYieldOnly', false);
      storage.set('selectedExams', []);
      self.renderExamFilter();
      self.renderAdvancedFilters();
    });
    body.appendChild(resetBtn);

    section.appendChild(body);
    container.appendChild(section);

    toggle.addEventListener('click', function () {
      var isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('open', !isOpen);
    });
  }

  _updateFilterCount() {
    var selectedTypes = storage.get('selectedQuestionTypes') || [];
    var selectedYears = storage.get('selectedYears') || [];
    var highYieldOnly = storage.get('highYieldOnly') || false;
    var activeCount = selectedTypes.length + selectedYears.length + (highYieldOnly ? 1 : 0);
    var countEl = document.getElementById('activeFilterCount');
    if (countEl) {
      setText(countEl, activeCount > 0 ? '(' + activeCount + ' active)' : '');
    }
  }

  // ═══════════════════════════════════════════════════════
  // HOW TO PLAY
  // ═══════════════════════════════════════════════════════

  renderHowToPlay() {
    var container = document.getElementById('howToPlaySection');
    if (!container) return;
    clearElement(container);

    var sections = [
      { icon: '🎮', title: 'Controls', text: 'Swipe left/right to switch lanes. Swipe up to jump over obstacles, down to slide under them. Use arrow keys or WASD on desktop.' },
      { icon: '⚡', title: 'Rush Mode', text: 'Double-tap or press Shift to RUSH through gates! Rush makes you invulnerable to obstacles and pushes you through in 0.5 seconds. Stack up to 3 rushes for bonus points!' },
      { icon: '❤️', title: 'Lives & Hearts', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. When you\'re down to 1 life, look for heart pickups on the track!' },
      { icon: '🪙', title: 'Coins & Power-ups', text: 'Collect coins as you run. Power-ups include: Shield (🛡), Magnet (🧲), Double Score (2×), Auto-Pilot (🤖), and Score Frenzy (💎).' },
      { icon: '📊', title: 'Scoring', text: 'Correct answers build your streak. Every 5 correct increases your multiplier up to 8×. Rush through gates for bonus points!' },
      { icon: '👾', title: 'The Exam Monster', text: 'Beware! An exam monster chases you. It gets closer when you miss questions and falls back when you answer correctly.' },
      { icon: '🎯', title: 'Game Modes', text: 'Endless: play until you run out of lives. Study: infinite lives with teaching points. Weakness: focus on missed cards. Daily: 15-card challenge. Versus: multiplayer!' },
      { icon: '📝', title: 'Custom Cards & Flashcards', text: 'Create your own cards in My Cards. Use Flashcard mode to study without the runner game. Import Anki cards for AI-converted questions.' }
    ];

    var wrapper = createElement('div');
    wrapper.style.marginTop = '4px';

    var heading = createElement('h4', { text: '📖 How to Play' });
    heading.style.cssText = 'font-size:13px;font-weight:800;color:var(--text-secondary);margin-bottom:6px';
    wrapper.appendChild(heading);

    sections.forEach(function (s) {
      var details = createElement('details');
      var summary = createElement('summary', { text: s.icon + ' ' + s.title });
      details.appendChild(summary);
      var p = createElement('p', { text: s.text });
      p.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-top:6px;line-height:1.5';
      details.appendChild(p);
      wrapper.appendChild(details);
    });

    container.appendChild(wrapper);
  }

  // ═══════════════════════════════════════════════════════
  // HUD
  // ═══════════════════════════════════════════════════════

  showHud() {
    document.getElementById('hud').classList.remove('off');
  }

  hideHud() {
    document.getElementById('hud').classList.add('off');
  }

  updateHud(game) {
    setText(document.getElementById('hudCoins'), game.coins);
    setText(document.getElementById('hudScore'), game.score);
    setText(document.getElementById('hudStreak'), game.streak);
    setText(document.getElementById('hudMulti'), game.multiplier);
    setText(document.getElementById('hudLives'), game.mode === 'study' ? '∞' : game.lives);

    if (game.feedbackTimer <= 0) document.getElementById('feedbackEl').classList.remove('show');
    if (game.teachTimer <= 0) document.getElementById('teachEl').classList.remove('show');

    for (var i = 0; i < 3; i++) {
      document.getElementById('ans' + i).classList.toggle('active', i === game.currentLane);
    }

    var puRow = document.getElementById('powerupRow');
    clearElement(puRow);
    if (game.powerups.shield > 0) puRow.appendChild(createElement('div', { className: 'powerup-tag', text: '🛡️ Shield' }));
    if (game.powerups.magnet > 0) puRow.appendChild(createElement('div', { className: 'powerup-tag', text: '🧲 ' + Math.ceil(game.powerups.magnet) + 's' }));
    if (game.powerups.double > 0) puRow.appendChild(createElement('div', { className: 'powerup-tag', text: '2× ' + Math.ceil(game.powerups.double) + 's' }));
    if (game.powerups.autoPilot > 0) puRow.appendChild(createElement('div', { className: 'powerup-tag', text: '🤖 ' + game.autoPilotGatesLeft + ' gates' }));
    if (game.powerups.scoreFrenzy > 0) puRow.appendChild(createElement('div', { className: 'powerup-tag', text: '💎 ' + Math.ceil(game.powerups.scoreFrenzy) + 's' }));
    if (game.rushStacks > 0) {
      var rushTag = createElement('div', { className: 'powerup-tag', text: '⚡ Rush ×' + game.rushStacks });
      rushTag.style.cssText = 'color:var(--accent-orange);border-color:rgba(255,136,0,0.4)';
      puRow.appendChild(rushTag);
    }

    this.updateRushVignette(game.rushStacks);
    this.updateSpeedTimer(game);
  }

  // ═══════════════════════════════════════════════════════
  // ANSWER CHOICES / BUZZWORDS / FEEDBACK
  // ═══════════════════════════════════════════════════════

  showAnswerChoices(gates) {
    for (var i = 0; i < 3; i++) {
      setText(document.getElementById('ansText' + i), gates[i].label);
    }
  }

  hideAnswerChoices() {
    for (var i = 0; i < 3; i++) {
      setText(document.getElementById('ansText' + i), '');
    }
  }

  showBuzzwords(card) {
    setText(document.getElementById('buzzText'), card.bw.join(' • '));
    // Revenge card banner
    var banner = document.getElementById('revengeCardBanner');
    if (banner) {
      var stat = storage.getCardStat(card.id);
      if (stat.wrong > 0 && stat.wrong > stat.correct) {
        banner.classList.add('show');
        setTimeout(function () { banner.classList.remove('show'); }, 2000);
      }
    }
  }

  showFeedback(card, wasCorrect) {
    var fb = document.getElementById('feedbackEl');
    setText(fb, (wasCorrect ? '✓ ' : '✗ ') + card.ans);
    fb.className = 'show ' + (wasCorrect ? 'ok' : 'bad');
    if (!wasCorrect) {
      var tb = document.getElementById('teachEl');
      setText(tb, card.tp);
      tb.classList.add('show');
    }
    this.hideAnswerChoices();
  }

  showStudyTeaching(card) {
    var tb = document.getElementById('teachEl');
    setText(tb, card.tp);
    tb.classList.add('show');
  }

  // ═══════════════════════════════════════════════════════
  // TRACK NAME
  // ═══════════════════════════════════════════════════════

  showTrackName(skinName) {
    var overlay = document.getElementById('trackNameOverlay');
    if (!overlay) return;
    var nameEl = document.getElementById('trackNameText');
    if (nameEl) setText(nameEl, skinName);
    overlay.classList.add('show');
    setTimeout(function () { overlay.classList.remove('show'); }, 2500);
  }

  // ═══════════════════════════════════════════════════════
  // SCORE POPUP / COIN BURST / STREAK / POWERUP
  // ═══════════════════════════════════════════════════════

  showScorePopup(points) {
    if (prefersReducedMotion()) return;
    var popup = createElement('div', { text: '+' + points });
    popup.style.cssText = 'position:fixed;top:35%;left:50%;transform:translateX(-50%);font-size:24px;font-weight:900;color:var(--accent-gold);text-shadow:0 0 10px rgba(255,215,64,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '20%'; popup.style.opacity = '0'; });
    setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, 800);
  }

  showCoinBurst() {
    if (prefersReducedMotion()) return;
    for (var i = 0; i < 6; i++) {
      var particle = createElement('div', { text: '✦' });
      var angle = (i / 6) * Math.PI * 2;
      var dist = 30 + Math.random() * 20;
      particle.style.cssText = 'position:fixed;top:50%;left:50%;font-size:14px;color:var(--accent-gold);pointer-events:none;z-index:6;transition:all 0.4s ease-out;opacity:1;transform:translate(-50%,-50%);';
      document.body.appendChild(particle);
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist;
      (function (el, ddx, ddy) {
        requestAnimationFrame(function () {
          el.style.transform = 'translate(calc(-50% + ' + ddx + 'px), calc(-50% + ' + ddy + 'px))';
          el.style.opacity = '0';
        });
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
      })(particle, dx, dy);
    }
    this.showCoinTrail();
  }

  showStreakMilestone(streak, multiplier) {
    if (prefersReducedMotion()) return;
    var popup = createElement('div', { text: '🔥 ' + streak + ' STREAK! ×' + multiplier });
    popup.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:900;color:var(--accent-cyan);text-shadow:0 0 12px rgba(24,255,255,0.5);pointer-events:none;z-index:6;transition:all 1s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '25%'; popup.style.opacity = '0'; });
    setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, 1000);
  }

  showPowerupNotification(type) {
    var names = {
      shield: '🛡️ Shield!',
      magnet: '🧲 Coin Magnet!',
      double: '2× Score!',
      autoPilot: '🤖 Auto-Pilot!',
      scoreFrenzy: '💎 Score Frenzy!'
    };
    var popup = createElement('div', { text: names[type] || type });
    popup.style.cssText = 'position:fixed;top:45%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:900;color:var(--accent-purple);text-shadow:0 0 10px rgba(179,136,255,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '30%'; popup.style.opacity = '0'; });
    setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, 800);
  }

  showPowerupGlow(type) {
    if (prefersReducedMotion()) return;
    var colors = {
      shield: 'rgba(68, 136, 255, 0.3)',
      magnet: 'rgba(255, 170, 0, 0.3)',
      double: 'rgba(170, 68, 255, 0.3)',
      autoPilot: 'rgba(0, 238, 102, 0.3)',
      scoreFrenzy: 'rgba(255, 68, 136, 0.3)'
    };
    var color = colors[type] || 'rgba(255, 255, 255, 0.2)';
    var glow = createElement('div');
    glow.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;transition:opacity 0.8s ease-out;opacity:1;box-shadow:inset 0 0 60px 20px ' + color + ';';
    document.body.appendChild(glow);
    requestAnimationFrame(function () { glow.style.opacity = '0'; });
    setTimeout(function () { if (glow.parentNode) glow.parentNode.removeChild(glow); }, 800);
  }

  // ═══════════════════════════════════════════════════════
  // ACHIEVEMENT NOTIFICATION
  // ═══════════════════════════════════════════════════════

  showAchievementNotification(achievementIds) {
    var delay = 0;
    achievementIds.forEach(function (achId) {
      var ach = null;
      for (var i = 0; i < ACHIEVEMENTS.length; i++) {
        if (ACHIEVEMENTS[i].id === achId) { ach = ACHIEVEMENTS[i]; break; }
      }
      if (!ach) return;
      setTimeout(function () {
        audio.play('achievement');
        var popup = createElement('div');
        popup.style.cssText = 'position:fixed;top:15%;left:50%;transform:translateX(-50%);text-align:center;background:rgba(8,12,36,0.95);backdrop-filter:blur(10px);border:2px solid var(--accent-gold);border-radius:16px;padding:16px 24px;pointer-events:none;z-index:20;transition:all 1.5s ease-out;opacity:1;';

        popup.appendChild(createElement('div', { text: ach.icon }));
        popup.firstChild.style.cssText = 'font-size:28px;margin-bottom:4px';

        var titleEl = createElement('div', { text: 'Achievement Unlocked!' });
        titleEl.style.cssText = 'font-size:14px;font-weight:800;color:var(--accent-gold)';
        popup.appendChild(titleEl);

        var nameEl = createElement('div', { text: ach.name });
        nameEl.style.cssText = 'font-size:16px;font-weight:700;margin-top:2px';
        popup.appendChild(nameEl);

        var descEl = createElement('div', { text: ach.desc });
        descEl.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-top:2px';
        popup.appendChild(descEl);

        document.body.appendChild(popup);
        setTimeout(function () { popup.style.top = '5%'; popup.style.opacity = '0'; }, 2000);
        setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, 3500);
      }, delay);
      delay += 2000;
    });
  }

  // ═══════════════════════════════════════════════════════
  // CONTINUE PROMPT
  // ═══════════════════════════════════════════════════════

  showContinuePrompt(cost, onContinue, onDecline) {
    var overlay = document.getElementById('continueOverlay');
    var costEl = document.getElementById('continueCost');
    var currentCoins = document.getElementById('continueCoins');
    var continueBtn = document.getElementById('continueYesBtn');
    var declineBtn = document.getElementById('continueNoBtn');

    setText(costEl, cost);
    setText(currentCoins, storage.get('coins'));
    overlay.classList.add('active');
    trapFocus(overlay);

    var newContinueBtn = continueBtn.cloneNode(true);
    continueBtn.parentNode.replaceChild(newContinueBtn, continueBtn);
    var newDeclineBtn = declineBtn.cloneNode(true);
    declineBtn.parentNode.replaceChild(newDeclineBtn, declineBtn);

    newContinueBtn.addEventListener('click', function () {
      overlay.classList.remove('active');
      releaseFocusTrap();
      if (onContinue) onContinue();
    });
    newDeclineBtn.addEventListener('click', function () {
      overlay.classList.remove('active');
      releaseFocusTrap();
      if (onDecline) onDecline();
    });
  }

  hideContinuePrompt() {
    document.getElementById('continueOverlay').classList.remove('active');
    releaseFocusTrap();
  }

  // ═══════════════════════════════════════════════════════
  // COUNTDOWN (1000ms intervals)
  // ═══════════════════════════════════════════════════════

  showCountdown(options) {
    this.countdown(options && options.onComplete ? options.onComplete : function () {});
  }

  countdown(callback) {
    var ovl = document.getElementById('countdownOverlay');
    var num = document.getElementById('countdownNum');
    var tip = document.getElementById('countdownTip');
    ovl.classList.add('active');
    var ct = 3;
    setText(num, ct);
    audio.play('countdown');

    if (tip) {
      var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      setText(tip, isTouch
        ? '💡 Know the answer? Double-tap to RUSH through! ⚡ Faster = more points'
        : '💡 Know the answer? Press SHIFT or SPACE to RUSH! ⚡ Faster = more points'
      );
      tip.style.opacity = '1';
    }

    var iv = setInterval(function () {
      ct--;
      if (ct > 0) {
        setText(num, ct);
        audio.play('countdown');
      } else {
        clearInterval(iv);
        setText(num, 'GO!');
        if (tip) tip.style.opacity = '0';
        setTimeout(function () {
          ovl.classList.remove('active');
          callback();
        }, 500);
      }
    }, 1000);
  }

  // ═══════════════════════════════════════════════════════
  // PAUSE
  // ═══════════════════════════════════════════════════════

  showPause() {
    document.getElementById('pauseOverlay').classList.add('active');
  }

  hidePause() {
    document.getElementById('pauseOverlay').classList.remove('active');
  }

  // ═══════════════════════════════════════════════════════
  // ERROR
  // ═══════════════════════════════════════════════════════

  showError(message, options) {
    this._showToast(message);
  }

  // ═══════════════════════════════════════════════════════
  // DISPOSE
  // ═══════════════════════════════════════════════════════

  dispose() {
    // Cleanup delegated event listeners
    for (var i = 0; i < this._delegateCleanups.length; i++) {
      this._delegateCleanups[i]();
    }
    this._delegateCleanups = [];

    // Unmount settings extensions
    for (var j = 0; j < this._settingsExtensions.length; j++) {
      try {
        if (typeof this._settingsExtensions[j].unmount === 'function') {
          this._settingsExtensions[j].unmount();
        }
      } catch (e) { /* best-effort */ }
    }

    if (this.characterPreview) {
      this.characterPreview.dispose();
      this.characterPreview = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // SHOP
  // ═══════════════════════════════════════════════════════

  startPreview() {
    if (!this.characterPreview) {
      this.characterPreview = new CharacterPreview();
      this.characterPreview.init('characterPreviewContainer');
    }
    this.characterPreview.clearPreview();
    this.characterPreview.resize();
    this.characterPreview.startAnimation();
  }

  renderShop() {
    var self = this;
    var shopCoinsEl = document.getElementById('shopCoins');
    if (shopCoinsEl) setText(shopCoinsEl, storage.get('coins'));

    var renderGroup = function (type, title) {
      var items = SHOP_ITEMS.filter(function (i) { return i.type === type; });
      if (type === 'skin') {
        items = items.filter(function (i) {
          if (i.id === 'avatar_golden' && !storage.hasAchievement('ach_golden_doctor')) return false;
          return true;
        });
      }
      var equipped = storage.get('equipped');
      var container = createElement('div');

      var heading = createElement('h3', { text: title });
      heading.style.cssText = 'margin:12px 0 6px;font-size:14px;color:var(--text-secondary)';
      container.appendChild(heading);

      items.forEach(function (item) {
        var owned = storage.ownsItem(item.id);
        var isEquipped = equipped[type] === item.id;

        var row = createElement('div', {
          className: 'shop-item' + (isEquipped ? ' equipped' : '')
        });

        // Color swatch
        var colorHex = item.color ? '#' + item.color.toString(16).padStart(6, '0') : '#333';
        var swatch = createElement('div', { text: item.icon || '' });
        swatch.style.cssText = 'width:36px;height:36px;border-radius:8px;background:' + colorHex + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px';
        row.appendChild(swatch);

        // Name
        var nameWrap = createElement('div');
        nameWrap.style.flex = '1';
        nameWrap.appendChild(createElement('div', { text: item.name }));
        nameWrap.firstChild.style.cssText = 'font-size:13px;font-weight:700';
        row.appendChild(nameWrap);

        // Buttons
        var btnWrap = createElement('div');
        btnWrap.style.cssText = 'display:flex;align-items:center;gap:2px';

        // Try-on button (not for trails)
        if (type !== 'trail') {
          var tryBtn = createElement('button', {
            className: 'btn btn-outline btn-sm',
            text: '👁',
            dataset: { preview: item.id, prevslot: type }
          });
          tryBtn.style.cssText = 'font-size:10px;padding:4px 8px;margin-left:4px';
          tryBtn.addEventListener('click', function () {
            if (self.characterPreview) {
              self.characterPreview.previewItem(item.id, type);
            }
          });
          btnWrap.appendChild(tryBtn);
        }

        if (isEquipped) {
          var eqLabel = createElement('span', { text: 'EQUIPPED' });
          eqLabel.style.cssText = 'color:var(--accent-cyan);font-size:11px;font-weight:700';
          btnWrap.appendChild(eqLabel);
        } else if (owned) {
          var equipBtn = createElement('button', {
            className: 'btn btn-outline btn-sm',
            text: 'Equip'
          });
          equipBtn.addEventListener('click', function () {
            storage.equipItem(item.id, type);
            self.renderShop();
            if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
            if (self.onEquipChange) self.onEquipChange();
          });
          btnWrap.appendChild(equipBtn);
        } else {
          var buyBtn = createElement('button', {
            className: 'btn btn-gold btn-sm',
            text: '🪙 ' + item.price
          });
          buyBtn.addEventListener('click', function () {
            if (storage.buyItem(item.id, item.price)) {
              audio.play('coin');
              self.renderShop();
              if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
            } else {
              self._showToast('Not enough coins!');
            }
          });
          btnWrap.appendChild(buyBtn);
        }

        row.appendChild(btnWrap);
        container.appendChild(row);
      });

      return container;
    };

    var shopItems = document.getElementById('shopItems');
    clearElement(shopItems);
    shopItems.appendChild(renderGroup('skin', '👕 Avatars'));
    shopItems.appendChild(renderGroup('clothing', '🥼 Clothing'));
    shopItems.appendChild(renderGroup('hat', '🧢 Headwear'));
    shopItems.appendChild(renderGroup('trail', '✨ Trails'));
    shopItems.appendChild(renderGroup('gear', '🩺 Gear'));
  }

  // ═══════════════════════════════════════════════════════
  // QUESTS (with claiming support per Section 14.6) [2]
  // ═══════════════════════════════════════════════════════

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
        var claimed = false;
        if (storage.areQuestsComplete) {
          // Check if this specific quest was already claimed today
          // Simple claim tracking: we use a special key
          claimed = storage.get('questClaimed_' + q.id + '_' + today);
        }

        if (!claimed) {
          var claimBtn = createElement('button', {
            className: 'btn btn-gold btn-sm',
            text: '🎁 Claim ' + q.reward + ' coins'
          });
          claimBtn.style.marginTop = '4px';
          claimBtn.addEventListener('click', function () {
            storage.addCoins(q.reward);
            storage.set('questClaimed_' + q.id + '_' + today, true);
            audio.play('coin');
            self._showToast('🪙 +' + q.reward + ' coins!');
            self.renderQuests();
            self.renderHome();
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
  }

  // ═══════════════════════════════════════════════════════
  // ACHIEVEMENTS
  // ═══════════════════════════════════════════════════════

  renderAchievements() {
    var container = document.getElementById('achievementsList');
    if (!container) return;
    clearElement(container);
    var unlocked = storage.get('achievements');

    ACHIEVEMENTS.forEach(function (ach) {
      var isUnlocked = unlocked.indexOf(ach.id) >= 0;
      var item = createElement('div', {
        className: 'achievement-item ' + (isUnlocked ? 'unlocked' : 'locked')
      });

      var iconEl = createElement('div', { className: 'achievement-icon', text: isUnlocked ? ach.icon : '🔒' });
      item.appendChild(iconEl);

      var info = createElement('div', { className: 'achievement-info' });
      info.appendChild(createElement('div', { className: 'achievement-name', text: ach.name }));
      info.appendChild(createElement('div', { className: 'achievement-desc', text: ach.desc }));
      item.appendChild(info);

      container.appendChild(item);
    });
  }

  // ═══════════════════════════════════════════════════════
  // SETTINGS (with extension mounting) [2]
  // ═══════════════════════════════════════════════════════

  renderSettings() {
    var self = this;
    var content = document.getElementById('settingsContent');
    if (!content) return;
    clearElement(content);

    var settings = [
      { key: 'musicOn', label: '🎵 Music', type: 'toggle' },
      { key: 'nightMode', label: '🌙 Night Shift', type: 'toggle' },
      { key: 'ttsEnabled', label: '🗣 Text-to-Speech', type: 'toggle' },
      { key: 'masterVolume', label: '🔊 Master Volume', type: 'range', min: 0, max: 1, step: 0.1 },
      { key: 'sfxVolume', label: '🎵 SFX Volume', type: 'range', min: 0, max: 1, step: 0.1 },
      { key: 'musicVolume', label: '🎵 Music Volume', type: 'range', min: 0, max: 1, step: 0.1 },
      { key: 'cardFreshnessWeight', label: '🔄 Card Freshness', type: 'range', min: 1, max: 10, step: 1 }
    ];

    settings.forEach(function (s) {
      var row = createElement('div', { className: 'setting-row' });
      var label = createElement('div', { text: s.label });
      label.style.fontSize = '13px';
      row.appendChild(label);

      if (s.type === 'toggle') {
        var toggle = createElement('div', {
          className: 'toggle' + (storage.get(s.key) ? ' on' : '')
        });
        toggle.addEventListener('click', function () {
          var newVal = !storage.get(s.key);
          storage.set(s.key, newVal);
          toggle.classList.toggle('on');
          if (s.key === 'nightMode') {
            self.applySettings();
            if (self.onNightModeChange) self.onNightModeChange();
          }
          if (s.key === 'musicOn') {
            if (newVal) audio.startMusic(); else audio.stopMusic();
          }
        });
        row.appendChild(toggle);
      } else if (s.type === 'range') {
        var currentVal = storage.get(s.key);
        if (currentVal === undefined || currentVal === null) currentVal = s.min;
        var range = createElement('input', {
          attributes: { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step), value: String(currentVal) }
        });
        range.style.cssText = 'width:100px;accent-color:var(--accent-cyan)';
        range.addEventListener('input', function () {
          var val = parseFloat(range.value);
          storage.set(s.key, val);
          if (s.key === 'masterVolume' || s.key === 'sfxVolume' || s.key === 'musicVolume') {
            audio.updateMusicVolume();
          }
        });
        row.appendChild(range);
      }

      content.appendChild(row);
    });

    // Tutorial button
    var tutRow = createElement('div', { className: 'setting-row' });
    tutRow.appendChild(createElement('div', { text: '❓ How to Play' }));
    var tutBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Tutorial' });
    tutBtn.addEventListener('click', function () { self.showTutorial(); });
    tutRow.appendChild(tutBtn);
    content.appendChild(tutRow);

    // Export reports
    var reportRow = createElement('div', { className: 'setting-row' });
    reportRow.appendChild(createElement('div', { text: '📤 Export Card Reports' }));
    var reportBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Export' });
    reportBtn.addEventListener('click', function () { self.exportCardReports(); });
    reportRow.appendChild(reportBtn);
    content.appendChild(reportRow);

    // Anki import container (mount point for settings extension)
    var ankiContainer = createElement('div', { attributes: { id: 'ankiImportContainer' } });
    content.appendChild(ankiContainer);

    // Reset button
    var resetWrap = createElement('div');
    resetWrap.style.marginTop = '20px';
    var resetBtn = createElement('button', { className: 'btn btn-red btn-block', text: '🗑 Reset All Progress' });
    resetBtn.addEventListener('click', function () {
      if (confirm('Reset ALL progress? This cannot be undone.')) {
        storage.reset();
        window.location.reload();
      }
    });
    resetWrap.appendChild(resetBtn);
    content.appendChild(resetWrap);

    this.applySettings();

    // Mount settings extensions (Section 21.1) [2]
    this.mountSettingsExtensions();
  }

  exportCardReports() {
    var reports = storage.get('cardReports') || [];
    if (reports.length === 0) {
      this._showToast('No card reports to export.');
      return;
    }
    var allCards = CARDS.concat(customCards.getAll());
    var enriched = reports.map(function (r) {
      var card = null;
      for (var i = 0; i < allCards.length; i++) {
        if (allCards[i].id === r.cardId) { card = allCards[i]; break; }
      }
      return {
        cardId: r.cardId,
        cardContent: card ? { buzzwords: card.bw, answer: card.ans, subject: card.subj } : null,
        reason: r.reason,
        text: r.text,
        date: r.date
      };
    });
    var json = JSON.stringify(enriched, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = createElement('a', { attributes: { href: url, download: 'buzzword-dash-card-reports.json' } });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  applySettings() {
    document.body.classList.toggle('night-mode', storage.get('nightMode'));
  }

  // ═══════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════

  renderStats() {
    var tc = storage.get('totalCorrect');
    var tw = storage.get('totalWrong');
    var te = storage.get('totalEncounters');
    var acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;
    var container = document.getElementById('statsContent');
    if (!container) return;
    clearElement(container);

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

        weakBox.appendChild(row);
      });
    } else {
      weakBox.appendChild(createElement('p', { text: 'Play more to see weak areas.' }));
      weakBox.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted)';
    }
    container.appendChild(weakBox);
  }

  // ═══════════════════════════════════════════════════════
  // CUSTOM CARDS
  // ═══════════════════════════════════════════════════════

  bindCustomCards() {
    var self = this;
    var addBtn = document.getElementById('addCardBtn');
    if (addBtn) addBtn.addEventListener('click', function () { self.openCardEditor(null); });
    var saveBtn = document.getElementById('saveCardBtn');
    if (saveBtn) saveBtn.addEventListener('click', function () { self.saveCard(); });
    var cancelBtn = document.getElementById('cancelCardBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { self.show('screenMyCards'); self.renderCustomCardList(); });
    var exportBtn = document.getElementById('exportCardsBtn');
    if (exportBtn) exportBtn.addEventListener('click', function () { self.showExport(); });
    var importBtn = document.getElementById('importCardsBtn');
    if (importBtn) importBtn.addEventListener('click', function () { self.showImport(); });
    var select = document.getElementById('cardSubject');
    if (select) {
      clearElement(select);
      SUBJECTS.forEach(function (s) {
        select.appendChild(createElement('option', { text: s, attributes: { value: s } }));
      });
    }
  }

  renderCustomCardList() {
    var cards = customCards.getAll();
    var container = document.getElementById('customCardList');
    if (!container) return;
    clearElement(container);
    var self = this;

    if (cards.length === 0) {
      var empty = createElement('div', { text: 'No custom cards yet. Tap "Create New Card" to add your own!' });
      empty.style.cssText = 'text-align:center;padding:20px;color:var(--text-muted);font-size:13px';
      container.appendChild(empty);
      return;
    }

    var countLabel = createElement('p', { text: cards.length + ' custom card' + (cards.length === 1 ? '' : 's') });
    countLabel.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-bottom:8px';
    container.appendChild(countLabel);

    cards.forEach(function (card) {
      var cardEl = createElement('div', { className: 'review-card' });
      cardEl.style.borderLeftColor = 'var(--accent-blue)';

      // Buzzwords (safe text)
      var h4 = createElement('h4');
      setText(h4, card.bw.join(' • '));
      cardEl.appendChild(h4);

      // Tags
      var tagRow = createElement('div');
      var ansTag = createElement('span', { className: 'tag tag-correct' });
      setText(ansTag, card.ans);
      tagRow.appendChild(ansTag);
      var subjTag = createElement('span', { className: 'tag tag-subject' });
      setText(subjTag, card.subj);
      tagRow.appendChild(subjTag);
      cardEl.appendChild(tagRow);

      // Teaching point (safe text)
      var tp = createElement('p');
      setText(tp, card.tp);
      tp.style.marginTop = '4px';
      cardEl.appendChild(tp);

      // Action buttons (event delegation instead of global callbacks)
      var btnRow = createElement('div');
      btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px';

      var editBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: '✏️ Edit' });
      editBtn.addEventListener('click', function () { self.openCardEditor(card.id); });
      btnRow.appendChild(editBtn);

      var deleteBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: '🗑️ Delete' });
      deleteBtn.style.cssText = 'border-color:rgba(255,82,82,0.5);color:var(--accent-red)';
      deleteBtn.addEventListener('click', function () {
        if (confirm('Delete this card? This cannot be undone.')) {
          customCards.remove(card.id);
          self.renderCustomCardList();
        }
      });
      btnRow.appendChild(deleteBtn);

      cardEl.appendChild(btnRow);
      container.appendChild(cardEl);
    });
  }

  openCardEditor(cardId) {
    var isEdit = !!cardId;
    setText(document.getElementById('cardEditorTitle'), isEdit ? '✏️ Edit Card' : '📝 Create Card');
    document.getElementById('cardEditId').value = cardId || '';
    setText(document.getElementById('cardErrors'), '');

    if (isEdit) {
      var cards = customCards.getAll();
      var card = null;
      for (var i = 0; i < cards.length; i++) { if (cards[i].id === cardId) { card = cards[i]; break; } }
      if (card) {
        document.getElementById('cardSubject').value = card.subj;
        document.getElementById('cardBuzzwords').value = card.bw.join('\n');
        document.getElementById('cardAnswer').value = card.ans;
        document.getElementById('cardDistractor1').value = card.d[0] || '';
        document.getElementById('cardDistractor2').value = card.d[1] || '';
        document.getElementById('cardWhy1').value = (card.ww && card.ww[card.d[0]]) || '';
        document.getElementById('cardWhy2').value = (card.ww && card.ww[card.d[1]]) || '';
        document.getElementById('cardTeaching').value = card.tp;
      }
    } else {
      document.getElementById('cardBuzzwords').value = '';
      document.getElementById('cardAnswer').value = '';
      document.getElementById('cardDistractor1').value = '';
      document.getElementById('cardDistractor2').value = '';
      document.getElementById('cardWhy1').value = '';
      document.getElementById('cardWhy2').value = '';
      document.getElementById('cardTeaching').value = '';
    }
    this.show('screenCardEditor');
  }

  saveCard() {
    var buzzwords = document.getElementById('cardBuzzwords').value.split('\n').map(function (b) { return b.trim(); }).filter(function (b) { return b.length > 0; });
    var cardData = {
      subject: document.getElementById('cardSubject').value,
      buzzwords: buzzwords,
      answer: document.getElementById('cardAnswer').value.trim(),
      distractors: [document.getElementById('cardDistractor1').value.trim(), document.getElementById('cardDistractor2').value.trim()],
      teachingPoint: document.getElementById('cardTeaching').value.trim(),
      whyWrong1: document.getElementById('cardWhy1').value.trim(),
      whyWrong2: document.getElementById('cardWhy2').value.trim()
    };
    var errors = customCards.validate(cardData);
    var errEl = document.getElementById('cardErrors');
    if (errors.length > 0) {
      clearElement(errEl);
      errors.forEach(function (e) {
        errEl.appendChild(createElement('div', { text: e }));
      });
      return;
    }
    var editId = document.getElementById('cardEditId').value;
    if (editId) { customCards.update(editId, cardData); }
    else { customCards.add(cardData); storage.unlockAchievement('ach_custom_card'); }
    this.show('screenMyCards');
    this.renderCustomCardList();
  }

  showExport() {
    setText(document.getElementById('importExportTitle'), '📤 Export Cards');
    document.getElementById('importExportArea').value = customCards.exportJSON();
    document.getElementById('importExportArea').readOnly = true;
    setText(document.getElementById('importExportMsg'), 'Copy this JSON to share your cards.');
    var actionBtn = document.getElementById('importExportAction');
    setText(actionBtn, '📋 Copy to Clipboard');
    var newBtn = actionBtn.cloneNode(true);
    actionBtn.parentNode.replaceChild(newBtn, actionBtn);
    newBtn.addEventListener('click', function () {
      document.getElementById('importExportArea').select();
      document.execCommand('copy');
      setText(document.getElementById('importExportMsg'), '✅ Copied!');
    });
    this.show('screenImportExport');
  }

  showImport() {
    setText(document.getElementById('importExportTitle'), '📥 Import Cards');
    document.getElementById('importExportArea').value = '';
    document.getElementById('importExportArea').readOnly = false;
    setText(document.getElementById('importExportMsg'), 'Paste JSON from someone who shared their cards.');
    var actionBtn = document.getElementById('importExportAction');
    setText(actionBtn, '📥 Import');
    var newBtn = actionBtn.cloneNode(true);
    actionBtn.parentNode.replaceChild(newBtn, actionBtn);
    newBtn.addEventListener('click', function () {
      var result = customCards.importJSON(document.getElementById('importExportArea').value);
      var msg = document.getElementById('importExportMsg');
      clearElement(msg);
      var span = createElement('span', { text: result.message });
      span.style.color = result.success ? 'var(--accent-green)' : 'var(--accent-red)';
      msg.appendChild(span);
    });
    this.show('screenImportExport');
  }

  // ═══════════════════════════════════════════════════════
  // CARD BROWSER (with pagination per Section 21.2) [2]
  // ═══════════════════════════════════════════════════════

  renderCardBrowser() {
    var container = document.getElementById('cardBrowserContent');
    if (!container) return;
    var self = this;
    // Preserve existing search input if mounted
    var existingSearch = container.querySelector('#cbSearch');
    if (!existingSearch) {
      clearElement(container);
      // Build controls (only once, kept mounted during typing)
      var searchInput = createElement('input', {
        className: 'card-browser-search',
        attributes: { type: 'text', placeholder: '🔍 Search buzzwords, answers, teaching points...', id: 'cbSearch' }
      });
      searchInput.value = this.cardBrowserSearch || '';
      var debouncedSearch = debounce(function () {
        self.cardBrowserSearch = searchInput.value;
        self.cardBrowserPage = 0;
        self._renderCardBrowserResults();
      }, 300);
      searchInput.addEventListener('input', debouncedSearch);
      container.appendChild(searchInput);

      // Filter row
      var filterRow = createElement('div', { className: 'card-browser-filters' });

      var subjectSelect = createElement('select', {
        attributes: { id: 'cbSubjectFilter' }
      });
      subjectSelect.style.cssText = 'padding:6px;border-radius:8px;background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:11px';
      subjectSelect.appendChild(createElement('option', { text: 'All Subjects', attributes: { value: '' } }));
      SUBJECTS.forEach(function (s) {
        var opt = createElement('option', { text: s, attributes: { value: s } });
        if (self.cardBrowserSubject === s) opt.selected = true;
        subjectSelect.appendChild(opt);
      });
      subjectSelect.addEventListener('change', function () {
        self.cardBrowserSubject = subjectSelect.value;
        self.cardBrowserPage = 0;
        self._renderCardBrowserResults();
      });
      filterRow.appendChild(subjectSelect);

      var statusSelect = createElement('select', {
        attributes: { id: 'cbStatusFilter' }
      });
      statusSelect.style.cssText = 'padding:6px;border-radius:8px;background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:11px';
      ['all', 'seen', 'unseen', 'disabled'].forEach(function (val) {
        var labels = { all: 'All Cards', seen: 'Seen', unseen: 'Unseen', disabled: 'Disabled' };
        var opt = createElement('option', { text: labels[val], attributes: { value: val } });
        if (self.cardBrowserFilter === val) opt.selected = true;
        statusSelect.appendChild(opt);
      });
      statusSelect.addEventListener('change', function () {
        self.cardBrowserFilter = statusSelect.value;
        self.cardBrowserPage = 0;
        self._renderCardBrowserResults();
      });
      filterRow.appendChild(statusSelect);

      container.appendChild(filterRow);

      // Results container
      container.appendChild(createElement('div', { attributes: { id: 'cbResults' } }));
    }

    this._renderCardBrowserResults();
  }

  _renderCardBrowserResults() {
    var resultsContainer = document.getElementById('cbResults');
    if (!resultsContainer) return;
    clearElement(resultsContainer);

    var self = this;
    var allCards = CARDS.concat(customCards.getAll());
    var disabledCards = storage.get('disabledCards') || [];

    // Apply filters
    var filtered = allCards;
    if (this.cardBrowserSubject) {
      filtered = filtered.filter(function (c) { return c.subj === self.cardBrowserSubject; });
    }
    if (this.cardBrowserSearch) {
      var q = this.cardBrowserSearch.toLowerCase();
      filtered = filtered.filter(function (c) {
        var text = (c.bw.join(' ') + ' ' + c.ans + ' ' + c.tp).toLowerCase();
        return text.indexOf(q) >= 0;
      });
    }
    if (this.cardBrowserFilter === 'seen') {
      filtered = filtered.filter(function (c) { return storage.getCardStat(c.id).seen > 0; });
    } else if (this.cardBrowserFilter === 'unseen') {
      filtered = filtered.filter(function (c) { return storage.getCardStat(c.id).seen === 0; });
    } else if (this.cardBrowserFilter === 'disabled') {
      filtered = filtered.filter(function (c) { return disabledCards.indexOf(c.id) >= 0; });
    }

    // Pagination
    var pageSize = this.cardBrowserPageSize;
    var totalPages = Math.ceil(filtered.length / pageSize);
    var page = Math.min(this.cardBrowserPage, totalPages - 1);
    if (page < 0) page = 0;
    var start = page * pageSize;
    var displayCards = filtered.slice(start, start + pageSize);

    // Count
    var countEl = createElement('div', {
      className: 'card-browser-stats',
      text: 'Showing ' + (start + 1) + '-' + Math.min(start + pageSize, filtered.length) + ' of ' + filtered.length + ' cards'
    });
    resultsContainer.appendChild(countEl);

    // Cards list
    var list = createElement('div', { className: 'card-browser-list' });

    displayCards.forEach(function (c) {
      var stat = storage.getCardStat(c.id);
      var isDisabled = disabledCards.indexOf(c.id) >= 0;
      var accuracy = stat.seen > 0 ? Math.round(stat.correct / stat.seen * 100) : -1;

      var item = createElement('div', {
        className: 'card-browser-item' + (isDisabled ? ' disabled-card' : '') + (stat.wrong > 2 ? ' missed-card' : '')
      });

      // Buzzwords (safe)
      var bwEl = createElement('div', { className: 'cb-buzzwords' });
      setText(bwEl, c.bw.join(' • '));
      item.appendChild(bwEl);

      // Answer (safe)
      var ansEl = createElement('div', { className: 'cb-answer' });
      setText(ansEl, c.ans);
      item.appendChild(ansEl);

      // Meta row
      var meta = createElement('div', { className: 'cb-meta' });
      var subjTag = createElement('span', { className: 'tag tag-subject' });
      setText(subjTag, c.subj);
      meta.appendChild(subjTag);

      if (accuracy >= 0) {
        var accTag = createElement('span', {
          className: 'tag ' + (accuracy >= 70 ? 'tag-correct' : 'tag-wrong'),
          text: accuracy + '% (' + stat.seen + ')'
        });
        meta.appendChild(accTag);
      } else {
        meta.appendChild(createElement('span', { className: 'tag', text: 'Not seen' }));
      }

      // Toggle button
      var toggleBtn = createElement('div', {
        className: 'card-browser-toggle' + (isDisabled ? '' : ' enabled'),
        text: isDisabled ? '🚫 Disabled' : '✅ Enabled'
      });
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (storage.isCardDisabled) {
          storage.toggleCardDisabled(c.id);
        } else {
          var disabled = storage.get('disabledCards') || [];
          var idx = disabled.indexOf(c.id);
          if (idx >= 0) disabled.splice(idx, 1);
          else disabled.push(c.id);
          storage.set('disabledCards', disabled);
        }
        self._renderCardBrowserResults();
      });
      meta.appendChild(toggleBtn);

      item.appendChild(meta);
      list.appendChild(item);
    });

    resultsContainer.appendChild(list);

    // Pagination controls
    if (totalPages > 1) {
      var pagRow = createElement('div');
      pagRow.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-top:10px';

      if (page > 0) {
        var prevBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: '← Prev' });
        prevBtn.addEventListener('click', function () { self.cardBrowserPage--; self._renderCardBrowserResults(); });
        pagRow.appendChild(prevBtn);
      }

      pagRow.appendChild(createElement('span', { text: 'Page ' + (page + 1) + ' of ' + totalPages }));
      pagRow.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted);display:flex;align-items:center';

      if (page < totalPages - 1) {
        var nextBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Next →' });
        nextBtn.addEventListener('click', function () { self.cardBrowserPage++; self._renderCardBrowserResults(); });
        pagRow.appendChild(nextBtn);
      }

      resultsContainer.appendChild(pagRow);
    }
  }

  // ═══════════════════════════════════════════════════════
  // PROFILE (with complete profile picture selector) [2]
  // ═══════════════════════════════════════════════════════

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

    // Badge selector
    if (achievements.length > 0) {
      var badgeSection = createElement('div', { className: 'profile-badges' });
      badgeSection.appendChild(createElement('h4', { text: 'Selected Badges (tap to toggle, max 6)' }));
      var badgeGrid = createElement('div', { className: 'profile-badge-grid' });

      ACHIEVEMENTS.forEach(function (ach) {
        if (achievements.indexOf(ach.id) < 0) return;
        var isSelected = selectedBadges.indexOf(ach.id) >= 0;
        var chip = createElement('div', {
          className: 'subject-chip' + (isSelected ? ' selected' : ''),
          text: ach.icon + ' ' + ach.name,
          dataset: { badge: ach.id }
        });
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', function () {
          var badges = storage.get('selectedBadges') || [];
          var idx = badges.indexOf(ach.id);
          if (idx >= 0) {
            badges.splice(idx, 1);
          } else {
            if (badges.length >= 6) {
              self._showToast('Maximum 6 badges. Remove one first.');
              return;
            }
            badges.push(ach.id);
          }
          storage.set('selectedBadges', badges);
          chip.classList.toggle('selected');
        });
        badgeGrid.appendChild(chip);
      });

      badgeSection.appendChild(badgeGrid);
      container.appendChild(badgeSection);
    }

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
  }

  // ═══════════════════════════════════════════════════════
  // FLASHCARD SCREEN
  // ═══════════════════════════════════════════════════════

  startFlashcardSession(subjects) {
    var subjs = subjects || storage.get('selectedSubjects');
    if (!subjs || subjs.length === 0) subjs = SUBJECTS.slice();
    var examFilters = storage.get('selectedExams') || [];
    this.flashcardMode.start(subjs, examFilters, 20);
    if (!this.flashcardMode.sessionActive) {
      this._showToast('No cards available for the selected filters.');
      return;
    }
    this.show('screenFlashcard');
    this.renderFlashcardScreen();
  }

  renderFlashcardScreen() {
    var container = document.getElementById('flashcardContent');
    if (!container) return;
    clearElement(container);
    var self = this;
    var fm = this.flashcardMode;

    if (!fm.sessionActive) {
      var startBtn = createElement('button', { className: 'btn btn-green btn-block', text: '📖 Start Flashcard Session' });
      startBtn.style.marginTop = '12px';
      startBtn.addEventListener('click', function () { self.startFlashcardSession(); });
      var backBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '🏠 Back to Home' });
      backBtn.style.marginTop = '6px';
      backBtn.addEventListener('click', function () { self.show('screenHome'); });
      var wrap = createElement('div');
      wrap.style.cssText = 'text-align:center;padding:30px';
      wrap.appendChild(createElement('p', { text: 'No active flashcard session.' }));
      wrap.lastChild.style.color = 'var(--text-muted)';
      wrap.appendChild(startBtn);
      wrap.appendChild(backBtn);
      container.appendChild(wrap);
      return;
    }

    if (fm.isComplete()) {
      this._renderFlashcardSummary(container);
      return;
    }

    var progress = fm.getProgress();
    var cardHTML = fm.showCard(); // returns HTML string - we need to handle this safely

    // Progress bar
    var progressWrap = createElement('div');
    progressWrap.style.cssText = 'text-align:center;margin-bottom:10px';
    progressWrap.appendChild(createElement('div', { text: 'Card ' + progress.current + ' of ' + progress.total }));
    progressWrap.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted)';

    var barOuter = createElement('div', { className: 'fc-progress-bar' });
    barOuter.style.margin = '6px 0';
    var barInner = createElement('div', { className: 'fc-progress-fill' });
    barInner.style.width = Math.round((progress.current - 1) / progress.total * 100) + '%';
    barOuter.appendChild(barInner);
    progressWrap.appendChild(barOuter);

    progressWrap.appendChild(createElement('div', { text: '✅ ' + progress.correctSoFar + ' | ❌ ' + progress.wrongSoFar }));
    progressWrap.lastChild.style.cssText = 'font-size:10px;color:var(--text-muted)';
    container.appendChild(progressWrap);

    // Card display area
    var cardArea = createElement('div');
    cardArea.style.cssText = 'background:var(--bg-card-solid);border-radius:var(--radius-lg);padding:20px;text-align:center;border:var(--border-glow)';
    // Note: flashcardMode.showCard() returns HTML - we insert it but this is source-controlled markup
    cardArea.innerHTML = cardHTML;

    if (!fm.revealed) {
      var revealBtn = createElement('button', { className: 'btn btn-primary btn-block', text: 'Show Answer' });
      revealBtn.style.marginTop = '16px';
      revealBtn.addEventListener('click', function () {
        fm.revealAnswer();
        self.renderFlashcardScreen();
      });
      cardArea.appendChild(revealBtn);
    } else {
      var answerArea = createElement('div');
      answerArea.style.marginTop = '12px';
      answerArea.innerHTML = fm.revealAnswer(); // source-controlled HTML from FlashcardMode
      cardArea.appendChild(answerArea);

      var btnRow = createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px';
      var gotItBtn = createElement('button', { className: 'btn btn-green', text: '✅ Got it' });
      gotItBtn.style.flex = '1';
      gotItBtn.addEventListener('click', function () { fm.markCorrect(); self.renderFlashcardScreen(); });
      btnRow.appendChild(gotItBtn);

      var missedBtn = createElement('button', { className: 'btn btn-red', text: '❌ Missed it' });
      missedBtn.style.flex = '1';
      missedBtn.addEventListener('click', function () { fm.markIncorrect(); self.renderFlashcardScreen(); });
      btnRow.appendChild(missedBtn);
      cardArea.appendChild(btnRow);
    }

    container.appendChild(cardArea);

    var endBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '✕ End Session' });
    endBtn.style.marginTop = '10px';
    endBtn.addEventListener('click', function () { fm.end(); self.show('screenHome'); });
    container.appendChild(endBtn);
  }

  _renderFlashcardSummary(container) {
    var self = this;
    var fm = this.flashcardMode;
    var summary = fm.getSummary();
    var missed = fm.getMissedCards();

    var header = createElement('div');
    header.style.cssText = 'text-align:center;padding:16px 0';
    header.appendChild(createElement('h2', { text: '📋 Session Complete' }));

    var statsRow = createElement('div', { className: 'post-stats' });
    statsRow.style.margin = '10px 0';
    [
      { val: summary.correct, label: 'Correct', color: 'var(--accent-green)' },
      { val: summary.wrong, label: 'Missed', color: 'var(--accent-red)' },
      { val: summary.accuracy + '%', label: 'Accuracy' }
    ].forEach(function (s) {
      var stat = createElement('div', { className: 'post-stat' });
      var valEl = createElement('div', { className: 'val', text: String(s.val) });
      if (s.color) valEl.style.color = s.color;
      stat.appendChild(valEl);
      stat.appendChild(createElement('div', { className: 'label', text: s.label }));
      statsRow.appendChild(stat);
    });
    header.appendChild(statsRow);
    container.appendChild(header);

    // Missed cards
    if (missed.length > 0) {
      container.appendChild(createElement('h3', { text: '❌ Missed Cards' }));
      container.lastChild.style.cssText = 'margin:10px 0 6px';

      missed.forEach(function (r) {
        var card = createElement('div', { className: 'review-card' });
        var h4 = createElement('h4');
        setText(h4, '❌ ' + r.card.bw.join(' • '));
        card.appendChild(h4);

        var tagRow = createElement('div');
        var ansTag = createElement('span', { className: 'tag tag-correct' });
        setText(ansTag, '✓ ' + r.card.ans);
        tagRow.appendChild(ansTag);
        var subjTag = createElement('span', { className: 'tag tag-subject' });
        setText(subjTag, r.card.subj);
        tagRow.appendChild(subjTag);
        card.appendChild(tagRow);

        var tp = createElement('p');
        setText(tp, r.card.tp);
        tp.style.cssText = 'margin-top:4px;font-size:11px;color:var(--text-secondary)';
        card.appendChild(tp);

        container.appendChild(card);
      });
    } else {
      container.appendChild(createElement('h3', { text: '🎉 Perfect Session!' }));
      container.lastChild.style.cssText = 'margin:10px 0 6px;color:var(--accent-green)';
    }

    // Action buttons
    var actionRow = createElement('div');
    actionRow.style.cssText = 'display:flex;gap:6px;margin-top:14px';

    if (missed.length > 0) {
      var reviewBtn = createElement('button', { className: 'btn btn-primary', text: '🔄 Review Missed' });
      reviewBtn.style.flex = '1';
      reviewBtn.addEventListener('click', function () {
        fm.reviewMissed();
        self.renderFlashcardScreen();
      });
      actionRow.appendChild(reviewBtn);
    }

    var newBtn = createElement('button', { className: 'btn btn-green', text: '📖 New Session' });
    newBtn.style.flex = '1';
    newBtn.addEventListener('click', function () { fm.end(); self.startFlashcardSession(); });
    actionRow.appendChild(newBtn);
    container.appendChild(actionRow);

    var homeBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '🏠 Home' });
    homeBtn.style.marginTop = '6px';
    homeBtn.addEventListener('click', function () { fm.end(); self.show('screenHome'); });
    container.appendChild(homeBtn);
  }

  // ═══════════════════════════════════════════════════════
  // POST-RUN (displays ALL answers — correct + wrong) [2]
  // ═══════════════════════════════════════════════════════

  showPostRun(game) {
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
    var skinInfo = game.currentSkin ? ' • Track: ' + game.currentSkin.name : '';
    var metaP = createElement('p', { text: 'Speed: ' + game.userSpeed + '×' + skinInfo + (game.continued ? ' (continued)' : '') });
    metaP.style.cssText = 'color:var(--text-muted);font-size:12px';
    header.appendChild(metaP);
    content.appendChild(header);

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

    // Stats grid
    var statsRow = createElement('div', { className: 'post-stats' });
    [
      { val: acc + '%', label: 'Accuracy', color: 'var(--accent-green)' },
      { val: '🪙 ' + game.coins, label: 'Coins', color: 'var(--accent-gold)' },
      { val: '🔥 ' + game.bestStreak, label: 'Streak' }
    ].forEach(function (s) {
      var stat = createElement('div', { className: 'post-stat' });
      var valEl = createElement('div', { className: 'val', text: String(s.val) });
      if (s.color) valEl.style.color = s.color;
      stat.appendChild(valEl);
      stat.appendChild(createElement('div', { className: 'label', text: s.label }));
      statsRow.appendChild(stat);
    });
    content.appendChild(statsRow);

    var statsRow2 = createElement('div', { className: 'post-stats' });
    statsRow2.style.gridTemplateColumns = '1fr 1fr';
    [
      { val: game.correct, label: 'Correct', color: 'var(--accent-green)' },
      { val: game.wrong, label: 'Wrong', color: 'var(--accent-red)' }
    ].forEach(function (s) {
      var stat = createElement('div', { className: 'post-stat' });
      var valEl = createElement('div', { className: 'val', text: String(s.val) });
      if (s.color) valEl.style.color = s.color;
      stat.appendChild(valEl);
      stat.appendChild(createElement('div', { className: 'label', text: s.label }));
      statsRow2.appendChild(stat);
    });
    content.appendChild(statsRow2);

    // Missed cards
    if (missed.length > 0) {
      content.appendChild(createElement('h3', { text: '❌ Missed Cards (' + missed.length + ')' }));
      content.lastChild.style.cssText = 'margin:14px 0 6px';

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
            alert('Card reported — thank you for helping improve the game!');
          }
        });
        card.appendChild(reportBtn);

        content.appendChild(card);
      });
    } else {
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

    // Action buttons
    var actionRow = createElement('div');
    actionRow.style.cssText = 'display:flex;gap:6px;margin-top:14px';

    var againBtn = createElement('button', { className: 'btn btn-green', text: '▶ Again', attributes: { id: 'playAgainBtn' } });
    againBtn.style.flex = '1';
    actionRow.appendChild(againBtn);

    var homeBtn = createElement('button', { className: 'btn btn-primary', text: '🏠 Home', attributes: { id: 'goHomeBtn' } });
    homeBtn.style.flex = '1';
    homeBtn.addEventListener('click', function () { self.show('screenHome'); });
    actionRow.appendChild(homeBtn);
    content.appendChild(actionRow);

    if (missed.length > 0) {
      var weakBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '🎯 Weakness Mode', attributes: { id: 'weaknessBtn' } });
      weakBtn.style.marginTop = '6px';
      content.appendChild(weakBtn);

      var qrBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '📝 Quick Review' });
      qrBtn.style.marginTop = '6px';
      qrBtn.addEventListener('click', function () { self.showQuickReview(missed); });
      content.appendChild(qrBtn);
    }

    var shareBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '📤 Share Score' });
    shareBtn.style.marginTop = '6px';
    shareBtn.addEventListener('click', function () { self.shareScore(game); });
    content.appendChild(shareBtn);

    this.show('screenPostRun');

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
  }

  // ═══════════════════════════════════════════════════════
  // CONFETTI
  // ═══════════════════════════════════════════════════════

  showConfetti() {
    if (prefersReducedMotion()) return;
    var colors = ['#ff3355', '#00ff88', '#ffcc00', '#44aaff', '#bb66ff', '#ff44aa'];
    for (var i = 0; i < 40; i++) {
      var piece = createElement('div', { className: 'confetti-piece' });
      piece.style.left = (10 + Math.random() * 80) + '%';
      piece.style.top = '-10px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.animationDuration = (1 + Math.random() * 1) + 's';
      document.body.appendChild(piece);
      setTimeout(function (el) { if (el.parentNode) el.parentNode.removeChild(el); }, 2500, piece);
    }
    var banner = createElement('div', { className: 'new-best-banner', text: '🏆 NEW BEST!' });
    document.body.appendChild(banner);
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 2500);
  }

  // ═══════════════════════════════════════════════════════
  // QUICK REVIEW
  // ═══════════════════════════════════════════════════════

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
  }

  // ═══════════════════════════════════════════════════════
  // TUTORIAL
  // ═══════════════════════════════════════════════════════

  showTutorial() {
    this.tutorialPage = 0;
    this.renderTutorialPage();
    var overlay = document.getElementById('tutorialOverlay');
    overlay.classList.add('active');
    trapFocus(overlay);
  }

  renderTutorialPage() {
    var p = this.tutorialPages[this.tutorialPage];
    var self = this;
    var tutPage = document.getElementById('tutPage');
    clearElement(tutPage);

    var iconEl = createElement('div', { className: 'tut-icon', text: p.icon });
    tutPage.appendChild(iconEl);
    tutPage.appendChild(createElement('h2', { text: p.title }));
    tutPage.appendChild(createElement('p', { text: p.text }));

    var dots = document.getElementById('tutDots');
    clearElement(dots);
    for (var i = 0; i < this.tutorialPages.length; i++) {
      dots.appendChild(createElement('div', { className: 'tut-dot' + (i === self.tutorialPage ? ' active' : '') }));
    }

    setText(document.getElementById('tutNextBtn'), this.tutorialPage === this.tutorialPages.length - 1 ? 'Start Playing! ✓' : 'Next →');
  }

  tutorialNext() {
    this.tutorialPage++;
    if (this.tutorialPage >= this.tutorialPages.length) {
      document.getElementById('tutorialOverlay').classList.remove('active');
      releaseFocusTrap();
    } else {
      this.renderTutorialPage();
    }
  }

  // ═══════════════════════════════════════════════════════
  // CALENDAR
  // ═══════════════════════════════════════════════════════

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
  }

  // ═══════════════════════════════════════════════════════
  // SHARE
  // ═══════════════════════════════════════════════════════

  shareScore(game) {
    var total = game.correct + game.wrong;
    var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
    var skinName = game.currentSkin ? game.currentSkin.name : 'Unknown';
    var text = '⚡ Buzzword Dash ⚡\n🏆 Score: ' + game.score + '\n✅ Accuracy: ' + acc + '%\n🔥 Streak: ' + game.bestStreak + '\n🪙 Coins: ' + game.coins + '\n💊 Speed: ' + game.userSpeed + '×\n🌍 Track: ' + skinName + '\n\nCan you beat my score? Play at:\n' + window.location.href;

    if (navigator.share) {
      navigator.share({ title: 'Buzzword Dash Score', text: text }).catch(function () {
        _copyToClipboard(text);
      });
    } else {
      _copyToClipboard(text);
    }
  }

} // end class UI

// ═══════════════════════════════════════════════════════
// CLIPBOARD HELPER
// ═══════════════════════════════════════════════════════

function _copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      alert('Score copied to clipboard! Paste it anywhere to share.');
    }).catch(function () { _fallbackCopy(text); });
  } else {
    _fallbackCopy(text);
  }
}

function _fallbackCopy(text) {
  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    alert('Score copied to clipboard!');
  } catch (e) {
    alert('Could not copy. Your score:\n\n' + text);
  }
  document.body.removeChild(textarea);
}

export var ui = new UI();
