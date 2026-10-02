import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildPowerupIcon } from '../../js/game/obstacles.js';

// Each power-up floats a shape that says what it does, so nobody has to memorize them.
describe('power-up icons', () => {
  HTMLCanvasElement.prototype.getContext = () => null;
  const types = ['shield', 'magnet', 'double', 'autoPilot', 'scoreFrenzy'];

  const signature = (obj) => {
    const parts = [];
    obj.traverse((o) => parts.push(o.isSprite ? 'sprite' : o.isMesh ? o.geometry.type : 'group'));
    return parts.join(',');
  };

  it('every power-up has its own icon, and no two look the same', () => {
    const sigs = types.map((t) => signature(buildPowerupIcon(t).icon));
    expect(new Set(sigs).size).toBe(types.length);
  });

  it('the shield is a shield-shaped extrusion, the magnet a half-ring with legs, the wheel a ring with spokes', () => {
    expect(signature(buildPowerupIcon('shield').icon)).toContain('ExtrudeGeometry');
    const magnet = signature(buildPowerupIcon('magnet').icon);
    expect(magnet).toContain('TorusGeometry');
    expect(magnet.split('CylinderGeometry').length - 1).toBe(4); // two legs, two tips
    const wheel = signature(buildPowerupIcon('autoPilot').icon);
    expect(wheel).toContain('TorusGeometry');
    expect(wheel.split('BoxGeometry').length - 1).toBe(3); // three spokes
  });

  it('"2×" is a sprite (it always faces the camera) and the gem is a stretched octahedron', () => {
    const two = buildPowerupIcon('double').icon;
    expect(two.children[0]).toBeInstanceOf(THREE.Sprite);
    const gem = buildPowerupIcon('scoreFrenzy').icon.children[0];
    expect(gem.geometry.type).toBe('OctahedronGeometry');
    expect(gem.scale.y).toBeGreaterThan(gem.scale.x);
  });

  it('flat icons are flagged so the game turns them to face the camera; solid ones spin freely', () => {
    expect(['shield', 'magnet', 'autoPilot'].every((t) => buildPowerupIcon(t).flat)).toBe(true);
    expect(['double', 'scoreFrenzy'].some((t) => buildPowerupIcon(t).flat)).toBe(false);
  });

  it('an unknown type still gets an icon', () => {
    expect(buildPowerupIcon('mystery').icon.children.length).toBe(1);
  });
});
