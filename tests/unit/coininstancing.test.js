import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { enableCoinInstancing, disableCoinInstancing, syncCoinInstances, coinInstancingActive, spawnCoinBatch, coinInstanceMeshes, reattachCoinInstances } from '../../js/game/obstacles.js';

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

describe('coin batches', () => {
  it('use at most two lanes, and tell the caller how long they are', () => {
    for (let n = 0; n < 300; n++) {
      const scene = new THREE.Scene();
      const coins = [];
      const length = spawnCoinBatch(scene, coins, -40);
      expect(length).toBeGreaterThan(5);
      const lanes = new Set(coins.map((c) => c.userData.lane));
      expect(lanes.size).toBeLessThanOrEqual(2);
      expect(lanes.size).toBeGreaterThanOrEqual(1);
    }
  });

  it('the next batch starts in a different lane than the last one ended', () => {
    let changed = 0;
    let last = -1;
    for (let n = 0; n < 200; n++) {
      const scene = new THREE.Scene();
      const coins = [];
      spawnCoinBatch(scene, coins, -40);
      const first = coins[0].userData.lane;
      if (last >= 0 && first !== last) changed++;
      last = coins[coins.length - 1].userData.lane;
    }
    expect(changed).toBeGreaterThan(150);
  });
});

describe('coins stay drawn when the scene is swept', () => {
  it('lists the shared coin meshes, and puts them back if something removed them', () => {
    const scene = new THREE.Scene();
    disableCoinInstancing();
    enableCoinInstancing(scene);
    const meshes = coinInstanceMeshes();
    expect(meshes.length).toBe(3);
    meshes.forEach((m) => scene.remove(m));          // what a map change used to do to them
    expect(scene.children.filter((c) => c.isInstancedMesh).length).toBe(0);
    expect(reattachCoinInstances(scene)).toBe(3);
    expect(scene.children.filter((c) => c.isInstancedMesh).length).toBe(3);
    expect(reattachCoinInstances(scene)).toBe(0);    // nothing to fix the second time
    disableCoinInstancing();
  });
});
