import { describe, it, expect } from 'vitest';
import { parseAuthLink, getAuthRedirectUrl, isNative, APP_SCHEME } from '../../js/native.js';
import { getTipUrl } from '../../js/tips.js';

describe('native app helpers', () => {
  it('is a browser here, so the web behavior is unchanged', () => {
    expect(isNative()).toBe(false);
    expect(getAuthRedirectUrl()).toBe(window.location.origin + window.location.pathname);
  });

  it('reads the session out of an email link that reopens the app', () => {
    const link = parseAuthLink(`${APP_SCHEME}://auth#access_token=abc.def&refresh_token=r1&type=recovery&expires_in=3600`);
    expect(link).toEqual({ accessToken: 'abc.def', refreshToken: 'r1', type: 'recovery', code: '' });
    expect(parseAuthLink(`${APP_SCHEME}://auth?code=xyz`)).toEqual({ accessToken: '', refreshToken: '', type: '', code: 'xyz' });
  });

  it('ignores links that are not ours or carry no session', () => {
    expect(parseAuthLink('https://evil.example/auth#access_token=abc')).toBeNull();
    expect(parseAuthLink(`${APP_SCHEME}://auth`)).toBeNull();
    expect(parseAuthLink(null)).toBeNull();
    expect(parseAuthLink('')).toBeNull();
  });

  it('decodes encoded values in the link', () => {
    const link = parseAuthLink(`${APP_SCHEME}://auth#access_token=a%2Bb&refresh_token=c%3Dd&type=signup`);
    expect(link.accessToken).toBe('a+b');
    expect(link.refreshToken).toBe('c=d');
  });

  it('the tip link still works on the web (it is only hidden inside the store apps)', () => {
    expect(getTipUrl()).toBe(''); // no VITE_TIP_URL in tests: nothing configured
  });
});
