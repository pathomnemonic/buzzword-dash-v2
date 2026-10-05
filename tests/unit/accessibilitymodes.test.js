import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { getRunRules, describeRules, isRankedRun, RELAXED_PACE } from '../../js/rules.js';
import { planPack, formatBytes, canDownloadPack, downloadPack, packStatus } from '../../js/offlinepack.js';

describe('relaxed pace', () => {
  const prefs = { disabledPowerups: [], hazardsOff: false, monsterOff: false, speedRamp: { on: true, every: 20, step: 0.5 } };

  it('is slower than normal, and never lets the run speed up', () => {
    expect(RELAXED_PACE).toBeLessThan(1);
    expect(RELAXED_PACE).toBeGreaterThan(0.4);
    const rules = getRunRules('endless', { ...prefs, relaxedPace: true });
    expect(rules.relaxed).toBe(true);
    expect(rules.speedRamp.on).toBe(false);
  });

  it('keeps coins and progress but is not ranked, and says so', () => {
    const rules = getRunRules('endless', { ...prefs, relaxedPace: true });
    expect(rules.custom).toBe(true);
    expect(isRankedRun({ custom: rules.custom })).toBe(false);
    expect(describeRules(rules)).toBe('relaxed pace');
  });

  it('is ignored in modes that compare players', () => {
    const rules = getRunRules('daily', { ...prefs, relaxedPace: true });
    expect(rules.relaxed).toBe(false);
    expect(rules.custom).toBe(false);
  });

  it('is off by default, so the standard run stays ranked', () => {
    expect(getRunRules('endless', prefs).custom).toBe(false);
  });
});

describe('dyslexia font and button side', () => {
  const css = readFileSync('css/arcade.css', 'utf8');

  it('ships the font files with their license', () => {
    ['opendyslexic-latin-400-normal.woff2', 'opendyslexic-latin-700-normal.woff2', 'OpenDyslexic-LICENSE.txt'].forEach((f) => {
      expect(readFileSync('css/fonts/' + f).length).toBeGreaterThan(1000);
    });
    expect(readFileSync('css/fonts/OpenDyslexic-LICENSE.txt', 'utf8')).toMatch(/SIL Open Font License/);
    expect(css).toMatch(/@font-face[^}]*OpenDyslexic/);
  });

  it('the body classes set by the settings have matching styles', () => {
    expect(css).toMatch(/body\.dyslexia/);
    expect(css).toMatch(/body\.lefty \.dash-btn/);
    expect(css).toMatch(/body\.lefty \.auto-btn/);
  });

  describe('applied from the settings', () => {
    let ui; let storage;
    beforeEach(async () => {
      localStorage.clear();
      document.body.className = '';
      ({ ui } = await import('../../js/ui.js'));
      ({ storage } = await import('../../js/storage.js'));
      storage.load();
    });
    it('turns the classes on and off', () => {
      ui.applySettings();
      expect(document.body.classList.contains('dyslexia')).toBe(false);
      expect(document.body.classList.contains('lefty')).toBe(false);
      storage.set('dyslexiaFont', true);
      storage.set('handedness', 'left');
      ui.applySettings();
      expect(document.body.classList.contains('dyslexia')).toBe(true);
      expect(document.body.classList.contains('lefty')).toBe(true);
      storage.set('handedness', 'right');
      ui.applySettings();
      expect(document.body.classList.contains('lefty')).toBe(false);
    });
    it('the settings are kept across a reload', () => {
      storage.set('dyslexiaFont', true);
      storage.set('handedness', 'left');
      storage.set('relaxedPace', true);
      storage.save && storage.save();
      storage.load();
      expect(storage.get('dyslexiaFont')).toBe(true);
      expect(storage.get('handedness')).toBe('left');
      expect(storage.get('relaxedPace')).toBe(true);
    });
  });
});

describe('offline pack', () => {
  const manifest = { files: [{ url: 'assets/a.js', size: 2048 }, { url: 'models/x.glb', size: 1048576 }, { url: '', size: 5 }, null] };

  it('plans the files from the manifest and ignores damaged entries', () => {
    const plan = planPack(manifest);
    expect(plan.urls).toEqual(['assets/a.js', 'models/x.glb']);
    expect(plan.bytes).toBe(2048 + 1048576);
    expect(planPack(null).urls).toEqual([]);
  });

  it('formats sizes and status for people', () => {
    expect(formatBytes(1572864)).toBe('1.5 MB');
    expect(formatBytes(20000)).toBe('20 KB');
    expect(packStatus(0)).toMatch(/Not downloaded/);
    expect(packStatus(Date.now())).toMatch(/today/);
    expect(packStatus(Date.now() - 3 * 86400000)).toMatch(/3 days ago/);
  });

  it('is only offered where a service worker is in charge (not in the phone apps)', () => {
    expect(canDownloadPack({ isNative: true, navigator: { serviceWorker: { controller: {} } } })).toBe(false);
    expect(canDownloadPack({ isNative: false, navigator: { serviceWorker: { controller: null } } })).toBe(false);
    expect(canDownloadPack({ isNative: false, navigator: { serviceWorker: { controller: {} } } })).toBe(true);
  });

  it('downloads every file, reports progress, and remembers when it finished', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const asked = [];
    const fetcher = (url) => {
      asked.push(url);
      if (url === 'offline-manifest.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) });
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) });
    };
    const progress = [];
    let cardsLoaded = false;
    const res = await downloadPack({ fetch: fetcher, now: () => 12345, loadCards: () => { cardsLoaded = true; return Promise.resolve(); }, onProgress: (d, t) => progress.push([d, t]) });
    expect(res.ok).toBe(true);
    expect(cardsLoaded).toBe(true);
    expect(asked).toEqual(expect.arrayContaining(['assets/a.js', 'models/x.glb']));
    expect(progress[progress.length - 1]).toEqual([2, 2]);
    expect(storage.get('offlinePackAt')).toBe(12345);
  });

  it('a file that fails to download means it is not marked as saved', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const fetcher = (url) => {
      if (url === 'offline-manifest.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) });
      return url.startsWith('models') ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) });
    };
    const res = await downloadPack({ fetch: fetcher, now: () => 999 });
    expect(res.ok).toBe(false);
    expect(res.failed).toBe(1);
    expect(storage.get('offlinePackAt')).toBe(0);
  });

  it('no manifest (the dev server) fails kindly instead of throwing', async () => {
    const res = await downloadPack({ fetch: () => Promise.resolve({ ok: false }) });
    expect(res.ok).toBe(false);
  });
});
