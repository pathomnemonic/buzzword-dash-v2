import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTourSteps, buildLessonSteps, LESSON_STEPS } from '../../js/tourdata.js';
import { HOME_DISCOVERIES, isExplored } from '../../js/discoverydots.js';
import { startLesson, seedLessons, hasLesson } from '../../js/lessons.js';
import { skipTour, isTourOpen } from '../../js/tour.js';

function fakeStorage(data) {
  const d = { explored: [], ...data };
  return { get: (k) => d[k], set: (k, v) => { d[k] = v; }, d };
}

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('the how-to-play covers only the run and Home', () => {
  beforeEach(loadPage);
  it('has just the Home steps: welcome, coins, and a pointer to the red dots', () => {
    const steps = buildTourSteps({ ui: { show() {} } });
    expect(steps.map((s) => s.id)).toEqual(['home', 'coins', 'menus']);
    expect(steps[2].text).toMatch(/red dot/i);
  });
});

describe('everything with a red dot teaches itself', () => {
  beforeEach(loadPage);
  it('has a lesson for every dotted button and tab', () => {
    HOME_DISCOVERIES.forEach((d) => expect(hasLesson(d.id), d.id).toBe(true));
  });

  it('builds real steps for each lesson, in order', () => {
    Object.keys(LESSON_STEPS).forEach((id) => {
      const steps = buildLessonSteps(id, { ui: { show() {} } });
      expect(steps.length, id).toBeGreaterThan(0);
      expect(steps.map((s) => s.id), id).toEqual(LESSON_STEPS[id]);
    });
    expect(buildLessonSteps('nothing', {})).toEqual([]);
  });
});

describe('lessons', () => {
  beforeEach(() => { loadPage(); vi.useFakeTimers(); });
  afterEach(() => { skipTour(); vi.useRealTimers(); });

  it('open after the menu, with no step count, and close with the ×', () => {
    expect(startLesson('tab:stats', { ui: { show() {} }, isRunning: () => false })).toBe(true);
    expect(isTourOpen()).toBe(false); // (the menu opens first)
    vi.advanceTimersByTime(600);
    expect(isTourOpen()).toBe(true);
    expect(document.querySelector('.tour-card .tut-count')).toBeNull();
    document.getElementById('tourCloseBtn').click();
    expect(isTourOpen()).toBe(false);
  });

  it('do not open during a run, over another lesson, or for something with no lesson', () => {
    expect(startLesson('tab:stats', { ui: { show() {} }, isRunning: () => true })).toBe(false);
    expect(startLesson('nope', { ui: { show() {} }, isRunning: () => false })).toBe(false);
    startLesson('tab:quests', { ui: { show() {} }, isRunning: () => false });
    vi.advanceTimersByTime(600);
    expect(isTourOpen()).toBe(true);
    expect(startLesson('tab:stats', { ui: { show() {} }, isRunning: () => false })).toBe(false);
  });
});

describe('players who already know the app', () => {
  it('are not walked through the lessons again, once; a new player is', () => {
    const veteran = fakeStorage({ firstRunComplete: true, runsFinished: 5 });
    seedLessons(veteran);
    HOME_DISCOVERIES.forEach((d) => expect(isExplored(veteran, d.id), d.id).toBe(true));
    expect(veteran.d.lessonsSeeded).toBe(true);

    const fresh = fakeStorage({ firstRunComplete: false, runsFinished: 0 });
    seedLessons(fresh);
    HOME_DISCOVERIES.forEach((d) => expect(isExplored(fresh, d.id), d.id).toBe(false));
    expect(fresh.d.lessonsSeeded).toBe(true);

    // it only runs once: a player who becomes experienced later keeps their lessons
    fresh.d.firstRunComplete = true; fresh.d.runsFinished = 9;
    seedLessons(fresh);
    HOME_DISCOVERIES.forEach((d) => expect(isExplored(fresh, d.id), d.id).toBe(false));
  });
});
