/**
 * ui.js — Main UI Controller for Dx Dash
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

import { renderLibraryBanner } from './proui.js';
import { requireGate } from './pro.js';
import { shareLink, track as shareTrack } from './analytics/index.js';
import { renderPal } from './palui.js';
import { setText, createElement, clearElement } from './dom.js';
import { SUBJECTS, CARDS, EXAM_FILTERS } from './cardhub.js';
import { storage } from './storage.js';
import { startTutorial } from './tutorial.js';
import { missExplanation } from './explain.js';
import { appPublicUrl } from './publicurl.js';
import { shareText, copyText, saveFile } from './platform.js';
import { buildBackup, restoreBackup } from './backup.js';
import { speak, cancelSpeech } from './tts.js';
import { isGameTutorialOpen } from './tutorialrun.js';
import { createColorWheel } from './colorwheel.js';
import { audio } from './audio.js';
import { customCards } from './customcards.js';
import { LOCKER_ITEMS, ACHIEVEMENTS, QUESTS } from './game/shopdata.js';
import { CharacterPreview } from './game/preview.js';
import { FlashcardMode } from './game/flashcardmode.js';
import { getControlText } from './controlhints.js';
import { KEY_ACTIONS, getKeyBindings, keyLabel } from './keybindings.js';
import { getDashControl } from './dashcontrol.js';
import { streakCallout } from './flavor.js';
import { dailyReward, loginStep } from './progress.js';
import { newlyAffordable, markSeen } from './lockerdots.js';
import { showDailyRewardModal } from './rewardsui.js';
import { listDecks, getDeck, saveDeck, removeDeck } from './deckcache.js';
import { postRunMethods } from './uipostrun.js';
import { settingsMethods } from './uisettings.js';
import { studyMethods } from './uistudy.js';
import { browseMethods } from './uibrowse.js';
import { profileMethods } from './uiprofile.js';
import { homeMethods, SHEETS } from './uihome.js';
import { prefersReducedMotion, trapFocus, releaseFocusTrap } from './uihelpers.js';

// ═══════════════════════════════════════════════════════════
// SETTINGS EXTENSIONS REGISTRY (Section 21.1) [2]
// ═══════════════════════════════════════════════════════════

var _settingsExtensions = [];

// ═══════════════════════════════════════════════════════════
// UI CLASS
// ═══════════════════════════════════════════════════════════

/** The secret needs this many taps on the title... */
export var TITLE_TAPS_NEEDED = 20;
/** ...all within this many milliseconds (about 2.5 taps a second: deliberate, never accidental). */
export var TITLE_TAPS_WITHIN_MS = 8000;

/** Remember a tap, keeping only the most recent ones that could still count. */
export function pushTitleTap(taps, now) {
  var kept = taps.filter(function (t) { return now - t <= TITLE_TAPS_WITHIN_MS; });
  kept.push(now);
  return kept.slice(-TITLE_TAPS_NEEDED);
}

/** True when the last 20 taps all fell inside the window. */
export function titleTapsUnlock(taps) {
  return taps.length >= TITLE_TAPS_NEEDED && taps[taps.length - 1] - taps[taps.length - TITLE_TAPS_NEEDED] <= TITLE_TAPS_WITHIN_MS;
}

/** The tab a screen belongs to (sub-pages keep their parent's tab lit; Settings and Ranks light none). */
function NAV_PARENT(screenId) {
  if (screenId === 'screenCardBrowser' || screenId === 'screenMyCards' || screenId === 'screenFlashcard') return 'screenHome';
  return screenId;
}

/** The speed settings, slowest to fastest. 1 is the default; the first three are slower for a calmer track. */
export var SPEED_STEPS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** The slider position for a saved speed (the nearest setting). */
export function speedIndex(speed) {
  var best = 3, gap = Infinity;
  SPEED_STEPS.forEach(function (v, i) { var d = Math.abs(v - (Number(speed) || 1)); if (d < gap) { gap = d; best = i; } });
  return best;
}

class UI {
  constructor() {
    this.characterPreview = null;
    this.titleTapCount = 0;
    this.titleTapTimer = null;
    this.konamiSequence = [];
    this.konamiCode = [38, 38, 40, 40, 37, 39, 37, 39];

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
    this.setupSpeedDial();
    this.bindNavigation();
    this.bindHomeSheets();
    this.bindMusicToggle();
    this.bindFlashcardKeys();
    this.bindSubjectControls();
    this.bindCustomCards();
    this.bindEasterEggs();
    this.checkDailyLoginReward();
    this.createVignetteOverlay();
    this.renderCalendar();
    this.renderExamFilter();
    this.renderAdvancedFilters();
    this._renderFiltersSummary();
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

  show(screenId, slideFrom) {
    // Leaving the Locker: the items that wore a red dot have now been seen
    var shopEl = document.getElementById('screenShop');
    if (shopEl && shopEl.classList.contains('active') && screenId !== 'screenShop' && this._lockerFresh && this._lockerFresh.length) {
      storage.set('lockerSeen', markSeen(storage.get('lockerSeen') || [], this._lockerFresh));
      this._lockerFresh = [];
      document.dispatchEvent(new CustomEvent('dx:coins-changed'));
    }
    // Leaving the profile: the badges that wore a red dot have now been seen
    var profileEl = document.getElementById('screenProfile');
    if (profileEl && profileEl.classList.contains('active') && screenId !== 'screenProfile') storage.markAchievementsSeen();
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    var el = document.getElementById(screenId);
    if (el) {
      el.classList.remove('from-left', 'from-right');
      if (slideFrom) el.classList.add(slideFrom); // swiped in from this side
      el.classList.add('active');
    }
    document.body.setAttribute('data-screen', screenId); // the flying objects are a Home-only element

    if (screenId === 'screenHome') {
      document.dispatchEvent(new CustomEvent('dx:home-shown'));
      this.renderHome();
      if (this.homeCharacter) this.homeCharacter.startAnimation();
    }
    if (screenId === 'screenStats') this.renderStats();
    if (screenId === 'screenQuests') this.renderQuests();
    if (screenId === 'screenShop') {
      // What newly became affordable since the last visit wears a red dot until the player leaves
      this._lockerFresh = newlyAffordable(LOCKER_ITEMS, storage.get('coins') || 0, storage.get('ownedItems') || [], storage.get('lockerSeen') || []);
      this._lockerOpen = false; // each visit starts folded: the display, the tabs and what you wear
      this.renderShop();
      this.startPreview();
      this._syncLockerPreview();
    }
    if (screenId === 'screenSettings') { this._settingsSection = null; this.renderSettings(); }
    if (screenId === 'screenMyCards') { this.renderCustomCardList(); this._renderSavedDecks(); }
    if (screenId === 'screenProfile') this.renderProfile();
    if (screenId === 'screenCardBrowser') this.renderCardBrowser();
    if (screenId !== 'screenFlashcard' && this._hf && this._hf.active) this.stopHandsFree();
    if (screenId === 'screenFlashcard') this.renderFlashcardScreen();
    if (screenId === 'screenExam') this.openExam();

    if (screenId !== 'screenShop' && this.characterPreview) {
      this.characterPreview.stopAnimation();
    }
    if (screenId !== 'screenHome' && this.homeCharacter) {
      this.homeCharacter.stopAnimation();
    }

    document.dispatchEvent(new CustomEvent('dx:attention-changed'));

    var indicator = document.querySelectorAll('#tabIndicator span');
    document.querySelectorAll('.nav-item').forEach(function (n, idx) {
      if (indicator[idx]) indicator[idx].classList.toggle('on', n.dataset.screen === NAV_PARENT(screenId));
      var isCurrent = n.dataset.screen === NAV_PARENT(screenId);
      n.classList.toggle('active', isCurrent);
      // aria-current drives the highlight too, so it must follow the tab
      if (isCurrent) n.setAttribute('aria-current', 'true');
      else n.removeAttribute('aria-current');
    });
  }

  hideAll() {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    if (this.characterPreview) this.characterPreview.stopAnimation();
    if (this.homeCharacter) this.homeCharacter.stopAnimation();
  }

  /** Where Back goes from each screen (anything not listed goes Home). */
  _parentScreen(screenId) {
    if (screenId === 'screenCardEditor' || screenId === 'screenImportExport') return 'screenMyCards';
    return 'screenHome';
  }

  /**
   * One step back, used by the on-screen Back buttons and the Android back button.
   * @returns {boolean} false when already on Home (nothing to go back to)
   */
  goBack() {
    var current = document.querySelector('.screen.active');
    if (!current || current.id === 'screenHome') return false;
    if (current.id === 'screenSettings' && this._settingsSection) {
      this._settingsSection = null; // a settings section goes back to the list of sections
      this.renderSettings();
      return true;
    }
    this.show(this._parentScreen(current.id));
    return true;
  }

  /**
   * Every screen except the tab screens (Stats, Locker, Home, Quests, Profile: the bottom bar and a swipe
   * already move between them) and the results screen gets a Back button at the top.
   */
  _addBackButtons() {
    var self = this;
    var tabScreens = ['screenStats', 'screenShop', 'screenHome', 'screenQuests', 'screenProfile', 'screenPostRun'];
    document.querySelectorAll('.screen').forEach(function (screen) {
      if (tabScreens.indexOf(screen.id) >= 0) return;
      var scroll = screen.querySelector('.screen-scroll');
      if (!scroll || scroll.querySelector('.back-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-sm back-btn';
      btn.textContent = '← Back';
      btn.setAttribute('aria-label', 'Back');
      btn.addEventListener('click', function () { self.goBack(); });
      scroll.insertBefore(btn, scroll.firstChild);
    });
  }

  bindNavigation() {
    var self = this;
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () {
        self.show(item.dataset.screen);
      });
    });
    this._addBackButtons();
    // The interactive tutorial: the same one from Home, Settings and the first run
    var howToBtn = document.getElementById('howToPlayBtn');
    if (howToBtn) howToBtn.addEventListener('click', function () { self.showTutorial(); });
    var settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', function () { self.show('screenSettings'); });
    var shopBtn = document.getElementById('shopBtn');
    if (shopBtn) shopBtn.addEventListener('click', function () { self.show('screenShop'); });
    var myCardsBtn = document.getElementById('myCardsBtn');
    if (myCardsBtn) myCardsBtn.addEventListener('click', function () {
      self.show('screenMyCards');
      self.renderCustomCardList();
    });
    var profileBtn = document.getElementById('profileBtn');
    if (profileBtn) profileBtn.addEventListener('click', function () { self.show('screenProfile'); });
    var cardBrowserBtn = document.getElementById('cardBrowserBtn');
    if (cardBrowserBtn) cardBrowserBtn.addEventListener('click', function () { self.show('screenCardBrowser'); });
    var flashcardBtn = document.getElementById('flashcardBtn');
    if (flashcardBtn) flashcardBtn.addEventListener('click', function () { self.show('screenFlashcard'); });
    var examBtn = document.getElementById('examBtn');
    if (examBtn) examBtn.addEventListener('click', function () { self.show('screenExam'); });
  }

