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
import { storage, STORAGE_DEFAULTS } from './storage.js';
import { checkDataSanity } from './sanity.js';
import { loadRemoteConfig, isKilled } from './remoteconfig.js';
import { audio, MENU_THEME } from './audio.js';
import { CARDS, CARD_BY_ID, SUBJECTS, loadCards, areCardsReady } from './cardhub.js';
import { bonusSubjectFor, bonusCoinsFor, nextGoalLine } from './progress.js';
import { discoveryIdFor, markExplored } from './discoverydots.js';
import { mountFitScreens } from './fitscreen.js';
import { localDateKey } from './uihelpers.js';
import { customCards } from './customcards.js';
import { createDailyOrder } from './game/gates.js';
import { uniqueByAnswer } from './cardleaks.js';
import { reportError, showUserError, installGlobalErrorHandlers, setDiagnosticsSink } from './errors.js';
import { registerServiceWorker } from './swregister.js';
import { isTutorialOpen, requestCloseTutorial } from './tutorial.js';
import { startTour } from './tour.js';
import { startGameTutorial, isGameTutorialOpen, requestCloseGameTutorial, TUTORIAL_CARD_IDS } from './tutorialrun.js';
import { mountProfileCorner, renderAccountSection } from './profilecorner.js';
import { attachPromptCard } from './promptui.js';
import { initTabSwipe } from './tabswipe.js';
import { beatsBest, recordBest } from './scorebest.js';
import { getDashControl, attachDashPrompt } from './dashcontrol.js';
import { TOURNAMENT_SIZE, isoWeekKey } from './challenge.js';
import { mountFlyers } from './homefx.js';
import { updateAttentionDots } from './attentiondots.js';
import { getTipUrl, openTipPage, shouldShowTipPrompt } from './tips.js';
import { initNative, isNative } from './native.js';
import { loadingLine } from './flavor.js';
import { isRankedRun } from './rules.js';
import { ranked, useTestClient as useRankedTestClient } from './ranked.js';
import { FEATURES } from './features.js';
import { watchBattery } from './battery.js';
import { appPublicUrl } from './publicurl.js';
import { syncNativeReminder } from './reminders.js';
import { watchConnection } from './offline.js';
import { shareSetting, isShareableRun, runPayload, crossedCardMilestone, crossedDayMilestone } from './sharing.js';
import { LOCKER_ITEMS, QUESTS } from './game/shopdata.js';
import { newlyAffordable } from './lockerdots.js';
import { pickTheme, applyTheme, rollWorld, rerollDue } from './theme.js';
import { awardRunXp, buildRunRewardCard, renderLevelChip } from './rewardsui.js';
import { leagueRules } from './leagues.js';
import { shareText } from './platform.js';
import { installChunkRecovery } from './chunkrecovery.js';
import { ComboTracker, musicMood } from './game/combo.js';
import { GOLD_REWARD_COINS } from './game/mapmastery.js';
import { palCheer, currentPal, streakDeservesCheer } from './palui.js';
import { palReminder } from './companions.js';
import { isRankedActive, isSearching, startRankedSearch, cancelRanked, finishRankedMatch, mountLeagueCard, mountTopPlayers, refreshHomeBadge } from './rankedui.js';

// ===== Lazy-loaded module references =====
var ankiImportModule = null;
var leaderboardModule = null;

// ===== Application state =====
var homeCharacter = null;
var webglOk = true;
var multiplayerClient = null;
var multiplayerLastStateSend = 0;
var multiplayerMatchStarted = false;
var multiplayerModeConfig = {};
var multiplayerLocalResult = null;
var multiplayerOpponentResult = null;
var multiplayerResultShown = false;
var runStartTime = 0;
var currentRunId = null;
var lastRunReward = null;
var lastRunBonus = null;   // { subject, coins, got } for the results screen
var lastRunNewBest = false;
var GAUNTLET_REWARD = 150;
var GAUNTLET_LIVES = 1;
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
      // The section starts closed (the `hidden` attribute); the first tap must open it
      var isOpen = !subjectBody.hidden;
      subjectBody.hidden = isOpen;
      subjectToggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if (subjectArrow) subjectArrow.classList.toggle('open', !isOpen);
    });
  }
}

// =========================================================================
//  HOME CHARACTER
// =========================================================================
function showWebGLNotice() {
  var section = document.querySelector('.play-section');
  if (!section) return;
  var note = document.createElement('p');
  note.id = 'webglNotice';
  note.setAttribute('role', 'status');
  note.style.cssText = 'font-size:12px;color:var(--accent-gold);text-align:center;margin:8px 0';
  note.textContent = 'Graphics (WebGL) are not available in this browser, so the runner cannot start. Flashcards, the exam simulator, stats and everything else still work.';
  section.appendChild(note);
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
  ['opponentScore', 'opponentStreak', 'opponentCorrect', 'opponentWrong'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = '0';
  });
}

function showMultiplayerMessage(message, color) {
  // Same out-of-the-way chip as the map names and hazards (see ui.showNotice)
  ui.showNotice(message, { color: color || 'var(--accent-cyan)', ms: 2200 });
}

function scheduleVersusStart(config) {
  if (multiplayerMatchStarted) return;
  multiplayerMatchStarted = true;
  multiplayerModeConfig = config.config || config.modeConfig || {};
  multiplayerLocalResult = null;
  multiplayerOpponentResult = null;
  multiplayerResultShown = false;
  var overlay = document.getElementById('multiplayerOverlay');
  if (overlay) overlay.classList.remove('active');
  // startAt is on the host's clock; the joiner converts it with the offset measured by the clock pings
  // (a phone with a clock a minute off would otherwise start a minute early or late)
  var startAt = config.startAt || Date.now();
  if (multiplayerClient && !multiplayerClient.isHost && multiplayerClient.hostStartToLocalTime) {
    startAt = multiplayerClient.hostStartToLocalTime(startAt);
  }
  var delay = Math.min(10000, Math.max(0, startAt - Date.now()));
  showMultiplayerMessage('Match starting!', 'var(--accent-green)');
  setTimeout(function () {
    startMode(config.mode || 'mp_highscore');
  }, delay);
}

function isMultiplayerMode(mode) {
  return mode === 'versus' || mode === 'mp_highscore' ||
    mode === 'mp_suddendeath' || mode === 'mp_race';
}

/**
 * Decide the winner once both sides have reported.
 * @returns {'win'|'loss'|'tie'}
 */
function decideMultiplayerResult(mode, local, remote) {
  if (remote.forfeit) return 'win';
  if (local.forfeit) return 'loss';
  if (mode === 'mp_suddendeath') {
    if (local.eliminated && !remote.eliminated) return 'loss';
    if (remote.eliminated && !local.eliminated) return 'win';
  }
  if (mode === 'mp_race') {
    var target = (multiplayerModeConfig && multiplayerModeConfig.targetCorrect) || 0;
    var localDone = target > 0 && local.correct >= target;
    var remoteDone = target > 0 && remote.correct >= target;
    if (localDone && !remoteDone) return 'win';
    if (remoteDone && !localDone) return 'loss';
    if (localDone && remoteDone && local.raceTime !== remote.raceTime) {
      return local.raceTime < remote.raceTime ? 'win' : 'loss';
    }
    if (local.correct !== remote.correct) return local.correct > remote.correct ? 'win' : 'loss';
  }
  if (local.score === remote.score) return 'tie';
  return local.score > remote.score ? 'win' : 'loss';
}

function maybeShowMultiplayerResult() {
  if (multiplayerResultShown || !multiplayerLocalResult || !multiplayerOpponentResult) return;
  multiplayerResultShown = true;
  var mode = multiplayerLocalResult.mode;
  var outcome = decideMultiplayerResult(mode, multiplayerLocalResult, multiplayerOpponentResult);
  var you = multiplayerLocalResult.score;
  var them = multiplayerOpponentResult.score || 0;
  var message;
  if (multiplayerOpponentResult.forfeit) message = '🏆 Rival left the match — you win!';
  else if (multiplayerLocalResult.forfeit) message = 'You forfeited the match.';
  else if (outcome === 'win') message = '🏆 You won! ' + you + '–' + them;
  else if (outcome === 'loss') message = 'Rival won ' + them + '–' + you;
  else message = '🤝 Tie game: ' + you;
  showMultiplayerMessage(message, 'var(--accent-gold)');
  if (storage.recordMultiplayerGame) storage.recordMultiplayerGame(outcome === 'win');
  if (isRankedActive()) finishRankedMatch(outcome === 'tie' ? 'draw' : outcome);
}

function makeForfeitResult() {
  return { forfeit: true, score: 0, correct: 0, eliminated: false, raceTime: Number.MAX_SAFE_INTEGER };
}

