import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attachPromptCard } from '../../js/promptui.js';

const DAY = 24 * 60 * 60 * 1000;

function fakeStorage(settings) {
  const data = { runsFinished: 12, firstRunAt: Date.now() - 10 * DAY, promptState: {}, ...settings };
  return { get: (k) => data[k], set: (k, v) => { data[k] = v; }, getStreakStatus: () => ({ streak: 0 }), data };
}

describe('the ask on the results screen', () => {
  let container;
  let deps;
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c');
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
    deps = {
      container, storage: fakeStorage(), run: { correct: 9, accuracy: 90, newBest: true },
      signedIn: false, accountsAvailable: true, openAccount: vi.fn(), toast: vi.fn()
    };
  });

  it('shows one card, remembers it was shown, and does not repeat on the next results screen', () => {
    expect(attachPromptCard(deps)).toBe('account');
    expect(container.querySelectorAll('.prompt-card').length).toBe(1);
    expect(deps.storage.get('promptState').kinds.account.count).toBe(1);
    container.innerHTML = '';
    expect(attachPromptCard(deps)).toBeNull(); // inside the cooldown
  });

  it('the account button opens the account panel and ends the ask for good', () => {
    attachPromptCard(deps);
    container.querySelector('.btn-gold').click();
    expect(deps.openAccount).toHaveBeenCalled();
    expect(deps.storage.get('promptState').kinds.account.done).toBe(true);
    expect(container.querySelector('.prompt-card')).toBeNull();
  });

  it('"Don\'t ask again" is remembered for that kind', () => {
    attachPromptCard(deps);
    container.querySelectorAll('button')[2].click();
    expect(deps.storage.get('promptState').kinds.account.off).toBe(true);
  });

  it('share copies the link when there is no share sheet', async () => {
    deps.signedIn = true;
    expect(attachPromptCard(deps)).toBe('share');
    container.querySelector('.btn-gold').click();
    await vi.waitFor(() => expect(deps.toast).toHaveBeenCalledWith(expect.stringMatching(/copied/i)));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

describe('the account invitation on the Profile tab', () => {
  it('shows while signed out, can be put off for the session, and never shows when signed in', async () => {
    const { attachAccountBanner } = await import('../../js/promptui.js');
    document.body.innerHTML = '<div id="c"><h4>Existing</h4></div>';
    const container = document.getElementById('c');
    const openAccount = vi.fn();
    expect(attachAccountBanner({ container, signedIn: true, accountsAvailable: true, openAccount })).toBe(false);
    expect(attachAccountBanner({ container, signedIn: false, accountsAvailable: false, openAccount })).toBe(false);
    expect(attachAccountBanner({ container, signedIn: false, accountsAvailable: true, openAccount })).toBe(true);
    expect(container.firstChild.classList.contains('account-banner')).toBe(true);
    expect(attachAccountBanner({ container, signedIn: false, accountsAvailable: true, openAccount })).toBe(false); // no duplicates
    container.querySelector('.btn-gold').click();
    expect(openAccount).toHaveBeenCalled();
    container.querySelector('.btn-outline').click();
    expect(container.querySelector('.account-banner')).toBeNull();
    expect(attachAccountBanner({ container, signedIn: false, accountsAvailable: true, openAccount })).toBe(false); // put off
  });
});
