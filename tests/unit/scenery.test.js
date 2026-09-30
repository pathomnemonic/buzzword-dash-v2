// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SCENERY_FILES, PROP_KEYS, registerSceneryModel, buildScenery, buildHanging, buildSideScenery, randomSceneryProp } from '../../js/game/scenery.js';
import { getObstacleVariant } from '../../js/game/obstacles.js';

// Some models carry embedded textures. Node has no DOM image loading, so
// give the loader just enough of a stand-in to finish parsing.
globalThis.self = globalThis;
globalThis.createImageBitmap = undefined;
globalThis.document = {
  createElementNS: () => ({
    addEventListener(type, fn) { if (type === 'load') setTimeout(fn, 0); },
    removeEventListener() {},
    set src(v) {}
  })
};

function arrayBuffer(file) {
  const b = readFileSync('public/models/' + file);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('3D scenery models', () => {
  it('loads every model file', async () => {
    for (const [key, file] of Object.entries(SCENERY_FILES)) {
      await registerSceneryModel(key, arrayBuffer(file));
    }
  });

  it('fits each obstacle model inside its collision box and sits it on the floor', () => {
    const map = { gurney: 'bed', wet_floor_sign: 'cone', spilled_supplies: 'boxes', fallen_stretcher: 'barrier', medical_waste_bin: 'bin', crate: 'crate' };
    for (const [variantId, key] of Object.entries(map)) {
      const variant = getObstacleVariant(variantId);
      expect(variant.model, variantId).toBe(key);
      const group = buildScenery(key, variant.bounds, true);
      expect(group, key).toBeTruthy();
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      expect(size.x, key + ' width').toBeLessThanOrEqual(variant.bounds.width + 0.02);
      expect(size.y, key + ' height').toBeLessThanOrEqual(variant.bounds.height + 0.02);
      expect(size.z, key + ' depth').toBeLessThanOrEqual(variant.bounds.depth + 0.02);
      expect(size.x * size.y * size.z, key + ' is not degenerate').toBeGreaterThan(0.01);
      expect(box.min.y, key + ' on the floor').toBeCloseTo(0, 2);
    }
  });

  it('produces floating props of a sensible size', () => {
    PROP_KEYS.forEach((key) => {
      const g = buildScenery(key, { height: 3.2, width: 3.2, depth: 3.2 });
      g.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y, size.z), key).toBeLessThanOrEqual(3.25);
      expect(Math.max(size.x, size.y, size.z), key).toBeGreaterThan(0.5);
    });
    expect(randomSceneryProp()).toBeTruthy();
  });

  it('hangs each overhead obstacle above a sliding runner and below a standing one', () => {
    ['hanging_traffic_light', 'hanging_chandelier', 'hanging_sign', 'hanging_spotlight'].forEach((id) => {
      const variant = getObstacleVariant(id);
      expect(variant.hang, id).toBeTruthy();
      const group = buildHanging(variant.model, variant.hang);
      expect(group, id).toBeTruthy();
      group.updateMatrixWorld(true);
      // Measure the model only (first child); the cable rises above it
      const box = new THREE.Box3().setFromObject(group.children[0]);
      expect(box.min.y, id + ' clears a slide').toBeGreaterThanOrEqual(1.1);
      expect(box.min.y, id + ' blocks a standing runner').toBeLessThanOrEqual(1.4);
      const size = box.getSize(new THREE.Vector3());
      expect(size.x, id + ' width').toBeLessThanOrEqual(variant.hang.fit.width + 0.02);
    });
  });

  it('keeps old obstacle ids working (saved and shared challenge plans)', () => {
    expect(getObstacleVariant('wheelchair').id).toBe('crate');
    expect(getObstacleVariant('or_doors').id).toBe('hanging_traffic_light');
    expect(getObstacleVariant('mri_tunnel').id).toBe('hanging_chandelier');
    expect(getObstacleVariant('caution_tape').id).toBe('hanging_sign');
    expect(getObstacleVariant('xray_arm').id).toBe('hanging_spotlight');
  });

  it('builds street lights and trees along both sides that repeat seamlessly', () => {
    const side = buildSideScenery();
    expect(side).toBeTruthy();
    expect(side.spacing).toBeGreaterThan(0);
    const xs = side.group.children.map((c) => Math.sign(c.position.x));
    expect(xs).toContain(-1);
    expect(xs).toContain(1);
  });
});
