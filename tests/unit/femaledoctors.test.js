import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { existsSync } from 'node:fs';
import { AVATARS, SHOP_ITEMS } from '../../js/game/shopdata.js';
import { CHARACTER_MODELS, RETIRED_CHARACTERS, getCharacterParts } from '../../js/game/modelcatalog.js';
import { addHairStyle } from '../../js/game/player.js';
import { findClipName } from '../../js/game/clipnames.js';

describe('women in the 3D roster, at the same quality as the men', () => {
  it('has a physician (Dr. Dash) and the Scout as full 3D characters', () => {
    const nova = AVATARS.find((a) => a.id === 'avatar_m_nurse');
    expect(nova.name).toBe('Dr. Dash');
    expect(nova.isModel).toBe(true);
    expect(nova.desc).toMatch(/medicine/i);
    const scout = AVATARS.find((a) => a.id === 'avatar_m_scout');
    expect(scout.isModel).toBe(true);
    expect(existsSync('public/models/' + CHARACTER_MODELS.find((m) => m.id === 'avatar_m_scout').file)).toBe(true);
    expect(SHOP_ITEMS.some((i) => i.id === 'avatar_m_scout')).toBe(true);
  });

  it('does not use the lower-quality Classic women doctors any more', () => {
    ['maya', 'lin', 'amara', 'sofia', 'zuri', 'priya'].forEach((n) => {
      expect(AVATARS.some((a) => a.id === 'avatar_dr_' + n)).toBe(false);
      expect(RETIRED_CHARACTERS['avatar_dr_' + n].to).toBe('avatar_m_nurse');
    });
  });

  it('the medical characters get the same skin tone choices, and hair color where they have hair', () => {
    ['avatar_intern', 'avatar_m_nurse', 'avatar_m_paramedic'].forEach((id) => {
      const skin = getCharacterParts(id).find((p) => p.key === 'skin');
      expect(skin, id + ' skin').toBeTruthy();
      expect(skin.palette.length).toBeGreaterThanOrEqual(6);
    });
    ['avatar_intern', 'avatar_m_nurse'].forEach((id) => expect(getCharacterParts(id).some((p) => p.key === 'hair'), id).toBe(true));
    // both doctors offer exactly the same skin tones
    const tones = (id) => JSON.stringify(getCharacterParts(id).find((p) => p.key === 'skin').palette);
    expect(tones('avatar_intern')).toBe(tones('avatar_m_nurse'));
  });

  it('the Scout\'s animation clip names are understood by the game', () => {
    const clips = ['Running_A', 'Jump_Full_Short', 'Dodge_Forward', 'Cheer', 'Death_A', 'Idle'];
    expect(findClipName(clips, 'run')).toBe('Running_A');
    expect(findClipName(clips, 'jump')).toBe('Jump_Full_Short');
    expect(findClipName(clips, 'slide')).toBe('Dodge_Forward');
    expect(findClipName(clips, 'death')).toBe('Death_A');
    expect(findClipName(clips, 'idle')).toBe('Idle');
    expect(findClipName(clips, 'celebrate')).toBe('Cheer');
  });

  it('hairstyles still work for the Classic characters that use them', () => {
    ['ponytail', 'bun', 'bob', 'long', 'braids', 'puffs'].forEach((style) => {
      const g = new THREE.Group();
      addHairStyle(g, { hairStyle: style, hairColor: 0x222222 }, 0.38, 1);
      expect(g.children.length, style).toBeGreaterThan(0);
    });
  });
});
