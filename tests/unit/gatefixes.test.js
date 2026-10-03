import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { chooseCommittedLane } from '../../js/game/lanelock.js';
import { buildTrack } from '../../js/game/track.js';
import { SKINS } from '../../js/game/skins.js';

const LANES = [-3, 0, 3];

describe('which gate counts', () => {
  it('is the lane the player last asked for, even while the runner is still gliding out of the old one', () => {
    // swiped right from the middle: the body is still at x=0.4, nearest to the middle lane, but the player chose lane 2
    expect(chooseCommittedLane({ targetLane: 2, playerX: 0.4, laneX: LANES })).toBe(2);
    expect(chooseCommittedLane({ targetLane: 0, playerX: -0.2, laneX: LANES })).toBe(0);
    expect(chooseCommittedLane({ targetLane: 1, playerX: 2.9, laneX: LANES })).toBe(1);
  });

  it('falls back to where the body is when no valid lane was asked for', () => {
    expect(chooseCommittedLane({ targetLane: undefined, playerX: 2.4, laneX: LANES })).toBe(2);
    expect(chooseCommittedLane({ targetLane: 7, playerX: -2.6, laneX: LANES })).toBe(0);
    expect(chooseCommittedLane({ targetLane: NaN, playerX: 0.1, laneX: LANES })).toBe(1);
  });
});

describe('see-through scenery', () => {
  it('never writes depth, so coins, power-ups and the monster cannot vanish inside a light cone', () => {
    for (const skin of SKINS) {
      const root = new THREE.Scene();
      const refs = buildTrack(root, skin, { quality: 'medium', reducedMotion: false });
      const offenders = [];
      root.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        mats.forEach((m) => { if (m.transparent && m.opacity < 1 && m.depthWrite !== false) offenders.push(skin.id + ' ' + (o.name || o.type)); });
      });
      refs.dispose();
      expect(offenders, skin.id).toEqual([]);
    }
  });
});