  /** Lazy-load and mount the exam simulator. */
  openExam() {
    var self = this;
    var container = document.getElementById('examContent');
    if (!container) return;
    import('./exam.js').then(function (mod) {
      mod.mountExam(container, {
        goHome: function () { mod.unmountExam(); self.show('screenHome'); },
        toast: function (m) { self._showToast(m); },
        startFlashcards: function (ids) { mod.unmountExam(); self.startFlashcardSession(null, ids); }
      });
    }).catch(function () { self._showToast('Could not load the exam simulator.'); });
  }

  /** Keyboard study: Space/Enter reveals, right arrow or 1 = got it, left arrow or 2 = missed. */
  bindFlashcardKeys() {
    document.addEventListener('keydown', function (e) {
      var screen = document.getElementById('screenFlashcard');
      if (!screen || getComputedStyle(screen).display === 'none') return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var id = null;
      if (e.key === ' ' || e.key === 'Enter') id = document.getElementById('fcRevealBtn') ? 'fcRevealBtn' : null;
      else if (e.key === 'ArrowRight' || e.key === '1') id = 'fcGotBtn';
      else if (e.key === 'ArrowLeft' || e.key === '2') id = 'fcMissBtn';
      var btn = id && document.getElementById(id);
      if (btn) { e.preventDefault(); btn.click(); }
    });
  }

