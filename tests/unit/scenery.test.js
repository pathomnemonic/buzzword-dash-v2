// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SCENERY_FILES, PROP_KEYS, registerSceneryModel, buildScenery, randomSceneryProp } from '../../js/game/scenery.js';
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
    const map = { gurney: 'bed', wet_floor_sign: 'cone', spilled_supplies: 'boxes', fallen_stretcher: 'barrier', medical_waste_bin: 'bin' };
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
});
