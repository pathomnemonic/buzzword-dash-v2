import { describe, it, expect } from 'vitest';
import { isValidTipUrl, isReservedTipUrl, getTipUrl } from '../../js/tips.js';
import { TIP_PAYMENT_URL } from '../../js/tipconfig.js';
import fs from 'node:fs';

describe('tip link', () => {
  it('accepts only https URLs', () => {
    expect(isValidTipUrl('https://buy.stripe.com/abc123')).toBe(true);
    expect(isValidTipUrl('http://buy.stripe.com/abc123')).toBe(false);
    expect(isValidTipUrl('javascript:alert(1)')).toBe(false);
    expect(isValidTipUrl('https://localhost')).toBe(false);
    expect(isValidTipUrl('')).toBe(false);
    expect(isValidTipUrl(null)).toBe(false);
  });

  it('refuses the reserved Ko-fi page: it belongs to another app\'s tips', () => {
    expect(isReservedTipUrl('https://ko-fi.com/pathomnemonic')).toBe(true);
    expect(isReservedTipUrl('https://KO-FI.com/anyone')).toBe(true);
    expect(isReservedTipUrl('https://buy.stripe.com/abc')).toBe(false);
    expect(isValidTipUrl('https://ko-fi.com/pathomnemonic')).toBe(false);
  });

  it('shows nothing until the one config constant is set, and the constant is never the Ko-fi page', () => {
    expect(typeof TIP_PAYMENT_URL).toBe('string');
    expect(isReservedTipUrl(TIP_PAYMENT_URL)).toBe(false);
    expect(getTipUrl() === '' || /^https:\/\/buy\.stripe\.com\//.test(getTipUrl())).toBe(true);
  });

  it('no source file points at the Ko-fi page or reads a tip env variable', () => {
    for (const f of ['js/tips.js', 'js/tipconfig.js', 'js/uisettings.js', 'js/main.js', '.github/workflows/deploy.yml']) {
      const t = fs.readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/ko-fi\.com\/[a-z]/i);
      expect(t, f).not.toMatch(/VITE_TIP_URL/);
    }
  });

  it('there is no post-run tip prompt any more', () => {
    const main = fs.readFileSync('js/main.js', 'utf8');
    expect(main).not.toMatch(/shouldShowTipPrompt|Leave a tip/);
  });
});