function configureMultiplayer(client, content) {
  multiplayerClient = client;
  multiplayerMatchStarted = false;
  multiplayerModeConfig = {};
  multiplayerLocalResult = null;
  multiplayerOpponentResult = null;
  multiplayerResultShown = false;

  function statusEl(text, color, id) {
    var el = document.createElement('div');
    el.className = 'mp-status';
    if (id) el.id = id;
    if (color) el.style.color = color;
    el.textContent = text;
    return el;
  }

  function modeLabel(modes, id) {
    for (var i = 0; i < modes.length; i++) if (modes[i].id === id) return modes[i].name;
    return id;
  }

  client.onConnected = function () {
    content.textContent = '';
    content.appendChild(statusEl('✅ Opponent connected!', 'var(--accent-green)'));

    var modeSlot = document.createElement('div');
    content.appendChild(modeSlot);

    import('./multiplayer.js').then(function (mod) {
      if (client.isHost) {
        var select = document.createElement('select');
        select.setAttribute('aria-label', 'Match mode');
        select.style.cssText = 'width:100%;padding:10px;border-radius:12px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3);margin:8px 0';
        mod.MP_MODES.forEach(function (m) {
          var opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name + ' — ' + m.desc;
          select.appendChild(opt);
        });
        select.addEventListener('change', function () { client.setMode(select.value); });
        modeSlot.appendChild(select);
        client.setMode(select.value);
      } else {
        modeSlot.appendChild(statusEl('Waiting for the host to choose a mode…', null, 'mpModeStatus'));
      }
    });

    var readyBtn = document.createElement('button');
    readyBtn.className = 'btn btn-green btn-block';
    readyBtn.id = 'mpReadyBtn';
    readyBtn.style.marginTop = '10px';
    readyBtn.textContent = 'Ready';
    readyBtn.addEventListener('click', function () {
      client.sendReady(true);
      readyBtn.disabled = true;
      readyBtn.textContent = '✓ READY';
    });
    content.appendChild(readyBtn);
    var ready = statusEl('Waiting for both players...', null, 'mpReadyStatus');
    ready.style.marginTop = '8px';
    content.appendChild(ready);
  };

  client.onModeSelected = function (info) {
    var el = document.getElementById('mpModeStatus');
    if (!el) return;
    import('./multiplayer.js').then(function (mod) {
      el.textContent = 'Mode: ' + modeLabel(mod.MP_MODES, info.mode);
    });
  };

  client.onReadyState = function (state) {
    var status = document.getElementById('mpReadyStatus');
    if (!status) return;
    if (state.localReady && state.opponentReady) {
      if (client.isHost) {
        status.textContent = '';
        var ok = document.createElement('span');
        ok.style.color = 'var(--accent-green)';
        ok.textContent = 'Both ready!';
        var startBtn = document.createElement('button');
        startBtn.className = 'btn btn-primary btn-block';
        startBtn.id = 'mpStartMatchBtn';
        startBtn.style.marginTop = '8px';
        startBtn.textContent = 'Start Match';
        status.appendChild(ok);
        status.appendChild(startBtn);
        startBtn.addEventListener('click', function () {
          startBtn.disabled = true;
          import('./multiplayer.js').then(function (mod) {
            var cfg = client.sendMatchConfig({
              mode: client.getMode(),
              startAt: Date.now() + 2500,
              seed: Math.floor(Math.random() * 2147483646) + 1,
              subjects: storage.get('selectedSubjects'),
              cardPoolHash: mod.hashCardPool(CARDS)
            });
            client.sendMatchStart();
            scheduleVersusStart({ startAt: cfg.startAt, mode: cfg.mode, config: cfg.modeConfig });
          });
        });
      } else {
        status.textContent = 'Both ready — waiting for host to start.';
      }
    } else if (state.localReady) {
      status.textContent = 'You are ready. Waiting for opponent...';
    } else if (state.opponentReady) {
      status.textContent = 'Opponent is ready.';
    }
  };

  client.onMatchStart = function (config) {
    // Both peers must hold the same built-in card pool or the seeded order
    // would desync; the host's hash comes with the match config.
    import('./multiplayer.js').then(function (mod) {
      if (config.cardPoolHash && config.cardPoolHash !== mod.hashCardPool(CARDS)) {
        client.sendForfeit('Card pool mismatch');
        showMultiplayerMessage('Card sets differ between players — refresh both browsers and retry.', 'var(--accent-red)');
        return;
      }
      scheduleVersusStart(config);
    });
  };
  client.onOpponentUpdate = function (state) { updateOpponentHud(state); };

  client.onEncounterResult = function (result) {
    if (result.correct) {
      showMultiplayerMessage('Rival answered correctly!', 'var(--accent-pink)');
    }
  };

  client.onRunFinished = function (result) {
    multiplayerOpponentResult = {
      score: result.score || 0,
      correct: result.correctCount || result.correct || 0,
      eliminated: !!result.eliminated,
      raceTime: result.raceTime || Number.MAX_SAFE_INTEGER
    };
    if (game.running) {
      showMultiplayerMessage('Rival finished with ' + multiplayerOpponentResult.score + ' points', 'var(--accent-gold)');
    }
    maybeShowMultiplayerResult();
  };

  // The match is decided the moment the rival is eliminated (Sudden Death) or reaches the target (Race), so
  // stop the local run instead of letting it play on and compare scores
  function endIfDecided(mode) {
    if (multiplayerMatchStarted && game.running && game.mode === mode) game.requestEnd('match_decided');
  }

  client.onEliminated = function () {
    showMultiplayerMessage('💀 Rival eliminated!', 'var(--accent-green)');
    endIfDecided('mp_suddendeath');
  };

  client.onRaceFinished = function (data) {
    showMultiplayerMessage('🏁 Rival finished! ' + data.correctCount + ' correct in ' + Math.round(data.totalTime / 1000) + 's', 'var(--accent-gold)');
    endIfDecided('mp_race');
  };

  client.onForfeit = function () {
    multiplayerOpponentResult = makeForfeitResult();
    if (game.running) game.requestEnd('opponent_forfeit');
    maybeShowMultiplayerResult();
  };

  client.onDisconnected = function (reason) {
    hideOpponentHud();
    if (multiplayerMatchStarted && !multiplayerOpponentResult) {
      multiplayerOpponentResult = makeForfeitResult();
      if (game.running) game.requestEnd('opponent_forfeit');
      maybeShowMultiplayerResult();
    } else {
      showMultiplayerMessage(reason || 'Opponent disconnected.', 'var(--accent-red)');
    }
    multiplayerMatchStarted = false;
  };

  client.onError = function (error) {
    content.textContent = '';
    content.appendChild(statusEl('❌ ' + error, 'var(--accent-red)'));
  };
}

// =========================================================================
//  MODE STARTER  —  Canonical game.start(options) [2] §6.2
// =========================================================================
/** Start this week's Gauntlet: the same 30 seeded cards for everyone, with one life. */
function startTournament() {
  Promise.all([import('./challenge.js'), import('./multiplayer.js')]).then(function (mods) {
    var challenge = mods[0];
    var seed = challenge.tournamentSeed(challenge.isoWeekKey());
    var plan = mods[1].buildEncounterPlan({ seed: seed, cards: CARDS, count: challenge.TOURNAMENT_SIZE });
    launchRun('tournament', plan.map(function (entry) { return entry.cardId; }), { challengeCount: challenge.TOURNAMENT_SIZE, allowContinue: false, lives: GAUNTLET_LIVES });
  }).catch(function (e) {
    reportError(e, { system: 'tournament', operation: 'start', recoverable: true });
    ui._showToast('Could not start the Weekly Gauntlet. Check your connection and try again.', 2200);
  });
}

/** Insert a highlighted box near the top of the post-run screen. */
function addPostRunBox(builder) {
  var content = document.getElementById('postRunContent');
  if (!content) return;
  var box = document.createElement('div');
  box.style.cssText = 'margin:12px 0;padding:12px;border-radius:12px;border:2px solid var(--accent-gold);text-align:center';
  builder(box);
  content.insertBefore(box, content.children[1] || null);
}

/** Post at most one activity event per kind per window (an hour unless said otherwise). */
function throttledActivity(kind, payload, windowMs) {
  if (!leaderboardModule) return;
  var key = 'buzzword_activity_throttle';
  var seen = {};
  try { seen = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { seen = {}; }
  if (!seen || typeof seen !== 'object' || Array.isArray(seen)) seen = {}; // (stored text can be "null" or a list)
  if (Date.now() - (Number(seen[kind]) || 0) < (windowMs || 3600000)) return;
  seen[kind] = Date.now();
  try { localStorage.setItem(key, JSON.stringify(seen)); } catch (e) { /* storage unavailable; posting is best-effort */ }
  // A player who keeps runs private still gets them in their own feed, but nobody else sees them
  leaderboardModule.leaderboard.postActivity(kind, payload, shareSetting(storage.get('shareRuns')));
}

/** A first look at a counter only sets the baseline, so players with history are not greeted with old news. */
function crossedSince(seenKey, now, crossed) {
  var seen = Number(storage.get(seenKey)) || 0;
  if (seen === 0 && now > 0) { storage.set(seenKey, now); return null; }
  storage.set(seenKey, now);
  return crossed(seen, now);
}

function postActivities(summary, result) {
  var name = storage.get('profileName');
  if (isShareableRun(summary)) throttledActivity('run', runPayload(summary, name), 120000);
  if (result && result.newBestScore && summary.score > 0) {
    throttledActivity('new_best', { name: name, score: summary.score });
  }
  if (summary.bestStreak >= 10) {
    throttledActivity('streak', { name: name, streak: summary.bestStreak });
  }
  var cards = crossedSince('cardMilestoneSeen', Number(storage.get('totalCardsStudied')) || 0, crossedCardMilestone);
  if (cards) throttledActivity('milestone', { name: name, cards: cards }, 60000);
  var days = crossedSince('dayMilestoneSeen', storage.getStreakStatus().streak, crossedDayMilestone);
  if (days) throttledActivity('streak_days', { name: name, days: days }, 60000);
}

// A finished exam simulation goes to friends' feeds (only for a signed-in player with a public, named profile)
document.addEventListener('dx:exam-finished', function (e) {
  if (!leaderboardModule || !leaderboardModule.leaderboard.isAuthenticated()) return;
  if (!storage.get('profileVisible') || !storage.get('profileName')) return;
  var d = (e && e.detail) || {};
  if (!(d.total >= 10)) return; // a quick handful of questions is not worth announcing
  throttledActivity('exam', { name: storage.get('profileName'), accuracy: Math.round(Number(d.accuracy) || 0) });
});

var _lastStudySync = -1;

/** Tell the server how many cards we studied this week (for group goals). */
function syncWeeklyStudy() {
  if (!leaderboardModule || !leaderboardModule.leaderboard.isAuthenticated()) return;
  var cards = storage.getWeeklyCards();
  if (cards === _lastStudySync || cards === 0) return;
  _lastStudySync = cards;
  leaderboardModule.leaderboard.reportStudy(cards);
}

var activeChallenge = null;

function challengeBase() {
  return appPublicUrl(); // (inside the phone app the page is https://localhost, which a friend cannot open)
}

/** Share a challenge link: native share sheet if present, else clipboard. */
function shareChallenge(challenge) {
  return import('./challenge.js').then(function (mod) {
    return import('./multiplayer.js').then(function (mp) {
      var url = mod.buildChallengeUrl(challengeBase(), {
        seed: challenge.seed,
        n: challenge.n,
        from: storage.get('profileName') || 'A friend',
        score: challenge.myScore || 0,
        hash: mp.hashCardPool(CARDS),
        ids: challenge.ids || null
      });
      var text = 'Beat my Dx Dash score of ' + (challenge.myScore || 0) + '!';
      return shareText({ title: 'Dx Dash challenge', text: text, url: url }).then(function (res) {
        if (res === 'copied') ui._showToast('Challenge link copied \u2014 send it to a friend!');
        else if (res === 'failed') window.prompt('Copy this challenge link:', url);
      });
    });
  });
}

/** Banner shown when the app is opened from a challenge link. */
function showChallengeBanner(challenge) {
  var banner = document.createElement('div');
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Challenge received');
  banner.style.cssText = 'position:fixed;top:12%;left:50%;transform:translateX(-50%);z-index:60;width:90%;max-width:340px;padding:16px;border-radius:16px;background:rgba(10,5,30,0.97);border:2px solid var(--accent-gold);color:#fff;text-align:center';
  var title = document.createElement('div');
  title.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:6px';
  title.textContent = (challenge.from || 'A friend') + ' challenges you!';
  var body = document.createElement('div');
  body.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-bottom:12px';
  body.textContent = challenge.n + ' questions, same order for both of you. Score to beat: ' + challenge.score.toLocaleString();
  var accept = document.createElement('button');
  accept.className = 'btn btn-green btn-block';
  accept.textContent = 'Accept challenge';
  var dismiss = document.createElement('button');
  dismiss.className = 'btn btn-outline btn-block';
  dismiss.style.marginTop = '6px';
  dismiss.textContent = 'Not now';
  banner.appendChild(title);
  banner.appendChild(body);
  banner.appendChild(accept);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);
  dismiss.addEventListener('click', function () { banner.remove(); });
  accept.addEventListener('click', function () {
    banner.remove();
    activeChallenge = { seed: challenge.seed, n: challenge.n, from: challenge.from, score: challenge.score, ids: challenge.ids || null };
    startMode('challenge');
  });
}

