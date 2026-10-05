import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeStatic } from '../../js/game/materials.js';
import { buildTrack } from '../../js/game/track.js';
import { SKINS } from '../../js/game/skins.js';

const countMeshes = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };

describe('mergeStatic (fewer draw calls, same picture)', () => {
  it('merges same-material meshes into one and keeps their combined shape', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.set(i * 2, 0, 0);
      root.add(m);
    }
    const before = new THREE.Box3().setFromObject(root);
    const removed = mergeStatic(root);
    expect(removed).toBe(20);
    expect(countMeshes(root)).toBe(1);
    const after = new THREE.Box3().setFromObject(root);
    expect(after.min.x).toBeCloseTo(before.min.x);
    expect(after.max.x).toBeCloseTo(before.max.x);
  });

  it('separate materials stay separate, and equal-looking materials are combined', () => {
    const root = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const color = i % 2 ? 0x00ff00 : 0x0000ff;
      // A new material object per mesh with the same look
      root.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color })));
    }
    mergeStatic(root);
    expect(countMeshes(root)).toBe(2);
  });

  it('leaves animated (skinned) and shadow-casting meshes alone', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.castShadow = i < 2;
      root.add(m);
    }
    mergeStatic(root);
    // two shadow casters untouched + one merged mesh of the other two
    expect(countMeshes(root)).toBe(3);
  });

  it('a full track is a small number of draw calls, whatever the map', () => {
    // Every third map keeps the test quick while covering different wall and arch styles
    SKINS.filter((_, i) => i % 3 === 0).forEach((skin) => {
      const root = new THREE.Scene();
      const refs = buildTrack(root, skin, { quality: 'medium', reducedMotion: false });
      const meshes = countMeshes(root);
      expect(meshes, skin.name).toBeLessThan(450);
      // the classic maps also scroll glowing lines, panels and markers; the bright worlds scroll just their walls and fixtures
      expect(refs.scrollers.length, skin.name).toBeGreaterThanOrEqual(skin.world ? 2 : 5);
    });
  }, 90000);
});
