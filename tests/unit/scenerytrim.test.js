import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { planAdaptiveStep, DENSITY_LEVELS } from '../../js/game/quality.js';
import { setSceneryDensity } from '../../js/game/mapfx.js';
import { SKINS } from '../../js/game/skins.js';
import { buildTrack } from '../../js/game/track.js';

describe('thinning the scenery before the picture', () => {
  it('a slower step thins the scenery first and only then lowers the resolution', () => {
    let d = 0;
    const steps = [];
    for (let i = 0; i < DENSITY_LEVELS.length + 1; i++) {
      const p = planAdaptiveStep('slower', d, true);
      steps.push(p.applyResolution);
      d = p.densityIndex;
    }
    expect(steps).toEqual([false, false, false, true, true].slice(0, DENSITY_LEVELS.length + 1));
    expect(d).toBe(DENSITY_LEVELS.length - 1);
  });

  it('a faster step restores the resolution first, then the scenery', () => {
    expect(planAdaptiveStep('faster', 3, false)).toEqual({ densityIndex: 3, applyResolution: true });
    expect(planAdaptiveStep('faster', 3, true)).toEqual({ densityIndex: 2, applyResolution: false });
    expect(planAdaptiveStep('faster', 0, true)).toEqual({ densityIndex: 0, applyResolution: true });
  });

  it('draws fewer of every swarm, and all of them again afterwards', () => {
    const skin = SKINS.find((s) => s.name === 'Cafeteria Carnival');
    const root = new THREE.Scene();
    const refs = buildTrack(root, skin, { quality: 'medium' });
    const swarms = refs.worldMovers.children.filter((m) => m.userData.swarmCount);
    expect(swarms.length).toBeGreaterThan(3);
    setSceneryDensity(refs, 0.5);
    swarms.forEach((m) => expect(m.count).toBe(Math.ceil(m.userData.swarmCount * 0.5)));
    setSceneryDensity(refs, 0);
    swarms.forEach((m) => expect(m.visible).toBe(false));
    setSceneryDensity(refs, 1);
    swarms.forEach((m) => { expect(m.count).toBe(m.userData.swarmCount); expect(m.visible).toBe(true); });
    refs.dispose();
  });
});