/** Handle a #c= link on load. */
function handleChallengeLink() {
  import('./challenge.js').then(function (mod) {
    var challenge = mod.parseChallengeHash(window.location.hash);
    if (!challenge) return;
    // Clear the hash so a refresh does not re-open the banner.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return import('./multiplayer.js').then(function (mp) {
      // A link that carries its card ids plays those cards even after the card set has changed
      if (!challenge.ids && challenge.hash && challenge.hash !== mp.hashCardPool(CARDS)) {
        ui._showToast('This challenge uses a different card set. Ask your friend to update the game.');
        return;
      }
      showChallengeBanner(challenge);
    });
  }).catch(function (e) {
    reportError(e, { system: 'challenge', operation: 'parseLink', recoverable: true });
  });
}

/** Start a brand-new challenge run (you set the score to beat). */
function startNewChallenge() {
  import('./challenge.js').then(function (mod) {
    activeChallenge = { seed: mod.newChallengeSeed(), n: mod.CHALLENGE_SIZE, from: null, score: null };
    startMode('challenge');
  }).catch(function (err) {
    reportError(err, { system: 'challenge', operation: 'start', recoverable: true });
    ui._showToast('Could not start the challenge. Check your connection and try again.');
  });
}

/** Post-run: compare to the sender and offer to share. */
/**
 * A rare, polite tip note after a good run (never during a run or exam).
 * It appears at most once a week and can be turned off for good.
 */
/** The first results screen a player sees points out the review: that is where missed cards are explained. */
function attachReviewTip() {
  if (storage.get('reviewTipSeen') || game._tutorial || game.correct + game.wrong === 0) return;
  storage.set('reviewTipSeen', true);
  setTimeout(function () {
    var target = function () { return document.querySelector('#postRunContent .post-review'); };
    if (!document.getElementById('screenPostRun') || !document.getElementById('screenPostRun').classList.contains('active')) return;
    startTour({
      steps: [{ id: 'review', title: 'Learn from every miss', target: target, press: 'next',
        text: 'Tap Missed to see each question you got wrong, the right answer and why. Tap Correct to revisit the ones you got right. Review is where the learning happens.' }]
    });
  }, 2200);
}

function attachTipPrompt() {
  var content = document.getElementById('postRunContent');
  if (!content) return;
  var total = game.correct + game.wrong;
  // After a few games on a phone: offer the double tap once (one ask per results screen, so this one goes first)
  if (attachDashPrompt(content, function (m) { ui._showToast(m); })) return;
  // Share / rate / account asks come first; only one ask per results screen, so the tip waits its turn
  var lb = leaderboardModule ? leaderboardModule.leaderboard : null;
  var lbStatus = lb ? lb.getStatus() : null;
  var asked = attachPromptCard({
    container: content,
    storage: storage,
    run: { correct: game.correct, accuracy: total > 0 ? Math.round(game.correct / total * 100) : 0, newBest: lastRunNewBest },
    signedIn: !!(lbStatus && lbStatus.email && !lbStatus.anonymous),
    accountsAvailable: !!(lbStatus && lbStatus.configured),
    openAccount: function () { if (profileCorner) profileCorner.open(); },
    sendFeedback: lb ? function (fb) { return lb.submitFeedback(fb); } : null,
    toast: function (m) { ui._showToast(m); }
  });
  if (asked) return;
  var shouldShow = shouldShowTipPrompt({
    tipUrl: getTipUrl(),
    optedOut: !!storage.get('tipPromptOff'),
    totalRuns: storage.data.history.recentRuns.length,
    lastPromptAt: storage.get('lastTipPromptAt') || 0,
    now: Date.now(),
    correct: game.correct,
    accuracy: total > 0 ? Math.round(game.correct / total * 100) : 0
  });
  if (!shouldShow) return;
  storage.set('lastTipPromptAt', Date.now());

  var box = document.createElement('div');
  box.style.cssText = 'margin:14px 0;padding:12px;border-radius:12px;border:1px solid rgba(255,215,0,0.4);text-align:center;background:rgba(255,215,0,0.06)';
  var text = document.createElement('div');
  text.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-bottom:8px';
  text.textContent = 'Enjoying Dx Dash? It is free and always will be. If it is helping your studying, a small tip helps keep it going.';
  box.appendChild(text);

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center';
  function makeButton(label, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    row.appendChild(b);
  }
  makeButton('\u2615 Leave a tip', 'btn-gold', function () { openTipPage(); box.remove(); });
  makeButton('Not now', 'btn-outline', function () { box.remove(); });
  makeButton('Don\u2019t ask again', 'btn-outline', function () { storage.set('tipPromptOff', true); box.remove(); });
  box.appendChild(row);
  content.appendChild(box);
}

var MODE_LABELS = {
  endless: 'Endless', study: 'Study', weakness: 'Weakness', daily: 'Daily Challenge',
  challenge: 'Challenge', tournament: 'Weekly Gauntlet', mp_highscore: 'Versus', mp_suddendeath: 'Sudden Death', mp_race: 'Race'
};

/** Post-run: render the result as an image to share or save. */
/** The XP card at the top of the results screen. */
/** Under the review buttons: the subject-of-the-day bonus, if it paid, and the one small goal that is closest. */
function attachNextGoal() {
  var content = document.getElementById('postRunContent');
  var bonus = lastRunBonus;
  lastRunBonus = null;
  if (!content) return;
  var lines = [];
  if (bonus && bonus.coins > 0) lines.push('⭐ ' + bonus.subject + ' day: +' + bonus.coins + ' 🪙');
  var owned = storage.get('ownedItems') || [];
  var wanted = LOCKER_ITEMS.filter(function (i) { return i.price > 0 && !i.hidden && !i.gatedBy && owned.indexOf(i.id) < 0; })
    .sort(function (a, b) { return a.price - b.price; })[0];
  var goal = nextGoalLine({
    score: game.score, best: storage.get('bestScore') || 0, xp: storage.get('xp') || 0, coins: storage.get('coins') || 0,
    dailyDone: storage.getStudiedToday(), dailyGoal: storage.get('dailyGoal') || 20,
    cheapestWanted: wanted ? { name: wanted.name, price: wanted.price } : null
  });
  if (goal) lines.push(goal);
  if (!lines.length) return;
  var box = document.createElement('div');
  box.className = 'post-next-goal';
  box.setAttribute('role', 'status');
  lines.forEach(function (t) { var d = document.createElement('div'); d.textContent = t; box.appendChild(d); });
  var actions = content.querySelector('.post-actions');
  content.insertBefore(box, actions);
}

function attachRewardCard() {
  var content = document.getElementById('postRunContent');
  var reward = lastRunReward;
  lastRunReward = null;
  lastRunNewBest = !!(reward && reward.newBest);
  if (!content || !reward) return;
  var card = buildRunRewardCard(reward.info, reward.score, reward.best, reward.newBest);
  var postHeader = content.querySelector('.post-header');
  if (card) content.insertBefore(card, postHeader ? postHeader.nextSibling : null);
  if (reward.newBest) audio.haptic('best');
  renderLevelChip(document.getElementById('homeLevel'));
  updateLockerDot();
}

/**
 * A red dot on the Locker tab when something has become affordable since the last visit.
 * It goes away once the Locker has been opened and left (see ui.show).
 */
function updateLockerDot() {
  var fresh = newlyAffordable(LOCKER_ITEMS, storage.get('coins') || 0, storage.get('ownedItems') || [], storage.get('lockerSeen') || []);
  var nav = document.querySelector('.nav-item[data-screen="screenShop"]');
  if (!nav) return;
  var dot = nav.querySelector('.nav-dot');
  if (fresh.length) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'nav-dot';
      dot.setAttribute('aria-label', 'You can afford something new in the Locker');
      nav.appendChild(dot);
    }
  } else if (dot) {
    dot.remove();
  }
}

function attachShareImage() {
  var content = document.getElementById('postRunContent');
  if (!content) return;
  var shareBtn = document.createElement('button');
  shareBtn.className = 'btn btn-outline btn-sm post-corner-btn';
  shareBtn.type = 'button';
  shareBtn.id = 'saveShareImageBtn';
  shareBtn.setAttribute('aria-label', 'Save a share image');
  shareBtn.textContent = '\uD83D\uDDBC Image';
  var snapshot = {
    name: storage.get('profileName') || '',
    score: game.score,
    correct: game.correct,
    wrong: game.wrong,
    bestStreak: game.bestStreak,
    modeLabel: MODE_LABELS[game.mode] || 'Runner',
    trackName: game.currentSkin ? game.currentSkin.name : '',
    streakDays: storage.getStreakStatus().streak,
    cardsMet: Number(storage.get('totalCardsStudied')) || 0,
    runCards: game.runCards ? game.runCards.slice() : []
  };
  shareBtn.addEventListener('click', function () {
    shareBtn.disabled = true;
    import('./sharecard.js').then(function (mod) {
      snapshot.subjects = mod.topSubjects(snapshot.runCards);
      return mod.renderShareCard(snapshot).then(mod.shareOrDownload);
    }).then(function (how) {
      ui._showToast(how === 'downloaded' ? 'Image saved to your downloads.' : 'Shared!');
    }).catch(function (e) {
      reportError(e, { system: 'sharecard', operation: 'render', recoverable: true });
      ui._showToast('Could not create the image.');
    }).then(function () { shareBtn.disabled = false; });
  });
  var slot = document.getElementById('postImageSlot');
  (slot || content).appendChild(shareBtn);
}

