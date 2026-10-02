/**
 * tutorialrun.js — the how-to-play, played in the real game.
 *
 * The tutorial is an ordinary run on the real track with the real top bar, clue and answer gates, but
 * nothing arrives on its own: a coach card at the bottom of the screen asks for one move at a time, and
 * only then sends the obstacle or the question that needs it. The welcome and finish pages are full
 * pages over the screen; the run starts when "Start practice" is pressed. Swipes, keys and the Dash button are the
 * game's own, so what is practised is exactly what a run needs. Nothing from it is saved (no score,
 * coins, stats or history), and it can be skipped at any time.
 *
 * Where the runner cannot start (no WebGL), the older practice-track tutorial in tutorial.js is used.
 */

import { createElement, clearElement } from './dom.js';
import { buildSteps, REFERENCE } from './tutorial.js';
import { getDashControl } from './dashcontrol.js';
import { getControlText } from './controlhints.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';

var ADVANCE_MS = 900;        // pause on the "Nice!" before the next step
var RETRY_MS = 1400;         // pause before a missed obstacle or question is sent again
var WATCH_MS = 120;          // how often an obstacle on the way is checked
var OBSTACLE_GRACE_MS = 1500; // an obstacle is only judged missed once it is this old and gone

/** The two questions: one to dash through, one to answer. Each is a card id looked up at start. */
export var TUTORIAL_CARD_IDS = ['su022', 'en004'];

var _session = null;

/** True while the tutorial is open. */
export function isGameTutorialOpen() {
  return !!_session;
}

/** Close the tutorial as skipped (Escape, the Android back button). */
export function skipGameTutorial() {
  if (_session) _session.finish('skipped');
}

/**
 * Open the tutorial on the real track.
 * @param {object} env
 * @param {object} env.game the engine
 * @param {function(string[]): void} env.begin starts the tutorial run, given the card ids to use
 * @param {string[]} env.cardIds [dash question, answer question]
 * @param {function({completed: boolean, skipped: boolean}): void} [env.onClose]
 */
