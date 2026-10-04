import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizeConfig, loadRemoteConfig, applyKillSwitch, isKilled, setKilledForTest, KILLABLE } from '../../js/remoteconfig.js';

const store = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; };
beforeEach(() => setKilledForTest([]));

describe('remote kill switch', () => {
  it('keeps only known names and survives any shape of file', () => {
    expect(sanitizeConfig({ killed: ['hazards', 'bogus', 5, 'monster'] }).killed).toEqual(['hazards', 'monster']);
    [null, undefined, 3, 'x', [], {}, { killed: 'hazards' }, { killed: null }].forEach((bad) => expect(sanitizeConfig(bad).killed).toEqual([]));
  });

  it('turns mechanics off in the run rules without making the run custom', () => {
    setKilledForTest(['hazards', 'monster', 'powerups', 'mapChanges', 'rush']);
    const rules = { disabledPowerups: [], hazardsOff: false, monsterOff: false, custom: false };
    const out = applyKillSwitch(rules, ['shield', 'magnet']);
    expect(rules).toMatchObject({ hazardsOff: true, monsterOff: true, disabledPowerups: ['shield', 'magnet'], custom: false });
    expect(out).toEqual({ mapsPinned: true, rushOff: true });
  });

  it('does nothing when nothing is killed', () => {
    const rules = { disabledPowerups: [], hazardsOff: false, monsterOff: false };
    expect(applyKillSwitch(rules, ['shield'])).toEqual({ mapsPinned: false, rushOff: false });
    expect(rules.hazardsOff).toBe(false);
  });

  it('fetches, applies and remembers the file; the saved copy is used if the network fails', async () => {
    const s = store();
    const ok = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ killed: ['hazards'] }) }));
    expect(await loadRemoteConfig({ fetchFn: ok, store: s })).toEqual(['hazards']);
    expect(isKilled('hazards')).toBe(true);
    setKilledForTest([]);
    const down = vi.fn(() => Promise.reject(new Error('offline')));
    expect(await loadRemoteConfig({ fetchFn: down, store: s })).toEqual(['hazards']);
    const bad = vi.fn(() => Promise.resolve({ ok: false }));
    expect(await loadRemoteConfig({ fetchFn: bad, store: s })).toEqual(['hazards']);
  });

  it('a file that says nothing is killed switches a mechanic back on', async () => {
    const s = store();
    await loadRemoteConfig({ fetchFn: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ killed: ['monster'] }) }), store: s });
    await loadRemoteConfig({ fetchFn: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ killed: [] }) }), store: s });
    expect(isKilled('monster')).toBe(false);
  });

  it('gives up after four seconds on a hung request', async () => {
    vi.useFakeTimers();
    const p = loadRemoteConfig({ fetchFn: () => new Promise(() => {}), store: store() });
    await vi.advanceTimersByTimeAsync(4100);
    expect(await p).toEqual([]);
    vi.useRealTimers();
    expect(KILLABLE).toContain('rush');
  });
});