/** Fixed-set modes are not ranked: lots of players finish them perfectly, so a board would only show ties. */
function isUnrankedMode(mode) {
  return mode === 'challenge' || mode === 'daily' || mode === 'tournament';
}

/** After a Weekly Gauntlet run: cleared (badge and coins, once a week) or how far you got. */
function attachGauntletResult() {
  var size = TOURNAMENT_SIZE;
  var cleared = game.encountersDone >= size && game.lives > 0;
  var week = isoWeekKey();
  var firstClear = cleared && storage.recordTournamentTop10(week);
  if (firstClear) {
    storage.addCoins(GAUNTLET_REWARD);
    ui.renderHome();
  }
  addPostRunBox(function (box) {
    var head = document.createElement('div');
    head.style.cssText = 'font-size:14px;font-weight:800';
    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;margin-top:4px;color:var(--text-secondary)';
    if (cleared) {
      head.textContent = '\uD83D\uDEE1\uFE0F Weekly Gauntlet cleared!';
      hint.textContent = firstClear ? '\uD83C\uDFC5 Badge earned and +' + GAUNTLET_REWARD + ' coins. A new Gauntlet starts next week.' : 'Already cleared this week. Nice run. A new Gauntlet starts next week.';
    } else {
      head.textContent = '\uD83D\uDEE1\uFE0F Weekly Gauntlet: ' + game.encountersDone + ' of ' + size + ' cards';
      hint.textContent = 'The same ' + size + ' cards all week, and you can retry as often as you like. Clear them on a single life.';
    }
    box.appendChild(head);
    box.appendChild(hint);
  });
}

function attachChallengeResult(finalScore) {
  var content = document.getElementById('postRunContent');
  if (!content || !activeChallenge) return;
  var box = document.createElement('div');
  box.style.cssText = 'margin:12px 0;padding:12px;border-radius:12px;border:2px solid var(--accent-gold);text-align:center';
  var headline = document.createElement('div');
  headline.style.cssText = 'font-size:14px;font-weight:800';
  if (activeChallenge.score !== null) {
    var diff = finalScore - activeChallenge.score;
    if (diff > 0) headline.textContent = 'You beat ' + (activeChallenge.from || 'your friend') + ' by ' + diff.toLocaleString() + '!';
    else if (diff < 0) headline.textContent = (activeChallenge.from || 'Your friend') + ' wins by ' + (-diff).toLocaleString() + '. Try again?';
    else headline.textContent = 'A perfect tie with ' + (activeChallenge.from || 'your friend') + '!';
  } else {
    headline.textContent = 'Challenge set: ' + finalScore.toLocaleString() + ' points';
  }
  box.appendChild(headline);
  var share = document.createElement('button');
  share.className = 'btn btn-gold btn-block';
  share.style.marginTop = '8px';
  share.textContent = '\uD83D\uDCE4 Share a challenge with your score';
  var snapshot = { seed: activeChallenge.seed, n: activeChallenge.n, myScore: finalScore, ids: activeChallenge.ids || null };
  share.addEventListener('click', function () { shareChallenge(snapshot); });
  box.appendChild(share);
  content.insertBefore(box, content.children[1] || null);
}

/** Play a list of cards in the runner (the study plan's "Run it" button). */
function startStudyPlanRun(cardIds) {
  if (!areCardsReady()) {
    ui._showToast(loadingLine());
    loadCards().then(function () { startStudyPlanRun(cardIds); });
    return;
  }
  ui.hideAll();
  launchRun('study', cardIds, { planCardIds: cardIds.slice(), allowContinue: false });
}

function startMode(mode) {
  // The questions load in the background after the first paint; wait for them if needed
  if (!areCardsReady()) {
    ui._showToast(loadingLine());
    loadCards().then(function () { startMode(mode); }).catch(function () {
      ui._showToast('Could not load the questions. Check your connection and try again.');
    });
    return;
  }
  if (!webglOk) { ui._showToast('The runner needs WebGL, which is not available here. Try Flashcards or the Exam Sim!'); return; }
  if (mode === 'tournament') { startTournament(); return; }
  if (mode === 'daily' && storage.get('dailyDone')) {
    ui._showToast('Daily round already completed today! Come back tomorrow.', 2200);
    return;
  }

  if (mode === 'weakness') {
    var subjects = storage.get('selectedSubjects');
    var allCards = CARDS.concat(customCards.getAll());
    var weakCards = allCards.filter(function (c) {
      if (Array.isArray(c.enabledModes) && c.enabledModes.length && c.enabledModes.indexOf('weakness') < 0) return false; // (imported flashcards cannot be played in the runner)
      if (subjects.length > 0 && subjects.indexOf(c.subj) < 0) return false;
      var s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weakCards.length < 3) {
      ui._showToast('Not enough missed cards yet. Play more rounds first!', 2200);
      return;
    }
  }

  // Resolve the shared multiplayer card order BEFORE the run starts so the very
  // first encounter is already seeded (installing it after go() races the
  // first spawn and desyncs the two peers).
  if (mode === 'challenge') {
    if (!activeChallenge) { startNewChallenge(); return; }
    var challengeSeed = activeChallenge.seed;
    var challengeCount = activeChallenge.n;
    var sharedIds = activeChallenge.ids && activeChallenge.ids.filter(function (id) { return CARD_BY_ID.has(id); });
    if (sharedIds && sharedIds.length >= Math.min(5, challengeCount) && sharedIds.length === challengeCount) {
      launchRun('challenge', sharedIds, { challengeCount: challengeCount, allowContinue: false });
      return;
    }
    import('./multiplayer.js').then(function (mod) {
      var plan = mod.buildEncounterPlan({ seed: challengeSeed, cards: CARDS, count: challengeCount });
      var ids = plan.map(function (entry) { return entry.cardId; });
      if (activeChallenge) activeChallenge.ids = ids; // so the link this player shares carries the same cards
      launchRun('challenge', ids, { challengeCount: challengeCount, allowContinue: false });
    }).catch(function (err) {
      reportError(err, { system: 'challenge', operation: 'start', recoverable: true });
      ui._showToast('Could not start the challenge. Check your connection and try again.', 2200);
    });
    return;
  }

  // The Daily 15 is the same fifteen cards for everyone on the same date (it was being dealt from each player's
  // own filters and history, so no two players got the same round)
  if (mode === 'daily') {
    var now = new Date();
    var dayKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var dailyOrder = createDailyOrder({ dateKey: dayKey, eligibleCardIds: uniqueByAnswer(CARDS).map(function (c) { return c.id; }), count: 15 });
    launchRun('daily', dailyOrder.slice(), { dailyEncounterCount: 15 });
    return;
  }

  var mpSeed = (isMultiplayerMode(mode) && multiplayerMatchStarted && multiplayerClient && multiplayerClient.getSeed && multiplayerClient.getSeed()) || 0;
  if (mpSeed > 0) {
    import('./multiplayer.js').then(function (mod) {
      // Built-in pool only: both peers hold the same one (hash-verified at match
      // start), whereas per-user subject filters / custom cards would differ.
      var plan = mod.buildEncounterPlan({ seed: mpSeed, cards: CARDS, count: 100 });
      launchRun(mode, plan.map(function (entry) { return entry.cardId; }), multiplayerModeConfig);
    }).catch(function (err) {
      reportError(err, { system: 'multiplayer', operation: 'seededCardOrder', recoverable: true });
      launchRun(mode, null);
    });
    return;
  }

  launchRun(mode, null);
}

function launchRun(mode, orderedCardIds, modeConfig) {
  if (!webglOk) { ui._showToast('The runner needs WebGL, which is not available here.'); return; }
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
    // Head-to-head matches use the standard speed so both players run the same track
    userSpeed: isMultiplayerMode(mode) ? 1 : (storage.get('userSpeed') || 1),
    orderedCardIds: orderedCardIds,
    modeConfig: modeConfig ? Object.assign({}, modeConfig) : undefined,
    leagueRules: modeConfig && typeof modeConfig.leagueTrophies === 'number' ? leagueRules(modeConfig.leagueTrophies) : undefined
  });
  ui.hideAll();
  ui.resetQuestionDisplay(); // nothing from the last run's final question may show
  // The top bar belongs to this run: show its own starting numbers (and lives, which study mode does not use)
  // and put away the other player's bar unless this is a head-to-head match
  if (!isMultiplayerMode(mode)) hideOpponentHud(); else updateOpponentHud({});
  ui.updateHud(game);
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
    mapAnswers: gameRef.mapAnswers || {},
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

  // The engine's canonical summary is persisted by storage.finalizeRun only
  // (idempotent by runId); nothing else writes run totals.
  var summary = gameRef.getRunSummary() || buildRunSummary(gameRef);
  var result = storage.finalizeRun(summary);
  lastRunReward = result.applied
    ? { info: awardRunXp(summary), score: summary.score, best: storage.get('bestScore'), newBest: !!result.newBestScore }
    : null;

  // The subject of the day pays a few coins for each right answer in it (up to a daily cap)
  lastRunBonus = null;
  if (result.applied && summary.correct > 0) {
    var todayKey = localDateKey(new Date());
    var bonusSubject = bonusSubjectFor(todayKey, SUBJECTS);
    var got = gameRef.runCards.filter(function (r) { return r.ok && r.card && r.card.subj === bonusSubject; }).length;
    var paid = storage.get('bonusCoins') || {};
    // a paid date ahead of the clock (it was set back, or the player travelled west) still counts as today's cap
    var already = paid.date >= todayKey ? (paid.coins || 0) : 0;
    var capDate = paid.date > todayKey ? paid.date : todayKey;
    var bonusCoins = bonusCoinsFor(got, already);
    if (bonusCoins > 0) {
      storage.addCoins(bonusCoins);
      storage.set('bonusCoins', { date: capDate, coins: already + bonusCoins });
    }
    lastRunBonus = { subject: bonusSubject, coins: bonusCoins, got: got };
  }

  if (result.applied && summary.wrong === 0 && summary.correct >= 20 && !storage.ownsItem('avatar_golden')) {
    var owned = storage.get('ownedItems').slice();
    owned.push('avatar_golden');
    storage.set('ownedItems', owned);
  }

  // the study buddy cheers what deserves it, the next time Home is showing
  if (result.applied) {
    if (lastRunReward && lastRunReward.newBest) palCheer('best');
    else if (lastRunReward && lastRunReward.info && lastRunReward.info.levelAfter > lastRunReward.info.levelBefore) palCheer('levelup');
    else if (streakDeservesCheer(storage.getStreakStatus().streak) && storage.getStudiedToday() > 0) palCheer('milestone');
  }
  if (result.newMapMasteries && result.newMapMasteries.length > 0) {
    ui.showNotice('🥇 Map mastered: ' + result.newMapMasteries.join(', ') + '! +' + (result.newMapMasteries.length * GOLD_REWARD_COINS) + ' 🪙', { color: 'var(--accent-gold, #ffcc22)', ms: 4200 });
  }
  if (result.newlyUnlockedAchievementIds && result.newlyUnlockedAchievementIds.length > 0) {
    ui.showAchievementNotification(result.newlyUnlockedAchievementIds);
  }
  if (result.completedQuestIds && result.completedQuestIds.length > 0) {
    var titles = result.completedQuestIds.map(function (id) { var q = QUESTS.filter(function (x) { return x.id === id; })[0]; return q ? q.title : ''; }).filter(Boolean);
    if (titles.length) ui.showNotice('✅ Quest complete: ' + titles.join(', ') + '. Claim your coins in Quests.', { color: 'var(--accent-gold)', ms: 4500 });
  }

  // --- Leaderboard submission ---
  // Custom-rule runs (power-ups, hazards or monster turned off) are never ranked
  var canPost = leaderboardModule && storage.get('profileVisible') && storage.get('profileName') &&
    leaderboardModule.leaderboard.isAuthenticated() && isRankedRun(summary);
  if (canPost) postActivities(summary, result);
  // Only a run that beats the player's best for this mode this season is sent: the board keeps one entry per player
  var season = canPost ? leaderboardModule.leaderboard.getSeasonKey() : '';
  if (canPost && summary.encountersCompleted > 0 && !isUnrankedMode(summary.mode) &&
      beatsBest(storage.get('scoreBests'), summary.mode, season, summary.score)) {
    leaderboardModule.leaderboard.submitVerifiedScore({
      runId: summary.runId,
      playerName: storage.get('profileName'),
      avatar: storage.get('profilePicture') || 'avatar_intern',
      score: summary.score,
      correct: summary.correct,
      wrong: summary.wrong,
      bestStreak: summary.bestStreak,
      userSpeed: gameRef.userSpeed,
      mode: summary.mode,
      badges: storage.get('selectedBadges') || []
    }).then(function (res) {
      if (!res.success) {
        reportError(new Error(res.error), { system: 'leaderboard', operation: 'submitScore', recoverable: true });
        return;
      }
      storage.set('scoreBests', recordBest(storage.get('scoreBests'), summary.mode, season, summary.score));
      syncWeeklyStudy();
    });
  }
}

