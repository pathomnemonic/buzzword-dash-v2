import { describe, it, expect, vi, afterEach } from 'vitest';
import { compileSafely } from '../../js/game/safecompile.js';

afterEach(() => { vi.useRealTimers(); });

function fakeRenderer(materials, programs) {
  const set = new Set(materials);
  return {
    compile: () => set,
    properties: { get: (m) => programs.get(m) || {} }
  };
}

describe('compileSafely', () => {
  it('resolves once every program reports ready', async () => {
    vi.useFakeTimers();
    const a = {}; const b = {};
    let ready = false;
    const programs = new Map([[a, { currentProgram: { isReady: () => true } }], [b, { currentProgram: { isReady: () => ready } }]]);
    let done = false;
    const p = compileSafely(fakeRenderer([a, b], programs), {}, {}).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(50);
    expect(done).toBe(false);
    ready = true;
    await vi.advanceTimersByTimeAsync(20);
    await p;
    expect(done).toBe(true);
  });

  it('does not throw when a material is disposed while it waits (what three compileAsync does)', async () => {
    vi.useFakeTimers();
    const a = {};
    const programs = new Map([[a, { currentProgram: { isReady: () => false } }]]);
    const renderer = fakeRenderer([a], programs);
    let done = false;
    const p = compileSafely(renderer, {}, {}).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(30);
    programs.delete(a); // the scene is thrown away: properties for the material are gone
    await vi.advanceTimersByTimeAsync(30);
    await p;
    expect(done).toBe(true);
  });

  it('never rejects: a renderer that throws, or returns nothing useful, just resolves', async () => {
    await expect(compileSafely({ compile() { throw new Error('lost context'); } }, {}, {})).resolves.toBeUndefined();
    await expect(compileSafely({ compile: () => undefined, properties: {} }, {}, {})).resolves.toBeUndefined();
    await expect(compileSafely({ compile: () => new Set([{}]), properties: { get() { throw new Error('boom'); } } }, {}, {})).resolves.toBeUndefined();
  });

  it('gives up after a few seconds instead of polling for ever', async () => {
    vi.useFakeTimers();
    const a = {};
    const programs = new Map([[a, { currentProgram: { isReady: () => false } }]]);
    let done = false;
    const p = compileSafely(fakeRenderer([a], programs), {}, {}).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(6000);
    await p;
    expect(done).toBe(true);
  });
});
