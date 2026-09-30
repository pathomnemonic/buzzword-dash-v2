// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { storage } from '../../js/storage.js';
import { parseCharacterModel, updateModelAnimation } from '../../js/game/charactermodel.js';
import { buildPlayer } from '../../js/game/player.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = undefined;
globalThis.document = { createElementNS: () => ({ addEventListener(t, f) { if (t === 'load') setTimeout(f, 0); }, removeEventListener() {}, set src(v) {} }) };

describe('hats on animated 3D characters', () => {
  it('builds the 3D character with a crown that follows the head', async () => {
    storage.set('quality', 'high');
    const buf = readFileSync('public/models/characters/explorer.glb');
    await parseCharacterModel('/models/characters/explorer.glb', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

    const eq = storage.get('equipped');
    eq.skin = 'avatar_intern';
    eq.hat = 'hat_crown';
    storage.set('equipped', eq);

    const pg = buildPlayer();
    expect(pg.userData.isModel).toBe(true);
    const acc = pg.userData.headAccessory;
    expect(acc, 'a head bone was found').toBeTruthy();
    expect(acc.group.children.length).toBeGreaterThan(0);

    // As the run animation plays the head moves and the hat moves with it
    const seen = [];
    for (let i = 0; i < 20; i++) {
      updateModelAnimation(pg, 0.05, 'run');
      seen.push(acc.group.position.y);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.001);
    // ...and stays within a sensible distance of where it was fitted
    seen.forEach((y) => expect(Math.abs(y)).toBeLessThan(1));
    expect(pg instanceof THREE.Group).toBe(true);
  });
});