// =========================================================================
//  MAIN INITIALIZATION
// =========================================================================
/** Remove the boot splash once the app is ready. */
function hideBootSplash() {
  var splash = document.getElementById('bootSplash');
  if (!splash) return;
  splash.classList.add('done');
  setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 400);
}

var flyersOn = null;

/** The medical odds and ends flying out of the middle of the home backdrop (off for reduced motion). */
function refreshFlyers() {
  var layer = document.getElementById('bgFlyers');
  if (!layer) return;
  var reduced = !!storage.get('reducedMotion') || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (flyersOn === !reduced) return; // already in the right state
  flyersOn = !reduced;
  mountFlyers(layer, { reducedMotion: reduced });
}

/** Apply the current color theme (a whole palette tinted by the season and time of day). */
var themeRoll = { world: null, runs: 0, at: Date.now() };
function refreshTheme() {
  if (!themeRoll.world) themeRoll.world = rollWorld(null);
  var theme = pickTheme(new Date(), storage.get('uiTheme') || 'surprise', themeRoll.world);
  applyTheme(document.documentElement, theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.vars['--bg-fallback'] || '#0b1020');
  document.documentElement.setAttribute('data-theme-name', theme.name);
  refreshFlyers();
}

/** Surprise me: after every run (or after a while) the look changes to a different season, quietly: no popup or toast. */
function maybeRerollTheme() {
  if ((storage.get('uiTheme') || 'surprise') !== 'surprise') return;
  if (!rerollDue(themeRoll.runs, themeRoll.at, Date.now())) return;
  themeRoll.world = rollWorld(themeRoll.world);
  themeRoll.runs = 0;
  themeRoll.at = Date.now();
  refreshTheme();
}

/** Fill the account section of the Profile tab, and add the invitation when signed out. */
function fillProfileAccount() {
  var lb = leaderboardModule ? leaderboardModule.leaderboard : null;
  var st = lb ? lb.getStatus() : null;
  var section = document.getElementById('profileAccount');
  renderAccountSection(section, {
    getLeaderboard: function () { return lb; },
    getCloudSync: function () { return cloudSync; },
    toast: function (msg) { ui._showToast(msg); },
    rerender: function () { fillProfileAccount(); if (profileCorner) profileCorner.refresh(); }
  });
  // The one-line state beside the folded Account row
  var stateEl = document.getElementById('profileAccountState');
  if (stateEl) {
    var signedIn = !!(st && st.email && !st.anonymous);
    stateEl.textContent = !st ? '' : (!st.configured ? 'This device only' : (signedIn ? 'Signed in' : 'Guest: tap to save your progress'));
    stateEl.classList.toggle('good', signedIn);
  }

}

