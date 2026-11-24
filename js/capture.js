/**
 * capture.js: the screenshot mode used to make social posts from the REAL game.
 *
 * Never shipped: it exists only in a build made with VITE_FEATURE_CAPTURE=1 (js/features.js), and only does anything on a page
 * opened with ?capture=<card id>. A normal build does not even contain this file.
 *
 *   /?capture=pe024&map=Neural%20Highway&lane=2&clues=0,1,2,3,4
 *
 *   capture   the card id (required)
 *   map       a map name or id (js/game/skins.js); every map is treated as owned
 *   hero      a hero id (js/game/shopdata.js); treated as owned
 *   lane      0, 1 or 2: the lane the correct answer is in (default 2)
 *   clues     the order to reveal the clues in, as 0-based positions in the card's clue list (default: the card's own order).
 *             A shorter list reveals only those clues.
 *   theme     the page colors: classic (default), winter, spring, summer, autumn, ocean, forest, ember, amber, rose
 *   score, coins, streak   the numbers on the top bar (default 0, 0, 0), so every state of a post set matches
 *   state     the state to open on (default "clue-1")
 *
 * The page exposes window.__capture (see docs/CAPTURE.md): states, goto(name), next(), prev(), ready.
 * Use a fresh browser context, a 540x675 viewport and deviceScaleFactor 2 to get 1080x1350 images.
 */

import { spawnGates, updateGateHighlights } from './game/gates.js';
import { removeAndDispose, LANE_X } from './game/enginedefs.js';
import { spawnObstacle, spawnCoinsForObstacle, spawnCoinBatch } from './game/obstacles.js';
import { flashGateResult } from './game/gates.js';
import { setText } from './dom.js';

var GATES_FAR = -70;      // where they stand before the choices (small, down the track)
var GATES_NEAR = -8;      // where the gates stand in the choices state (close enough to read the answers)
var GATES_PASSING = 0.3;  // where they stand while the runner is going through

var STYLE = [
  // everything that is not the game: pop-ups, nav, dev and account chrome
  '#dailyReward, #tutorialOverlay, #bottomNav, #noticeDock, #pauseBtn, #dashBtn, #autoBtn, #sideRun, #sideKeys, #opponentHud,',
  '#countdownOverlay, #feedbackToast, .toast, .notice-chip, .update-banner, #updateBanner, .new-dot, #powerupRow, #rushEl,',
  '.lesson-dot, .install-banner, #revengeCardBanner { display: none !important; }',
  'body.capture-hide-answers #answerRow { visibility: hidden !important; }',
  '#captureLabels { position: fixed; inset: 0; pointer-events: none; z-index: 40; }',
  '#captureLabels .cap-gate { position: absolute; transform: translate(-50%, -100%); width: 31%; text-align: center; font: 800 19px/1.15 system-ui, sans-serif;',
  '  color: #fff; padding: 8px 6px; border-radius: 14px; border: 3px solid #fff; box-shadow: 0 4px 0 rgba(0,0,0,.35); text-shadow: 0 2px 0 rgba(0,0,0,.35); }',
  '#captureLabels .cap-gate small { display: block; font-size: 11px; letter-spacing: .08em; opacity: .9; margin-bottom: 2px; }',
  '#captureLabels .cap-count { position: absolute; left: 50%; transform: translateX(-50%); font: 800 20px/1 system-ui, sans-serif; color: #fff;',
  '  background: rgba(20, 10, 50, .82); padding: 9px 18px; border-radius: 999px; border: 3px solid #ffd54a; white-space: nowrap; }'
].join('\n');

function param(name) {
  var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return m ? decodeURIComponent(m[1]) : '';
}

function intParam(name) { return Math.max(0, parseInt(param(name) || '0', 10) || 0); }

/** Run before the game finishes starting up: no first-run tutorial, no pop-ups. */
export function prepareCapture(storage) {
  storage.data.firstRunComplete = true;
  var s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
  document.documentElement.setAttribute('data-capture', '1');
}

function settle(ms) {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(resolve, ms || 120); }); });
  });
}

/**
 * @param {{game: any, ui: any, storage: any, launchRun: Function, cardById: Map<string, any>}} deps
 */
