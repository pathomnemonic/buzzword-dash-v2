/**
 * main.js — Application composition root
 *
 * Owns:
 *  - The single renderer.setAnimationLoop() call
 *  - Active application view (home vs game)
 *  - Engine event routing → audio, UI, multiplayer, progression
 *  - runId generation
 *  - Canonical game.start(options)
 *  - storage.finalizeRun(summary) invocation (once per run)
 *  - Visibility-pause behaviour
 *  - Settings extension remounting (Anki importer)
 *  - Removal of stale window card caches and global callbacks
 *
 * Does NOT own:
 *  - Flashcard session logic (flashcardmode.js / ui.js)
 *  - Card browser rendering (ui.js)
 *  - Profile rendering (ui.js)
 *  - Quest / achievement evaluation (storage.js)
 *
 * Per Sections 19, 30 and 31 of the architecture contract [2].
 */

import { game } from './game/engine.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';
import { customCards } from './customcards.js';
import { HomeCharacter } from './game/homecharacter.js';
import { reportError } from './errors.js';

// ===== Lazy-loaded module references =====
var ankiImportModule = null;
var leaderboardModule = null;

// ===== Application state =====
var homeCharacter = null;
var multiplayerClient = null;
var multiplayerLastStateSend = 0;
var multiplayerMatchStarted = false;
var runStartTime = 0;
var currentRunId = null;
var runFinalized = false;

// =========================================================================
//  GENERATE A UNIQUE RUN ID
// =========================================================================
function generateRunId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'run_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// =========================================================================
//  BOTTOM NAV VISIBILITY
// =========================================================================
function showBottomNav(visible) {
  var nav = document.getElementById('bottomNav');
  if (nav) {
    if (visible) nav.classList.remove('hidden');
    else nav.classList.add('hidden');
  }
}

// =========================================================================
//  COLLAPSIBLE SECTIONS
// =========================================================================
function setupCollapsibles() {
  var subjectToggle = document.getElementById('subjectToggle');
  var subjectBody = document.getElementById('subjectBody');
  var subjectArrow = document.getElementById('subjectArrow');

  if (subjectToggle && subjectBody) {
    subjectToggle.addEventListener('click', function () {
      var isOpen = subjectBody.style.display !== 'none';
      subjectBody.style.display = isOpen ? 'none' : 'block';
      if (subjectArrow) subjectArrow.classList.toggle('open', !isOpen);
    });
  }
}

// =========================================================================
//  FIRST-RUN ONBOARDING
// =========================================================================
function showOnboarding() {
  var overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;

  var pages = [
    { icon: '\u26A1', title: 'Welcome to Buzzword Dash!', text: 'See medical buzzwords, then swipe into the correct diagnosis gate to score points!', hand: '\uD83D\uDC46' },
    { icon: '\uD83D\uDC46', title: 'Swipe to Move', text: 'Swipe left/right to switch lanes. Swipe up to jump, down to slide. Double-tap to rush for bonus points!', hand: '\uD83D\uDC48\uD83D\uDC49' },
    { icon: '\uD83C\uDFC6', title: 'Build Your Streak!', text: 'Correct answers build your streak and multiplier. Collect coins, unlock avatars, and climb the leaderboard!', hand: '' }
  ];
  var currentPage = 0;

  function renderPage() {
    var p = pages[currentPage];
    var icon = document.getElementById('obIcon');
    var title = document.getElementById('obTitle');
    var text = document.getElementById('obText');
    var hand = document.getElementById('obHand');
    var dots = document.getElementById('obDots');
    var btn = document.getElementById('obNextBtn');
    if (icon) icon.textContent = p.icon;
    if (title) title.textContent = p.title;
    if (text) text.textContent = p.text;
    if (hand) { hand.textContent = p.hand; hand.style.display = p.hand ? 'inline-block' : 'none'; }
    if (dots) {
      dots.innerHTML = pages.map(function (_, i) {
        return '<div class="tut-dot ' + (i === currentPage ? 'active' : '') + '"></div>';
      }).join('');
    }
    if (btn) btn.textContent = currentPage === pages.length - 1 ? 'Let\'s Go! \u2713' : 'Next \u2192';
  }

  overlay.classList.add('active');
  renderPage();

  var btn = document.getElementById('obNextBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      currentPage++;
      if (currentPage >= pages.length) {
        overlay.classList.remove('active');
        storage.set('firstRunComplete', true);
      } else {
        renderPage();
      }
    });
  }
}

