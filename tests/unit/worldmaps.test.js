import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { SKINS, isIndoorSkin, getNextSkin } from '../../js/game/skins.js';
import { WORLDS, worldOf, isWorld, worldBay, buildWorldBay, buildWorldArch, buildWorldGround } from '../../js/game/worlds.js';
import { buildTrack } from '../../js/game/track.js';
import { updateAnimators } from '../../js/game/mapfx.js';
import { holidaySeason } from '../../js/game/maps/holiday.js';
import { LOCKER_ITEMS } from '../../js/game/shopdata.js';
import { SKIN_MUSIC } from '../../js/audio.js';
import { HAZARD_BY_SKIN } from '../../js/game/hazards.js';
import { WORLD_PERIOD, LANE_EDGE } from '../../js/game/mapkit.js';

const worlds = SKINS.filter((s) => s.world);

function countCalls(root) {
  let calls = 0;
  let tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    calls++;
    const g = o.geometry;
    tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  return { calls, tris };
}

describe('the bright maps', () => {
  it('are all there, each with a world module, music, a hazard and a place in the Locker', () => {
    expect(worlds.map((s) => s.name).sort()).toEqual([
      'Anatomy Amusement Park', 'Aquarium Imaging Center', 'Candy Lab', 'Cafeteria Carnival', 'Cardiac Pulse', 'Cellular Matrix',
      'DNA Helix Tunnel', 'Defibrillator Shock', 'Holiday Wards', 'Neon ER', 'Neonatal Cloud Nursery', 'Neural Highway',
      'Pediatric Playland', 'Pharmacy Pop Factory', 'Prescription Sunset', 'Rooftop Helipad Resort', 'Skeletal Corridor',
      'Sunshine Rehab Garden', 'Surgical Theater', 'Vascular Rush', 'Vet and Farm Clinic', 'X-Ray Vision'
    ].sort());
    worlds.forEach((s) => {
      expect(isWorld(s), s.name).toBe(true);
      expect(worldOf(s), s.name).toBe(WORLDS[s.world]);
      expect(SKIN_MUSIC[s.name], s.name + ' music').toBeTruthy();
      expect(HAZARD_BY_SKIN[s.name], s.name + ' hazard').toBeTruthy();
      ['surge', 'flare', 'glitch', 'pulse'].includes(HAZARD_BY_SKIN[s.name]) || expect.fail(s.name + ' has a harsh hazard');
      expect(s.fog && s.fog.far, s.name + ' fog').toBeGreaterThan(100);
      expect(LOCKER_ITEMS.some((i) => i.skinId === s.id), s.name + ' for sale').toBe(true);
    });
  });

  it('every map is bright and cheerful, not dark: light haze, a lit sky and strong ambient light', () => {
    const lum = (hex) => ((hex >> 16) & 255) * 0.2126 / 255 + ((hex >> 8) & 255) * 0.7152 / 255 + (hex & 255) * 0.0722 / 255;
    worlds.forEach((s) => {
      expect(lum(s.colors.bg), s.name + ' haze').toBeGreaterThan(0.55);
      expect(s.light.ambient + s.light.hemi, s.name + ' light').toBeGreaterThanOrEqual(1.2);
      expect(s.wallType, s.name).toBe('world');
    });
    // the old dark body maps are gone: the maps that were once neon-on-black are worlds now
    ['Neural Highway', 'Vascular Rush', 'Neon ER', 'Surgical Theater', 'Candy Lab', 'Prescription Sunset', 'Skeletal Corridor', 'Cellular Matrix', 'DNA Helix Tunnel', 'Cardiac Pulse', 'X-Ray Vision', 'Defibrillator Shock']
      .forEach((n) => expect(SKINS.find((s) => s.name === n).world, n).toBeTruthy());
  });

  it('none of them is free from the start: they are rewards, and a new player never rotates into one', () => {
    expect(worlds.filter(isIndoorSkin)).toEqual([]);
    const owns = () => false;
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(getNextSkin(SKINS[0], 3, Math.random, owns).name);
    expect(seen.has('Pediatric Playland')).toBe(false);
  });

  worlds.forEach((skin) => {
    describe(skin.name, () => {
      it('repeats every four bays so it scrolls without a seam', () => {
        expect(WORLD_PERIOD).toBe(16);
        expect(worldBay(-16)).toBe(worldBay(0));
        const sig = (side, z) => {
          const g = buildWorldBay(skin, side, z);
          const box = new THREE.Box3().setFromObject(g);
          return [g.children.length, box.min.x.toFixed(2), box.max.x.toFixed(2), box.min.y.toFixed(2), box.max.y.toFixed(2)].join('/');
        };
        [-1, 1].forEach((side) => expect(sig(side, -8), 'side ' + side).toBe(sig(side, -8 - WORLD_PERIOD)));
      });

      it('keeps all three lanes clear of everything the runner could hit', () => {
        [-1, 1].forEach((side) => {
          for (let k = 0; k < 4; k++) {
            const g = buildWorldBay(skin, side, -4 * k);
            g.updateMatrixWorld(true);
            g.children.forEach((child) => {
              const box = new THREE.Box3().setFromObject(child);
              if (box.isEmpty()) return;
              if (box.min.x < 0 && box.max.x > 0) return;  // the floor, the ceiling and other pictures spanning the track
              if (box.min.y > 2.6) return;                  // overhead, above the runner
              if (box.min.y > 2.0 && (side > 0 ? box.min.x : -box.max.x) >= 3.4) return; // a canopy or awning overhead may lean out a little
              if (box.max.y < 0.12) return;                 // paint on the floor
              const nearest = side > 0 ? box.min.x : -box.max.x;
              expect(nearest, skin.name + ' side ' + side + ' bay ' + k).toBeGreaterThanOrEqual(LANE_EDGE - 0.001);
            });
          }
        });
      });

      it('builds fixtures, a ground and a whole track within the draw-call and triangle budget', () => {
        expect(buildWorldArch(skin, -44).children.length).toBeGreaterThan(3);
        expect(buildWorldGround(skin).children.length).toBeGreaterThan(1);
        const root = new THREE.Scene();
        const refs = buildTrack(root, skin, { quality: 'medium' });
        const { calls, tris } = countCalls(root);
        expect(calls, skin.name + ' draw calls').toBeLessThan(260);
        expect(tris, skin.name + ' triangles').toBeLessThan(150000);
        expect(refs.animators.length, skin.name + ' has things that move').toBeGreaterThan(2);
        expect(root.fog.far, skin.name + ' fog').toBe(skin.fog.far);
        refs.dispose();
        expect(refs.animators).toEqual([]);
      }, 60000);

      it('animates without ever producing a bad number, and keeps its movers in view range', () => {
        const root = new THREE.Scene();
        const refs = buildTrack(root, skin, { quality: 'medium' });
        for (let f = 0; f < 120; f++) updateAnimators(refs.animators, f / 60, 1 / 60, 0.3);
        root.traverse((o) => {
          if (o.isInstancedMesh) o.instanceMatrix.array.forEach((v) => expect(Number.isFinite(v), skin.name).toBe(true));
        });
        refs.worldMovers.children.forEach((m) => {
          expect(Number.isFinite(m.position.z), skin.name).toBe(true);
          expect(m.position.z).toBeLessThanOrEqual(30);
          expect(m.position.z).toBeGreaterThanOrEqual(-400);
        });
        refs.dispose();
      }, 60000);
    });
  });
});

