// @vitest-environment node
//
// Node has real ArrayBuffers (jsdom's differ), which the glTF parser needs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

describe('animated glTF avatar', () => {
  it('loads a real model, finds the clips the state machine needs, and stands 2 units tall', async () => {
    const { parseCharacterModel, buildModelCharacter, getModelClipNames, updateModelAnimation } = await import('../../js/game/charactermodel.js');
    const bytes = readFileSync('public/models/characters/doctor.glb');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await parseCharacterModel('test.glb', buffer);

    const clips = getModelClipNames('test.glb');
    expect(clips.length).toBeGreaterThanOrEqual(5);
    ['Run', 'Death', 'Idle'].forEach((name) => expect(clips.some((c) => c.toLowerCase().includes(name.toLowerCase())), name).toBe(true));

    const pg = buildModelCharacter('test.glb', 1);
    expect(pg.userData.isModel).toBe(true);

    // Regression: a wrong measurement once shrank the avatar to a speck.
    pg.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(pg, true).getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(1.7);
    expect(size.y).toBeLessThan(2.4);
    expect(new THREE.Box3().setFromObject(pg, true).min.y).toBeGreaterThan(-0.2);
    expect(updateModelAnimation(pg, 0.016, 'jump')).toBe(true);
    expect(updateModelAnimation(pg, 0.016, 'death')).toBe(true);
    expect(pg.userData.animator.state).toBe('death');
    expect(updateModelAnimation({ userData: {} }, 0.016, 'run')).toBe(false);
  });
});
