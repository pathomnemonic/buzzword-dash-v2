/**
 * tutorialrun.js — the how-to-play, played in the real game.
 *
 * The tutorial is an ordinary run on the real track with the real top bar, clue and answer gates, but
 * nothing arrives on its own: a coach card at the bottom of the screen asks for one move at a time, and
 * only then sends the obstacle or the question that needs it. The welcome and finish pages are full
 * pages over the screen; the run starts when "Start practice" is pressed. After the last practice step the run is
 * put away and a spotlight tour of the real screens follows (tour.js, tourdata.js): Home, Stats, the Locker (where
 * the starting coins buy a first trail), Quests and Profile. Swipes, keys and the Dash button are the
 * game's own, so what is practised is exactly what a run needs. Nothing from it is saved (no score,
 * coins, stats or history), and it can be skipped at any time.
 *
 * Where the runner cannot start (no WebGL), the older practice-track tutorial in tutorial.js is used.
 */

import { storage } from './storage.js';
import { createStepTracker } from './analytics/steptracker.js';
import { createElement, clearElement } from './dom.js';
import { buildSteps, REFERENCE } from './tutorial.js';
import { getDashControl } from './dashcontrol.js';
import { getControlText } from './controlhints.js';
import { trapFocus, releaseFocusTrap } from './uihelpers.js';
import { startTour, skipTour, isTourOpen } from './tour.js';
import { confirmExitTutorial, isExitConfirmOpen, dismissExitConfirm } from './tutorialexit.js';
import { buildTourSteps } from './tourdata.js';

var ADVANCE_MS = 900;        // pause on the "Nice!" before the next step
var RETRY_MS = 1400;         // pause before a missed obstacle or question is sent again
var WATCH_MS = 120;          // how often an obstacle on the way is checked
var OBSTACLE_GRACE_MS = 1500; // an obstacle is only judged missed once it is this old and gone

/** The two questions: one to answer (learned first), one to dash through. Each is a card id looked up at start. */
export var TUTORIAL_CARD_IDS = ['en004', 'su022'];

var _session = null;

/** True while the tutorial is open. */
export function isGameTutorialOpen() {
  return !!_session;
}

/** The player tried to close the tutorial (Escape, the Android back button): ask first. */
export function requestCloseGameTutorial() {
  if (!_session) return;
  if (isExitConfirmOpen()) { dismissExitConfirm(); return; } // back or Escape on the warning means "keep going"
  _session.requestClose();
}