// =========================================================================
//  HOW TO PLAY
// =========================================================================
function renderHowToPlay() {
  var container = document.getElementById('howToPlaySection');
  if (!container) return;

  var sections = [
    { icon: '\uD83C\uDFAE', title: 'Controls', text: 'Swipe left/right to switch lanes. Swipe up to jump over obstacles, down to slide under them. Use arrow keys or WASD on desktop.' },
    { icon: '\u26A1', title: 'Rush Mode', text: 'Double-tap or press Shift to RUSH through gates! Rush makes you invulnerable and pushes you through in 0.5 seconds. Stack up to 3 rushes for bonus points!' },
    { icon: '\u2764\uFE0F', title: 'Lives & Hearts', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. Look for heart pickups on the track!' },
    { icon: '\uD83E\uDE99', title: 'Coins & Power-ups', text: 'Collect coins as you run. Power-ups include Shield, Magnet, Double Score, Auto-Pilot, and Score Frenzy.' },
    { icon: '\uD83D\uDCCA', title: 'Scoring', text: 'Correct answers build your streak. Every 5 correct increases your multiplier up to 8\u00D7. Rush through gates for bonus points!' },
    { icon: '\uD83D\uDC79', title: 'The Exam Monster', text: 'An exam monster chases you. It gets closer when you miss questions and falls back when you answer correctly.' },
    { icon: '\uD83C\uDFAF', title: 'Game Modes', text: 'Endless, Study, Weakness, Daily, and Versus multiplayer!' },
    { icon: '\uD83D\uDCDD', title: 'Custom Cards & Flashcards', text: 'Create your own cards. Use Flashcard mode to study without the runner. Import Anki cards for AI-converted questions.' }
  ];

  var html = '<div style="margin-top:4px"><h4 style="font-size:13px;font-weight:800;color:var(--text-secondary);margin-bottom:6px">\uD83D\uDCD6 How to Play</h4>';
  sections.forEach(function (s) {
    html += '<details style="margin-bottom:4px;background:var(--bg-card);border-radius:var(--radius-sm);padding:8px 12px;border:var(--border-card)">' +
      '<summary style="font-size:12px;font-weight:700;cursor:pointer">' + s.icon + ' ' + s.title + '</summary>' +
      '<p style="font-size:11px;color:var(--text-secondary);margin-top:6px;line-height:1.5">' + s.text + '</p></details>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// =========================================================================
//  HOME CHARACTER
// =========================================================================
function initHomeCharacter() {
  homeCharacter = new HomeCharacter();
  homeCharacter.init(game.renderer);
  ui.homeCharacter = homeCharacter;
}

// =========================================================================
//  MULTIPLAYER HELPERS
// =========================================================================
function updateOpponentHud(state) {
  var hud = document.getElementById('opponentHud');
  if (!hud) return;
  hud.style.display = 'flex';
  var score = document.getElementById('opponentScore');
  var streak = document.getElementById('opponentStreak');
  var correct = document.getElementById('opponentCorrect');
  var wrong = document.getElementById('opponentWrong');
  if (score) score.textContent = state.score || 0;
  if (streak) streak.textContent = state.streak || 0;
  if (correct) correct.textContent = state.correct || 0;
  if (wrong) wrong.textContent = state.wrong || 0;
}

function hideOpponentHud() {
  var hud = document.getElementById('opponentHud');
  if (hud) hud.style.display = 'none';
}

function showMultiplayerMessage(message, color) {
  var popup = document.createElement('div');
  popup.textContent = message;
  popup.style.cssText =
    'position:fixed;top:18%;left:50%;transform:translateX(-50%);z-index:40;' +
    'padding:12px 20px;border-radius:14px;background:rgba(10,5,30,0.94);' +
    'border:2px solid ' + (color || 'var(--accent-cyan)') + ';color:#fff;' +
    'font-size:14px;font-weight:800;text-align:center;pointer-events:none;' +
    'transition:opacity .4s ease;';
  document.body.appendChild(popup);
  setTimeout(function () { popup.style.opacity = '0'; }, 1800);
  setTimeout(function () { popup.remove(); }, 2300);
}

function scheduleVersusStart(config) {
  if (multiplayerMatchStarted) return;
  multiplayerMatchStarted = true;
  var overlay = document.getElementById('multiplayerOverlay');
  if (overlay) overlay.classList.remove('active');
  var delay = Math.max(0, (config.startAt || Date.now()) - Date.now());
  showMultiplayerMessage('Match starting!', 'var(--accent-green)');
  setTimeout(function () {
    startMode(config.mode || 'versus');
  }, delay);
}

function configureMultiplayer(client, content) {
  multiplayerClient = client;
  multiplayerMatchStarted = false;

  client.onConnected = function () {
    content.innerHTML =
      '<div class="mp-status" style="color:var(--accent-green)">\u2705 Opponent connected!</div>' +
      '<button class="btn btn-green btn-block" id="mpReadyBtn" style="margin-top:10px">Ready</button>' +
      '<div class="mp-status" id="mpReadyStatus" style="margin-top:8px">Waiting for both players...</div>';
    var readyBtn = document.getElementById('mpReadyBtn');
    readyBtn.addEventListener('click', function () {
      client.sendReady(true);
      readyBtn.disabled = true;
      readyBtn.textContent = '\u2713 READY';
    });
  };

  client.onReadyState = function (state) {
    var status = document.getElementById('mpReadyStatus');
    if (!status) return;
    if (state.localReady && state.opponentReady) {
      if (client.isHost) {
        status.innerHTML =
          '<span style="color:var(--accent-green)">Both ready!</span>' +
          '<button class="btn btn-primary btn-block" id="mpStartMatchBtn" style="margin-top:8px">Start Match</button>';
        var startBtn = document.getElementById('mpStartMatchBtn');
        startBtn.addEventListener('click', function () {
          var cfg = client.sendStartMatch({
            startAt: Date.now() + 1800,
            seed: Math.floor(Math.random() * 2147483647),
            subjects: storage.get('selectedSubjects')
          });
          scheduleVersusStart(cfg);
        });
      } else {
        status.textContent = 'Both ready \u2014 waiting for host to start.';
      }
    } else if (state.localReady) {
      status.textContent = 'You are ready. Waiting for opponent...';
    } else if (state.opponentReady) {
      status.textContent = 'Opponent is ready.';
    }
  };

  client.onMatchStart = function (config) { scheduleVersusStart(config); };
  client.onOpponentUpdate = function (state) { updateOpponentHud(state); };

  client.onEncounterResult = function (result) {
    if (result.correct) {
      showMultiplayerMessage('Rival answered correctly!', 'var(--accent-pink)');
    }
  };

  client.onEndRun = function (result) {
    var message;
    if (!game.running) {
      if (game.score > result.score) message = '\uD83C\uDFC6 You won! ' + game.score + '\u2013' + result.score;
      else if (game.score < result.score) message = 'Rival won ' + result.score + '\u2013' + game.score;
      else message = '\uD83E\uDD1D Tie game: ' + game.score;
    } else {
      message = 'Rival finished with ' + result.score + ' points';
    }
    showMultiplayerMessage(message, 'var(--accent-gold)');
    if (storage.recordMultiplayerGame) {
      var won = !game.running && game.score > result.score;
      storage.recordMultiplayerGame(won);
    }
  };

  if (client.onEliminated !== undefined) {
    client.onEliminated = function () {
      showMultiplayerMessage('\uD83D\uDC80 Rival eliminated!', 'var(--accent-green)');
    };
  }
  if (client.onRaceFinished !== undefined) {
    client.onRaceFinished = function (data) {
      showMultiplayerMessage('\uD83C\uDFC1 Rival finished! ' + data.correctCount + ' correct in ' + Math.round(data.totalTime / 1000) + 's', 'var(--accent-gold)');
    };
  }

  client.onDisconnected = function (reason) {
    hideOpponentHud();
    multiplayerMatchStarted = false;
    showMultiplayerMessage(reason || 'Opponent disconnected.', 'var(--accent-red)');
  };

  client.onError = function (error) {
    content.innerHTML = '';
    var errorEl = document.createElement('div');
    errorEl.className = 'mp-status';
    errorEl.style.color = 'var(--accent-red)';
    errorEl.textContent = '\u274C ' + error;
    content.appendChild(errorEl);
  };
}

// =========================================================================
//  MODE STARTER  —  Canonical game.start(options) [2] §6.2
// =========================================================================
function startMode(mode) {
  if (mode === 'daily' && storage.get('dailyDone')) {
    alert('Daily round already completed today! Come back tomorrow.');
    return;
  }

  if (mode === 'weakness') {
    var subjects = storage.get('selectedSubjects');
    var allCards = CARDS.concat(customCards.getAll());
    var weakCards = allCards.filter(function (c) {
      if (subjects.length > 0 && subjects.indexOf(c.subj) < 0) return false;
      var s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weakCards.length < 3) {
      alert('Not enough missed cards yet. Play more rounds first!');
      return;
    }
  }

  // Resolve the shared multiplayer card order BEFORE the run starts so the very
  // first encounter is already seeded (installing it after go() races the
  // first spawn and desyncs the two peers).
  var mpSeed = (multiplayerClient && multiplayerClient.getSeed && multiplayerClient.getSeed()) || 0;
  if (mpSeed > 0) {
    import('./multiplayer.js').then(function (mod) {
      // Built-in pool only: both peers hold the same one (hash-verified at match
      // start), whereas per-user subject filters / custom cards would differ.
      var plan = mod.buildEncounterPlan({ seed: mpSeed, cards: CARDS, count: 100 });
      launchRun(mode, plan.map(function (entry) { return entry.cardId; }));
    }).catch(function (err) {
      reportError(err, { system: 'multiplayer', operation: 'seededCardOrder', recoverable: true });
      launchRun(mode, null);
    });
    return;
  }

  launchRun(mode, null);
}

function launchRun(mode, orderedCardIds) {
  // Stop home scene, hide nav
  if (homeCharacter) homeCharacter.stopAnimation();
  showBottomNav(false);

  // Generate runId (shared with the engine so the run summary matches)
  currentRunId = generateRunId();
  runFinalized = false;
  runStartTime = Date.now();

  // Canonical options object. Subject/exam/source filters are read from
  // storage by the engine when it builds each card pool.
  game.start({
    mode: mode,
    runId: currentRunId,
    userSpeed: storage.get('userSpeed') || 1,
    orderedCardIds: orderedCardIds
  });
  ui.hideAll();
  ui.showHud();

  game.beginCountdown();
  ui.countdown(function () {
    game.go();
  });
}

// =========================================================================
//  BUILD THE CANONICAL RUN SUMMARY
// =========================================================================
function buildRunSummary(gameRef) {
  var durationMs = runStartTime > 0 ? (Date.now() - runStartTime) : 0;

  return {
    runId: currentRunId,
    mode: gameRef.mode,
    endReason: 'out_of_lives', // simplified; engine could provide this
    completed: gameRef.encountersDone > 0,

    startedAt: runStartTime,
    endedAt: Date.now(),
    durationMs: durationMs,

    score: gameRef.score,
    coinsEarned: gameRef.coins,
    coinsCollected: gameRef.runCoinsCollected || 0,

    encountersCompleted: gameRef.encountersDone,
    correct: gameRef.correct,
    wrong: gameRef.wrong,
    bestStreak: gameRef.bestStreak,
    fastestDecisionMs: gameRef.lastEncounterTime || null,

    continued: gameRef.continued,
    continuesUsed: gameRef.continued ? 1 : 0,

    subjectsSeen: [],
    rushesUsed: 0,
    powerupsCollected: gameRef.runPowerupsCollected || 0,
    obstaclesJumped: 0,
    obstaclesSlid: 0,

    dailyCompleted: gameRef.mode === 'daily' && gameRef.encountersDone >= 15,

    encounters: gameRef.runCards || [],

    multiplayer: {
      matchId: null,
      result: 'none',
      opponentId: null,
      raceTimeMs: null,
      eliminated: false,
      forfeit: false
    }
  };
}

// =========================================================================
//  FINALIZE RUN (exactly once)
// =========================================================================
function finalizeRun(gameRef) {
  if (runFinalized) return;
  runFinalized = true;

  var summary = buildRunSummary(gameRef);

  // --- Persist via storage ---
  // Play time
  if (summary.durationMs > 0 && storage.addPlayTime) {
    storage.addPlayTime(Math.round(summary.durationMs / 1000));
  }

  // Cards studied
  if (storage.addCardsStudied && summary.encountersCompleted > 0) {
    storage.addCardsStudied(summary.encountersCompleted);
  }

  // Coins
  storage.addCoins(summary.coinsEarned);

  // Best score / streak
  if (summary.score > storage.get('bestScore')) {
    storage.set('bestScore', summary.score);
  }
  if (summary.bestStreak > storage.get('bestStreak')) {
    storage.set('bestStreak', summary.bestStreak);
  }

  // Totals
  storage.set('totalCorrect', storage.get('totalCorrect') + summary.correct);
  storage.set('totalWrong', storage.get('totalWrong') + summary.wrong);
  storage.set('totalEncounters', storage.get('totalEncounters') + summary.encountersCompleted);

  // Daily
  if (summary.dailyCompleted) {
    storage.set('dailyDone', true);
    var today = new Date().toDateString();
    var lastDaily = storage.get('lastDaily');
    if (lastDaily) {
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastDaily === yesterday.toDateString()) {
        storage.set('dailyStreak', storage.get('dailyStreak') + 1);
      } else if (lastDaily !== today) {
        storage.set('dailyStreak', 1);
      }
    } else {
      storage.set('dailyStreak', 1);
    }
    storage.set('lastDaily', today);
    storage.incrementQuest('q_daily');
  }

  // Quest progress
  storage.incrementQuest('q_25enc', summary.encountersCompleted);

  // Achievements
  var runData = {
    score: summary.score,
    perfect: summary.wrong === 0 && summary.correct > 0,
    speed: gameRef.userSpeed,
    fastestAnswer: summary.fastestDecisionMs
  };

  // Golden doctor
  if (summary.wrong === 0 && summary.correct >= 20) {
    storage.unlockAchievement('ach_golden_doctor');
    if (!storage.ownsItem('avatar_golden')) {
      var owned = storage.get('ownedItems').slice();
      owned.push('avatar_golden');
      storage.set('ownedItems', owned);
    }
  }

  var newAchievements = storage.checkAchievements(runData);

  if (newAchievements.length > 0) {
    ui.showAchievementNotification(newAchievements);
  }

  // --- Leaderboard submission ---
  if (leaderboardModule && storage.get('profileVisible') && storage.get('profileName')) {
    var totalAnswered = summary.correct + summary.wrong;
    var acc = totalAnswered > 0 ? Math.round(summary.correct / totalAnswered * 100) : 0;
    leaderboardModule.leaderboard.submitScore({
      playerName: storage.get('profileName'),
      avatar: storage.get('profilePicture') || 'avatar_intern',
      score: summary.score,
      accuracy: acc,
      bestStreak: summary.bestStreak,
      speed: gameRef.userSpeed,
      mode: gameRef.mode,
      badges: storage.get('selectedBadges') || []
    }).catch(function (e) {
      reportError(e, { system: 'leaderboard', operation: 'submitScore' });
    });
  }
}

// =========================================================================
//  MAIN INITIALIZATION
// =========================================================================
function init() {
  storage.load();
  storage.checkDailyReset();
  game.init();
  ui.init();

  // Home character
  initHomeCharacter();

  // Collapsibles
  setupCollapsibles();

  // How to Play
  renderHowToPlay();

  // Onboarding
  if (!storage.get('firstRunComplete')) {
    showOnboarding();
  }

  // --- Anki import (lazy) ---
  import('./ankiimport.js').then(function (mod) {
    ankiImportModule = mod;
    mountAnkiImport();
  }).catch(function (e) {
    reportError(e, { system: 'ankiimport', operation: 'load', recoverable: true });
  });

  // --- Leaderboard (lazy) ---
  import('./leaderboard.js').then(function (mod) {
    leaderboardModule = mod;
    mod.leaderboard.init().then(function () {
      mountLeaderboard();
    }).catch(function (e) {
      reportError(e, { system: 'leaderboard', operation: 'init', recoverable: true });
    });
  }).catch(function (e) {
    reportError(e, { system: 'leaderboard', operation: 'load', recoverable: true });
  });

  // ==========================
  //  ENGINE EVENT ROUTING
  // ==========================

  game.onEncounterStart = function (card, gates) {
    ui.showBuzzwords(card);
    ui.showAnswerChoices(gates);
  };

  game.onEncounterResolve = function (card, wasCorrect) {
    ui.showFeedback(card, wasCorrect);
    if (game.mode === 'study' && wasCorrect) {
      ui.showStudyTeaching(card);
    }
    // Route to audio (once)
    if (wasCorrect) {
      audio.play('correct');
    }
    // Route to multiplayer (once)
    sendMultiplayerEncounterResult(wasCorrect, card);
  };

  game.onRunEnd = function () {
    ui.hideHud();
    ui.hideAnswerChoices();
    audio.stopAmbient();

    // Finalize run ONCE
    finalizeRun(game);

    // Multiplayer: send final score
    sendMultiplayerEndRun();

    // Restore home
    showBottomNav(true);
    if (homeCharacter) homeCharacter.startAnimation();

    ui.showPostRun(game);

    // Wire post-run buttons
    var againBtn = document.getElementById('playAgainBtn');
    if (againBtn) {
      againBtn.addEventListener('click', function () { startMode(game.mode); });
    }
    var weakBtn = document.getElementById('weaknessBtn');
    if (weakBtn) {
      weakBtn.addEventListener('click', function () { startMode('weakness'); });
    }

    // Hide opponent HUD after delay
    setTimeout(function () {
      hideOpponentHud();
      multiplayerMatchStarted = false;
    }, 5000);
  };

  game.onHudUpdate = function () {
    ui.updateHud(game);
    sendMultiplayerGameState();
  };

  game.onScorePopup = function (points) {
    ui.showScorePopup(points);
    ui.showCoinBurst();
  };

  game.onStreakMilestone = function (streak, multiplier) {
    ui.showStreakMilestone(streak, multiplier);
  };

  game.onPowerupCollected = function (type) {
    ui.showPowerupNotification(type);
    ui.showPowerupGlow(type);
    audio.play('powerup');
  };

  game.onAchievementUnlocked = function (achievementIds) {
    ui.showAchievementNotification(achievementIds);
  };

  game.onContinuePrompt = function (cost) {
    ui.showContinuePrompt(
      cost,
      function () {
        var success = game.doContinue();
        if (success) {
          audio.play('continue');
          ui.showHud();
        } else {
          game.endRun();
        }
      },
      function () {
        game.endRun();
      }
    );
  };

  game.onSkinSelected = function (skinName) {
    ui.showTrackName(skinName);
    audio.startAmbient(skinName);
  };

  if (game.onMapTransition !== undefined) {
    game.onMapTransition = function (newSkinName) {
      audio.crossfadeMusic(newSkinName, 3.0);
      audio.play('mapTransition');
      ui.showTrackName(newSkinName);
    };
  }

  if (game.onPlayerFaceplant !== undefined) {
    game.onPlayerFaceplant = function () {
      audio.play('faceplant');
    };
  }

  ui.onEquipChange = function () {
    game.buildPlayer();
    if (homeCharacter) homeCharacter.rebuildCharacter();
  };

  ui.onNightModeChange = function () {
    game.updateNightMode();
  };

  // ==========================
  //  BUTTON BINDINGS (no duplicates — ui.js owns its own nav buttons)
  // ==========================

  // Big green PLAY button
  var playBtn = document.querySelector('.btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', function () {
      startMode(this.dataset.mode || 'endless');
    });
  }

  // Secondary mode buttons
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = this.dataset.mode;
      if (mode) startMode(mode);
    });
  });

  // Legacy .mode-card
  document.querySelectorAll('.mode-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var mode = this.dataset.mode;
      if (mode) startMode(mode);
    });
  });

  // Leaderboard button
  var leaderboardBtn = document.getElementById('leaderboardBtn');
  if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', function () {
      ui.show('screenLeaderboard');
      mountLeaderboard();
    });
  }

  // Multiplayer
  var mpBtn = document.getElementById('multiplayerBtn');
  if (mpBtn) {
    mpBtn.addEventListener('click', async function () {
      var overlay = document.getElementById('multiplayerOverlay');
      var content = document.getElementById('mpContent');
      if (!overlay || !content) return;
      overlay.classList.add('active');
      content.innerHTML =
        '<button class="btn btn-green btn-block" id="mpHostBtn">\uD83C\uDFAE Host Game</button>' +
        '<div style="text-align:center;margin:8px 0;color:var(--text-muted)">\u2014 or \u2014</div>' +
        '<input type="text" id="mpJoinCode" maxlength="5" placeholder="ROOM CODE" style="width:100%;padding:10px;border-radius:12px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3);font-size:18px;text-align:center;letter-spacing:4px;margin-bottom:8px;text-transform:uppercase">' +
        '<button class="btn btn-primary btn-block" id="mpJoinBtn">Join Game</button>';

      var module;
      try {
        module = await import('./multiplayer.js');
        await module.multiplayer.init();
      } catch (error) {
        content.textContent = 'Could not load multiplayer: ' + error.message;
        return;
      }

      document.getElementById('mpHostBtn').addEventListener('click', function () {
        configureMultiplayer(module.multiplayer, content);
        content.innerHTML = '<div class="mp-status">Creating room...</div>';
        module.multiplayer.hostGame(function (code) {
          content.innerHTML =
            '<div class="mp-status">Waiting for opponent...</div>' +
            '<div class="mp-room-code">' + code + '</div>' +
            '<div class="mp-status">Share this code with a friend.</div>';
        });
      });

      document.getElementById('mpJoinBtn').addEventListener('click', function () {
        var input = document.getElementById('mpJoinCode');
        var code = input.value.trim().toUpperCase();
        if (code.length !== 5) { alert('Enter a five-character room code.'); return; }
        configureMultiplayer(module.multiplayer, content);
        content.innerHTML = '<div class="mp-status">Connecting to ' + code + '...</div>';
        module.multiplayer.joinGame(code);
      });
    });
  }

  var mpCloseBtn = document.getElementById('mpCloseBtn');
  if (mpCloseBtn) {
    mpCloseBtn.addEventListener('click', function () {
      var overlay = document.getElementById('multiplayerOverlay');
      if (overlay) overlay.classList.remove('active');
    });
  }

  // Pause / Resume / End Run
  document.getElementById('pauseBtn').addEventListener('click', function () {
    game.togglePause();
  });
  document.getElementById('resumeBtn').addEventListener('click', function () {
    game.resume();
  });
  document.getElementById('endRunBtn').addEventListener('click', function () {
    audio.stopAmbient();
    showBottomNav(true);
    if (homeCharacter) homeCharacter.startAnimation();
    game.endRun();
  });

  // ==========================
  //  MUSIC AUTO-START
  // ==========================
  document.addEventListener('click', function startMusicOnce() {
    if (storage.get('musicOn')) {
      audio.startMusic();
    }
    document.removeEventListener('click', startMusicOnce);
  }, { once: true });

  // ==========================
  //  VISIBILITY PAUSE  [2] §19.2
  // ==========================
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (game.running && !game.paused) {
        game.togglePause();
      }
      // TTS stop
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  });

  // ==========================
  //  PREVENT PULL-TO-REFRESH
  // ==========================
  document.addEventListener('touchmove', function (e) {
    if (game.running) e.preventDefault();
  }, { passive: false });

  // ==========================
  //  RETROACTIVE ACHIEVEMENT CHECK
  // ==========================
  storage.checkAchievements(null);

  // ==========================
  //  MAIN RENDER LOOP  [2] §2.2 — the ONLY animation loop
  // ==========================
  // The engine already calls renderer.setAnimationLoop in game.init().
  // HomeCharacter must NOT call requestAnimationFrame independently.
  // The Locker preview may retain its own renderer per §24.2.
  //
  // Since the current engine.js already owns setAnimationLoop and
  // renders only when game.running, the home character uses its own
  // RAF loop on a SEPARATE scene/camera (same renderer). This is
  // permitted by the architecture because HomeCharacter renders into
  // the same canvas but a different Three.js scene.
  //
  // When the game starts, homeCharacter.stopAnimation() is called,
  // and when it ends, homeCharacter.startAnimation() resumes.

  // Start home character animation
  if (homeCharacter) homeCharacter.startAnimation();

  // ==========================
  //  PERIODIC INVITE CHECKING
  // ==========================
  setInterval(function () {
    if (leaderboardModule && leaderboardModule.leaderboard && !game.running) {
      leaderboardModule.leaderboard.checkInvites().then(function (invites) {
        if (invites && invites.length > 0) {
          var invite = invites[0];
          if (confirm('Match invite! Room code: ' + invite.room_code + '\n\nJoin now?')) {
            var mpBtnEl = document.getElementById('multiplayerBtn');
            if (mpBtnEl) mpBtnEl.click();
            setTimeout(function () {
              var joinInput = document.getElementById('mpJoinCode');
              var joinBtn = document.getElementById('mpJoinBtn');
              if (joinInput && joinBtn) {
                joinInput.value = invite.room_code;
                joinBtn.click();
              }
            }, 1500);
          }
        }
      }).catch(function () {
        // Best-effort cleanup: invite check failed silently.
      });
    }
  }, 5000);
}

