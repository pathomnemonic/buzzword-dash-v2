import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSteps, startTutorial, skipTutorial, isTutorialOpen } from '../../js/tutorial.js';
import { getControlText } from '../../js/controlhints.js';
import { cornerLabel, cornerInitial } from '../../js/profilecorner.js';

describe('tutorial steps', () => {
  it('teaches every move, then a practice question, with a welcome and a close', () => {
    const ids = buildSteps(getControlText(false)).map((s) => s.id);
    expect(ids).toEqual(['welcome', 'left', 'right', 'jump', 'slide', 'answer', 'rush', 'done']);
  });

  it('every practice step asks for one action', () => {
    const actions = buildSteps(getControlText(false)).filter((s) => s.kind === 'action').map((s) => s.action);
    expect(actions).toEqual(['moveLeft', 'moveRight', 'jump', 'slide', 'rush']);
  });

  it('words the prompts for touch or keyboard', () => {
    const touch = buildSteps(getControlText(true)).find((s) => s.id === 'left').prompt;
    const keys = buildSteps(getControlText(false)).find((s) => s.id === 'left').prompt;
    expect(touch).toMatch(/swipe/i);
    expect(keys).toMatch(/press/i);
  });

  it('ends by sending the player off to the red-dotted menus, with no long list to read', () => {
    const last = buildSteps(getControlText(false)).at(-1);
    expect(last.reference).toBeUndefined();
    expect(last.text).toMatch(/red dots?/i);
    expect(last.text).toMatch(/explore|try/i);
  });
});

describe('tutorial overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="tutorialOverlay"></div>';
  });
  afterEach(() => { skipTutorial(); });

  it('opens on the welcome page, and skipping closes it and reports it', () => {
    const onClose = vi.fn();
    startTutorial({ onClose });
    const overlay = document.getElementById('tutorialOverlay');
    expect(overlay.classList.contains('active')).toBe(true);
    expect(overlay.querySelector('.tut-card').getAttribute('data-step')).toBe('welcome');
    expect(isTutorialOpen()).toBe(true);
    document.getElementById('tutCloseBtn').click();
    document.getElementById('tutExitYes').click(); // the × asks first
    expect(overlay.classList.contains('active')).toBe(false);
    expect(isTutorialOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledWith({ completed: false, skipped: true });
  });

  it('advances on the right key only', () => {
    startTutorial({});
    document.getElementById('tutNextBtn').click(); // to the first practice step
    const card = () => document.querySelector('.tut-card').getAttribute('data-step');
    expect(card()).toBe('left');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(card()).toBe('left');
    vi.useFakeTimers();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    vi.advanceTimersByTime(1000);
    expect(card()).toBe('right');
    vi.useRealTimers();
  });

  it('does not open twice', () => {
    startTutorial({});
    const first = document.querySelector('.tut-card');
    startTutorial({});
    expect(document.querySelector('.tut-card')).toBe(first);
  });
});

describe('profile button text', () => {
  it('invites guests to sign in and shows the account for signed-in players', () => {
    expect(cornerLabel(null, '')).toBe('Sign in');
    expect(cornerLabel({ email: '', anonymous: true }, '')).toBe('Sign in');
    expect(cornerLabel({ email: 'dr.house@example.com', anonymous: false }, '')).toBe('dr.house');
    expect(cornerLabel({ email: 'a@b.co', anonymous: false }, 'Averyveryverylongname')).toHaveLength(12);
    expect(cornerInitial({ email: 'zed@x.io', anonymous: false }, '')).toBe('Z');
    expect(cornerInitial(null, '')).toBe('👤');
  });
});