describe('Holiday Wards follows the calendar', () => {
  const d = (m, day) => new Date(2026, m - 1, day, 12);
  it('picks winter, spring, summer, autumn or the everyday party', () => {
    expect(holidaySeason(d(12, 25))).toBe('winter');
    expect(holidaySeason(d(1, 3))).toBe('winter');
    expect(holidaySeason(d(1, 7))).toBe('party');
    expect(holidaySeason(d(4, 5))).toBe('spring');
    expect(holidaySeason(d(7, 4))).toBe('summer');
    expect(holidaySeason(d(10, 31))).toBe('autumn');
    expect(holidaySeason(d(11, 6))).toBe('party');
    expect(holidaySeason(d(2, 14))).toBe('party');
    expect(holidaySeason(d(9, 15))).toBe('party');
  });

  it('builds every season without a seam or a crash', () => {
    const skin = SKINS.find((s) => s.name === 'Holiday Wards');
    const seasons = new Set();
    [[12, 20], [4, 5], [7, 10], [10, 20], [2, 10]].forEach(([m, day]) => {
      const RealDate = Date;
      const fixed = new RealDate(2026, m - 1, day, 12).getTime();
      globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } };
      try {
        const root = new THREE.Scene();
        const refs = buildTrack(root, skin, { quality: 'medium' });
        seasons.add(skin.season);
        const { calls, tris } = countCalls(root);
        expect(calls, skin.season).toBeLessThan(260);
        expect(tris, skin.season).toBeLessThan(150000);
        refs.dispose();
      } finally { globalThis.Date = RealDate; }
    });
    expect([...seasons].sort()).toEqual(['autumn', 'party', 'spring', 'summer', 'winter']);
  }, 90000);
});

describe('the KayKit models the maps ask for', () => {
  it('are all in the packed file, and none is packed without being used', () => {
    const dir = 'js/game/maps';
    const used = new Set();
    readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
      for (const m of readFileSync(dir + '/' + f, 'utf8').matchAll(/['"`](rest|hall|city|furn)\/([A-Za-z0-9_]+)['"`]/g)) used.add(m[1] + '/' + m[2]);
    });
    const packed = JSON.parse(readFileSync('public/models/kaykit/models.json', 'utf8'));
    expect([...used].sort()).toEqual(packed);
  });
});

describe('every map has something moving at its sides', () => {
  it('the original sixteen drift something gentle, cheaply, on every tier', () => {
    SKINS.filter((s) => !s.world).forEach((skin) => {
      const root = new THREE.Scene();
      const refs = buildTrack(root, skin, { quality: 'medium' });
      expect(refs.animators.length, skin.name).toBeGreaterThanOrEqual(2);
      for (let f = 0; f < 60; f++) updateAnimators(refs.animators, f / 60, 1 / 60, 0.3);
      root.traverse((o) => { if (o.isInstancedMesh) o.instanceMatrix.array.forEach((v) => expect(Number.isFinite(v), skin.name).toBe(true)); });
      refs.dispose();
    });
  }, 90000);
});
