/**
 * tutorial.js — the interactive how-to-play.
 *
 * One tutorial for every entry point: the first run, Settings → How to play, and the Home screen's
 * How to Play button. The player practices each move in a small practice track (swipe left, swipe
 * right, jump, slide, rush, then pick the right lane for a sample question) and the tutorial only
 * moves on when the move is done. It uses the same input module as the real game, so swipes, keys
 * and double-tap behave exactly as they will in a run. The × in the corner leaves (after a warning).
 *
 * It does not need WebGL, so it also works where the 3D runner cannot start.
 */

import { storage } from './storage.js';
import { createStepTracker } from './analytics/steptracker.js';
import { createElement, clearElement } from './dom.js';
import { setupInput } from './game/input.js';
import { getControlText } from './controlhints.js';
import { getKeyBindings, keysPhrase } from './keybindings.js';
import { getDashControl } from './dashcontrol.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';
import { confirmExitTutorial, isExitConfirmOpen, dismissExitConfirm } from './tutorialexit.js';

var MIN_LANE = 0;
var MAX_LANE = 2;
var CENTER_LANE = 1;
var DWELL_MS = 900;     // how long the runner must stay in a lane for the practice answer to lock
var ADVANCE_MS = 750;   // pause on the "Nice!" before the next step
var EFFECT_MS = 600;    // how long a jump / slide / rush animation shows

/** A sample question for the last practice step. The answer lane is never the middle one. */
var SAMPLE = {
  clue: 'Episodic headaches, sweating and palpitations with high blood pressure',
  answer: 'Pheochromocytoma',
  wrong: ['Hypothyroidism', 'Addison disease']
};

/** Things worth knowing, shown on the last page. */
export var REFERENCE = [
  { icon: '🏎️', title: 'Speed = points', text: 'Use the speed dial on Home. Faster speeds earn more points per correct answer.' },
  { icon: '🔥', title: 'Streak', text: 'Correct answers build your streak. Every 5 in a row raises your score multiplier, up to 8×.' },
  { icon: '❤️', title: 'Lives', text: 'You start with 3. Wrong answers and obstacles cost one. At 1 life, look for hearts on the track.' },
  { icon: '🪙', title: 'Coins and the Locker', text: 'Grab coins and power-up orbs, then spend coins in the Locker on characters, hats, trails and gear.' },
  { icon: '🎯', title: 'Game modes', text: 'Endless runs until you are out of lives. Study loses no lives and teaches after each question. Weakness drills the cards you miss. Daily is today\'s 15-card challenge. Versus races a friend live, or play ranked.' },
  { icon: '📝', title: 'Your own cards', text: 'Make cards in My Cards, import Anki decks, or study the same cards as flashcards.' },
  { icon: '🧠', title: 'Smart reviews', text: 'Cards come back just before you would forget them, scheduled with FSRS, the same algorithm Anki uses.' }
];

/**
 * The tutorial's steps, worded for this device (touch or keyboard).
 * @param {object} [controls] result of getControlText()
 */
export function buildSteps(controls, dashControl) {
  var c = controls || getControlText(undefined, dashControl);
  var t = c.touch;
  return [
    { id: 'welcome', kind: 'info', icon: 'Dx', title: 'Welcome to Dx Dash!',
      text: 'You will see medical buzzwords, then ' + c.intro + '. Let\'s practice each move. It takes a couple of minutes, and you can leave any time with the × in the corner.',
      button: 'Start practice' },
    { id: 'left', kind: 'action', action: 'moveLeft', title: 'Move left',
      prompt: t ? '👈 Swipe left' : '⬅ Press ' + keysPhrase('moveLeft'),
      text: 'Every lane holds a different diagnosis. Switch lanes to pick yours.' },
    { id: 'right', kind: 'action', action: 'moveRight', title: 'Move right',
      prompt: t ? 'Swipe right 👉' : 'Press ' + keysPhrase('moveRight') + ' ➡',
      text: 'Now the other way.' },
    { id: 'jump', kind: 'action', action: 'jump', obstacle: 'ground', title: 'Jump',
      prompt: t ? '👆 Swipe up' : '⬆ Press ' + keysPhrase('jump'),
      text: 'Jump over beds, crates and cones on the ground.' },
    { id: 'slide', kind: 'action', action: 'slide', obstacle: 'overhead', title: 'Slide',
      prompt: t ? '👇 Swipe down' : '⬇ Press ' + keysPhrase('slide'),
      text: 'Slide under hanging lights and signs.' },
    { id: 'answer', kind: 'answer', title: 'Pick the diagnosis',
      text: 'Read the clue, then ' + c.intro + '. Stay in a lane for a moment to lock it in.' },
    { id: 'rush', kind: 'action', action: 'rush', title: 'Rush', dashButton: t && dashControl === 'button',
      prompt: t ? (dashControl === 'button' ? '⚡ Tap the Dash button' : '👆👆 Double-tap') : 'Press ' + keysPhrase('rush'),
      text: 'Now that you can pick a lane: sure of the answer? Dash through the gate for bonus points. Obstacles cannot hurt you while you dash.' },
    { id: 'done', kind: 'info', icon: '🎉', title: 'You are ready!',
      text: 'A few last things to know. You can replay this any time from Settings → About → How to play, or the How to Play button on Home.',
      reference: true, button: 'Start playing' }
  ];
}

