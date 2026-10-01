import { describe, it, expect } from 'vitest';
import { SKIN_MUSIC } from '../../js/audio.js';
import { SKINS } from '../../js/game/skins.js';

describe('every map has its own music', () => {
  it('has a track for every map', () => {
    SKINS.forEach((s) => expect(SKIN_MUSIC[s.name], s.name).toBeTruthy());
  });

  it('no two maps share a track', () => {
    const sig = (m) => JSON.stringify([m.bpm, m.key, m.scale, m.bassPattern, m.melodyPattern]);
    const seen = {};
    SKINS.forEach((s) => {
      const k = sig(SKIN_MUSIC[s.name]);
      expect(seen[k], s.name + ' sounds the same as ' + seen[k]).toBeUndefined();
      seen[k] = s.name;
    });
    expect(Object.keys(seen).length).toBe(SKINS.length);
  });

  it('every track is well formed', () => {
    SKINS.forEach((s) => {
      const m = SKIN_MUSIC[s.name];
      expect(m.bassPattern, s.name).toHaveLength(16);
      expect(m.melodyPattern, s.name).toHaveLength(16);
      ['kick', 'snare', 'hat'].forEach((d) => expect(m.drumPattern[d], s.name + ' ' + d).toHaveLength(16));
      expect(m.bpm).toBeGreaterThan(60);
    });
  });
});