export function startCapture(deps) {
  var game = deps.game, ui = deps.ui, storage = deps.storage;
  var card = deps.cardById.get(param('capture'));
  if (!card) { window.__capture = { ready: false, error: 'unknown card id: ' + param('capture') }; return; }

  // fixed page colors (the default look changes by season, time of day and after every run)
  storage.data.settings.uiTheme = param('theme') || 'classic';
  document.dispatchEvent(new CustomEvent('dx:theme-changed'));
  // every map and hero is available to the capture
  storage.ownsItem = function () { return true; };
  var map = param('map');
  if (map) storage.data.settings.preferredMap = map;
  var hero = param('hero');
  if (hero) { var eq = storage.data.progression.equipped || (storage.data.progression.equipped = {}); eq.skin = hero; }

  var lane = Math.min(2, Math.max(0, parseInt(param('lane') || '2', 10) || 0));
  var order = (param('clues') || '').split(',').filter(function (x) { return x !== ''; }).map(function (x) { return parseInt(x, 10); })
    .filter(function (i) { return i >= 0 && i < card.bw.length; });
  if (!order.length) order = card.bw.map(function (_, i) { return i; });
  var clues = order.map(function (i) { return card.bw[i]; });

  var names = [];
  clues.forEach(function (_, i) { names.push('clue-' + (i + 1)); });
  names.push('choices', 'correct');

  var api = {
    ready: false,
    card: { id: card.id, answer: card.ans, clues: clues, distractors: card.d.slice(0, 2), teaching: card.tp },
    states: names,
    current: '',
    goto: null, next: null, prev: null
  };
  window.__capture = api;

  function placeGates(z) {
    game.gateMeshes.forEach(function (m) { m.visible = true; });
    for (var i = 0; i < game.gateMeshes.length; i++) game.gateMeshes[i].position.z = z;
    game.gateZ = z;
  }

  function buildGates() {
    // the correct answer in the chosen lane, the distractors in the card's own order
    var ds = card.d.slice();
    game.gates = [];
    for (var i = 0; i < 3; i++) game.gates.push(i === lane ? { label: card.ans, correct: true } : { label: ds.shift() || 'N/A', correct: false });
    for (var g = 0; g < game.gateMeshes.length; g++) removeAndDispose(game.scene, game.gateMeshes[g]);
    game.gateMeshes = spawnGates(game.scene, game.gates, game.currentLane, { glow: game.currentSkin.colors.gateGlow, gate: game.currentSkin.colors.gateBase }, card.subj);
  }

  function setLane(l) {
    game.currentLane = l; game.targetLane = l;
    game.playerGroup.position.x = LANE_X[l];
    if (game.playerShadow) game.playerShadow.position.x = LANE_X[l];
  }

  // The three answers, big and clear, each over its own gate, and how many clues the viewer has had
  function drawChoiceLabels(clueCount) {
    game.camera.updateMatrixWorld();
    var box = document.createElement('div');
    box.id = 'captureLabels';
    var W = window.innerWidth, H = window.innerHeight;
    var buzzRect = document.getElementById('buzzBox').getBoundingClientRect();
    var tops = [];
    [0, 1, 2].forEach(function (i) {
      var v = new game.camera.position.constructor(LANE_X[i], 3.4, GATES_NEAR); // just above the gate's top bar
      v.project(game.camera);
      var x = [0.175, 0.5, 0.825][i] * W, y = (-v.y * 0.5 + 0.5) * H; // (a third of the width each: the three lanes are close together on screen)
      var chip = document.createElement('div');
      chip.className = 'cap-gate';
      var tag = document.createElement('small'); tag.textContent = ['LEFT', 'CENTER', 'RIGHT'][i];
      chip.appendChild(tag);
      chip.appendChild(document.createTextNode(game.gates[i].label));
      var ans = document.getElementById('ans' + i);
      chip.style.background = ans ? getComputedStyle(ans).backgroundColor : '#5b4bd6';
      chip.style.left = x + 'px'; chip.style.top = y + 'px';
      tops.push(y);
      box.appendChild(chip);
    });
    var count = document.createElement('div');
    count.className = 'cap-count';
    count.textContent = clueCount + (clueCount === 1 ? ' clue' : ' clues') + ' in \u2014 which gate?';
    count.style.top = Math.round(buzzRect.bottom + 10) + 'px';
    box.appendChild(count);
    document.body.appendChild(box);
  }

  // A run in progress: obstacles and coins on the track, placed the same way every time for the same card and map
  function dress() {
    var seed = 2166136261;
    var key = card.id + '|' + (game.currentSkin ? game.currentSkin.name : '');
    for (var k = 0; k < key.length; k++) { seed ^= key.charCodeAt(k); seed = Math.imul(seed, 16777619); }
    var realRandom = Math.random;
    Math.random = function () { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try {
      game.obstacleMeshes.slice().forEach(function (m) { removeAndDispose(game.scene, m); });
      game.obstacleMeshes.length = 0;
      game.coinMeshes.slice().forEach(function (m) { removeAndDispose(game.scene, m); });
      game.coinMeshes.length = 0;
      [-12, -22, -34, -48].forEach(function (z) {
        var made = spawnObstacle(game.scene, game.obstacleMeshes, null, { spawnZ: z });
        if (made) spawnCoinsForObstacle(game.scene, game.coinMeshes, made, z, 1);
      });
      [-4, -18, -30, -44].forEach(function (z) { spawnCoinBatch(game.scene, game.coinMeshes, z, 1); });
    } finally { Math.random = realRandom; }
  }

  function clearFeedback() {
    var fb = document.getElementById('feedbackEl'); if (fb) { fb.className = ''; setText(fb, ''); }
    var tb = document.getElementById('teachEl'); if (tb) { tb.classList.remove('show'); setText(tb, ''); }
  }

  function render(name) {
    clearFeedback();
    // the top bar shows fixed numbers, whatever the run had counted up to the moment it was frozen (set first: updateHud also hides the feedback)
    game.score = intParam('score'); game.coins = intParam('coins'); game.streak = intParam('streak');
    ui.updateHud(game);
    var buzz = document.getElementById('buzzText');
    document.body.classList.toggle('capture-hide-answers', name !== 'choices' && name !== 'correct');
    var labels = document.getElementById('captureLabels');
    if (labels) labels.remove();
    if (/^clue-\d+$/.test(name)) {
      var n = parseInt(name.slice(5), 10);
      setText(buzz, clues.slice(0, n).join(' • '));
      placeGates(GATES_FAR); setLane(1);
    } else if (name === 'choices') {
      setText(buzz, clues.join(' • '));
      ui.showAnswerChoices(game.gates);
      document.body.classList.add('capture-hide-answers'); // (the big labels below replace the small lane chips)
      placeGates(GATES_NEAR); setLane(1);
      updateGateHighlights(game.gateMeshes, -1); // no gate lit up: nothing hints at the answer
    } else if (name === 'correct') {
      setText(buzz, clues.join(' • '));
      setLane(lane);
      placeGates(GATES_PASSING); // the runner is going through the correct gate
      flashGateResult(game.gateMeshes, game.gates, lane);
      ui.showFeedback(card, true, lane, false);
      ui.showStudyTeaching(card);
      ui.hideAnswerChoices();
      document.body.classList.add('capture-hide-answers');
    }
    if (name === 'choices') [0, 1, 2].forEach(function (i) { document.getElementById('ans' + i).classList.remove('active'); });
    ui.fitQuestionHud();
    if (name === 'choices') drawChoiceLabels(clues.length);
    api.current = name;
    document.body.setAttribute('data-capture-state', name);
    return settle(700);
  }

  api.goto = function (which) {
    var name = typeof which === 'number' ? names[which] : which;
    if (names.indexOf(name) < 0) return Promise.reject(new Error('unknown state: ' + which));
    return render(name).then(function () { return name; });
  };
  api.next = function () { var i = names.indexOf(api.current); return api.goto(Math.min(names.length - 1, i + 1)); };
  api.prev = function () { var i = names.indexOf(api.current); return api.goto(Math.max(0, i - 1)); };

  // start a Study run on just this card, then freeze the world the moment its first question is in place
  deps.launchRun('study', [card.id], { planCardIds: [card.id], allowContinue: false });
  var waited = 0;
  var poll = setInterval(function () {
    waited += 100;
    if (game.card && game.card.id === card.id && game.gatesActive && game.gateMeshes && game.gateMeshes.length === 3) {
      clearInterval(poll);
      game.update = function () {}; // nothing moves from here on; main.js keeps rendering the scene each frame
      game._adaptResolution = function () {}; // and the picture quality stays put
      // (no run summary, nothing saved: the run is never finished)
      var hud = document.getElementById('hud'); if (hud) hud.classList.remove('off');
      // the camera in its resting place (a run's opening fly-in would otherwise leave it wherever it was when frozen)
      if (game.cameraBasePos) { game.camera.position.copy(game.cameraBasePos); game.camera.fov = game.baseFOV; game.camera.updateProjectionMatrix(); game.camera.lookAt(0, 1, -20); }
      buildGates();
      dress();
      render(param('state') || 'clue-1').then(function () { api.ready = true; document.documentElement.setAttribute('data-capture-ready', '1'); });
    } else if (waited > 30000) {
      clearInterval(poll);
      api.error = 'the question never appeared';
    }
  }, 100);
}
