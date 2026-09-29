import { describe, it, expect } from 'vitest';
import { isValidTipUrl, shouldShowTipPrompt, getTipUrl } from '../../js/tips.js';

const DAY = 24 * 60 * 60 * 1000;
const base = {
  tipUrl: 'https://ko-fi.com/example',
  optedOut: false,
  totalRuns: 10,
  lastPromptAt: 0,
  now: 1_000_000_000_000,
  correct: 12,
  accuracy: 80
};

describe('tip link', () => {
  it('accepts only https URLs', () => {
    expect(isValidTipUrl('https://ko-fi.com/me')).toBe(true);
    expect(isValidTipUrl('http://ko-fi.com/me')).toBe(false);
    expect(isValidTipUrl('javascript:alert(1)')).toBe(false);
    expect(isValidTipUrl('https://localhost')).toBe(false);
    expect(isValidTipUrl('')).toBe(false);
    expect(isValidTipUrl(null)).toBe(false);
  });

  it('shows nothing when no tip page is configured', () => {
    expect(getTipUrl()).toBe('');
    expect(shouldShowTipPrompt({ ...base, tipUrl: '' })).toBe(false);
  });
});

describe('when the tip note appears', () => {
  it('appears after a good run once the player is established', () => {
    expect(shouldShowTipPrompt(base)).toBe(true);
  });

  it('stays quiet for new players, bad runs, opt-outs and recent prompts', () => {
    expect(shouldShowTipPrompt({ ...base, totalRuns: 2 })).toBe(false);
    expect(shouldShowTipPrompt({ ...base, correct: 2 })).toBe(false);
    expect(shouldShowTipPrompt({ ...base, accuracy: 40 })).toBe(false);
    expect(shouldShowTipPrompt({ ...base, optedOut: true })).toBe(false);
    expect(shouldShowTipPrompt({ ...base, lastPromptAt: base.now - 2 * DAY })).toBe(false);
  });

  it('comes back after the weekly cooldown', () => {
    expect(shouldShowTipPrompt({ ...base, lastPromptAt: base.now - 8 * DAY })).toBe(true);
  });
});
