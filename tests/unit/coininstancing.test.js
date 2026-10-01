import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { enableCoinInstancing, disableCoinInstancing, syncCoinInstances, coinInstancingActive, spawnCoinBatch } from '../../js/game/obstacles.js';

// Coins are drawn in bulk by a few instanced meshes; the game still moves each coin as its own object.

describe('coins drawn in bulk', () => {
  let scene;
  beforeEach(() => {
    disableCoinInstancing();
    scene = new THREE.Scene();
  });

  it('turns every coin into a light object and draws them with a few shared meshes', () => {
    enableCoinInstancing(scene);
    expect(coinInstancingActive()).toBe(true);
    const coins = [];
    for (let i = 0; i < 5; i++) spawnCoinBatch(scene, coins, -50 - i * 20);
    expect(coins.length).toBeGreaterThan(5);
    coins.forEach((c) => expect(c.children.length).toBe(0));

    const drawn = syncCoinInstances(coins);
    expect(drawn).toBe(coins.filter((c) => c.userData.type === 'coin').length);
    const instanced = scene.children.filter((c) => c.isInstancedMesh);
    expect(instanced.length).toBe(3);               // disc, rim and crosses, glow
    instanced.forEach((m) => expect(m.count).toBe(drawn));
    // far fewer drawn objects than one mesh per coin part
    expect(scene.children.filter((c) => c.isMesh).length).toBe(3);
  });

  it('puts each instance where its coin is, and follows it when it moves or spins', () => {
    enableCoinInstancing(scene);
    const coins = [];
    spawnCoinBatch(scene, coins, -30);
    const coin = coins.find((c) => c.userData.type === 'coin');
    coin.position.set(2, 1.2, -10);
    coin.rotation.y = 1;
    syncCoinInstances(coins);
    const mesh = scene.children.find((c) => c.isInstancedMesh);
    const m = new THREE.Matrix4();
    const index = coins.filter((c) => c.userData.type === 'coin').indexOf(coin);
    mesh.getMatrixAt(index, m);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    expect(pos.x).toBeCloseTo(2, 5);
    expect(pos.y).toBeCloseTo(1.2, 5);
    expect(pos.z).toBeCloseTo(-10, 5);
    // moving the coin moves its instance on the next sync
    coin.position.z = -5;
    syncCoinInstances(coins);
    mesh.getMatrixAt(index, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).z).toBeCloseTo(-5, 5);
  });

  it('forgets coins that were collected or left the track', () => {
    enableCoinInstancing(scene);
    const coins = [];
    spawnCoinBatch(scene, coins, -30);
    const n = syncCoinInstances(coins);
    coins.splice(0, 2);
    expect(syncCoinInstances(coins)).toBeLessThan(n);
    expect(syncCoinInstances([])).toBe(0);
  });

  it('still works without instancing (each coin draws itself)', () => {
    const coins = [];
    spawnCoinBatch(scene, coins, -30);
    const coin = coins.find((c) => c.userData.type === 'coin');
    expect(coin.children.length).toBe(3); // disc, rim and crosses, glow
  });
});
