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

describe('the rating question: enjoying it? then rate; not enjoying it? then feedback', () => {
  let container;
  let deps;
  beforeEach(async () => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c');
    vi.stubEnv('VITE_REVIEW_URL', 'https://example.com/rate');
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
    // only the rating question is eligible: signed in, accounts on, but nothing to share
    deps = {
      container, storage: fakeStorage({ promptState: { kinds: { account: { off: true }, share: { off: true } } } }),
      run: { correct: 9, accuracy: 90, newBest: true }, signedIn: true, accountsAvailable: true, openAccount: vi.fn(), toast: vi.fn(),
      sendFeedback: vi.fn().mockResolvedValue({ success: true })
    };
  });
  const buttonWith = (re) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent));

  it('first asks whether the player is enjoying the game, and does not go to a store yet', async () => {
    const { attachPromptCard } = await import('../../js/promptui.js');
    expect(attachPromptCard(deps)).toBe('review');
    expect(container.textContent).toMatch(/Are you enjoying Dx Dash\?/);
    expect(buttonWith(/Yes/)).toBeTruthy();
    expect(buttonWith(/Not really/)).toBeTruthy();
  });

  it('"Not really" opens a feedback form (never the store) and sends what the player writes', async () => {
    const { attachPromptCard } = await import('../../js/promptui.js');
    const { setPlatformPluginsForTest } = await import('../../js/platform.js');
    const AppLauncher = { openUrl: vi.fn() };
    setPlatformPluginsForTest({ AppLauncher });
    attachPromptCard(deps);
    buttonWith(/Not really/).click();
    const area = container.querySelector('textarea');
    expect(area).toBeTruthy();
    area.value = 'Too many obstacles';
    buttonWith(/Send feedback/).click();
    await vi.waitFor(() => expect(deps.toast).toHaveBeenCalledWith(expect.stringMatching(/Thank you/)));
    expect(deps.sendFeedback.mock.calls[0][0]).toMatchObject({ mood: 'unhappy', message: 'Too many obstacles' });
    expect(AppLauncher.openUrl).not.toHaveBeenCalled();
    expect(container.querySelector('.prompt-card')).toBeNull();
    setPlatformPluginsForTest(null);
  });

  it('feedback that cannot be sent is not lost: it falls back to copying', async () => {
    const { attachPromptCard } = await import('../../js/promptui.js');
    deps.sendFeedback = vi.fn().mockResolvedValue({ success: false });
    attachPromptCard(deps);
    buttonWith(/Not really/).click();
    container.querySelector('textarea').value = 'Crashes on start';
    buttonWith(/Send feedback/).click();
    await vi.waitFor(() => expect(deps.toast).toHaveBeenCalledWith(expect.stringMatching(/copied/)));
    expect(navigator.clipboard.writeText.mock.calls[0][0]).toContain('Crashes on start');
  });

  it('"Yes" asks whether to rate, and only then goes to the store', async () => {
    const { attachPromptCard } = await import('../../js/promptui.js');
    const { setPlatformPluginsForTest } = await import('../../js/platform.js');
    const AppLauncher = { openUrl: vi.fn().mockResolvedValue({ completed: true }) };
    setPlatformPluginsForTest({ AppLauncher });
    attachPromptCard(deps);
    buttonWith(/Yes/).click();
    expect(container.textContent).toMatch(/Would you rate Dx Dash/);
    expect(AppLauncher.openUrl).not.toHaveBeenCalled();
    buttonWith(/Sure/).click();
    await vi.waitFor(() => expect(AppLauncher.openUrl).toHaveBeenCalledWith({ url: 'https://example.com/rate' }));
    await vi.waitFor(() => expect(container.querySelector('.prompt-card')).toBeNull());
    expect(deps.storage.get('promptState').kinds.review.done).toBe(true);
    setPlatformPluginsForTest(null);
  });

  it('when the store\'s own rating box was requested, the store page stays on offer as a back-up', async () => {
    const { attachPromptCard } = await import('../../js/promptui.js');
    const { setReviewPluginForTest } = await import('../../js/review.js');
    setReviewPluginForTest({ requestReview: vi.fn().mockResolvedValue() });
    attachPromptCard(deps);
    buttonWith(/Yes/).click();
    buttonWith(/Sure/).click();
    await vi.waitFor(() => expect(container.textContent).toMatch(/did not appear/));
    expect(buttonWith(/Open the store page/)).toBeTruthy();
    setReviewPluginForTest(null);
  });
});