function init() {
  // Load the question database in the background; screens that show counts refresh when it arrives
  loadCards().then(function () {
    ui.renderHome();
    ui.renderSubjects();
  }).catch(function (e) {
    reportError(e, { system: 'cards', operation: 'load', recoverable: true });
  });
  // ?debug=1 exposes the engine on window.__game for measuring performance
  if (/[?&]debug=1(&|$)/.test(window.location.search)) {
    window.__game = game;
    window.__ui = ui;
    window.__useRankedTestClient = useRankedTestClient;
    window.__audio = audio;
    window.__storage = storage;
    window.__dataProblems = function () { return checkDataSanity(storage.data, STORAGE_DEFAULTS); };
    Object.defineProperty(window, '__cards', { get: function () { return CARDS; } }); // (CARDS is filled in after the first paint)
  }
  storage.load();
  // Switches for mechanics that turn out broken in the field (see remoteconfig.js); the saved copy applies at once
  loadRemoteConfig().catch(function () { /* the saved copy stays */ });
  // Badges added or fixed in an update are awarded to anyone who already qualifies, shown a little after launch
  setTimeout(function () {
    try {
      var late = storage.checkAchievements(null);
      if (late.length) ui.showAchievementNotification(late);
    } catch (e) { reportError(e, { system: 'achievements', operation: 'catchUp', recoverable: true }); }
  }, 4000);
  storage.checkDailyReset();
  // Colors follow the time of day and the season (Settings -> Colors can turn that off)
  refreshTheme();
  setInterval(refreshTheme, 10 * 60 * 1000);
  document.addEventListener('dx:theme-changed', refreshTheme);
  document.addEventListener('dx:home-shown', maybeRerollTheme);
  // Dash: double-tap, an on-screen button, or off (Settings -> Look -> Dash control)
  var autoBtn = document.getElementById('autoBtn');
  if (autoBtn) {
    autoBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); game.useAutoPilot(); });
    autoBtn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); game.useAutoPilot(); } });
  }
  var dashBtn = document.getElementById('dashBtn');
  function applyDashControl() { if (dashBtn) dashBtn.hidden = getDashControl() !== 'button'; }
  if (dashBtn) {
    dashBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); game.addRushStack(); });
    dashBtn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); game.addRushStack(); } });
  }
  applyDashControl();
  document.addEventListener('dx:controls-changed', applyDashControl);
  // Profile tab: the account section, and an invitation for signed-out players to make an account
  document.addEventListener('dx:profile-opened', fillProfileAccount);
  initTabSwipe(ui, ['screenStats', 'screenShop', 'screenHome', 'screenQuests', 'screenProfile']);
  // The 3D engine needs WebGL. If it cannot start (old browser, blocked GPU,
  // or ?webgl=off for diagnostics) the rest of the app must still work.
  try {
    if (/[?&]webgl=off(&|$)/.test(window.location.search)) throw new Error('WebGL disabled by URL');
    game.init();
  } catch (e) {
    webglOk = false;
    reportError(e, { system: 'engine', operation: 'init', recoverable: true });
  }
  installGlobalErrorHandlers();
  watchBattery(); // a nearly flat phone steps Auto graphics down a tier
  watchConnection(function (msg) { ui.showNotice(msg, { ms: 4500 }); });
  // Anonymous crash and slow-frame reports, only for players who switched them on in Settings
  setDiagnosticsSink(function (report) {
    if (!storage.get('sendDiagnostics')) return;
    if (!leaderboardModule || !leaderboardModule.leaderboard.isAuthenticated()) return;
    leaderboardModule.leaderboard.reportDiagnostic(report);
  });
  installChunkRecovery(function () { ui._showToast("Part of the app did not load. Reload the page to update."); });
  ui.init();
  ui.onStudyPlanRun = startStudyPlanRun;
  ui.submitFeedback = function (fb) {
    var lb = leaderboardModule ? leaderboardModule.leaderboard : null;
    return lb ? lb.submitFeedback(fb) : Promise.resolve({ success: false });
  };

  // Home is a plain menu (no 3D scene), so there is only a notice to show when WebGL is missing
  if (!webglOk) showWebGLNotice();

  // Collapsibles
  setupCollapsibles();

  // Profile button (top right of Home): sign up, sign in, name and avatar
  profileCorner = mountProfileCorner({
    getLeaderboard: function () { return leaderboardModule ? leaderboardModule.leaderboard : null; },
    getCloudSync: function () { return cloudSync; },
    storage: storage,
    openProfileScreen: function () { ui.show('screenProfile'); var box = document.getElementById('profileAccountBox'); if (box) box.open = true; },
    onAuthChange: function () { if (document.getElementById('screenProfile').classList.contains('active')) fillProfileAccount(); }
  });

  // The how-to-play is played on the real track; the practice-track tutorial is the fallback where the runner cannot start
  ui.startRealTutorial = function (opts) {
    if (!webglOk || game.running || game.paused) return false;
    // (the card list can still be loading on the very first launch: the two ids are only looked up when a question is sent)
    var ids = TUTORIAL_CARD_IDS.slice();
    if (CARDS.length > 0) {
      var known = {};
      CARDS.forEach(function (c) { known[c.id] = true; });
      ids = ids.filter(function (id) { return known[id]; });
      for (var ci = 0; ci < CARDS.length && ids.length < 2; ci++) {
        if (ids.indexOf(CARDS[ci].id) < 0) ids.push(CARDS[ci].id);
      }
    }
    return startGameTutorial({
      game: game,
      ui: ui,
      cardIds: ids,
      onClose: opts && opts.onClose,
      begin: function (cardIds) { launchRun('study', cardIds, { tutorial: true, allowContinue: false }); }
    });
  };

  // First run: the interactive tutorial (skippable); finishing or skipping it ends the first run
  if (!storage.get('firstRunComplete')) {
    ui.showTutorial({ firstRun: true });
  }

  // --- Anki import (lazy) ---
  import('./ankiimport.js').then(function (mod) {
    ankiImportModule = mod;
    mountAnkiImport();
  }).catch(function (e) {
    reportError(e, { system: 'ankiimport', operation: 'load', recoverable: true });
  });

  // --- Leaderboard (lazy) ---
  if (!isKilled('onlineFeatures')) import('./leaderboard.js').then(function (mod) {
    leaderboardModule = mod;
    mod.leaderboard.init().then(function () {
      if (pendingDeepLink) { handleDeepLink(pendingDeepLink); pendingDeepLink = null; }
      startCloudSync(mod.leaderboard);
      mountLeaderboard();
      if (profileCorner && profileCorner.onLeaderboardReady) profileCorner.onLeaderboardReady();
      mod.leaderboard.subscribeToInvites(function () { checkMatchInvites(); });
      checkMatchInvites();
    }).catch(function (e) {
      reportError(e, { system: 'leaderboard', operation: 'init', recoverable: true });
    });
  }).catch(function (e) {
    reportError(e, { system: 'leaderboard', operation: 'load', recoverable: true });
  });

  // ==========================
  //  ENGINE EVENT ROUTING
  // ==========================

  game.onSpeedUp = function (dial) {
    ui.showNotice('⚡ Faster! Speed ' + dial + '×', { color: 'var(--accent-gold)', ms: 1800 });
  };

  game.onEncounterStart = function (card, gates, info) {
    ui.showBuzzwords(card);
    ui.showAnswerChoices(gates);
    // Read the question aloud (when switched on), planned to be finished before the answer locks
    audio.speakQuestion({
      clues: card.bw || [],
      answers: gates.map(function (g) { return g.label; }),
      secondsToLock: info && typeof info.secondsToLock === 'number' ? info.secondsToLock : 0
    });
  };

  game.onEncounterResolve = function (card, wasCorrect, choice) {
    if (!wasCorrect) combo.miss(); // a miss takes one layer off the music, not all of them
    audio.cancelSpeech(); // the question is over
    ui.showFeedback(card, wasCorrect, choice, game.mode === 'study' || !!game._tutorial);
    ui.flashScreen(wasCorrect);
    if (game.mode === 'study' && wasCorrect && !game._tutorial) {
      ui.showStudyTeaching(card);
    }
    // Route to audio (once): a musical chime for a right answer, a soft falling sigh for a wrong one
    audio.play(wasCorrect ? 'correct' : 'wrong');
    // (The runner's own voice is switched off for now, see FEATURES.characterVoices)
    if (FEATURES.characterVoices && storage.get('characterVoices') !== false && game.mode !== 'exam') {
      audio.playCharacter((storage.get('equipped') || {}).skin || 'avatar_intern', wasCorrect ? 'cheer' : 'sad');
    }
    // Route to multiplayer (once)
    sendMultiplayerEncounterResult(wasCorrect, card);
  };

  game.onRunEnd = function () {
    audio.cancelSpeech();
    ui.hideHud();
    ui.hideAnswerChoices();
    audio.stopAmbient();
    audio.setMusicTheme(MENU_THEME, 2.0); // back on the menus: the menu track, never the last map's

    // The tutorial is not a real run: nothing is saved or shown afterwards, and the player lands on Home
    if (game._tutorial) {
      game._tutorial = false;
      showBottomNav(true);
      if (homeCharacter) homeCharacter.startAnimation();
      ui.resetQuestionDisplay();
      ui.show('screenHome');
      return;
    }
    themeRoll.runs++;

    // Finalize run ONCE
    finalizeRun(game);

    // Multiplayer: send final score
    sendMultiplayerEndRun();

    // Restore home
    showBottomNav(true);
    if (homeCharacter) homeCharacter.startAnimation();

    ui.showPostRun(game);
    attachRewardCard();
    attachNextGoal();
    audio.setMusicIntensity(0.5, 0);
    attachShareImage();
    attachTipPrompt();
    attachReviewTip();
    if (game.mode === 'challenge') attachChallengeResult(game.score);
    if (game.mode === 'tournament') attachGauntletResult();

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

  game.onCoinCollected = function (info) {
    // the chime climbs with each coin in a run; only every third coin buzzes the phone
    audio.play('coin', { lane: info.lane, ratio: info.ratio, noHaptic: info.chain % 3 !== 0 });
    ui.showCoinPickup(info);
  };

  game.onNearMiss = function (info) {
    ui.showNotice('😮 Close call! +' + info.coins + ' 🪙', { color: 'var(--accent-gold, #ffcc22)', ms: 1100 });
    audio.play('coin', { ratio: 2 });
    audio.haptic('fusion');
  };

  game.onScorePopup = function (points) {
    ui.showScorePopup(points);
    ui.showCoinBurst();
  };

  game.onStreakMilestone = function (streak, multiplier) {
    audio.play('streak');
    audio.haptic('streak', streak); // a bigger streak buzzes bigger
    ui.showStreakMilestone(streak, multiplier);
  };

  game.onSecretFound = function (found) {
    ui.showNotice('🔎 You found ' + found.name + '! +' + found.coins + ' 🪙' + (found.first ? ' (first time here!)' : ''), { color: 'var(--accent-gold, #ffcc22)', ms: 2600 });
    audio.play('achievement');
    audio.haptic('fusion');
  };

  game.onPowerupFused = function (fusion) {
    ui.showNotice(fusion.label + ' ' + fusion.detail, { color: 'var(--accent-gold, #ffcc22)', ms: 2600 });
    audio.play('achievement');
    audio.haptic('fusion');
  };

  game.onPowerupCollected = function (type) {
    ui.showPowerupNotification(type);
    if (type === 'autoPilot') ui.showAutoPilotHint();
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

  // The map's name is not announced when a run starts; only map changes are.
  // Sound effects requested by the engine (monster lunge, impacts, death styles)
  game.onSfx = function (name) {
    if (name === 'pause') audio.cancelSpeech(); // a question being read stops with the pause
    audio.play(name);
  };

  game.onSkinSelected = function (skinName) {
    audio.startAmbient(skinName);
    audio.setMusicTheme(skinName, 1.5); // the run plays its own map's track (nothing happens if it already is)
  };

  if (game.onMapTransition !== undefined) {
    game.onMapTransition = function (newSkinName) {
      audio.setMusicTheme(newSkinName, 3.0);
      audio.play('map_transition');
      ui.showTrackName('Now entering ' + newSkinName);
    };
  }

  if (game.onPlayerFaceplant !== undefined) {
    game.onPlayerFaceplant = function () {
      audio.play('faceplant');
    };
  }

  // Exam monster: warn when it closes in, and play the "consumed" sting when
  // it catches the player (the engine ends the run with the faceplant).
  game.onMonsterWarning = function () {
    // A sound is enough: no on-screen text every time the monster gets close
    audio.play('monster_close');
  };
  game.onHazard = function (info) {
    showMultiplayerMessage('\u26A0 ' + info.label, 'var(--accent-gold)');
  };
  game.onMonsterCaught = function () {
    audio.play('monster_consume');
  };

  ui.onEquipChange = function () {
    if (webglOk) game.buildPlayer();
    if (homeCharacter) homeCharacter.rebuildCharacter();
  };

  ui.onNightModeChange = function () {
    if (webglOk) game.updateNightMode();
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
  document.querySelectorAll('.mode-btn[data-mode], .sheet-entry[data-mode]').forEach(function (btn) {
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

  // Cohorts: built and tested, but hidden until the build turns the feature on
  if (FEATURES.cohorts) {
    var cohortsBtn = document.getElementById('cohortsBtn');
    if (cohortsBtn) {
      cohortsBtn.hidden = false;
      cohortsBtn.addEventListener('click', function () {
        ui.show('screenCohorts');
        import('./cohortsui.js').then(function (m) { m.mountCohorts(document.getElementById('cohortsRoot')); }).catch(function (e) {
          reportError(e, { system: 'cohorts', operation: 'load', recoverable: true });
          ui._showToast('Could not open Cohorts. Check your connection and try again.', 2200);
        });
      });
    }
  }

  // The league chip on Home opens the multiplayer panel; it also celebrates ranked wins and promotions
  var homeLeague = document.getElementById('homeLeague');
  if (homeLeague) {
    refreshHomeBadge(homeLeague);
    setTimeout(function () { refreshHomeBadge(homeLeague); }, 4000);
    homeLeague.addEventListener('click', function () {
      var open = document.getElementById('multiplayerBtn');
      if (open) open.click();
    });
  }
  renderLevelChip(document.getElementById('homeLevel'));
  updateLockerDot();
  document.addEventListener('dx:coins-changed', updateLockerDot);
  // another tab saved: show its numbers (coins, level) if Home is up
  document.addEventListener('dx:data-refreshed', function () {
    var home = document.getElementById('screenHome');
    if (home && home.classList.contains('active') && !game.running) { ui.renderHome(); document.dispatchEvent(new CustomEvent('dx:coins-changed')); }
  });
  // Red dots: new badges, quest rewards and the weekly reward waiting to be claimed
  updateAttentionDots(storage, storage.getDailyQuests());
  document.addEventListener('dx:attention-changed', function () { updateAttentionDots(storage, storage.getDailyQuests()); });
  // A light tick under the thumb for the big Home buttons
  document.addEventListener('pointerdown', function (e) {
    if (e.target && e.target.closest && e.target.closest('.btn-play, .mode-btn, .side-btn')) audio.haptic('tap');
  }, true);
  // One-page screens grow to use a bigger screen (Stats, Quests, Profile, the folded Locker)
  mountFitScreens();
  // A red "new" dot goes away for good the first time the player opens that menu, tab or button
  document.addEventListener('click', function (e) {
    var id = discoveryIdFor(e.target);
    if (id && markExplored(storage, id)) document.dispatchEvent(new CustomEvent('dx:attention-changed'));
  }, true);
  document.addEventListener('dx:celebrate', function () { ui.showConfetti(true); });
  document.addEventListener('dx:ranked-updated', function (e) {
    refreshHomeBadge(homeLeague);
    updateLockerDot();
    if (e.detail && (e.detail.promoted || (e.detail.outcome === 'win' && e.detail.settled))) {
      ui.showConfetti(true);
      audio.play('achievement');
    }
  });

  // Multiplayer
  var mpBtn = document.getElementById('multiplayerBtn');
  if (mpBtn) {
    mpBtn.addEventListener('click', async function () {
      var overlay = document.getElementById('multiplayerOverlay');
      var content = document.getElementById('mpContent');
      if (!overlay || !content) return;
      overlay.classList.add('active');
      var rankedOn = ranked.isAvailable();
      content.innerHTML =
        (rankedOn ? '<div class="rk-card" id="rkCard"></div>' +
          '<button class="btn btn-primary btn-block" id="mpRankedBtn" type="button">⚔️ Find Ranked Match</button>' +
          '<button class="btn btn-outline btn-block" id="mpTopBtn" type="button" style="margin-top:6px">🏆 Top Players</button>' +
          '<div id="rkTop" class="rk-top-list" hidden></div>' +
          '<div style="text-align:center;margin:8px 0;color:var(--text-muted)">— or play a friend —</div>' : '') +
        '<button class="btn btn-green btn-block" id="mpHostBtn">\uD83C\uDFAE Host Game</button>' +
        '<div style="text-align:center;margin:8px 0;color:var(--text-muted)">\u2014 or \u2014</div>' +
        '<input type="text" id="mpJoinCode" maxlength="5" placeholder="ROOM CODE" aria-label="Room code" style="width:100%;padding:10px;border-radius:12px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3);font-size:18px;text-align:center;letter-spacing:4px;margin-bottom:8px;text-transform:uppercase">' +
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
            '<div class="mp-room-code"></div>' +
            '<div class="mp-status">Share this code with a friend.</div>';
          content.querySelector('.mp-room-code').textContent = code;
        });
      });

      document.getElementById('mpJoinBtn').addEventListener('click', function () {
        var input = document.getElementById('mpJoinCode');
        var code = input.value.trim().toUpperCase();
        if (code.length !== 5) { ui._showToast('Enter a five-character room code.', 2200); return; }
        configureMultiplayer(module.multiplayer, content);
        content.textContent = '';
        var connecting = document.createElement('div');
        connecting.className = 'mp-status';
        connecting.textContent = 'Connecting to ' + code + '...';
        content.appendChild(connecting);
        module.multiplayer.joinGame(code);
      });

      if (rankedOn) {
        mountLeagueCard(document.getElementById('rkCard'));
        document.getElementById('mpRankedBtn').addEventListener('click', function () {
          loadCards().then(function () {
            startRankedSearch({
              client: module.multiplayer,
              configure: configureMultiplayer,
              cardPoolHash: function () { return module.hashCardPool(CARDS); },
              startMatch: scheduleVersusStart,
              onBack: function (message) {
                mpBtn.click();
                if (message) showMultiplayerMessage(message, 'var(--accent-gold)');
              }
            }, content);
          });
        });
        document.getElementById('mpTopBtn').addEventListener('click', function () {
          var list = document.getElementById('rkTop');
          list.hidden = !list.hidden;
          if (!list.hidden) mountTopPlayers(list);
        });
      }
    });
  }

  var mpCloseBtn = document.getElementById('mpCloseBtn');
  if (mpCloseBtn) {
    mpCloseBtn.addEventListener('click', function () {
      if (isSearching() && multiplayerClient) cancelRanked(multiplayerClient, {});
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
    if (isMultiplayerActive() && multiplayerMatchStarted) {
      multiplayerClient.sendForfeit('Player ended the run');
      game.requestEnd('local_forfeit');
    } else {
      game.endRun();
    }
  });

  // ==========================
  //  MUSIC AUTO-START
  // ==========================
  document.addEventListener('click', function startMusicOnce() {
    if (storage.get('musicOn')) {
      combo.reset();
      audio.startMusic();
    }
    document.removeEventListener('click', startMusicOnce);
  }, { once: true });

  // A soft tap sound and a light haptic on buttons and tabs (not the in-run answer gates)
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('button, .nav-item, .subject-chip, [role="tab"], [role="switch"]') : null;
    if (!el || el.disabled) return;
    audio.play('ui_tap');
  }, true);

  // Keep the home character framed in its gap when the window changes shape
  window.addEventListener('resize', function () {
    if (homeCharacter) homeCharacter.resize(window.innerWidth, window.innerHeight);
  });

  // Inside the store apps: back button, pause when backgrounded, email deep links
  initNative({
    onBack: handleNativeBack,
    onBackground: function () {
      if (game.running && !game.paused) game.togglePause();
      audio.pause('background'); // leaving the app: the music stops with it
    },
    onForeground: function () { audio.resume('foreground'); },
    onDeepLink: handleDeepLink
  });

  // ==========================
  //  VISIBILITY PAUSE  [2] §19.2
  // ==========================
  document.addEventListener('visibilitychange', function () {
    lastFrameMs = 0;
    if (document.visibilityState === 'hidden') {
      if (game.running && !game.paused) {
        game.togglePause();
      }
      // Leaving the tab or the app: nothing may keep playing (music, ambient, a question being read)
      audio.pause('hidden');
    } else if (document.visibilityState === 'visible') {
      audio.resume('visible');
    }
  });
  // Closing the page or sending it to the back (iOS fires this instead of visibilitychange): same
  window.addEventListener('pagehide', function () { audio.pause('pagehide'); });
  window.addEventListener('pageshow', function () { if (document.visibilityState === 'visible') audio.resume('pageshow'); });

  // ==========================
  //  PREVENT PULL-TO-REFRESH
  // ==========================
  document.addEventListener('touchmove', function (e) {
    if (game.running) e.preventDefault();
  }, { passive: false });

  // Challenge links and the Challenge button
  handleChallengeLink();
  var tournamentBtn = document.getElementById('tournamentBtn');
  if (tournamentBtn) tournamentBtn.addEventListener('click', startTournament);
  var challengeBtn = document.getElementById('challengeBtn');
  if (challengeBtn) challengeBtn.addEventListener('click', startNewChallenge);

  // ==========================
  //  MAIN RENDER LOOP  [2] §2.2 — the ONLY animation loop
  // ==========================
  // main.js owns the single renderer.setAnimationLoop(). The engine and the
  // home scene expose update()/render() and never schedule frames themselves.
  // The game scene draws while a run exists (including pause and the continue
  // prompt); otherwise the home character scene draws. The Locker preview
  // keeps its own renderer per §24.2.
  var lastFrameMs = 0;
  var lastMusicMs = 0;
  var combo = new ComboTracker();
  var GAME_SCENE_STATES = ['preparing', 'countdown', 'playing', 'paused', 'dying', 'continue_prompt', 'finishing'];
  // A run is capped at 30 fps by default (Settings can switch it to 60): a runner this size
  // does not need more, and half the frames means a cooler, steadier game.
  var batterySaver = !!storage.get('batterySaver');
  game.targetFrameMs = batterySaver ? 1000 / 30 : 1000 / 60;
  setInterval(function () {
    batterySaver = !!storage.get('batterySaver');
    game.targetFrameMs = batterySaver ? 1000 / 30 : 1000 / 60;
  }, 1000);
  var canvasShown = null;
  var SAVER_FRAME_MS = 1000 / 30 - 2;
  if (webglOk && game.renderer) game.renderer.setAnimationLoop(function (nowMs) {
    var inGame = GAME_SCENE_STATES.indexOf(game._state) >= 0;
    // The 3D canvas is only used during a run; every other screen is plain HTML
    if (inGame !== canvasShown) {
      canvasShown = inGame;
      document.body.classList.toggle('in-game', inGame);
    }
    if (!inGame) return;
    var capMs = batterySaver ? SAVER_FRAME_MS : 0;
    if (capMs && lastFrameMs && nowMs - lastFrameMs < capMs) return;
    // After a long gap (over half a second: the tab was in the background, or the canvas was hidden) take one normal step instead of a
    // big one, so scenery and particles never leap forward on the first frame back
    // (a merely slow frame still gets up to 0.1 s so the game does not crawl on a weak phone)
    var gap = lastFrameMs ? (nowMs - lastFrameMs) / 1000 : 0;
    var dt = gap > 0.5 || !gap ? 0.016 : Math.min(gap, 0.1);
    lastFrameMs = nowMs;
    if (game._state === 'playing' && nowMs - lastMusicMs > 250) {
      // Adaptive music: layers build with the streak, tension rises with the monster
      lastMusicMs = nowMs;
      var danger = 1 - Math.min(1, Math.max(0, (game.monsterZ - 3) / 13));
      audio.setMusicMood(musicMood({ tier: combo.update(game.streak), speedRatio: game.baseSpeed ? game.speed / game.baseSpeed : 1, lives: game.lives, ducked: audio.isMusicDucked(), danger: danger }));
    }
    game.update(dt, nowMs);
    game.render();
  });

  // A glTF avatar finished downloading: swap the stand-in for the real model.
  window.addEventListener('buzzword:model-ready', function () {
    if (webglOk && !game.running) game.buildPlayer();
    if (homeCharacter) homeCharacter.rebuildCharacter();
    if (ui.characterPreview) ui.characterPreview.rebuildCharacter();
    if (webglOk && game.refreshMonster) game.refreshMonster();
  });

  // Keep the server's weekly study total (group goals) up to date
  setInterval(syncWeeklyStudy, 60000);
  setTimeout(syncWeeklyStudy, 8000);

  // Daily study reminder (fires while the app is open or installed)
  setInterval(checkStudyReminder, 60000);
  document.addEventListener('dx:reminders-changed', checkStudyReminder);
  setTimeout(checkStudyReminder, 3000);

  // Start home character animation
  if (homeCharacter) homeCharacter.startAnimation();

  // ==========================
  //  PERIODIC INVITE CHECKING (realtime covers most; this is the fallback)
  // ==========================
  setInterval(checkMatchInvites, 15000);
}