/**
 * Open the tutorial on the real track.
 * @param {object} env
 * @param {object} env.game the engine
 * @param {function(string[]): void} env.begin starts the tutorial run, given the card ids to use
 * @param {string[]} env.cardIds [dash question, answer question]
 * @param {object} env.ui the interface (the tour opens Home and reads the Locker)
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
  // the spotlight tour comes after the practice, before the closing page
  var doneAt = steps.map(function (s) { return s.id; }).indexOf('done');
  steps.splice(doneAt < 0 ? steps.length : doneAt, 0, { id: 'tour', kind: 'tour', title: 'App tour' });
  var index = 0;
  var closed = false;
  var st = createStepTracker('real_track', { firstTime: !storage.get('firstRunComplete') });
  var exitAsked = false;
  var locked = false;
  var touring = false;     // the practice run was put away and the spotlight tour is open
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
    else if (step.id === 'answer') sendQuestion(env.cardIds[0]);
    else if (step.id === 'rush') sendQuestion(env.cardIds[1]);
  }

  // ---- what the game tells us ---------------------------------------------------------------
  function onGameEvent(type, data) {
    if (closed) return;
    if (type === 'go') { if (launching) { launching = false; started = true; quietHud(true); next(); } return; }
    if (type === 'pause') { requestClose(); return; }
    if (type === 'ended') { if (!touring) finish('skipped'); return; }
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
          later(function () { if (!locked && !closed) { say(''); sendQuestion(env.cardIds[1]); } }, RETRY_MS);
        }
      } else if (step.id === 'answer') {
        if (data && data.correct) complete('✓ Correct!');
        else {
          say('Not quite. Read the clue again and try this one.', 'bad');
          later(function () { if (!locked && !closed) { say(''); sendQuestion(env.cardIds[0]); } }, RETRY_MS);
        }
      }
    }
  }

  // ---- the coach card ------------------------------------------------------------------------
  // The practice is over: put the run away (silently) and walk through the real screens with a spotlight
  function startTourStep() {
    touring = true;
    clearTimers();
    clearElement(coach);
    coach.className = 'tutorial-coach';
    page.classList.remove('active');
    releaseFocusTrap();
    quietHud(false);
    if (game.running || game.paused) game.requestEnd('tutorial_tour');
    // (a moment for the run's put-away to land on Home before the first spotlight)
    later(function () {
      if (closed) return;
      startTour({
        steps: buildTourSteps({ ui: env.ui }),
        ctx: { ui: env.ui },
        requestClose: requestClose,
        onClose: function (r) {
          touring = false;
          if (closed) return;
          if (r.completed) next(); else finish('skipped');
        }
      });
    }, 120);
  }

  function render() {
    clearTimers();
    var step = steps[index];
    st.view(step.id, index);
    if (step.kind === 'tour') { startTourStep(); return; }
    var isPage = step.kind === 'info';
    var target = isPage ? page : coach;
    clearElement(coach);
    clearElement(page);
    // The card sits out of the way of the swipes: at the top while the track is empty, and just under the answer
    // boxes once a question is up (never on the lower part of the screen, where the thumb swipes)
    var withQuestion = step.id === 'answer' || step.id === 'rush';
    coach.className = isPage ? 'tutorial-coach' : 'tutorial-coach active docked ' + (withQuestion ? 'under-question' : 'at-top');
    coach.style.paddingTop = '';
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
    card.appendChild(buttons);
    // A small × in the corner (there is no Skip button): it asks "are you sure?" before leaving
    var closeBtn = createElement('button', { className: 'tut-x', text: '×', attributes: { type: 'button', id: 'tutCloseBtn', 'aria-label': 'Close the tutorial' } });
    closeBtn.addEventListener('click', function () { requestClose(); });
    card.appendChild(closeBtn);

    target.appendChild(card);
    // Practice steps leave focus alone so keys reach the game, never a button (Space would press it)
    if (primary) primary.focus();
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    enterStep();
    placeUnderQuestion();
  }

  // With a question showing, the card goes just below the answer boxes (they are taller when the clue runs long)
  function placeUnderQuestion() {
    if (!coach.classList.contains('under-question')) return;
    var row = document.getElementById('answerRow');
    var bottom = row ? row.getBoundingClientRect().bottom : 0;
    coach.style.paddingTop = (bottom > 0 ? bottom + 10 : 214) + 'px';
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

  // The player wants out. On the last page that just finishes; anywhere else they are asked first, because the
  // tutorial is how a new player learns the game and it is easy to press by accident.
  function requestClose() {
    if (closed || isExitConfirmOpen()) return;
    var onLastPage = index === steps.length - 1 && steps[index].kind === 'info';
    if (onLastPage) { finish('completed'); return; }
    exitAsked = true;
    confirmExitTutorial({ onExit: function () { finish('skipped'); } });
  }

  function finish(result) {
    if (closed) return;
    st.end(result, exitAsked);
    closed = true;
    clearTimers();
    document.removeEventListener('keydown', swallowSpace, true);
    document.removeEventListener('keyup', swallowSpace, true);
    game.tutorialListener = null;
    if (answerRow) {
      answerRow.removeEventListener('pointerdown', onAnswerTap);
      answerRow.classList.remove('tut-tappable');
      answerRow.querySelectorAll('.tut-nudge').forEach(function (c) { c.classList.remove('tut-nudge'); });
    }
    clearTimeout(nudgeTimer);
    if (dontEl && dontEl.parentNode) dontEl.parentNode.removeChild(dontEl);
    if (isExitConfirmOpen()) dismissExitConfirm();
    quietHud(false);
    if (isTourOpen()) skipTour();
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
    if (e.key === 'Escape' && !closed && !started && !launching && !isExitConfirmOpen()) requestClose();
  }
  document.addEventListener('keydown', onEscape);

  // Space on a practice step is a rush, not a press of whichever button has focus
  function swallowSpace(e) {
    if (closed || e.key !== ' ' || !steps[index] || steps[index].action !== 'rush') return;
    e.preventDefault();
  }
  document.addEventListener('keydown', swallowSpace, true);
  document.addEventListener('keyup', swallowSpace, true);

  // Players try to tap the answers at the top of the screen. They are only labels for the three gates, so say so, kindly,
  // and point at the lane that tap would have meant.
  var answerRow = document.getElementById('answerRow');
  var nudgeTimer = null;
  var dontEl = null;
  function onAnswerTap(e) {
    var choice = e.target && e.target.closest ? e.target.closest('.answer-choice') : null;
    if (closed || !choice) return;
    var lane = Number(String(choice.id).replace('ans', ''));
    var where = lane === 0 ? 'left' : lane === 2 ? 'right' : 'middle';
    var how = 'Swipe ' + (lane === 1 ? 'to the middle lane' : where) + ' or use the arrow keys to run into the ' + where + ' gate.';
    say('Those are just labels. ' + how, 'hint');
    // a red pop-up right under the labels, so nobody mistakes them for buttons
    if (dontEl && dontEl.parentNode) dontEl.parentNode.removeChild(dontEl);
    dontEl = document.createElement('div');
    dontEl.className = 'tut-dont';
    dontEl.setAttribute('role', 'alert');
    var r = answerRow.getBoundingClientRect();
    dontEl.style.top = Math.round(r.bottom + 8) + 'px';
    var b = document.createElement('strong'); b.textContent = '🚫 DON\'T TAP HERE!';
    var sp = document.createElement('span'); sp.textContent = 'These are only labels. ' + how;
    dontEl.appendChild(b); dontEl.appendChild(sp);
    document.body.appendChild(dontEl);
    var mine = dontEl;
    setTimeout(function () { if (mine.parentNode) mine.parentNode.removeChild(mine); }, 2400);
    choice.classList.add('tut-nudge');
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function () { choice.classList.remove('tut-nudge'); }, 800);
  }
  if (answerRow) {
    answerRow.classList.add('tut-tappable');
    answerRow.addEventListener('pointerdown', onAnswerTap);
  }

  _session = { finish: finish, requestClose: requestClose };
  game.tutorialListener = onGameEvent;
  render(); // the welcome page; the run starts when it is dismissed
  return true;
}
