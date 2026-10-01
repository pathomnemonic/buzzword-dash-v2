// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseCharacterModel, buildModelCharacter } from '../../js/game/charactermodel.js';
import { CHARACTER_MODELS, SCRUB_COLORS } from '../../js/game/modelcatalog.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = undefined;
globalThis.document = { createElementNS: () => ({ addEventListener(t, f) { if (t === 'load') setTimeout(f, 0); }, removeEventListener() {}, set src(v) {} }) };

const materialNames = (root) => {
  const names = new Set();
  root.traverse((o) => { if (o.isMesh && o.material && o.material.name) names.add(o.material.name); });
  return names;
};

describe('scrub colors on the medical characters', () => {
  const medical = CHARACTER_MODELS.filter((m) => m.scrub);

  it('offers a palette that starts with the original look', () => {
    expect(SCRUB_COLORS[0].hex).toBe(0);
    expect(SCRUB_COLORS.length).toBeGreaterThan(5);
  });

  it('has medical characters, and none of them wears shorts', () => {
    expect(medical.length).toBeGreaterThanOrEqual(4);
    CHARACTER_MODELS.filter((m) => /doctor|nurse|surgeon|paramedic|resident/.test(m.file)).forEach((m) => expect(m.file).not.toMatch(/hoodie|man\.glb/));
  });

  medical.forEach((m) => {
    it(m.name + ' repaints its scrub materials and nothing else', async () => {
      const url = '/models/' + m.file;
      const buf = readFileSync('public/models/' + m.file);
      await parseCharacterModel(url, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const plain = buildModelCharacter(url, 1);
      const names = materialNames(plain);
      m.scrub.forEach((n) => expect(names.has(n), m.name + ' has a material called ' + n).toBe(true));

      const tinted = buildModelCharacter(url, 1, undefined, { names: m.scrub, color: 0x9a2f45 });
      const painted = [];
      const other = [];
      tinted.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        (m.scrub.indexOf(o.material.name) >= 0 ? painted : other).push(o.material);
      });
      expect(painted.length).toBeGreaterThan(0);
      painted.forEach((mat) => expect(mat.color.r).toBeGreaterThan(mat.color.b));
      // the original is untouched (copies were painted, not the shared materials)
      plain.traverse((o) => { if (o.isMesh && m.scrub.indexOf(o.material.name) >= 0) expect(o.material.color.getHex()).not.toBe(new THREE.Color(0x9a2f45).getHex()); });
    });
  });
});