export function startGameTutorial(env) {
  var game = env.game;
  var coach = document.getElementById('tutorialCoach');   // the card docked over the track (practice steps)
  var page = document.getElementById('tutorialOverlay');  // the full pages (welcome and finish)
  if (!coach || !page || _session) return false;

  var dashControl = getDashControl();
  var steps = buildSteps(undefined, dashControl).filter(function (s) {
    return !(s.id === 'rush' && getControlText().touch && dashControl === 'off');
  });
  var index = 0;
  var closed = false;
  var locked = false;
  var started = false;     // the run is going and practice steps can be sent
  var launching = false;   // "Start practice" was pressed and the run is counting down
  var timers = [];
  var watch = null;
  var feedback = null;

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
    if (watch) { clearInterval(watch); watch = null; }
  }

  function say(text, tone) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = 'coach-feedback' + (tone ? ' ' + tone : '');
  }

  function complete(message) {
    if (locked) return;
    locked = true;
    clearTimers();
    say(message || '✓ Nice!', 'good');
    later(next, ADVANCE_MS);
  }

  // ---- what each practice step sends down the track ----------------------------------------
  function sendObstacle(step) {
    var low = step.obstacle === 'ground';
    var counter = low ? 'obstaclesJumped' : 'obstaclesSlid';
    var base = game[counter];
    var sentAt = Date.now();
    game.tutorialObstacle(low ? 'low' : 'high');
    if (watch) clearInterval(watch);
    watch = setInterval(function () {
      if (locked || closed) return;
      if (game[counter] > base) { complete(low ? '✓ Jumped it!' : '✓ Slid under it!'); return; }
      // It has come and gone without being cleared: say what to do and send another
      if (game.obstacleMeshes.length === 0 && Date.now() - sentAt > OBSTACLE_GRACE_MS) {
        clearInterval(watch); watch = null;
        say(low ? 'It got you. Swipe up just before it reaches you.' : 'It got you. Swipe down just before it reaches you.', 'bad');
        later(function () { if (!locked && !closed) { say(''); sendObstacle(step); } }, RETRY_MS);
      }
    }, WATCH_MS);
  }

  // No question yet means no clue or answer gates on the top bar (the run's usual "GET READY" would sit empty)
  var hud = document.getElementById('hud');
  function quietHud(on) { if (hud) hud.classList.toggle('tut-no-question', on); }

  function sendQuestion(cardId) {
    quietHud(false);
    game.tutorialEncounter(cardId);
  }

  function enterStep() {
    var step = steps[index];
    locked = false;
    if (step.kind === 'action' && step.obstacle) sendObstacle(step);
    else if (step.id === 'rush') sendQuestion(env.cardIds[0]);
    else if (step.id === 'answer') sendQuestion(env.cardIds[1]);
  }

  // ---- what the game tells us ---------------------------------------------------------------
  function onGameEvent(type, data) {
    if (closed) return;
    if (type === 'go') { if (launching) { launching = false; started = true; quietHud(true); next(); } return; }
    if (type === 'pause') { finish('skipped'); return; }
    if (type === 'ended') { finish('skipped'); return; }
    var step = steps[index];
    if (!started || !step || locked) return;

    if (type === 'action' && step.kind === 'action' && !step.obstacle && data === step.action) {
      complete();
    } else if (type === 'action' && step.id === 'rush' && data === 'rush') {
      say('⚡ Rushing through the gate!', 'good');
    } else if (type === 'resolved') {
      if (step.id === 'rush') {
        if (game.lastResolvedRushed) complete('✓ That is a rush!');
        else {
          say('The gate passed without a rush. ' + step.prompt + ' before it arrives.', 'bad');
          later(function () { if (!locked && !closed) { say(''); sendQuestion(env.cardIds[0]); } }, RETRY_MS);
        }
      } else if (step.id === 'answer') {
        if (data && data.correct) complete('✓ Correct!');
        else {
          say('Not quite. Read the clue again and try this one.', 'bad');
          later(function () { if (!locked && !closed) { say(''); sendQuestion(env.cardIds[1]); } }, RETRY_MS);
        }
      }
    }
  }

  // ---- the coach card ------------------------------------------------------------------------
  function render() {
    clearTimers();
    var step = steps[index];
    var isPage = step.kind === 'info';
    var target = isPage ? page : coach;
    clearElement(coach);
    clearElement(page);
    coach.className = isPage ? 'tutorial-coach' : 'tutorial-coach active docked' + (dashControl === 'button' && getControlText().touch ? ' with-dash' : '');
    if (isPage) { page.classList.add('active'); trapFocus(page); } else { page.classList.remove('active'); releaseFocusTrap(); }

    var card = createElement('div', { className: 'tut-card coach-card', attributes: { 'data-step': step.id } });
    card.appendChild(createElement('div', { className: 'tut-count', text: 'Step ' + (index + 1) + ' of ' + steps.length }));
    card.appendChild(createElement('h2', { text: step.title }));
    var primary = null;

    if (step.kind === 'info') {
      card.appendChild(createElement('p', { className: 'tut-text', text: step.text }));
      if (step.reference) {
        var list = createElement('ul', { className: 'tut-reference' });
        REFERENCE.forEach(function (r) {
          var li = createElement('li');
          li.appendChild(createElement('strong', { text: r.icon + ' ' + r.title + '. ' }));
          li.appendChild(document.createTextNode(r.text));
          list.appendChild(li);
        });
        card.appendChild(list);
      }
    } else {
      if (step.prompt) card.appendChild(createElement('div', { className: 'coach-prompt', text: step.prompt, attributes: { role: 'status' } }));
      card.appendChild(createElement('p', { className: 'tut-text', text: step.text }));
      feedback = createElement('div', { className: 'coach-feedback', attributes: { 'aria-live': 'polite', role: 'status' } });
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
      primary.addEventListener('click', function () {
        if (index === steps.length - 1) finish('completed');
        else if (!started) launch();
        else next();
      });
      buttons.appendChild(primary);
    } else {
      var skipStep = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Skip step', attributes: { type: 'button', id: 'tutSkipStepBtn' } });
      skipStep.addEventListener('click', function () { next(); });
      buttons.appendChild(skipStep);
    }
    var last = index === steps.length - 1;
    var skipAll = createElement('button', {
      className: 'btn btn-outline btn-sm',
      text: last ? 'Close' : 'Skip tutorial',
      attributes: { type: 'button', id: 'tutSkipBtn' }
    });
    skipAll.addEventListener('click', function () { finish(last ? 'completed' : 'skipped'); });
    buttons.appendChild(skipAll);
    card.appendChild(buttons);

    target.appendChild(card);
    // Practice steps leave focus alone so keys reach the game, never a button (Space would press it)
    if (primary) primary.focus();
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    enterStep();
  }

  // "Start practice": the real run begins (with its usual countdown); the first move is asked for at GO
  function launch() {
    if (launching || started) return;
    launching = true;
    clearElement(page);
    page.classList.remove('active');
    releaseFocusTrap();
    env.begin(env.cardIds);
  }

  function next() {
    if (closed) return;
    index++;
    if (index >= steps.length) { finish('completed'); return; }
    render();
  }

  function finish(result) {
    if (closed) return;
    closed = true;
    clearTimers();
    document.removeEventListener('keydown', swallowSpace, true);
    document.removeEventListener('keyup', swallowSpace, true);
    game.tutorialListener = null;
    quietHud(false);
    coach.className = 'tutorial-coach';
    clearElement(coach);
    clearElement(page);
    page.classList.remove('active');
    releaseFocusTrap();
    document.removeEventListener('keydown', onEscape);
    _session = null;
    // Put the run away without saving anything (main.js sees the tutorial flag and skips the results)
    if (launching || game.running || game.paused) game.requestEnd('tutorial_closed');
    if (env.onClose) env.onClose({ completed: result === 'completed', skipped: result === 'skipped' });
  }

  // Escape on the welcome page (no run yet) skips; once a run is going the game's own pause key does
  function onEscape(e) {
    if (e.key === 'Escape' && !closed && !started && !launching) finish('skipped');
  }
  document.addEventListener('keydown', onEscape);

  // Space on a practice step is a rush, not a press of whichever button has focus
  function swallowSpace(e) {
    if (closed || e.key !== ' ' || !steps[index] || steps[index].action !== 'rush') return;
    e.preventDefault();
  }
  document.addEventListener('keydown', swallowSpace, true);
  document.addEventListener('keyup', swallowSpace, true);

  _session = { finish: finish };
  game.tutorialListener = onGameEvent;
  render(); // the welcome page; the run starts when it is dismissed
  return true;
}