function checkStudyReminder() {
  // Inside the app the phone itself holds the next reminder (it also arrives when the app is closed)
  if (isNative()) {
    var buddy = currentPal();
    syncNativeReminder({ enabled: !!storage.get('reminders'), hour: storage.get('reminderHour') || 19, goalMetToday: storage.getStudiedToday() >= (storage.get('dailyGoal') || 20), body: buddy ? palReminder(buddy, storage.getStreakStatus().streak) : undefined });
    return;
  }
  if (!storage.get('reminders') || !('Notification' in window) || Notification.permission !== 'granted') return;
  var today = storage.getTodayKey();
  if (storage.get('lastReminderDate') === today) return;
  if (new Date().getHours() < (storage.get('reminderHour') || 19)) return;
  if (storage.getStudiedToday() >= (storage.get('dailyGoal') || 20)) return;
  storage.set('lastReminderDate', today);
  var remaining = (storage.get('dailyGoal') || 20) - storage.getStudiedToday();
  var options = {
    body: remaining + ' more card' + (remaining === 1 ? '' : 's') + ' to hit today\u2019s goal.',
    icon: 'icon.svg',
    tag: 'daily-reminder'
  };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(function (reg) { reg.showNotification('Dx Dash', options); })
      .catch(function () { new Notification('Dx Dash', options); });
  } else {
    new Notification('Dx Dash', options);
  }
}