// =========================================================================
//  MULTIPLAYER SEND HELPERS (route engine events to multiplayer ONCE)
// =========================================================================
function isMultiplayerActive() {
  return multiplayerClient &&
    multiplayerClient.isConnected() &&
    (game.mode === 'versus' || game.mode === 'mp_highscore' ||
     game.mode === 'mp_suddendeath' || game.mode === 'mp_race');
}

function sendMultiplayerEncounterResult(wasCorrect, card) {
  if (!isMultiplayerActive()) return;
  multiplayerClient.sendEncounterResult(wasCorrect, game.score, card.id);
}

function sendMultiplayerGameState() {
  if (!isMultiplayerActive()) return;
  var now = performance.now();
  if (now - multiplayerLastStateSend < 100) return;
  multiplayerLastStateSend = now;
  multiplayerClient.sendGameState({
    lane: game.currentLane,
    score: game.score,
    streak: game.streak,
    correct: game.correct,
    wrong: game.wrong,
    lives: game.lives,
    rushing: game.rushing,
    rushStacks: game.rushStacks,
    running: game.running
  });
}

function sendMultiplayerEndRun() {
  if (!isMultiplayerActive()) return;
  multiplayerClient.sendEndRun({
    score: game.score,
    correct: game.correct,
    wrong: game.wrong,
    bestStreak: game.bestStreak,
    coins: game.coins
  });
}

// =========================================================================
//  SETTINGS EXTENSION MOUNT — Anki importer [2] §21.1
// =========================================================================
function mountAnkiImport() {
  if (!ankiImportModule || !ankiImportModule.ankiImport) return;
  var container = document.getElementById('ankiImportContainer');
  if (!container) return;
  container.innerHTML = ankiImportModule.ankiImport.renderAnkiImportUI();
  ankiImportModule.ankiImport.bindAnkiEvents(container, customCards, storage);
}

// Remount after Settings renders
var _origRenderSettings = ui.renderSettings;
if (typeof _origRenderSettings === 'function') {
  ui.renderSettings = function () {
    _origRenderSettings.call(ui);
    // Remount Anki import into the freshly rendered settings
    mountAnkiImport();
  };
}

// =========================================================================
//  LEADERBOARD MOUNT
// =========================================================================
function mountLeaderboard() {
  if (!leaderboardModule) return;
  var lbContent = document.getElementById('leaderboardContent');
  if (!lbContent) return;
  lbContent.innerHTML = leaderboardModule.renderLeaderboardScreen();
  leaderboardModule.bindLeaderboardEvents(lbContent, storage);
}

// =========================================================================
//  START
// =========================================================================
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
