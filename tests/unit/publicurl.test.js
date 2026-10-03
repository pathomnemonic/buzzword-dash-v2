import { describe, it, expect } from 'vitest';
import { publicUrl, isPrivateHost, DEFAULT_PUBLIC_URL } from '../../js/publicurl.js';
import { buildChallengeUrl } from '../../js/challenge.js';

describe('links sent to friends', () => {
  it('never point at this device or a home network', () => {
    ['localhost', '127.0.0.1', '192.168.1.20', '10.0.0.5', '172.20.1.1', 'dx.local', ''].forEach((h) => expect(isPrivateHost(h), h).toBe(true));
    ['pathomnemonic.github.io', 'example.com', '8.8.8.8', '172.40.0.1'].forEach((h) => expect(isPrivateHost(h), h).toBe(false));
  });

  it('inside the phone app (https://localhost) the link is the real website', () => {
    const loc = { protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', pathname: '/' };
    expect(publicUrl(loc, '')).toBe(DEFAULT_PUBLIC_URL);
    expect(DEFAULT_PUBLIC_URL).toMatch(/^https:\/\/pathomnemonic\.github\.io\//);
  });

  it('on the website it is the page being used, without any #hash', () => {
    const loc = { protocol: 'https:', hostname: 'pathomnemonic.github.io', origin: 'https://pathomnemonic.github.io', pathname: '/buzzword-dash-v2/' };
    expect(publicUrl(loc, '')).toBe('https://pathomnemonic.github.io/buzzword-dash-v2/');
  });

  it('a file or a non-web page falls back to the website, and a build can override it', () => {
    expect(publicUrl({ protocol: 'file:', hostname: '', origin: 'null', pathname: '/x' }, '')).toBe(DEFAULT_PUBLIC_URL);
    expect(publicUrl({ protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', pathname: '/' }, 'https://dxdash.app/#x')).toBe('https://dxdash.app/');
    expect(publicUrl({ protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', pathname: '/' }, 'http://insecure.test/')).toBe(DEFAULT_PUBLIC_URL); // only https overrides
  });

  it('a challenge link built from it opens the website, not localhost', () => {
    const url = buildChallengeUrl(publicUrl({ protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', pathname: '/' }, ''), { seed: 5, n: 15, from: 'Ada', score: 100, hash: 'a' });
    expect(url).toMatch(/^https:\/\/pathomnemonic\.github\.io\/buzzword-dash-v2\/#c=/);
    expect(url).not.toContain('localhost');
  });
});
