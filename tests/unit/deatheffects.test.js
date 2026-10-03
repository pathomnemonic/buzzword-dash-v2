import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { runEndMethods } from '../../js/game/enginerunend.js';
import { PowerUpFX } from '../../js/game/powerupfx.js';
import { TrailSystem } from '../../js/game/trails.js';

describe('nothing from the run stays on the runner while the death plays', () => {
  it('putting the effects away hides the magnet ring on the feet, the dash ghosts, the trail and the speed lines', () => {
    const scene = new THREE.Scene();
    const fx = new PowerUpFX(scene);
    const trail = new TrailSystem(scene, { quality: 'medium' });
    trail.setOverride('trail_hearts');
    for (let i = 0; i < 60; i++) trail.update(1 / 60, 0, 0, 0, 5);
    // a magnet and a dash going at the moment of death
    fx.update(1 / 60, { x: 0, y: 0, z: 0 }, { shield: 0, double: 0, magnet: 5, autoPilot: 0, scoreFrenzy: 0 }, 2);
    expect(fx.effects.magnet.group.visible).toBe(true);
    expect(trail.pool.some((p) => p.active)).toBe(true);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), new THREE.MeshBasicMaterial());
    scene.add(line);
    const game = { powerupFX: fx, trailSystem: trail, speedLines: [line], scene };

    runEndMethods._clearRunEffects.call(game);

    Object.values(fx.effects).forEach((e) => { if (e && e.group) expect(e.group.visible).toBe(false); });
    fx.rushGhosts.forEach((g) => expect(g.mesh.visible).toBe(false));
    expect(trail.pool.some((p) => p.active)).toBe(false);
    expect(game.speedLines.length).toBe(0);
    expect(scene.children.includes(line)).toBe(false);
  });

  it('dying calls it (so it cannot be forgotten when a new death style is added)', () => {
    const src = runEndMethods._triggerDeath.toString();
    expect(src).toMatch(/_clearRunEffects/);
    void vi;
  });
});
