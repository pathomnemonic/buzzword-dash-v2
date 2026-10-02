import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isBatteryLow, watchBattery, isLowBattery, setLowBatteryForTest } from '../../js/battery.js';
import { isOnline, watchConnection, OFFLINE_NOTICE, BACK_ONLINE_NOTICE } from '../../js/offline.js';
import { reportError, reportPerformance, setDiagnosticsSink, resetRemoteLimits } from '../../js/errors.js';
import { getQuality } from '../../js/game/quality.js';
import { storage } from '../../js/storage.js';

describe('low battery', () => {
  beforeEach(() => { localStorage.clear(); storage.data = null; storage.load(); setLowBatteryForTest(false); });

  it('is low at 20% or less and not charging', () => {
    expect(isBatteryLow(0.2, false)).toBe(true);
    expect(isBatteryLow(0.5, false)).toBe(false);
    expect(isBatteryLow(0.1, true)).toBe(false);
    expect(isBatteryLow(undefined, false)).toBe(false);
  });

  it('follows the battery as it changes', async () => {
    const listeners = {};
    const battery = { level: 0.15, charging: false, addEventListener: (e, f) => { listeners[e] = f; } };
    expect(await watchBattery({ getBattery: () => Promise.resolve(battery) })).toBe(true);
    expect(isLowBattery()).toBe(true);
    battery.charging = true; listeners.chargingchange();
    expect(isLowBattery()).toBe(false);
    expect(await watchBattery({})).toBe(false); // not supported: nothing changes
  });

  it('steps Auto graphics down a tier, but never overrides a level picked by hand', () => {
    storage.set('quality', 'high');
    setLowBatteryForTest(true);
    expect(getQuality()).toBe('high');
    storage.set('quality', 'auto');
    const normal = (setLowBatteryForTest(false), getQuality());
    setLowBatteryForTest(true);
    expect(['low', 'medium', 'high'].indexOf(getQuality())).toBeLessThanOrEqual(['low', 'medium', 'high'].indexOf(normal));
    if (normal !== 'low') expect(getQuality()).not.toBe(normal);
  });
});

describe('offline', () => {
  it('knows the connection state and announces changes', () => {
    expect(isOnline({ onLine: false })).toBe(false);
    expect(isOnline({ onLine: true })).toBe(true);
    const notes = [];
    const stop = watchConnection((m) => notes.push(m), window);
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(notes).toEqual([OFFLINE_NOTICE, BACK_ONLINE_NOTICE]);
    stop();
    window.dispatchEvent(new Event('offline'));
    expect(notes).toHaveLength(2);
  });
});

describe('opt-in reports', () => {
  beforeEach(() => { resetRemoteLimits(); setDiagnosticsSink(null); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('sends nothing until a sink is set, then a short report with no stack or account data', () => {
    reportError(new Error('first'), { system: 'audio', operation: 'play' }); // nobody is listening
    const got = [];
    setDiagnosticsSink((r) => got.push(r));
    reportError(new Error('boom'), { system: 'audio', operation: 'play', metadata: { secret: 'x' } });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: 'error', message: 'boom', system: 'audio', operation: 'play' });
    expect(Object.keys(got[0]).sort()).toEqual(['kind', 'message', 'operation', 'system', 'version']);
    reportError(new Error('boom'), { system: 'audio', operation: 'play' }); // the same report is not sent twice
    expect(got).toHaveLength(1);
  });

  it('reports slow frames once per graphics level', () => {
    const got = [];
    setDiagnosticsSink((r) => got.push(r));
    reportPerformance({ tier: 'medium' });
    reportPerformance({ tier: 'medium' });
    reportPerformance({ tier: 'low' });
    expect(got.map((r) => r.tier)).toEqual(['medium', 'low']);
    expect(got[0].kind).toBe('perf');
  });
});
