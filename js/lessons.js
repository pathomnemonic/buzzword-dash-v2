/**
 * lessons.js — the little lesson a red-dotted menu teaches the first time it is opened.
 *
 * The how-to-play only covers the run and the Home screen. Everything else (Filters, Speed, Flashcards, Challenge,
 * Versus, Friends, Settings and the tabs) has a red dot (discoverydots.js). The first time the player taps one, it opens
 * as usual and a spotlight lesson shows what is inside (tourdata.js LESSON_STEPS). Lessons are not numbered, can be
 * closed with the ×, and never come back.
 */

import { startTour, isTourOpen } from './tour.js';
import { buildLessonSteps, LESSON_STEPS } from './tourdata.js';
import { isGameTutorialOpen } from './tutorialrun.js';
import { markExplored } from './discoverydots.js';

var LESSON_DELAY_MS = 450; // the menu opens first (a screen draws, a pop-up slides in), then the lesson points at it

/** The browser tests switch lessons off (they click through every menu); nothing else sets this. */
function lessonsDisabled() {
  try { return localStorage.getItem('dx_lessons_off') === '1'; } catch (e) { return false; }
}

/** Does this thing have a lesson? */
export function hasLesson(id) {
  return !!(id && LESSON_STEPS[id]);
}

/**
 * Show the lesson for a discovery id, unless something else is already teaching or a run is going.
 * @param {string} id a discovery id (see discoverydots.js)
 * @param {{ui: object, isRunning: function(): boolean}} deps
 * @returns {boolean} true when a lesson was scheduled
 */
export function startLesson(id, deps) {
  if (!hasLesson(id) || lessonsDisabled() || isTourOpen() || isGameTutorialOpen() || (deps.isRunning && deps.isRunning())) return false;
  setTimeout(function () {
    if (isTourOpen() || isGameTutorialOpen() || (deps.isRunning && deps.isRunning())) return;
    var steps = buildLessonSteps(id, { ui: deps.ui });
    if (steps.length) startTour({ steps: steps, ctx: { ui: deps.ui }, numbered: false, kind: 'lesson' });
  }, LESSON_DELAY_MS);
  return true;
}

/**
 * Players who already know the app (they finished the how-to-play and played a run before lessons existed) are not
 * walked through it again: their lessons count as seen. Run once.
 */
export function seedLessons(storage) {
  if (storage.get('lessonsSeeded')) return;
  if (storage.get('firstRunComplete') && (storage.get('runsFinished') || 0) >= 1) {
    Object.keys(LESSON_STEPS).forEach(function (id) { markExplored(storage, id); });
  }
  storage.set('lessonsSeeded', true);
}