  bindMusicToggle() {
    var btn = document.getElementById('musicToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var playing = !storage.get('musicOn');
      storage.set('musicOn', playing);
      audio.updateSettings();
      if (playing) audio.startMusic(); else audio.stopMusic();
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

      var rankedCard = document.getElementById('rankedResult');
      if (rankedCard) { rankedCard.remove(); return; }

      // Close modals in priority order
      // (the Home pop-ups come from the one list in uihome.js, so a new one cannot be forgotten here)
      var overlays = ['reviewOverlay', 'quickReviewOverlay', 'continueOverlay', 'multiplayerOverlay'].concat(SHEETS);
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
        // 20 taps inside a few seconds: taps minutes (or even a minute) apart never add up
        self.titleTaps = pushTitleTap(self.titleTaps || [], Date.now());
        if (titleTapsUnlock(self.titleTaps)) {
          self.titleTaps = [];
          storage.addCoins(100000);
          audio.play('secret');
          self._showToast('Secret found! +100,000 coins!');
          self.renderHome();
          document.dispatchEvent(new CustomEvent('dx:coins-changed'));
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
   * A short message that floats up and fades (safe text rendering; honours reduced motion). Screen readers announce
   * it (role=status). `holdMs` keeps it fully visible for that long first, for a sentence the player has to read.
   */
  _showToast(message, holdMs) {
    audio.play('achievement');
    var popup = createElement('div', { className: 'toast', text: message, attributes: { role: 'status', 'aria-live': 'polite' } });
    popup.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%) rotate(-1.5deg);font-size:18px;font-weight:900;color:#1b0a40;pointer-events:none;z-index:30;transition:all 1.2s ease-out;opacity:1;background:#fff6dc;padding:12px 22px;border-radius:16px;border:4px solid #1b0a40;box-shadow:0 5px 0 #1b0a40;text-align:center;max-width:86vw;';
    document.body.appendChild(popup);
    var hold = Math.max(0, Number(holdMs) || 0);
    setTimeout(function () {
      if (!prefersReducedMotion()) {
        requestAnimationFrame(function () {
          popup.style.top = '25%';
          popup.style.opacity = '0';
        });
      } else {
        setTimeout(function () { popup.style.opacity = '0'; }, 800);
      }
    }, hold);
    setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, hold + 1200);
  }

  // ═══════════════════════════════════════════════════════
  // DAILY LOGIN REWARD
  // ═══════════════════════════════════════════════════════

  checkDailyLoginReward() {
    var step = loginStep(storage.get('lastLoginDate'), storage.get('loginStreak'), storage.getTodayKey());
    if (!step.claim) {
      if (storage.get('lastLoginDate') !== step.last) storage.set('lastLoginDate', step.last); // an old-format date, now a key
      return;
    }
    storage.set('lastLoginDate', step.last);
    var loginStreak = step.streak;
    storage.set('loginStreak', loginStreak);
    var reward = dailyReward(loginStreak);
    storage.addCoins(reward.coins);
    shareTrack('daily_reward_claimed', { day: loginStreak, coins: reward.coins, chest: !!reward.chest, login_streak: loginStreak });
    var self = this;
    // The coins are already in the wallet; the screen is the reveal. It waits for the tutorial to finish.
    function show() {
      var tutorial = document.getElementById('tutorialOverlay');
      var coach = document.getElementById('tutorialCoach');
      if ((tutorial && tutorial.classList.contains('active')) || (coach && coach.classList.contains('active')) || isGameTutorialOpen()) { setTimeout(show, 1000); return; }
      // ...and for the player to be on Home: never on top of a run, its results, a tour or another pop-up
      var home = document.getElementById('screenHome');
      if (!(home && home.classList.contains('active')) || document.getElementById('tourOverlay') || document.getElementById('analyticsConsent') || document.querySelector('.sheet-overlay.active, #multiplayerOverlay.active, #quickReviewOverlay.active, #reviewOverlay.active')) { setTimeout(show, 1000); return; }
      audio.play('coin');
      showDailyRewardModal({
        streak: loginStreak,
        reward: reward,
        onClose: function () {
          self.renderHome();
          document.dispatchEvent(new CustomEvent('dx:coins-changed'));
        }
      });
    }
    setTimeout(show, 500);
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
    // the slider walks SPEED_STEPS: three slower settings below the 1× default, then 2× to 10× as before
    dial.min = '0'; dial.max = String(SPEED_STEPS.length - 1); dial.step = '1';
    var current = storage.get('userSpeed') || 1;
    dial.value = String(speedIndex(current));
    var shown = SPEED_STEPS[speedIndex(current)];
    var note = document.getElementById('speedNote');
    if (note) note.hidden = shown >= 1;
    setText(val, shown + '×');
    var btnVal = document.getElementById('speedBtnValue');
    if (btnVal) setText(btnVal, shown + '×');
    var self = this;
    dial.addEventListener('input', function () {
      var v = SPEED_STEPS[Math.max(0, Math.min(SPEED_STEPS.length - 1, parseInt(dial.value, 10) || 0))];
      storage.set('userSpeed', v);
      if (note) note.hidden = v >= 1;
      setText(val, v + '×');
      if (btnVal) setText(btnVal, v + '×');
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
    this.renderStudyGoal();
    this._renderFiltersSummary();
    renderPal();
    document.dispatchEvent(new CustomEvent('dx:attention-changed')); // the weekly claim button was just redrawn
  }

  // ═══════════════════════════════════════════════════════
  // SUBJECTS
  // ═══════════════════════════════════════════════════════

  renderSubjects() {
    var selected = storage.get('selectedSubjects');
    var container = document.getElementById('subjectScroll');
    if (!container) return;
    var self = this;
    if (container.parentNode) renderLibraryBanner(container.parentNode, 'subjects');

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

  /**
   * Chips for one filter. An empty list means "everything", so every chip then shows as on; tapping one narrows
   * the filter to that choice, tapping more adds to it, and turning the last one off goes back to everything.
   * @param {HTMLElement} scroll where the chips go
   * @param {Array<{id: *, label: string}>} items
   * @param {function(): Array} read the saved list
   * @param {function(*): void} toggle add or remove one id in the saved list
   * @param {string} dataKey the data attribute that names the chip (data-exam, data-qtype, data-year)
   * @param {function(): void} [after]
   */
  _filterChips(scroll, items, read, toggle, dataKey, after) {
    var chips = [];
    function paint() {
      var list = read();
      chips.forEach(function (c) { c.el.classList.toggle('selected', list.length === 0 || list.indexOf(c.id) >= 0); });
    }
    items.forEach(function (item) {
      var data = {};
      data[dataKey] = String(item.id);
      var el = createElement('div', { className: 'subject-chip', text: item.label, dataset: data });
      el.addEventListener('click', function () {
        toggle(item.id); // (with everything on, the list is empty, so this makes it the only choice)
        paint();
        if (after) after();
      });
      chips.push({ id: item.id, el: el });
      scroll.appendChild(el);
    });
    paint();
  }

  // ═══════════════════════════════════════════════════════
  // EXAM FILTER
  // ═══════════════════════════════════════════════════════

  renderExamFilter() {
    var container = document.getElementById('examFilterContainer');
    if (!container) return;
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

    this._filterChips(scroll, filters.map(function (ex) { return { id: ex, label: ex }; }),
      function () { return storage.get('selectedExams') || []; },
      function (ex) {
        var exams = (storage.get('selectedExams') || []).slice();
        var idx = exams.indexOf(ex);
        if (idx >= 0) exams.splice(idx, 1); else exams.push(ex);
        storage.set('selectedExams', exams);
      }, 'exam', function () { self._renderFiltersSummary(); });

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
    this._filterChips(qtScroll, QTYPES,
      function () { return storage.get('selectedQuestionTypes') || []; },
      function (id) { storage.toggleArrayItem('selectedQuestionTypes', id); },
      'qtype', function () { self._updateFilterCount(); });
    body.appendChild(qtScroll);

    // Year chips
    var yrLabel = createElement('label', { text: '🎓 Year' });
    yrLabel.style.cssText = 'font-size:11px;font-weight:700;margin-top:8px;display:block';
    body.appendChild(yrLabel);

    var yrScroll = createElement('div', { className: 'subject-scroll' });
    this._filterChips(yrScroll, YEARS,
      function () { return storage.get('selectedYears') || []; },
      function (id) { storage.toggleArrayItem('selectedYears', id); },
      'year', function () { self._updateFilterCount(); });
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

  /** The one-line summary on Home's "Question filters" row, e.g. "All subjects · USMLE · 2 filters". */
  _renderFiltersSummary() {
    var el = document.getElementById('filtersSummary');
    if (!el) return;
    var subjects = storage.get('selectedSubjects') || [];
    var exams = storage.get('selectedExams') || [];
    var advanced = (storage.get('selectedQuestionTypes') || []).length + (storage.get('selectedYears') || []).length + (storage.get('highYieldOnly') ? 1 : 0);
    var parts = [];
    parts.push(subjects.length === 0 || subjects.length >= SUBJECTS.length ? 'All subjects' : subjects.length === 1 ? subjects[0] : subjects.length + ' subjects');
    if (exams.length) parts.push(exams.length === 1 ? String(exams[0]) : exams.length + ' exams');
    if (advanced) parts.push(advanced + (advanced === 1 ? ' filter' : ' filters'));
    setText(el, parts.join(' · '));
  }

  _updateFilterCount() {
    this._renderFiltersSummary();
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

  // ═══════════════════════════════════════════════════════
  // HUD
  // ═══════════════════════════════════════════════════════

  showHud() {
    document.getElementById('hud').classList.remove('off');
  }

  /** A new run starts blank: nothing from the last question (or its answer and teaching point) may linger. */
  resetQuestionDisplay() {
    setText(document.getElementById('buzzText'), 'GET READY');
    this.hideAnswerChoices();
    var fb = document.getElementById('feedbackEl');
    if (fb) { setText(fb, ''); fb.className = ''; }
    var tb = document.getElementById('teachEl');
    if (tb) { setText(tb, ''); tb.classList.remove('show'); }
  }

  hideHud() {
    document.getElementById('hud').classList.add('off');
  }

  /** Full-screen colored pulse for right/wrong answers. */
  flashScreen(correct) {
    if (prefersReducedMotion()) return;
    var el = document.getElementById('screenFlash');
    if (!el) {
      el = createElement('div', { attributes: { id: 'screenFlash', 'aria-hidden': 'true' } });
      document.body.appendChild(el);
    }
    el.className = '';
    void el.offsetWidth; // restart the animation
    el.className = correct ? 'flash-good' : 'flash-bad';
  }

  /** Count numbers up from zero so results feel earned. */
  _animateNumbers(root) {
    if (prefersReducedMotion()) return;
    var targets = root.querySelectorAll('.score-big, .post-stat .val');
    targets.forEach(function (el) {
      var m = /^(\d+)(%?)$/.exec(el.textContent.trim());
      if (!m) return;
      var end = parseInt(m[1], 10);
      var suffix = m[2];
      if (end <= 0) return;
      var start = performance.now();
      var duration = 900;
      function tick(now) {
        var t = Math.min((now - start) / duration, 1);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(end * eased) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      }
      el.textContent = '0' + suffix;
      requestAnimationFrame(tick);
    });
  }

  updateHud(game) {
    var streakPill = document.getElementById('hudStreak') && document.getElementById('hudStreak').parentElement;
    if (streakPill) {
      streakPill.classList.toggle('hot', game.streak >= 5 && game.streak < 10);
      streakPill.classList.toggle('blaze', game.streak >= 10);
    }
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

    var autoBtn = document.getElementById('autoBtn');
    if (autoBtn) {
      var showAuto = !!game.autoPilotHeld;
      autoBtn.hidden = !showAuto;
      autoBtn.disabled = !(game.gatesActive && !game.answerLocked);
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
    this.updateSideCards(game);
  }

  /** The cards beside the track on wide landscape screens (hidden by CSS everywhere else). */
  updateSideCards(game) {
    var acc = document.getElementById('sideAcc');
    if (!acc) return;
    var done = (game.correct || 0) + (game.wrong || 0);
    setText(acc, done ? Math.round((game.correct / done) * 100) + '%' : '–');
    setText(document.getElementById('sideAns'), done);
    setText(document.getElementById('sideBest'), game.bestStreak || 0);
    var map = game.currentSkin ? game.currentSkin.name : '';
    if (map !== this._sideMap) { this._sideMap = map; setText(document.getElementById('sideMap'), map ? '🗺️ ' + map : ''); }
    if (!this._sideKeysShown) this.renderSideKeys();
  }

  /** The keys now in force (a player's own choices included). Touch screens show nothing: the swipes are taught in the tutorial. */
  renderSideKeys() {
    var list = document.getElementById('sideKeyList');
    if (!list) return;
    this._sideKeysShown = true;
    clearElement(list);
    var touch = getControlText().touch;
    if (touch) { list.appendChild(createElement('li', { text: 'Swipe to change lane, jump and slide' })); return; }
    var binds = getKeyBindings();
    KEY_ACTIONS.forEach(function (a) {
      var keys = binds[a.id] || [];
      if (!keys.length) return;
      var li = createElement('li');
      li.appendChild(createElement('span', { text: a.label }));
      li.appendChild(createElement('kbd', { text: keys.slice(0, 2).map(keyLabel).join(' / ') }));
      list.appendChild(li);
    });
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

  showFeedback(card, wasCorrect, choice, teachOnMiss) {
    this._teachOnMiss = teachOnMiss !== false;
    var fb = document.getElementById('feedbackEl');
    setText(fb, (wasCorrect ? '✓ ' : '✗ ') + card.ans);
    fb.className = 'show ' + (wasCorrect ? 'ok' : 'bad');
    // Only Study (which waits for you) and the tutorial show the explanation as it happens; in a scored run
    // there is no time to read it, and the end-of-run review has it.
    if (!wasCorrect && (this._teachOnMiss || this._teachOnMiss === undefined)) {
      var tb = document.getElementById('teachEl');
      if (requireGate('explanations', { record: true, passive: true })) setText(tb, missExplanation(card, choice));
      else setText(tb, '🔒 Free explanations used up today. Go Pro for every "why", every time.');
      shareTrack('explain_viewed', { card_id: card.id, source: this.flashcardMode && this._flashcardActive && this._flashcardActive() ? 'flashcards' : 'study' });
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


  /**
   * A short message that stays out of the way: a small chip at the bottom of the screen, under the
   * runner, never over the question, the answer lanes or the track. Used for map names, hazards,
   * power-ups and match messages. At most three show at once; the oldest goes first.
   * @param {string} text
   * @param {{color?: string, ms?: number}} [options]
   */
  showNotice(text, options) {
    options = options || {};
    var dock = document.getElementById('noticeDock');
    if (!dock) {
      dock = createElement('div', { attributes: { id: 'noticeDock', role: 'status', 'aria-live': 'polite' } });
      document.body.appendChild(dock);
    }
    while (dock.children.length >= 3) dock.removeChild(dock.firstChild);
    var chip = createElement('div', { className: 'notice-chip', text: text });
    if (options.color) chip.style.setProperty('--notice-color', options.color);
    dock.appendChild(chip);
    requestAnimationFrame(function () { chip.classList.add('show'); });
    var ms = options.ms || 2200;
    setTimeout(function () { chip.classList.remove('show'); }, ms);
    setTimeout(function () { if (chip.parentNode) chip.parentNode.removeChild(chip); }, ms + 450);
  }

  showTrackName(text) {
    this.showNotice('🗺 ' + text, { color: 'var(--accent-cyan)', ms: 2500 });
  }

  // ═══════════════════════════════════════════════════════
  // SCORE POPUP / COIN BURST / STREAK / POWERUP
  // ═══════════════════════════════════════════════════════

  showScorePopup(points) {
    if (prefersReducedMotion()) return;
    var popup = createElement('div', { text: typeof points === 'number' ? '+' + points : String(points) });
    popup.style.cssText = 'position:fixed;top:35%;left:50%;transform:translateX(-50%);font-size:24px;font-weight:900;color:var(--accent-gold);text-shadow:0 0 10px rgba(255,215,64,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '20%'; popup.style.opacity = '0'; });
    setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, 800);
  }

  /**
   * A coin off the track: it flies from where it was to the coin counter, which bumps when it arrives.
   * (No text per coin: a stream of "+1"s buries the track. Only a bigger coin, from a power-up, says what it is worth.)
   * @param {{value: number, sx: number, sy: number, air: boolean}} info
   */
  showCoinPickup(info) {
    if (prefersReducedMotion()) return;
    var counter = document.getElementById('hudCoins');
    if (!counter) return;
    var pill = counter.parentElement;
    this._flyingCoins = this._flyingCoins || 0;
    if (this._flyingCoins < 12 && isFinite(info.sx) && isFinite(info.sy)) {
      this._flyingCoins++;
      var dot = createElement('div', { className: 'coin-fly' + (info.air ? ' air' : '') });
      dot.style.left = info.sx + 'px';
      dot.style.top = info.sy + 'px';
      document.body.appendChild(dot);
      var rect = counter.getBoundingClientRect();
      var self = this;
      requestAnimationFrame(function () {
        dot.style.left = (rect.left + rect.width / 2) + 'px';
        dot.style.top = (rect.top + rect.height / 2) + 'px';
        dot.style.opacity = '0.2';
        dot.style.transform = 'translate(-50%, -50%) scale(0.5)';
      });
      setTimeout(function () {
        self._flyingCoins = Math.max(0, self._flyingCoins - 1);
        if (dot.parentNode) dot.parentNode.removeChild(dot);
        if (pill) { pill.classList.remove('coin-bump'); void pill.offsetWidth; pill.classList.add('coin-bump'); }
      }, 380);
    }
    // a bigger coin (a jump-collected one, Frenzy, Gold Rush) says what it was worth, lightly
    if (info.value > 1 && (!this._lastCoinPopup || performance.now() - this._lastCoinPopup > 250)) {
      this._lastCoinPopup = performance.now();
      this.showScorePopup('🪙 +' + info.value);
    }
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
    var callout = streakCallout(streak);
    this.showNotice('🔥 ' + streak + ' streak! ×' + multiplier + (callout ? ' — ' + callout : ''), { color: 'var(--accent-gold)', ms: 1800 });
  }

  showPowerupNotification(type) {
    var names = {
      shield: '🛡️ Shield!',
      magnet: '🧲 Coin Magnet!',
      double: '2× Score!',
      autoPilot: '🤖 Auto-Pilot ready!',
      scoreFrenzy: '💎 Score Frenzy!'
    };
    this.showNotice(names[type] || type, { color: 'var(--accent-purple)', ms: 1600 });
  }

  /**
   * The first ten times Auto-Pilot is picked up: a line along the bottom says how to use it (the key in force on a
   * computer, the 🤖 button on a touch screen).
   */
  showAutoPilotHint() {
    if (!storage.takeAutoPilotHint()) return null;
    var how;
    if (getControlText().touch) {
      how = 'Tap the 🤖 button';
    } else {
      var keys = (getKeyBindings().autoPilot || []).slice(0, 2).map(keyLabel);
      how = keys.length ? 'Press ' + keys.join(' or ') : 'Tap the 🤖 button';
    }
    var old = document.getElementById('autoPilotHint');
    if (old) old.remove();
    var hint = createElement('div', { className: 'bottom-hint', text: '🤖 Auto-Pilot ready: ' + how + ' to answer the next question for you', attributes: { id: 'autoPilotHint', role: 'status', 'aria-live': 'polite' } });
    document.body.appendChild(hint);
    setTimeout(function () { hint.classList.add('fade'); }, 4200);
    setTimeout(function () { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 5000);
    return hint;
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
    document.dispatchEvent(new CustomEvent('dx:attention-changed')); // the new badges now wear a red dot
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
        popup.style.cssText = 'position:fixed;bottom:110px;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100% - 32px);text-align:center;background:rgba(8,12,36,0.95);backdrop-filter:blur(10px);border:2px solid var(--accent-gold);border-radius:16px;padding:16px 24px;pointer-events:none;z-index:20;transition:all 1.5s ease-out;opacity:1;';

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
        setTimeout(function () { popup.style.bottom = '150px'; popup.style.opacity = '0'; }, 2000);
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
      var rushVerb = getControlText(undefined, getDashControl()).rushVerb;
      setText(tip, rushVerb ? '💡 Know the answer? ' + rushVerb.toUpperCase() + ' to RUSH through! ⚡ Faster = more points' : '💡 Read the clue, then run into the right gate');
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
    try {
      if (!this.characterPreview) {
        this.characterPreview = new CharacterPreview();
        this.characterPreview.init('characterPreviewContainer');
      }
      this.characterPreview.clearPreview();
      this.characterPreview.resize();
      this.characterPreview.startAnimation();
    } catch (e) {
      // No WebGL: the Locker still works, just without the 3D preview.
      this.characterPreview = null;
    }
  }


  /**
   * Color pickers for one animated 3D character. Every character has its own parts (a doctor's scrub
   * top and pants, a robot's body and trim, ...) and its own palettes, saved per character.
   * @param {object} avatar an entry from AVATARS with `parts`
   */
  _renderModelColors(avatar) {
    var self = this;
    var wrap = createElement('div', { className: 'shop-item' });
    wrap.style.cssText = 'display:block;margin:8px 0';
    wrap.appendChild(createElement('div', { text: '🎨 ' + avatar.name + ' colors' }));
    wrap.lastChild.style.cssText = 'font-size:13px;font-weight:800;margin-bottom:4px';
    wrap.appendChild(createElement('div', { className: 'setting-sublabel', text: 'Pick a color for each part, or tap the rainbow for any color. "Original" keeps the look it came with.' }));

    function hexOf(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }

    (avatar.parts || []).forEach(function (part) {
      var group = createElement('div', { className: 'color-part', attributes: { 'data-part': part.key } });
      group.style.marginTop = '8px';
      group.appendChild(createElement('div', { text: part.label }));
      group.lastChild.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:3px';
      var row = createElement('div', { className: 'pick-chips' });
      var chosen = ((storage.get('modelColors') || {})[avatar.id] || {})[part.key] || 0;
      var inPalette = chosen === 0 || part.palette.some(function (c) { return c.hex === chosen; });
      var custom = null;
      var wheel = null;
      var panel = null;

      // Save a color for this part (0 = back to the original look) and refresh the character
      function save(hex) {
        var all = Object.assign({}, storage.get('modelColors') || {});
        var mine = Object.assign({}, all[avatar.id] || {});
        if (hex) mine[part.key] = hex; else delete mine[part.key];
        all[avatar.id] = mine;
        storage.set('modelColors', all);
        storage.save();
        if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
        if (self.onEquipChange) self.onEquipChange();
      }
      function mark(target) {
        row.querySelectorAll('.scrub-swatch').forEach(function (el) { el.classList.remove('on'); el.setAttribute('aria-pressed', 'false'); });
        if (target) { target.classList.add('on'); target.setAttribute('aria-pressed', 'true'); }
      }
      function showCustom(hex) {
        custom.style.setProperty('--picked', hex ? hexOf(hex) : 'transparent');
        custom.classList.toggle('has-color', !!hex);
      }

      part.palette.forEach(function (c) {
        var on = chosen === c.hex;
        var sw = createElement('button', { className: 'scrub-swatch' + (on ? ' on' : ''), attributes: { type: 'button', 'aria-label': part.label + ': ' + c.name, 'aria-pressed': on ? 'true' : 'false', title: c.name } });
        sw.style.background = c.hex ? hexOf(c.hex) : 'linear-gradient(135deg,#fff 50%,#aab 50%)';
        sw.addEventListener('click', function () {
          save(c.hex);
          mark(sw);
          showCustom(0);
          if (wheel && c.hex) wheel.setHex(c.hex);
        });
        row.appendChild(sw);
      });

      // Any color at all: the full wheel opens under this row
      custom = createElement('button', {
        className: 'scrub-swatch scrub-custom' + (!inPalette ? ' on' : ''),
        attributes: { type: 'button', 'aria-label': part.label + ': pick any color', 'aria-pressed': !inPalette ? 'true' : 'false', 'aria-expanded': 'false', title: 'Any color' }
      });
      showCustom(inPalette ? 0 : chosen);
      custom.addEventListener('click', function () {
        if (panel) {
          panel.hidden = !panel.hidden;
          custom.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
          return;
        }
        panel = createElement('div', { className: 'cw-panel' });
        wheel = createColorWheel({
          hex: chosen || (part.palette[1] && part.palette[1].hex) || 0x1fa3b5,
          onCommit: function (hex) { chosen = hex; save(hex); mark(custom); showCustom(hex); }
        });
        panel.appendChild(wheel.el);
        group.appendChild(panel);
        custom.setAttribute('aria-expanded', 'true');
      });
      row.appendChild(custom);

      group.appendChild(row);
      wrap.appendChild(group);
    });
    return wrap;
  }


  // ═══════════════════════════════════════════════════════
  // QUESTS (with claiming support per Section 14.6) [2]
  // ═══════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════
  // SETTINGS (with extension mounting) [2]
  // ═══════════════════════════════════════════════════════

  /** The groups on the Settings screen: a list of cards, each opening its own page. */
  _settingsSections() {
    return [
      { id: 'sound', icon: '🔊', title: 'Sound', desc: 'Music, effects, volume and reading aloud' },
      { id: 'look', icon: '🎨', title: 'Look & performance', desc: 'Colors, camera, graphics and frame rate' },
      { id: 'keys', icon: '⌨️', title: 'Keyboard', desc: 'Choose the keys for moving, dashing and Auto-Pilot' },
      { id: 'study', icon: '📚', title: 'Study', desc: 'Daily goal, reminders and how cards are picked' },
      { id: 'rules', icon: '🎛️', title: 'Your rules', desc: 'Turn power-ups, hazards and the monster off' },
      { id: 'data', icon: '💾', title: 'Backup & data', desc: 'Save, restore, export or reset your progress' },
      { id: 'about', icon: 'ℹ️', title: 'About & help', desc: 'How to play, legal pages and support' }
    ];
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
    saveFile(blob, 'dx-dash-card-reports.json');
  }

  downloadBackup() {
    var blob = new Blob([buildBackup(storage, customCards)], { type: 'application/json' });
    var self = this;
    saveFile(blob, 'dx-dash-backup-' + new Date().toISOString().slice(0, 10) + '.json').then(function (how) {
      self._showToast(how === 'failed' ? 'Could not save the backup.' : (how === 'shared' ? 'Choose where to save your backup.' : 'Backup saved.'));
    });
  }

  restoreBackup(file) {
    var self = this;
    if (!file) return;
    if (!confirm('Replace ALL current progress with this backup?')) return;
    file.text().then(function (text) {
      var result = restoreBackup(text, storage, customCards);
      if (result.ok) {
        window.location.reload();
      } else {
        self._showToast(result.error);
      }
    });
  }

  applySettings() {
    document.body.classList.toggle('night-mode', storage.get('nightMode'));
    document.body.classList.toggle('colorblind', !!storage.get('colorblindMode'));
    document.body.classList.toggle('dyslexia', !!storage.get('dyslexiaFont'));
    document.body.classList.toggle('lefty', storage.get('handedness') === 'left');
  }

  // ═══════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════



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
    var bringBtn = document.getElementById('bringCardsBtn');
    if (bringBtn) bringBtn.addEventListener('click', function () {
      self.show('screenSettings');
      self._settingsSection = 'study';
      self.renderSettings();
      var box = document.getElementById('ankiImportContainer');
      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });
    });
    var importBtn = document.getElementById('importCardsBtn');
    if (importBtn) importBtn.addEventListener('click', function () { self.showImport(); });
    var shareDeckBtn = document.getElementById('shareDeckBtn');
    if (shareDeckBtn) shareDeckBtn.addEventListener('click', function () { self.shareDeck(); });
    var importDeckBtn = document.getElementById('importDeckBtn');
    if (importDeckBtn) importDeckBtn.addEventListener('click', function () { self.importDeckByCode(); });
    var select = document.getElementById('cardSubject');
    if (select) {
      clearElement(select);
      SUBJECTS.forEach(function (s) {
        select.appendChild(createElement('option', { text: s, attributes: { value: s } }));
      });
    }
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
    var errEl = document.getElementById('cardErrors');
    var editId = document.getElementById('cardEditId').value;
    if (!editId && !requireGate('custom_cards', { used: customCards.getAll().length })) return;
    var result = editId ? customCards.update(editId, cardData) : customCards.add(cardData);
    if (!result.success) {
      clearElement(errEl);
      (result.errors || []).forEach(function (e) {
        errEl.appendChild(createElement('div', { text: e.message || String(e) }));
      });
      return;
    }
    if (!editId) {
      var earned = storage.afterCustomCardCreated();
      if (earned.length) this.showAchievementNotification(earned);
    }
    if (result.warnings && result.warnings.length > 0) {
      this._showToast('Saved with ' + result.warnings.length + ' warning(s): ' + (result.warnings[0].message || ''));
    }
    this.show('screenMyCards');
    this.renderCustomCardList();
  }

  /** Run fn(leaderboardService) once online sharing is available. */
  _withOnlineService(fn, fallback) {
    var self = this;
    var unavailable = function (msg) {
      if (fallback && fallback()) return; // e.g. an offline copy was used instead
      self._showToast(msg);
    };
    import('./leaderboard.js').then(function (mod) {
      var lb = mod.leaderboard;
      var ready = lb.isReady() ? Promise.resolve() : lb.init();
      return ready.then(function () {
        if (!lb.isAuthenticated()) {
          unavailable('Online sharing needs the leaderboard connection (see README setup).');
          return;
        }
        return fn(lb);
      });
    }).catch(function () { unavailable('Online sharing is unavailable right now.'); });
  }

  /** Publish the player's custom cards and show a share code. */
  shareDeck() {
    var self = this;
    var cards = customCards.getAll();
    if (cards.length === 0) { this._showToast('Create some custom cards first.'); return; }
    var name = window.prompt('Deck name:', 'My deck');
    if (!name || !name.trim()) return;
    var payload;
    try { payload = JSON.parse(customCards.exportJSON()); } catch (e) { this._showToast('Could not read your cards.'); return; }
    this._withOnlineService(function (lb) {
      return lb.publishDeck(name.trim(), payload.slice(0, 200)).then(function (res) {
        if (!res.success) { self._showToast(res.error || 'Could not share the deck.'); return; }
        var code = res.data;
        copyText(code).then(function (ok) {
          window.alert('Deck shared! Give this code to friends:\n\n' + code + (ok ? '\n\n(It was copied to your clipboard.)' : ''));
        });
      });
    });
  }

  /** Import a deck by its share code. */
  importDeckByCode() {
    var self = this;
    var code = window.prompt('Enter the deck code:');
    if (!code || !code.trim()) return;
    var key = code.trim().toUpperCase();
    var cached = getDeck(key);

    // Imported cards go through the same validation as any custom card.
    var addDeck = function (deck, suffix) {
      var result = customCards.importJSON(JSON.stringify(deck.cards));
      self._showToast('Imported ' + result.importedCount + ' card(s) from "' + deck.name + '"' + (suffix || '') + (result.rejectedCount ? ' (' + result.rejectedCount + ' skipped)' : '') + '.');
      self.renderCustomCardList();
      self._renderSavedDecks();
    };
    var useCopy = function () {
      if (!cached) return false;
      addDeck(cached, ' (saved offline copy)');
      return true;
    };

    if (!navigator.onLine) {
      if (!useCopy()) this._showToast('You are offline and this deck is not saved on this device.');
      return;
    }
    this._withOnlineService(function (lb) {
      return lb.fetchDeck(key).then(function (res) {
        if (!res.success) {
          if (!useCopy()) self._showToast(res.error || 'Could not find that deck.');
          return;
        }
        saveDeck(key, res.deck.name, res.deck.cards);
        addDeck(res.deck, '');
      });
    }, useCopy);
  }

  /** Decks fetched by code are kept on this device for offline use. */
  _renderSavedDecks() {
    var self = this;
    var box = document.getElementById('savedDecks');
    if (!box) return;
    clearElement(box);
    var decks = listDecks();
    if (decks.length === 0) return;
    var heading = createElement('h3', { text: '📚 Saved decks (available offline)' });
    heading.style.cssText = 'margin:14px 0 6px;font-size:13px;color:var(--text-secondary)';
    box.appendChild(heading);
    decks.forEach(function (d) {
      var row = createElement('div', { className: 'setting-row' });
      var label = createElement('div');
      label.style.flex = '1';
      label.appendChild(createElement('div', { text: d.name }));
      label.firstChild.style.cssText = 'font-size:13px;font-weight:700';
      label.appendChild(createElement('div', { text: d.count + ' cards \u00B7 code ' + d.code }));
      label.lastChild.style.cssText = 'font-size:10px;color:var(--text-muted)';
      row.appendChild(label);
      var add = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Add to my cards', attributes: { type: 'button' } });
      add.addEventListener('click', function () {
        var deck = getDeck(d.code);
        if (!deck) return;
        var result = customCards.importJSON(JSON.stringify(deck.cards));
        self._showToast('Added ' + result.importedCount + ' card(s).');
        self.renderCustomCardList();
      });
      row.appendChild(add);
      var del = createElement('button', { className: 'btn btn-outline btn-sm', text: '\u2715', attributes: { type: 'button', 'aria-label': 'Remove saved deck ' + d.name } });
      del.addEventListener('click', function () { removeDeck(d.code); self._renderSavedDecks(); });
      row.appendChild(del);
      box.appendChild(row);
    });
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
      var area = document.getElementById('importExportArea');
      copyText(area.value).then(function (ok) {
        if (!ok) area.select();
        setText(document.getElementById('importExportMsg'), ok ? '✅ Copied!' : 'Could not copy automatically. The text is selected: copy it yourself.');
      });
    });
    this.show('screenImportExport');
  }

  showImport() {
    setText(document.getElementById('importExportTitle'), '📥 Import Cards');
    document.getElementById('importExportArea').value = '';
    document.getElementById('importExportArea').readOnly = false;
    setText(document.getElementById('importExportMsg'), 'Paste a card list here. This takes JSON: either from a friend who exported their cards, or from an AI chat. For the step-by-step (and a copy-paste AI prompt), go back to My Cards and tap "Bring in Anki, spreadsheet or AI cards".');
    var actionBtn = document.getElementById('importExportAction');
    setText(actionBtn, '📥 Import');
    var newBtn = actionBtn.cloneNode(true);
    actionBtn.parentNode.replaceChild(newBtn, actionBtn);
    newBtn.addEventListener('click', function () {
      var result = customCards.importJSON(document.getElementById('importExportArea').value);
      var msg = document.getElementById('importExportMsg');
      clearElement(msg);
      var text = 'Imported ' + result.importedCount + ' card(s)';
      if (result.rejectedCount > 0) {
        var firstErr = result.rejected[0] && result.rejected[0].errors && result.rejected[0].errors[0];
        text += ', rejected ' + result.rejectedCount + (firstErr ? ' (' + firstErr.message + ')' : '');
      }
      var span = createElement('span', { text: text + '.' });
      span.style.color = result.importedCount > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      msg.appendChild(span);
    });
    this.show('screenImportExport');
  }

  // ═══════════════════════════════════════════════════════
  // CARD BROWSER (with pagination per Section 21.2) [2]
  // ═══════════════════════════════════════════════════════



  // ═══════════════════════════════════════════════════════
  // PROFILE (with complete profile picture selector) [2]
  // ═══════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════
  // FLASHCARD SCREEN
  // ═══════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════
  // HANDS-FREE AUDIO REVIEW
  // Reads each clue aloud, pauses to let you think, then reads the answer and
  // teaching point. For commutes and workouts; it does not record ratings.
  // ═══════════════════════════════════════════════════════



  _hfSpeak(text) {
    return speak(text, { rate: 0.95 });
  }

  _hfSleep(ms) {
    var hf = this._hf;
    return new Promise(function (resolve) {
      var t = setTimeout(resolve, ms);
      hf.wake = function () { clearTimeout(t); resolve(); };
    });
  }

  _runHandsFree() {
    var self = this;
    var hf = this._hf;
    var run = async function () {
      for (var i = 0; i < hf.cards.length && !hf.cancel; i++) {
        var card = hf.cards[i];
        hf.index = i;
        hf.phase = 'clue';
        self.renderFlashcardScreen();
        await self._hfSpeak('Clue. ' + (card.bw || []).join('. '));
        if (hf.cancel) break;
        await self._hfSleep(6000);
        if (hf.cancel) break;
        hf.phase = 'answer';
        self.renderFlashcardScreen();
        await self._hfSpeak('Answer. ' + card.ans + '. ' + (card.tp && card.tp.trim() !== String(card.ans || '').trim() ? card.tp : ''));
        hf.heard++;
        if (hf.cancel) break;
        await self._hfSleep(1500);
      }
      hf.active = false;
      hf.finished = true;
      cancelSpeech();
      if (hf.heard > 0) {
        storage.addStudiedToday(hf.heard);
        storage.save();
      }
      if (document.getElementById('screenFlashcard').classList.contains('active')) self.renderFlashcardScreen();
    };
    run();
  }

  _renderHandsFree(container) {
    var self = this;
    var hf = this._hf;
    var wrap = createElement('div');
    wrap.style.textAlign = 'center';
    if (hf.finished) {
      wrap.appendChild(this._flashcardText('h2', '🎧 Session finished'));
      wrap.appendChild(this._flashcardText('p', 'You listened to ' + hf.heard + ' card' + (hf.heard === 1 ? '' : 's') + '. It counts toward your daily goal.', 'margin:10px 0;color:var(--text-secondary)'));
      var again = createElement('button', { className: 'btn btn-green btn-block', text: '🎧 Another round', attributes: { type: 'button' } });
      again.addEventListener('click', function () { var last = self._hf.last || {}; self._hf = null; self.startHandsFree(last.subjects, last.cardIds, last.count); });
      var home = createElement('button', { className: 'btn btn-outline btn-block', text: '🏠 Home', attributes: { type: 'button' } });
      home.style.marginTop = '6px';
      home.addEventListener('click', function () { self._hf = null; self.show('screenHome'); });
      wrap.appendChild(again);
      wrap.appendChild(home);
      container.appendChild(wrap);
      return;
    }

    var card = hf.cards[hf.index];
    wrap.appendChild(this._flashcardText('div', '🎧 Hands-free \u2014 card ' + (hf.index + 1) + ' of ' + hf.cards.length, 'font-size:11px;color:var(--text-muted);margin-bottom:8px'));
    var box = createElement('div');
    box.style.cssText = 'background:var(--bg-card-solid);border-radius:var(--radius-lg);padding:20px;border:var(--border-glow)';
    box.appendChild(this._flashcardText('div', card.subj, 'font-size:10px;color:var(--text-muted);margin-bottom:8px'));
    (card.bw || []).forEach(function (bw) {
      box.appendChild(self._flashcardText('div', '\u2022 ' + bw, 'font-size:16px;font-weight:700;margin:4px 0'));
    });
    if (hf.phase === 'answer') {
      box.appendChild(this._flashcardText('div', '\u2713 ' + card.ans, 'font-size:18px;font-weight:800;color:var(--accent-green);margin-top:12px'));
      if (card.tp && card.tp.trim() !== String(card.ans || '').trim()) box.appendChild(this._flashcardText('p', card.tp, 'font-size:12px;color:var(--text-secondary);margin-top:6px'));
    } else {
      box.appendChild(this._flashcardText('div', 'Think of the diagnosis\u2026', 'font-size:12px;color:var(--text-muted);margin-top:12px'));
    }
    wrap.appendChild(box);
    var stop = createElement('button', { className: 'btn btn-red btn-block', text: '\u23F9 Stop', attributes: { type: 'button' } });
    stop.style.marginTop = '10px';
    stop.addEventListener('click', function () { self.stopHandsFree(); });
    wrap.appendChild(stop);
    container.appendChild(wrap);
  }

  _flashcardActive() {
    var st = this.flashcardMode.state;
    return st === 'active' || st === 'revealed' || st === 'completed';
  }

  /** Persist the finished (or partially finished) session exactly once. */
  _persistFlashcardSummary(summary) {
    if (!summary || summary.total === 0) return;
    var result = storage.finalizeFlashcardSession(summary);
    var subjSet = {};
    (summary.cardResults || []).forEach(function (r) { subjSet[r.subject] = true; });
    shareTrack('flashcard_session', { cards: summary.total, correct: summary.correct, duration_s: Math.round((summary.durationMs || 0) / 1000), kind: 'other', subjects: Object.keys(subjSet).length });
    (result.completedQuestIds || []).forEach(function (id) { var q = QUESTS.filter(function (x) { return x.id === id; })[0]; shareTrack('quest_completed', { id: id, category: q ? q.category : '', reward: q ? q.reward : 0 }); });
    if (result.newlyUnlockedAchievementIds && result.newlyUnlockedAchievementIds.length > 0) {
      this.showAchievementNotification(result.newlyUnlockedAchievementIds);
    }
    if (result.completedQuestIds && result.completedQuestIds.length > 0) {
      var titles = result.completedQuestIds.map(function (id) { var q = QUESTS.filter(function (x) { return x.id === id; })[0]; return q ? q.title : ''; }).filter(Boolean);
      if (titles.length) this.showNotice('\uD83C\uDFC6 QUEST CLEARED: ' + titles.join(', ') + '! Grab your coins in Quests.', { color: 'var(--accent-gold)', ms: 4500 });
    }
  }

  /** Leave the session: save what was answered, then reset. */
  _endFlashcardSession() {
    var fm = this.flashcardMode;
    if (fm.state === 'completed') {
      fm.end('closed');
      return;
    }
    this._persistFlashcardSummary(fm.end('abandoned'));
  }

  _flashcardText(tag, text, css) {
    var el = createElement(tag);
    setText(el, text);
    if (css) el.style.cssText = css;
    return el;
  }

  /** Cards for each way of choosing what to study (so the picker can show real counts). */
  _pickerPools() {
    var stats = storage.get('cardStats') || {};
    var now = Date.now();
    var all = CARDS.concat(customCards.getAll());
    var disabled = storage.get('disabledCards') || [];
    var live = all.filter(function (c) { return disabled.indexOf(c.id) < 0; });
    var mine = storage.get('selectedSubjects');
    if (!mine || mine.length === 0) mine = SUBJECTS.slice();
    var due = [];
    var missed = [];
    var fresh = [];
    live.forEach(function (c) {
      var s = stats[c.id];
      if (!s || !s.seen) { if (mine.indexOf(c.subj) >= 0) fresh.push(c.id); return; }
      if (typeof s.due === 'number' && s.due <= now) due.push(c.id);
      if ((s.wrong || 0) > 0 && (s.wrong || 0) >= (s.correct || 0) * 0.5) missed.push(c.id);
    });
    due.sort(function (x, y) { return stats[x].due - stats[y].due; });
    missed.sort(function (x, y) { return (stats[y].wrong || 0) - (stats[x].wrong || 0); });
    return { due: due, missed: missed, fresh: fresh, mine: mine };
  }




  // ═══════════════════════════════════════════════════════
  // POST-RUN (displays ALL answers — correct + wrong) [2]
  // ═══════════════════════════════════════════════════════

  /** Append a collapsed-by-default section to `parent`; returns its body element. */
  _collapsible(parent, title, open) {
    var section = createElement('div', { className: 'collapsible-section' });
    var toggle = createElement('button', { className: 'collapsible-toggle', attributes: { type: 'button', 'aria-expanded': open ? 'true' : 'false' } });
    setText(toggle, title + ' ');
    var arrow = createElement('span', { className: 'collapse-arrow' + (open ? ' open' : ''), text: '▸' });
    toggle.appendChild(arrow);
    section.appendChild(toggle);
    var body = createElement('div');
    body.style.display = open ? 'block' : 'none';
    section.appendChild(body);
    toggle.addEventListener('click', function () {
      var isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('open', !isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });
    parent.appendChild(section);
    return body;
  }


  // ═══════════════════════════════════════════════════════
  // CONFETTI
  // ═══════════════════════════════════════════════════════

  showConfetti(noBanner) {
    if (prefersReducedMotion()) return;
    var colors = ['#ff4d6a', '#3dff9a', '#ffd23f', '#4db3ff', '#a566ff', '#ff5cad'];
    for (var i = 0; i < 60; i++) {
      var piece = createElement('div', { className: 'confetti-piece' });
      piece.style.left = (10 + Math.random() * 80) + '%';
      piece.style.top = '-10px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.animationDuration = (1 + Math.random() * 1) + 's';
      document.body.appendChild(piece);
      setTimeout(function (el) { if (el.parentNode) el.parentNode.removeChild(el); }, 2500, piece);
    }
    if (noBanner) return;
    var banner = createElement('div', { className: 'new-best-banner', text: '🏆 NEW BEST!' });
    document.body.appendChild(banner);
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 2500);
  }

  // ═══════════════════════════════════════════════════════
  // QUICK REVIEW
  // ═══════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════
  // TUTORIAL
  // ═══════════════════════════════════════════════════════

  /**
   * Open the interactive tutorial. On the first run, finishing or skipping it marks the first run done,
   * so it never opens by itself again.
   */
  showTutorial(opts) {
    var firstRun = !!(opts && opts.firstRun);
    var onClose = function () {
      if (firstRun) storage.set('firstRunComplete', true);
    };
    // On the real track when the runner can start (main.js provides it); the practice track otherwise
    if (typeof this.startRealTutorial === 'function' && this.startRealTutorial({ onClose: onClose })) return;
    startTutorial({ onClose: onClose });
  }

  // ═══════════════════════════════════════════════════════
  // CALENDAR
  // ═══════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════
  // SHARE
  // ═══════════════════════════════════════════════════════

  shareScore(game) {
    var total = game.correct + game.wrong;
    var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
    var skinName = game.currentSkin ? game.currentSkin.name : 'Unknown';
    var text = '⚡ Dx Dash ⚡\n🏆 Score: ' + game.score + '\n✅ Accuracy: ' + acc + '%\n🔥 Streak: ' + game.bestStreak + '\n🪙 Coins: ' + game.coins + '\n💊 Speed: ' + game.userSpeed + '×\n🌍 Track: ' + skinName + '\n\nCan you beat my score? Play at:\n' + shareLink(appPublicUrl(), 'results');

    var self = this;
    shareText({ title: 'Dx Dash Score', text: text, kind: 'results', surface: 'postrun', score: game.score }).then(function (how) {
      if (how === 'copied') self._showToast('Score copied \u2014 paste it anywhere to share.');
      else if (how === 'failed') window.alert('Could not share. Your score:\n\n' + text);
    });
  }

} // end class UI

// Screens split into their own files; attached here so `this` is still the UI controller.
Object.assign(UI.prototype, postRunMethods, settingsMethods, studyMethods, browseMethods, profileMethods, homeMethods);

export var ui = new UI();
