// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { CHARACTER_MODELS, MONSTER_MODELS } from '../../js/game/modelcatalog.js';
import { findClipName, resolveClipName, baseClipName } from '../../js/game/charactermodel.js';
import { AVATARS, SHOP_ITEMS } from '../../js/game/shopdata.js';

function clipNames(file) {
  const buf = readFileSync('public/models/' + file);
  expect(buf.subarray(0, 4).toString()).toBe('glTF');
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  expect((json.skins || []).length).toBeGreaterThan(0); // rigged
  return (json.animations || []).map((a) => a.name);
}

describe('animated model catalog', () => {
  it('has unique ids and a shop entry for every model', () => {
    const ids = [...CHARACTER_MODELS, ...MONSTER_MODELS].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(SHOP_ITEMS.some((i) => i.id === id), id).toBe(true));
    CHARACTER_MODELS.forEach((m) => expect(AVATARS.some((a) => a.id === m.id && a.isModel), m.id).toBe(true));
  });

  it('keeps the blocky Intern as a free classic option', () => {
    const classic = AVATARS.find((a) => a.id === 'avatar_classic');
    expect(classic).toBeTruthy();
    expect(classic.isModel).toBeFalsy();
    expect(SHOP_ITEMS.find((i) => i.id === 'avatar_classic').price).toBe(0);
    expect(AVATARS.find((a) => a.id === 'avatar_intern').isModel).toBe(true);
  });

  CHARACTER_MODELS.forEach((m) => {
    it(`character ${m.name}: file exists and can run, idle and die`, () => {
      expect(existsSync('public/models/' + m.file)).toBe(true);
      const names = clipNames(m.file);
      ['run', 'idle', 'death'].forEach((state) => {
        expect(findClipName(names, state), `${m.file} ${state}`).toBeTruthy();
      });
      // Every state the game asks for (jump, slide, intro wave, celebration) still animates via a fallback
      ['run', 'jump', 'slide', 'celebrate', 'death', 'idle', 'wave'].forEach((state) => {
        expect(resolveClipName(names, state), `${m.file} ${state}`).toBeTruthy();
      });
    });
  });

  MONSTER_MODELS.forEach((m) => {
    it(`monster ${m.name}: file exists and can idle/stalk and attack`, () => {
      expect(existsSync('public/models/' + m.file)).toBe(true);
      const names = clipNames(m.file);
      expect(resolveClipName(names, m.flying ? 'idle' : 'run')).toBeTruthy();
      expect(findClipName(names, 'attack'), `${m.file} attack`).toBeTruthy();
    });
  });

  it('matches clip names across pack conventions', () => {
    expect(baseClipName('RobotArmature|Robot_Running')).toBe('Running');
    expect(baseClipName('CharacterArmature|Idle_Gun')).toBe('Idle_Gun');
    expect(findClipName(['CharacterArmature|Run_Back', 'CharacterArmature|Run'], 'run')).toBe('CharacterArmature|Run');
    expect(findClipName(['CharacterArmature|Jump_Idle', 'CharacterArmature|Jump'], 'jump')).toBe('CharacterArmature|Jump');
    // A state with no clip falls back rather than freezing
    expect(resolveClipName(['DragonArmature|Dragon_Flying'], 'idle').clip).toBe('DragonArmature|Dragon_Flying');
  });
});
