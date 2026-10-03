import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LOCKER_ITEMS } from '../../js/game/shopdata.js';
import { TRAIL_SETTINGS, TrailSystem } from '../../js/game/trails.js';
import { TRAIL_SHAPES, getTrailGeometry, shapeWords } from '../../js/game/trailshapes.js';

/**
 * "Hearts" used to stream pink circles. Every trail's description must now say what it really draws, and every
 * trail must draw a shape of its own.
 */
const trails = LOCKER_ITEMS.filter((i) => i.type === 'trail' && i.id !== 'trail_none');

describe('trails draw what their description says', () => {
  it('every trail for sale has a description and a drawing', () => {
    expect(trails.length).toBe(12);
    trails.forEach((t) => {
      expect(t.desc, t.id).toBeTruthy();
      expect(TRAIL_SETTINGS[t.id], t.id).toBeTruthy();
      expect(TRAIL_SHAPES, t.id).toContain(TRAIL_SETTINGS[t.id].shape);
    });
  });

  it('the description (or name) names the shape that is drawn', () => {
    trails.forEach((t) => {
      const words = shapeWords(TRAIL_SETTINGS[t.id].shape);
      const text = (t.name + ' ' + t.desc).toLowerCase();
      expect(words.some((w) => text.includes(w)), `${t.id}: "${t.desc}" should mention one of ${words.join(', ')}`).toBe(true);
    });
  });

  it('no two trails are the same circles in a different colour: each has its own shape', () => {
    const shapes = trails.map((t) => TRAIL_SETTINGS[t.id].shape);
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(shapes).not.toContain('sphere');
  });

  it('every shape is real geometry of the same small size', () => {
    TRAIL_SHAPES.forEach((s) => {
      const g = getTrailGeometry(s);
      expect(g.attributes.position.count, s).toBeGreaterThan(3);
      g.computeBoundingBox();
      const size = new THREE.Vector3();
      g.boundingBox.getSize(size);
      expect(Math.max(size.x, size.y, size.z), s).toBeCloseTo(0.2, 2);
    });
  });

  it('the trail system launches particles with the trail\'s own shape', () => {
    trails.forEach((t) => {
      const sys = new TrailSystem(new THREE.Scene(), { quality: 'medium' });
      sys.setOverride(t.id);
      for (let i = 0; i < 90; i++) sys.update(1 / 60, 0, 0, 0, 5);
      const live = sys.pool.filter((p) => p.active);
      expect(live.length, t.id).toBeGreaterThan(0);
      live.forEach((p) => expect(p.mesh.geometry, t.id).toBe(getTrailGeometry(TRAIL_SETTINGS[t.id].shape)));
    });
  });
});
