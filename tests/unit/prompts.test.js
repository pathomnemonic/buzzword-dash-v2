import { describe, it, expect } from 'vitest';
import { choosePrompt, recordPrompt, backoffMs, GLOBAL_COOLDOWN_MS, MAX_ASKS } from '../../js/prompts.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const base = {
  now: NOW, totalRuns: 12, firstRunAt: NOW - 10 * DAY, correct: 8, accuracy: 85, newBest: false, streak: 0,
  signedIn: false, accountsAvailable: true, canShare: true, reviewUrl: 'https://play.google.com/store/apps/details?id=x', state: {}
};

describe('when to ask', () => {
  it('stays quiet after a poor run, and on the first runs', () => {
    expect(choosePrompt({ ...base, correct: 2, accuracy: 30 })).toBeNull();
    expect(choosePrompt({ ...base, totalRuns: 1 })).toBeNull();
    expect(choosePrompt({ ...base, totalRuns: 2 })).toBeNull();
  });

  it('a new best score is a good moment even when the run was short', () => {
    expect(choosePrompt({ ...base, correct: 2, accuracy: 50, newBest: true, totalRuns: 6, reviewUrl: '' })).not.toBeNull();
  });

  it('only asks for what can work', () => {
    const none = { ...base, signedIn: true, canShare: false, reviewUrl: '' };
    expect(choosePrompt(none)).toBeNull();
    expect(choosePrompt({ ...base, signedIn: true, canShare: false })).toBe('review');
    expect(choosePrompt({ ...base, signedIn: true, reviewUrl: '' })).toBe('share');
    expect(choosePrompt({ ...base, accountsAvailable: false, canShare: false, reviewUrl: '' })).toBeNull();
    expect(choosePrompt({ ...base, signedIn: false, canShare: false, reviewUrl: '', totalRuns: 4 })).toBe('account');
  });

  it('does not ask for a rating until the player has been around a few days', () => {
    const young = { ...base, signedIn: true, canShare: false, firstRunAt: NOW - DAY };
    expect(choosePrompt(young)).toBeNull();
  });

  it('never asks twice within a few days, whatever the kind', () => {
    const state = recordPrompt({}, 'account', 'shown', NOW - DAY);
    expect(choosePrompt({ ...base, state })).toBeNull();
    expect(choosePrompt({ ...base, now: NOW - DAY + GLOBAL_COOLDOWN_MS, state })).not.toBe('account');
  });

  it('rotates: the kind asked least recently goes next, and a kind backs off after being asked', () => {
    let state = recordPrompt({}, 'account', 'shown', NOW - 5 * DAY);
    expect(choosePrompt({ ...base, state })).toBe('share'); // never asked beats asked
    state = recordPrompt(state, 'share', 'shown', NOW - 4 * DAY);
    expect(choosePrompt({ ...base, state })).toBe('review');
    state = recordPrompt(state, 'review', 'shown', NOW - 3.5 * DAY);
    // account was asked 5 days ago, still inside its 14-day wait
    expect(choosePrompt({ ...base, state })).toBeNull();
    expect(choosePrompt({ ...base, now: NOW + 10 * DAY, state })).toBe('account');
  });

  it('backs off further each time and stops after three asks', () => {
    expect(backoffMs(1)).toBe(14 * DAY);
    expect(backoffMs(2)).toBe(28 * DAY);
    expect(backoffMs(3)).toBe(56 * DAY);
    let state = {};
    for (let i = 0; i < MAX_ASKS; i++) state = recordPrompt(state, 'account', 'shown', NOW - 400 * DAY + i * 100 * DAY);
    const only = { ...base, canShare: false, reviewUrl: '', state: { ...state, lastAt: 0 } };
    expect(choosePrompt(only)).toBeNull();
  });

  it('"don\'t ask again" and doing the thing both end that kind for good', () => {
    const never = recordPrompt({}, 'account', 'never', 0);
    const done = recordPrompt(never, 'share', 'done', 0);
    expect(choosePrompt({ ...base, now: NOW + 999 * DAY, state: never })).toBe('share');
    expect(choosePrompt({ ...base, now: NOW + 999 * DAY, state: done })).toBe('review');
  });

  it('recordPrompt does not change its input', () => {
    const s = { lastAt: 1, kinds: { share: { at: 1, count: 1 } } };
    recordPrompt(s, 'share', 'shown', 5);
    expect(s).toEqual({ lastAt: 1, kinds: { share: { at: 1, count: 1 } } });
  });
});
