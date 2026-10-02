import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TrailSystem } from '../../js/game/trails.js';
import { storage } from '../../js/storage.js';

// The Locker shows a trail by streaming it behind the character without equipping it.
describe('trail preview', () => {
  beforeEach(() => { localStorage.clear(); storage.load(); });

  const active = (t) => t.pool.filter((p) => p.active);
  const runFor = (t, seconds) => { for (let i = 0; i < seconds * 60; i++) t.update(1 / 60, 0, 0, 0, 5); };

  it('shows the trail it is told to, without touching what is equipped', () => {
    const t = new TrailSystem(new THREE.Scene(), { quality: 'medium' });
    expect(t.getConfig()).toBeNull(); // nothing equipped
    t.setOverride('trail_fire');
    expect(t.getConfig()).not.toBeNull();
    runFor(t, 0.5);
    expect(active(t).length).toBeGreaterThan(0);
    expect(storage.get('equipped').trail).toBe('trail_none');
    t.setOverride(null);
    expect(t.getConfig()).toBeNull();
  });

  it('switching trail clears the old particles, and "no trail" shows nothing', () => {
    const t = new TrailSystem(new THREE.Scene(), { quality: 'medium' });
    t.setOverride('trail_fire');
    runFor(t, 0.5);
    t.setOverride('trail_hearts');
    expect(active(t).length).toBe(0);
    t.setOverride('trail_none');
    runFor(t, 0.3);
    expect(active(t).length).toBe(0);
  });

  it('with no override, the equipped trail shows', () => {
    storage.data.progression.equipped.trail = 'trail_ekg';
    const t = new TrailSystem(new THREE.Scene(), { quality: 'medium' });
    expect(t.getConfig()).not.toBeNull();
  });

  it('particles are put away before they reach a close camera, and can stream either way', () => {
    const toward = new TrailSystem(new THREE.Scene(), { quality: 'high', direction: 1, clipZ: 2.6 });
    toward.setOverride('trail_fire');
    runFor(toward, 3);
    expect(Math.max(...toward.pool.map((p) => (p.active ? p.mesh.position.z : -Infinity)))).toBeLessThanOrEqual(2.7);
    const away = new TrailSystem(new THREE.Scene(), { quality: 'high', direction: -1 });
    away.setOverride('trail_fire');
    runFor(away, 1);
    expect(Math.min(...away.pool.map((p) => (p.active ? p.mesh.position.z : Infinity)))).toBeLessThan(-1);
  });
});
