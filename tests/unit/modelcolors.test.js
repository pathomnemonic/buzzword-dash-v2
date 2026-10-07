// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { parseCharacterModel, buildModelCharacter } from '../../js/game/charactermodel.js';
import { CHARACTER_MODELS, RETIRED_CHARACTERS, getCharacterParts } from '../../js/game/modelcatalog.js';
import { AVATARS, SHOP_ITEMS } from '../../js/game/shopdata.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = undefined;
globalThis.document = { createElementNS: () => ({ addEventListener(t, f) { if (t === 'load') setTimeout(f, 0); }, removeEventListener() {}, set src(v) {} }) };

const materialNames = (root) => {
  const names = new Set();
  root.traverse((o) => { if (o.isMesh && o.material && o.material.name) names.add(o.material.name); });
  return names;
};

describe('the 3D roster has no repeats', () => {
  it('every character is its own model file', () => {
    const files = CHARACTER_MODELS.map((m) => m.file);
    expect(new Set(files).size).toBe(files.length);
    files.forEach((f) => expect(existsSync('public/models/' + f), f).toBe(true));
  });

  it('no two characters share a name, and the retired ones are gone everywhere', () => {
    const names = CHARACTER_MODELS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    Object.keys(RETIRED_CHARACTERS).forEach((id) => {
      expect(AVATARS.some((a) => a.id === id), id).toBe(false);
      expect(SHOP_ITEMS.some((i) => i.id === id), id).toBe(false);
    });
  });

  it('item names do not repeat "animated 3D" (the section heading says it)', () => {
    SHOP_ITEMS.forEach((i) => expect(i.name, i.id).not.toMatch(/animated 3D/i));
  });

  it('every character has its own name (the roster is all themed: Pager Pete, Dr. Dash, Femur Fred...)', () => {
    const names = CHARACTER_MODELS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    names.forEach((n) => expect(n.trim().length).toBeGreaterThan(2));
    ['Pager Pete', 'Dr. Dash', 'Field Medic Finn', 'Rural Rex', 'Locum Lou', 'Dark-Room Dex', 'Stat Sadie', 'Night-Shift Nico', 'Femur Fred', 'Decaffeinated Dan', 'Gurney Grog', 'Pharmacist Pip', 'Anatomy Abe', 'MRI Mo', 'Attending Arthur'].forEach((n) => expect(names).toContain(n));
  });
});

describe('each character is customized in its own way', () => {
  const customizable = CHARACTER_MODELS.filter((m) => m.parts && m.parts.length);

  it('most characters can be recolored, with parts that fit them', () => {
    expect(customizable.length).toBeGreaterThanOrEqual(10);
    expect(getCharacterParts('avatar_intern').map((p) => p.label)).toEqual(['Scrub top', 'Scrub pants', 'Skin', 'Hair']);
    expect(getCharacterParts('avatar_m_robot').map((p) => p.label)).toEqual(['Body', 'Trim']);
    expect(getCharacterParts('avatar_m_wizard').map((p) => p.label)).toEqual(['Robe & hat', 'Trim']);
    expect(getCharacterParts('nonsense')).toEqual([]);
  });

  it('no two characters offer the same parts with the same palettes', () => {
    const signature = (m) => JSON.stringify(m.parts.map((p) => [p.label, p.palette.map((c) => c.hex)]));
    const sigs = customizable.map(signature);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('every palette starts with the original look and offers real choices', () => {
    customizable.forEach((m) => m.parts.forEach((p) => {
      expect(p.palette[0].hex, m.name + ' ' + p.label).toBe(0);
      expect(p.palette.length, m.name + ' ' + p.label).toBeGreaterThanOrEqual(5);
      p.palette.slice(1).forEach((c) => expect(c.hex).toBeGreaterThan(0));
    }));
  });

  customizable.forEach((m) => {
    it(m.name + ': each part repaints only its own materials', async () => {
      const url = '/models/' + m.file;
      const buf = readFileSync('public/models/' + m.file);
      await parseCharacterModel(url, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const plain = buildModelCharacter(url, 1);
      const names = materialNames(plain);
      m.parts.forEach((part) => part.materials.forEach((n) => expect(names.has(n), m.name + ' has a material called ' + n).toBe(true)));

      // paint every part a different color and check each landed only on its own materials
      const colors = [0x9a2f45, 0x2a7ad9, 0x1f8a5a, 0xf2cf2a];
      const tints = m.parts.map((p, i) => ({ names: p.materials, color: colors[i % colors.length] }));
      const tinted = buildModelCharacter(url, 1, undefined, tints);
      const wanted = {};
      tints.forEach((t) => t.names.forEach((n) => { wanted[n] = new THREE.Color(t.color).getHex(); }));
      tinted.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        if (wanted[o.material.name] !== undefined) expect(o.material.color.getHex()).toBe(wanted[o.material.name]);
      });
      // the shared originals are untouched
      plain.traverse((o) => { if (o.isMesh && wanted[o.material.name] !== undefined) expect(o.material.color.getHex()).not.toBe(wanted[o.material.name]); });
    });
  });
});

describe('every hero can be recolored', () => {
  it('has at least one part, and each part names materials that really exist in its model file', async () => {
    const fs = await import('node:fs');
    for (const m of CHARACTER_MODELS) {
      expect((m.parts || []).length, m.name).toBeGreaterThan(0);
      const buf = fs.readFileSync('public/models/' + m.file);
      const len = buf.readUInt32LE(12);
      const names = (JSON.parse(buf.slice(20, 20 + len).toString('utf8')).materials || []).map((x) => x.name);
      for (const part of m.parts) for (const mat of part.materials) expect(names, m.name + ' / ' + part.label + ' / ' + mat).toContain(mat);
    }
  });
});