var _invitePromptOpen = false;

function checkMatchInvites() {
  if (_invitePromptOpen || game.running) return;
  if (!leaderboardModule || !leaderboardModule.leaderboard.isAuthenticated()) return;
  var lb = leaderboardModule.leaderboard;
  lb.getInvites().then(function (invites) {
    if (!invites || invites.length === 0 || _invitePromptOpen || game.running) return;
    var invite = invites[0];
    _invitePromptOpen = true;
    var accept = confirm('Match invite! Room code: ' + invite.room_code + '\n\nJoin now?');
    var done = accept ? lb.acceptInvite(invite.id) : lb.declineInvite(invite.id);
    done.then(function () {
      _invitePromptOpen = false;
      if (!accept) return;
      var mpBtnEl = document.getElementById('multiplayerBtn');
      if (mpBtnEl) mpBtnEl.click();
      var attempts = 0;
      var timer = setInterval(function () {
        var joinInput = document.getElementById('mpJoinCode');
        var joinBtn = document.getElementById('mpJoinBtn');
        if (joinInput && joinBtn) {
          clearInterval(timer);
          joinInput.value = invite.room_code;
          joinBtn.click();
        } else if (++attempts > 30) {
          clearInterval(timer);
        }
      }, 200);
    });
  }).catch(function () {
    _invitePromptOpen = false;
  });
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
  if (!isMultiplayerActive() && !multiplayerMatchStarted) return;
  var summary = game._runSummary || {};
  var eliminated = summary.endReason === 'sudden_death_elimination';
  var forfeit = summary.endReason === 'local_forfeit';
  var raceTime = summary.durationMs || (runStartTime ? Date.now() - runStartTime : 0);

  multiplayerLocalResult = {
    mode: game.mode,
    score: game.score,
    correct: game.correct,
    eliminated: eliminated,
    forfeit: forfeit,
    raceTime: raceTime
  };

  if (multiplayerClient && multiplayerClient.isConnected()) {
    if (game.mode === 'mp_race' && multiplayerModeConfig.targetCorrect &&
        game.correct >= multiplayerModeConfig.targetCorrect) {
      multiplayerClient.sendRaceFinished(game.correct, raceTime);
    }
    if (eliminated) multiplayerClient.sendEliminated('');
    multiplayerClient.sendRunFinished({
      score: game.score,
      correct: game.correct,
      wrong: game.wrong,
      bestStreak: game.bestStreak,
      coins: game.coins,
      correctCount: game.correct,
      eliminated: eliminated,
      raceTime: raceTime
    });
  }
  maybeShowMultiplayerResult();
}

// =========================================================================
//  SETTINGS EXTENSION MOUNT — Anki importer [2] §21.1
// =========================================================================
function mountAnkiImport() {
  if (!ankiImportModule || !ankiImportModule.ankiImport) return;
  var container = document.getElementById('ankiImportContainer');
  if (!container) return;
  ankiImportModule.ankiImport.mount(container, {
    customCards: customCards,
    storage: storage,
    toast: function (m) { ui._showToast(m); },
    reportError: reportError
  });
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
var cloudSync = null;
var profileCorner = null;

/**
 * Account sign-in state and cloud saves. Guests are never synced; once the
 * player has an email account their progress follows them across devices.
 */
var pendingDeepLink = null;

/** An email link (confirm address, reset password) reopened the app: finish signing in. */
function handleDeepLink(url) {
  if (!leaderboardModule) { pendingDeepLink = url; return; }
  leaderboardModule.leaderboard.handleAuthLink(url).then(function (res) {
    if (res.success) ui._showToast(res.type === 'recovery' ? 'Choose a new password.' : 'Email confirmed. You are signed in.');
    else if (res.error && res.error !== 'Not an account link') ui._showToast(res.error);
  });
}

/** Android back button: close things in order, and only leave the app from the home screen. */
function handleNativeBack() {
  // Whatever is on top goes first: the ranked result card, then pop-ups, then the screen underneath
  var result = document.getElementById('rankedResult');
  if (result) { result.remove(); return true; }
  if (document.getElementById('dailyReward')) return true; // claim the reward first
  if (isGameTutorialOpen()) { requestCloseGameTutorial(); return true; }
  if (isTutorialOpen()) { requestCloseTutorial(); return true; }
  var popups = ['reviewOverlay', 'quickReviewOverlay', 'multiplayerOverlay', 'challengeSheet', 'flashcardsSheet', 'filtersSheet', 'speedSheet', 'todaySheet'];
  for (var pi = 0; pi < popups.length; pi++) {
    var pop = document.getElementById(popups[pi]);
    if (pop && pop.classList.contains('active')) {
      if (popups[pi] === 'multiplayerOverlay') {
        var closeMp = document.getElementById('mpCloseBtn');
        if (closeMp) closeMp.click();
      } else {
        pop.classList.remove('active');
      }
      return true;
    }
  }
  if (game.running || game.paused) {
    game.togglePause();
    return true;
  }
  return ui.goBack(); // false on Home: the app may close
}

function startCloudSync(lbService) {
  Promise.all([import('./cloudsync.js'), import('./accountui.js')]).then(function (mods) {
    cloudSync = new mods[0].CloudSync({
      storage: storage,
      customCards: customCards,
      leaderboard: lbService,
      toast: function (msg) { ui._showToast(msg); },
      askConflict: mods[1].askWhichSave,
      onPulled: function () {
        ui._showToast('Loaded your saved progress.');
        setTimeout(function () { window.location.reload(); }, 600);
      }
    });
    cloudSync.start();
    mountLeaderboard();
    lbService.onAuthEvent(function (event) {
      if (event === 'PASSWORD_RECOVERY') {
        mods[1].beginPasswordRecovery();
        ui.show('screenLeaderboard');
        import('./leaderboardui.js').then(function (m) { m.openAccountTab(); });
      } else if (event === 'USER_UPDATED') {
        ui._showToast('Account updated.');
      }
    });
  }).catch(function (e) {
    reportError(e, { system: 'cloudsync', operation: 'start', recoverable: true });
  });
}

function mountLeaderboard() {
  if (!leaderboardModule) return;
  var lbContent = document.getElementById('leaderboardContent');
  if (!lbContent) return;
  import('./leaderboardui.js').then(function (uiMod) {
    uiMod.mountLeaderboardScreen(lbContent, {
      leaderboard: leaderboardModule.leaderboard,
      storage: storage,
      toast: function (msg) { ui._showToast(msg); },
      cloudSync: cloudSync,
      startChallenge: function () { startNewChallenge(); },
      getRoomCode: function () {
        return (multiplayerClient && multiplayerClient.isHost && multiplayerClient.roomCode) || '';
      }
    });
  }).catch(function (e) {
    reportError(e, { system: 'leaderboard', operation: 'mountUI', recoverable: true });
  });
}

// =========================================================================
//  START
// =========================================================================
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', function () { try { init(); } finally { hideBootSplash(); } });
} else {
  try { init(); } finally { hideBootSplash(); }
}

// Offline support (production builds only). The store apps bundle their files, so they do not
// need the service worker. This runs whatever the readyState: module scripts execute after the
// page is parsed, so registering inside the 'loading' branch would never happen.
if (import.meta.env && import.meta.env.PROD && 'serviceWorker' in navigator && !isNative()) {
  var registerSW = function () {
    registerServiceWorker(navigator.serviceWorker, function () {
      showUserError('A new version of Dx Dash is ready.', {
        title: 'Update available',
        info: true,
        actionLabel: 'Reload',
        onAction: function () { window.location.reload(); },
        durationMs: 15000
      });
    }).catch(function (e) {
      console.warn('[Dx Dash] Service worker registration failed:', e.message);
    });
  };
  if (document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW);
}
