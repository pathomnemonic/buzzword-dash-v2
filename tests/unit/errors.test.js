import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRemotePayload, resetRemoteLimits, installGlobalErrorHandlers, requireSupabaseSuccess } from '../../js/errors.js';

describe('remote error payload', () => {
  beforeEach(() => resetRemoteLimits());

  it('keeps only message, trimmed stack and tags', () => {
    const p = buildRemotePayload('boom', 'x'.repeat(5000), { system: 'audio', operation: 'play', metadata: { email: 'a@b.c' } });
    expect(p.message).toBe('boom');
    expect(p.stack.length).toBe(1500);
    expect(p.system).toBe('audio');
    expect(JSON.stringify(p)).not.toContain('a@b.c');
  });

  it('drops duplicates and caps the number of reports', () => {
    expect(buildRemotePayload('same', '', {})).not.toBeNull();
    expect(buildRemotePayload('same', '', {})).toBeNull();
    let sent = 0;
    for (let i = 0; i < 30; i++) if (buildRemotePayload('e' + i, '', {})) sent++;
    expect(sent).toBeLessThan(10);
  });
});

describe('installGlobalErrorHandlers', () => {
  it('routes window errors and rejections to the console reporter', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listeners = {};
    installGlobalErrorHandlers({ addEventListener: (t, fn) => { listeners[t] = fn; } });
    listeners.error({ error: new Error('uncaught') });
    listeners.unhandledrejection({ reason: new Error('rejected') });
    const out = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('uncaught');
    expect(out).toContain('rejected');
    spy.mockRestore();
  });
});

describe('requireSupabaseSuccess', () => {
  it('throws on a resolved error and returns data otherwise', async () => {
    await expect(requireSupabaseSuccess(Promise.resolve({ error: { message: 'denied' } }))).rejects.toThrow('denied');
    await expect(requireSupabaseSuccess(Promise.resolve({ data: 5 }))).resolves.toBe(5);
  });
});
