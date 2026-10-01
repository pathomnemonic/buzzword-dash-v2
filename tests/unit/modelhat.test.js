// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { storage } from '../../js/storage.js';
import { parseCharacterModel } from '../../js/game/charactermodel.js';
import { buildPlayer } from '../../js/game/player.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = undefined;
globalThis.document = { createElementNS: () => ({ addEventListener(t, f) { if (t === 'load') setTimeout(f, 0); }, removeEventListener() {}, set src(v) {} }) };

describe('hats and the animated 3D characters', () => {
  it('3D characters do not wear a hat, even when one is equipped', async () => {
    storage.set('quality', 'high');
    const buf = readFileSync('public/models/characters/doctor.glb');
    await parseCharacterModel('/models/characters/doctor.glb', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

    const eq = storage.get('equipped');
    eq.skin = 'avatar_intern';
    eq.hat = 'hat_crown';
    storage.set('equipped', eq);

    const pg = buildPlayer();
    expect(pg.userData.isModel).toBe(true);
    expect(pg.userData.headAccessory).toBeUndefined();
    // The crown is not anywhere in the model's hierarchy
    let meshes = 0;
    pg.traverse((o) => { if (o.isMesh) meshes++; });
    storage.set('equipped', { ...eq, hat: 'hat_none' });
    const bare = buildPlayer();
    let bareMeshes = 0;
    bare.traverse((o) => { if (o.isMesh) bareMeshes++; });
    expect(meshes).toBe(bareMeshes);
    expect(pg instanceof THREE.Group).toBe(true);
  });
});