var _session = null;

/** True while the tutorial is open. */
export function isTutorialOpen() {
  return !!_session;
}

/** Close the tutorial right away, as skipped (no question asked). */
export function skipTutorial() {
  if (_session) _session.finish('skipped');
}

/** The player tried to close the tutorial (Escape, the Android back button): ask first. */
export function requestCloseTutorial() {
  if (!_session) return;
  if (isExitConfirmOpen()) { dismissExitConfirm(); return; }
  _session.requestClose();
}

/**
 * Open the tutorial.
 * @param {{onClose?: function({completed: boolean, skipped: boolean}): void}} [opts]
 */
export function startTutorial(opts) {
  opts = opts || {};
  var overlay = document.getElementById('tutorialOverlay');
  if (!overlay || _session) return;

  var steps = buildSteps(undefined, getDashControl()).filter(function (s) { return !(s.id === 'rush' && getControlText().touch && getDashControl() === 'off'); });
  var index = 0;
  var lane = CENTER_LANE;
  var locked = false;
  var timers = [];
  var dwellTimer = null;
  var arena = null;
  var runner = null;
  var feedback = null;
  var answerLane = Math.random() < 0.5 ? MIN_LANE : MAX_LANE;
  var closed = false;
  var st = createStepTracker('practice', { firstTime: !storage.get('firstRunComplete') });
  var exitAsked = false;

  function later(fn, ms) {
    var id = setTimeout(function () {
      timers = timers.filter(function (t) { return t !== id; });
      fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
    dwellTimer = null;
  }

  // ---- input: the same module the game uses -------------------------------------------------
  // Swipes and double-taps attach to the practice track only (never the buttons), and keys are
  // global, exactly as in a run.
  var disposeInput = null;
  var inputHandlers = {
    moveLeft: function () { act('moveLeft'); },
    moveRight: function () { act('moveRight'); },
    jump: function () { act('jump'); },
    slide: function () { act('slide'); },
    rush: function () { act('rush'); },
    pause: function () { requestClose(); }
  };

  function onEscape(e) {
    if (e.key === 'Escape' && !closed && !disposeInput && !isExitConfirmOpen()) requestClose(); // info pages (practice steps use the input module's pause)
  }
  document.addEventListener('keydown', onEscape);

  // Space activates a focused button on key-up; during the rush step it should only rush.
  function swallowSpace(e) {
    if (closed || e.key !== ' ' || !steps[index] || steps[index].action !== 'rush') return;
    e.preventDefault();
  }
  document.addEventListener('keydown', swallowSpace, true);
  document.addEventListener('keyup', swallowSpace, true);

  // ---- the practice track --------------------------------------------------------------------
  function setLane(next) {
    next = Math.max(MIN_LANE, Math.min(MAX_LANE, next));
    var changed = next !== lane;
    lane = next;
    if (runner) runner.style.setProperty('--lane', String(lane));
    return changed;
  }

  function flash(className) {
    if (!runner) return;
    runner.classList.remove('jump', 'slide', 'rush');
    void runner.offsetWidth; // restart the animation
    runner.classList.add(className);
    later(function () { if (runner) runner.classList.remove(className); }, EFFECT_MS);
  }

  function say(text, tone) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = 'tut-feedback' + (tone ? ' ' + tone : '');
  }

  function complete(message) {
    locked = true;
    if (arena) arena.classList.add('done');
    say(message || '✓ Nice!', 'good');
    later(next, ADVANCE_MS);
  }

  function evaluateAnswer() {
    dwellTimer = null;
    if (locked) return;
    var picked = arena && arena.querySelector('.tut-lane[data-lane="' + lane + '"]');
    if (lane === answerLane) {
      if (picked) picked.classList.add('correct');
      complete('✓ Correct! ' + SAMPLE.answer);
    } else if (lane !== CENTER_LANE) {
      if (picked) picked.classList.add('wrong');
      say('Not quite. That does not fit the clue. Try another lane.', 'bad');
      later(function () { if (picked) picked.classList.remove('wrong'); }, 900);
    }
  }

  function act(name) {
    var step = steps[index];
    st.view(step.id, index);
    if (!step || step.kind === 'info' || locked) return;

    var moved = false;
    if (name === 'moveLeft') moved = setLane(lane - 1);
    else if (name === 'moveRight') moved = setLane(lane + 1);
    else if (name === 'jump' || name === 'slide' || name === 'rush') flash(name);

    if (step.kind === 'action' && name === step.action) {
      var isMove = name === 'moveLeft' || name === 'moveRight';
      if (!isMove || moved) complete();
    } else if (step.kind === 'answer' && (name === 'moveLeft' || name === 'moveRight') && moved) {
      if (dwellTimer) { clearTimeout(dwellTimer); timers = timers.filter(function (t) { return t !== dwellTimer; }); }
      say('');
      dwellTimer = later(evaluateAnswer, DWELL_MS);
    }
  }

  function buildArena(step) {
    arena = createElement('div', {
      className: 'tut-arena' + (step.kind === 'answer' ? ' answering' : ''),
      attributes: { tabindex: '-1', 'aria-label': 'Practice track', 'data-step': step.id }
    });
    var labels = [];
    if (step.kind === 'answer') {
      var wrongs = SAMPLE.wrong.slice();
      for (var k = 0; k < 3; k++) labels.push(k === answerLane ? SAMPLE.answer : wrongs.shift());
    }
    for (var i = 0; i < 3; i++) {
      var laneEl = createElement('div', { className: 'tut-lane', attributes: { 'data-lane': String(i) } });
      if (step.kind === 'answer') {
        laneEl.setAttribute('data-correct', i === answerLane ? 'true' : 'false');
        laneEl.appendChild(createElement('span', { className: 'tut-lane-label', text: labels[i] }));
      }
      arena.appendChild(laneEl);
    }
    if (step.kind === 'answer') {
      arena.appendChild(createElement('div', { className: 'tut-clue', text: '🩺 ' + SAMPLE.clue }));
    }
    if (step.obstacle) {
      arena.appendChild(createElement('div', {
        className: 'tut-obstacle ' + step.obstacle,
        text: step.obstacle === 'ground' ? '🚧' : '💡',
        attributes: { 'aria-hidden': 'true' }
      }));
    }
    runner = createElement('div', { className: 'tut-runner', text: '🏃', attributes: { 'aria-hidden': 'true' } });
    runner.style.setProperty('--lane', String(lane));
    arena.appendChild(runner);
    if (step.dashButton) {
      var dashPractice = createElement('button', { className: 'tut-dash', text: '⚡ DASH', attributes: { type: 'button', id: 'tutDashBtn' } });
      dashPractice.addEventListener('pointerdown', function (e) { e.stopPropagation(); act('rush'); });
      arena.appendChild(dashPractice);
    }
    if (step.prompt) {
      arena.appendChild(createElement('div', { className: 'tut-prompt', text: step.prompt, attributes: { role: 'status' } }));
    }
    return arena;
  }

  // ---- screens -------------------------------------------------------------------------------
  function render() {
    clearTimers();
    if (disposeInput) { disposeInput(); disposeInput = null; }
    locked = false;
    arena = null;
    runner = null;
    var step = steps[index];
    lane = CENTER_LANE; // every step starts in the middle lane
    clearElement(overlay);

    var card = createElement('div', { className: 'tut-card', attributes: { 'data-step': step.id } });
    card.appendChild(createElement('div', { className: 'tut-count', text: 'Step ' + (index + 1) + ' of ' + steps.length }));

    var skipStep = null;
    var primary = null;
    if (step.kind === 'info') {
      var page = createElement('div', { className: 'tut-page' });
      page.appendChild(createElement('div', { className: 'tut-icon', text: step.icon }));
      page.appendChild(createElement('h2', { text: step.title }));
      page.appendChild(createElement('p', { text: step.text }));
      if (step.reference) {
        var list = createElement('ul', { className: 'tut-reference' });
        REFERENCE.forEach(function (r) {
          var li = createElement('li');
          li.appendChild(createElement('strong', { text: r.icon + ' ' + r.title + '. ' }));
          li.appendChild(document.createTextNode(r.text));
          list.appendChild(li);
        });
        page.appendChild(list);
      }
      card.appendChild(page);
    } else {
      card.appendChild(createElement('h2', { text: step.title }));
      card.appendChild(createElement('p', { className: 'tut-text', text: step.text }));
      card.appendChild(buildArena(step));
      feedback = createElement('div', { className: 'tut-feedback', attributes: { 'aria-live': 'polite', role: 'status' } });
      card.appendChild(feedback);
    }

    var dots = createElement('div', { className: 'tut-dots', attributes: { 'aria-hidden': 'true' } });
    steps.forEach(function (_, i) {
      dots.appendChild(createElement('div', { className: 'tut-dot' + (i === index ? ' active' : '') }));
    });
    card.appendChild(dots);

    var buttons = createElement('div', { className: 'tut-buttons' });
    if (step.kind === 'info') {
      primary = createElement('button', { className: 'btn btn-primary', text: step.button, attributes: { type: 'button', id: 'tutNextBtn' } });
      primary.addEventListener('click', function () { if (index === steps.length - 1) finish('completed'); else next(); });
      buttons.appendChild(primary);
    } else {
      skipStep = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Skip step', attributes: { type: 'button', id: 'tutSkipStepBtn' } });
      skipStep.addEventListener('click', next);
      buttons.appendChild(skipStep);
    }
    card.appendChild(buttons);
    // A small × in the corner (there is no Skip button): it asks "are you sure?" before leaving
    var closeBtn = createElement('button', { className: 'tut-x', text: '×', attributes: { type: 'button', id: 'tutCloseBtn', 'aria-label': 'Close the tutorial' } });
    closeBtn.addEventListener('click', function () { requestClose(); });
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    // Keyboard focus goes to the track on practice steps so keys act on the track, never on a button.
    if (arena) {
      disposeInput = setupInput(arena, inputHandlers, { keyBindings: getKeyBindings, enabled: function () { return !closed && !locked; }, doubleTap: function () { return !(steps[index] && steps[index].dashButton); } });
      try { arena.focus({ preventScroll: true }); } catch (e) { /* best effort */ }
    }
    else if (primary) primary.focus();
  }

  function next() {
    if (closed) return;
    index++;
    if (index >= steps.length) { finish('completed'); return; }
    render();
  }

  // Ask before leaving (on the last page it just finishes)
  function requestClose() {
    if (closed || isExitConfirmOpen()) return;
    if (index === steps.length - 1) { finish('completed'); return; }
    exitAsked = true;
    confirmExitTutorial({ onExit: function () { finish('skipped'); } });
  }

  function finish(result) {
    if (closed) return;
    st.end(result, exitAsked);
    if (isExitConfirmOpen()) dismissExitConfirm();
    closed = true;
    clearTimers();
    if (disposeInput) { disposeInput(); disposeInput = null; }
    document.removeEventListener('keydown', onEscape);
    document.removeEventListener('keydown', swallowSpace, true);
    document.removeEventListener('keyup', swallowSpace, true);
    overlay.classList.remove('active');
    clearElement(overlay);
    releaseFocusTrap();
    _session = null;
    if (opts.onClose) opts.onClose({ completed: result === 'completed', skipped: result === 'skipped' });
  }

  _session = { finish: finish, requestClose: requestClose };
  overlay.classList.add('active');
  trapFocus(overlay);
  render();
}
