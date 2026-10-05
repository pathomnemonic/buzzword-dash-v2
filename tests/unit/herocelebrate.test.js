import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { HERO_CELEBRATE, heroKeyFor, resolveClipName } from '../../js/game/clipnames.js';
import { CHARACTER_MODELS } from '../../js/game/modelcatalog.js';

function clipsOf(file) {
  const b = readFileSync('public/models/characters/' + file + '.glb');
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  return (json.animations || []).map((a) => a.name);
}

describe('each hero celebrates in its own way', () => {
  it('finds the model file from a catalog path', () => {
    expect(heroKeyFor('characters/king.glb')).toBe('king');
    expect(heroKeyFor('/base/models/characters/Ninja.glb?v=2')).toBe('ninja');
    expect(heroKeyFor('')).toBe('');
  });

  it('every signature belongs to a real hero and finds a real clip in its model', () => {
    const files = readdirSync('public/models/characters').map((f) => f.replace('.glb', ''));
    Object.keys(HERO_CELEBRATE).forEach((key) => {
      expect(files, key).toContain(key);
      const r = resolveClipName(clipsOf(key), 'celebrate', key);
      expect(r.state, key).toBe('celebrate');
      expect(HERO_CELEBRATE[key].some((re) => re.test(r.clip.split('|').pop())), key).toBe(true);
    });
  });

  it('a hero with no signature keeps the generic one (wave, dance, cheer or clapping)', () => {
    expect(resolveClipName(clipsOf('nurse'), 'celebrate', 'nurse').clip).toMatch(/wave/i);
    expect(resolveClipName(clipsOf('wizard'), 'celebrate', 'wizard').clip).toMatch(/dance/i);
    expect(resolveClipName(clipsOf('scout'), 'celebrate', 'scout').clip).toMatch(/cheer/i);
  });

  it('the heroes that used to have no celebration now do one', () => {
    ['explorer', 'skeleton', 'zombie'].forEach((key) => {
      expect(resolveClipName(clipsOf(key), 'celebrate', key).state, key).toBe('celebrate');
    });
  });

  it('every hero in the catalog has a celebration of some kind', () => {
    CHARACTER_MODELS.forEach((m) => {
      if (!m.file) return;
      const key = heroKeyFor(m.file);
      const r = resolveClipName(clipsOf(key), 'celebrate', key);
      expect(r && r.state, m.name).toBe('celebrate');
    });
  });
});
