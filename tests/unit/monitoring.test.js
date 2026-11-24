import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { scrubUrl, cleanSentryEvent, cleanPosthogEvent, APP_TAG, SENTRY_DSN, POSTHOG_KEY } from '../../js/monitoring.js';
import { buildCsp } from '../../tools/csp.mjs';

describe('the optional crash and page-view services', () => {
  it('strip the part of an address that can carry a name or scores', () => {
    expect(scrubUrl('https://pathomnemonic.github.io/buzzword-dash-v2/?x=1#c=eyJuYW1lIjoiQWxpY2UifQ')).toBe('https://pathomnemonic.github.io/buzzword-dash-v2/');
    expect(scrubUrl('not a url')).toBeTypeOf('string');
  });
  it('Sentry events drop users, breadcrumbs and the address query, carry app=dx-dash, and vanish when reports are off', () => {
    const ev = { user: { id: 'u' }, breadcrumbs: [{ message: 'x' }], request: { url: 'https://h.io/p?q=1#frag', headers: { a: 'b' } }, tags: { system: 'audio' } };
    const out = cleanSentryEvent(JSON.parse(JSON.stringify(ev)), () => true);
    expect(out.user).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.request).toEqual({ url: 'https://h.io/p' });
    expect(out.tags).toEqual({ system: 'audio', app: APP_TAG, platform: 'web' });
    expect(cleanSentryEvent(ev, () => false)).toBeNull();
  });
  it('PostHog events always carry app=dx-dash, never a hash, and vanish when consent is withdrawn', () => {
    const cp = { event: '$pageview', properties: { $current_url: 'https://h.io/a/?z=1#c=secret', screen: 'screenStats' } };
    const out = cleanPosthogEvent(cp, () => true);
    expect(out.properties.app).toBe('dx-dash');
    expect(out.properties.$current_url).toBe('https://h.io/a/#screenStats');
    expect(cleanPosthogEvent({ event: 'x', properties: {} }, () => false)).toBeNull();
  });
  it('the keys are the ones given, and the policy lets the two services in', () => {
    expect(SENTRY_DSN).toContain('ingest.us.sentry.io');
    expect(POSTHOG_KEY).toMatch(/^phc_/);
    const csp = buildCsp({});
    expect(csp).toContain('https://o4512486931169280.ingest.us.sentry.io');
    expect(csp).toContain('https://us.i.posthog.com');
  });
  it('main.js starts them only in a production build that is not the capture build', () => {
    const main = fs.readFileSync('js/main.js', 'utf8');
    expect(main).toMatch(/import\.meta\.env\.PROD && import\.meta\.env\.VITE_FEATURE_CAPTURE !== '1'\) import\('\.\/monitoring\.js'\)/);
    expect(main).not.toMatch(/^import .* from '\.\/monitoring\.js'/m);
  });
});

describe('the same consent rules inside the iPhone, iPad and Android apps', () => {
  it('main.js starts monitoring in every production build, native or not, and it is the same consent-gated code', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync('js/main.js', 'utf8');
    expect(main).toMatch(/import\.meta\.env\.PROD && import\.meta\.env\.VITE_FEATURE_CAPTURE !== '1'\) import\('\.\/monitoring\.js'\)/);
    expect(main).not.toMatch(/isNative\(\)[^\n]*monitoring\.js/);
  });

  it('native events are labelled with their platform and still vanish when consent is off', async () => {
    vi.resetModules();
    vi.doMock('../../js/native.js', async (orig) => ({ ...(await orig()), getNativePlatform: () => 'ios' }));
    const m = await import('../../js/monitoring.js');
    expect(m.cleanSentryEvent({ tags: {} }, () => true).tags).toMatchObject({ app: 'dx-dash', platform: 'ios' });
    expect(m.cleanPosthogEvent({ properties: {} }, () => true).properties).toMatchObject({ app: 'dx-dash', platform: 'ios' });
    expect(m.cleanSentryEvent({ tags: {} }, () => false)).toBeNull();
    expect(m.cleanPosthogEvent({ properties: {} }, () => false)).toBeNull();
    vi.doUnmock('../../js/native.js');
  });
});
