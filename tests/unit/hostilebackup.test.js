import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../../js/storage.js';

function backup(data) { return JSON.stringify({ app: 'buzzword-dash', data: Object.assign({ schemaVersion: storage.data.schemaVersion }, data) }); }

describe('hostile or damaged backups cannot break the app', () => {
  beforeEach(() => { localStorage.clear(); storage.load(); });

  const cases = {
    'wrong types everywhere': { progression: { ownedItems: 'x', equipped: null, coins: 'lots' }, settings: 5, cards: [], history: 'no' },
    'null sections': { progression: null, settings: null, profile: null },
    'proto pollution': JSON.parse('{"__proto__":{"polluted":1},"progression":{"__proto__":{"polluted2":1}}}'),
    'huge numbers': { progression: { coins: 1e308, xp: -5 } },
  };

  Object.keys(cases).forEach((name) => {
    it('survives: ' + name, () => {
      expect(() => { storage.importBackup(backup(cases[name])); }).not.toThrow();
      expect({}.polluted).toBeUndefined();
      expect({}.polluted2).toBeUndefined();
      const d = storage.data;
      expect(Array.isArray(d.progression.ownedItems)).toBe(true);
      expect(d.progression.equipped && typeof d.progression.equipped).toBe('object');
      expect(typeof d.settings).toBe('object');
      expect(Number.isFinite(d.progression.coins)).toBe(true);
      expect(d.progression.coins).toBeGreaterThanOrEqual(0);
    });
  });
});
