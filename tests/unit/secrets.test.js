import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SKINS } from '../../js/game/skins.js';
import { SECRETS, secretFor, buildSecret, planSecretTime, isTapOnSecret, secretReward, SECRET_COINS, SECRET_FIRST_COINS } from '../../js/game/secrets.js';

describe('map secrets', () => {
  it('every map has one, with its own name', () => {
    SKINS.forEach((s) => expect(secretFor(s.name), s.name).toBeTruthy());
    expect(Object.keys(SECRETS).length).toBe(SKINS.length);
  });

  it('every kind builds a small, cheap, animated model', () => {
    new Set(Object.values(SECRETS).map((s) => s.kind)).forEach((kind) => {
      const g = buildSecret(kind);
      g.userData.baseY = 1;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.getSize(new THREE.Vector3()).y, kind).toBeLessThan(3);
      let tris = 0;
      g.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
      expect(tris, kind).toBeLessThan(900);
      for (let t = 0; t < 5; t += 0.25) g.userData.tick(t);
      expect(Number.isFinite(g.position.y)).toBe(true);
    });
  });

  it('shows up partway through a run, pays more the first time, and takes a generous tap', () => {
    expect(planSecretTime(() => 0)).toBeGreaterThanOrEqual(20);
    expect(planSecretTime(() => 0.999)).toBeLessThan(75);
    expect(secretReward(true)).toBe(SECRET_FIRST_COINS);
    expect(secretReward(false)).toBe(SECRET_COINS);
    expect(SECRET_FIRST_COINS).toBeGreaterThan(SECRET_COINS);
    expect(isTapOnSecret(100, 100, 130, 120)).toBe(true);
    expect(isTapOnSecret(100, 100, 300, 300)).toBe(false);
  });
});

describe('map secrets in the save', () => {
  it('remembers a found secret once', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    expect(storage.markSecretFound('Candy Lab')).toBe(true);
    expect(storage.markSecretFound('Candy Lab')).toBe(false);
    expect(storage.secretFound('Candy Lab')).toBe(true);
  });
});
