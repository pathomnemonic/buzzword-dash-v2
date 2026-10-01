import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AVATARS, SHOP_ITEMS } from '../../js/game/shopdata.js';
import { addHairStyle } from '../../js/game/player.js';

const doctors = AVATARS.filter((a) => /^avatar_dr_/.test(a.id));

describe('women doctors in the roster', () => {
  it('has several, each with a name, a specialty and a shop entry', () => {
    expect(doctors.length).toBeGreaterThanOrEqual(6);
    doctors.forEach((a) => {
      expect(a.name).toMatch(/^Dr\. /);
      expect(a.desc.length).toBeGreaterThan(10);
      expect(a.icon).toBeTruthy();
      expect(SHOP_ITEMS.some((i) => i.id === a.id && i.type === 'skin' && i.price === a.price), a.id).toBe(true);
    });
  });

  it('are different from each other: hairstyle, skin tone and outfit', () => {
    const styles = new Set(doctors.map((a) => a.hairStyle));
    expect(styles.size).toBeGreaterThanOrEqual(5);
    const skins = new Set(doctors.map((a) => a.skinColor));
    expect(skins.size).toBe(doctors.length);
    const outfits = new Set(doctors.map((a) => a.bodyColor + '/' + a.pantsColor));
    expect(outfits.size).toBe(doctors.length);
    // a spread of skin tones, light to deep
    const lum = (hex) => ((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11;
    expect(Math.max(...doctors.map((a) => lum(a.skinColor))) - Math.min(...doctors.map((a) => lum(a.skinColor)))).toBeGreaterThan(80);
  });

  it('every hairstyle draws something, and the plain one draws nothing extra', () => {
    ['ponytail', 'bun', 'bob', 'long', 'braids', 'puffs'].forEach((style) => {
      const g = new THREE.Group();
      addHairStyle(g, { hairStyle: style, hairColor: 0x222222 }, 0.38, 1);
      expect(g.children.length, style).toBeGreaterThan(0);
      g.children.forEach((m) => expect(m.isMesh).toBe(true));
    });
    const plain = new THREE.Group();
    addHairStyle(plain, { hairColor: 0x222222 }, 0.38, 1);
    addHairStyle(plain, { hairStyle: 'short', hairColor: 0x222222 }, 0.38, 1);
    expect(plain.children.length).toBe(0);
  });

  it('hair stays on the head: nothing sticks out below the shoulders or far to the sides', () => {
    ['ponytail', 'bun', 'bob', 'long', 'braids', 'puffs'].forEach((style) => {
      const g = new THREE.Group();
      addHairStyle(g, { hairStyle: style, hairColor: 0x222222 }, 0.38, 1);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.min.y, style).toBeGreaterThan(0.85);  // above the waist
      expect(box.max.y, style).toBeLessThan(2.5);
      expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), style).toBeLessThan(0.7);
    });
  });
});
