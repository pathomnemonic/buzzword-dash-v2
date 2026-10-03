import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../js/native.js', async (orig) => {
  const real = await orig();
  return { ...real, getNativePlatform: () => 'ios', isNative: () => true };
});
vi.mock('../../js/review.js', async (orig) => {
  const real = await orig();
  return { ...real, canRate: () => true, rateTheApp: vi.fn(() => Promise.resolve({ how: 'in-app' })), storeLinks: () => ['https://apps.apple.com/app/id123'] };
});

import { attachPromptCard } from '../../js/promptui.js';
import { rateTheApp } from '../../js/review.js';

const DAY = 24 * 60 * 60 * 1000;

describe('the rating ask on iPhone', () => {
  let container; let deps;
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c');
    const data = { runsFinished: 30, firstRunAt: Date.now() - 20 * DAY, promptState: { kinds: { account: { done: true, count: 1, last: 0 }, share: { done: true, count: 1, last: 0 } } } };
    deps = { container, storage: { get: (k) => data[k], set: (k, v) => { data[k] = v; }, getStreakStatus: () => ({ streak: 5 }) }, run: { correct: 12, accuracy: 95, newBest: true }, signedIn: true, accountsAvailable: true, openAccount: vi.fn(), toast: vi.fn() };
  });

  it('is one plain step: no "are you enjoying?" screening, and a neutral feedback button for everyone', () => {
    expect(attachPromptCard(deps)).toBe('review');
    const text = container.textContent;
    expect(text).not.toMatch(/enjoying/i);
    expect(text).not.toMatch(/not really/i);
    expect(container.textContent).toMatch(/Rate Dx Dash/);
    expect(container.textContent).toMatch(/Send feedback/);
  });

  it('rating goes straight to the system box', async () => {
    attachPromptCard(deps);
    container.querySelector('.btn-gold').click();
    await Promise.resolve();
    expect(rateTheApp).toHaveBeenCalled();
  });
});
