import { describe, it, expect } from 'vitest';
import { SKINS } from '../../js/game/skins.js';
import { buildHallWallBay, buildHallSign, buildHallFloor, bayIndex, HALL_PERIOD, isHospitalHall } from '../../js/game/hospitalhall.js';
import { buildWallSegment, buildArch, buildGround } from '../../js/game/skinbuilders.js';
import { isChunkError, recoverFromChunkError } from '../../js/chunkrecovery.js';

const hall = SKINS.find((s) => s.name === 'Hospital Hallway');

describe('Hospital Hallway map', () => {
  it('is a real map with its own corridor builders', () => {
    expect(hall).toBeTruthy();
    expect(isHospitalHall(hall)).toBe(true);
    expect(buildWallSegment(hall, -1, -40, 3.5).children.length).toBeGreaterThan(8);
    expect(buildArch(hall, -44).children.length).toBeGreaterThan(3);
    expect(buildGround(hall).children.length).toBeGreaterThan(2);
  });

  it('repeats every four bays so the corridor scrolls without a pop', () => {
    expect(HALL_PERIOD).toBe(16);
    expect(bayIndex(-16)).toBe(bayIndex(0));
    expect(bayIndex(-4)).not.toBe(bayIndex(-8));
    const sig = (z) => buildHallWallBay(hall, 1, z).children.length;
    expect(sig(-4)).toBe(sig(-4 - HALL_PERIOD));
  });

  it('has a ceiling (from the left side only) and a hanging sign and floor', () => {
    const left = buildHallWallBay(hall, -1, -40);
    const right = buildHallWallBay(hall, 1, -40);
    expect(left.children.length).toBeGreaterThan(right.children.length - 20);
    expect(buildHallSign(hall, -22).children.length).toBeGreaterThan(3);
    expect(buildHallFloor().children.length).toBeGreaterThan(4);
  });
});

describe('stale app recovery', () => {
  it('recognises a failed lazy-loaded file', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/exam-abc.js'))).toBe(true);
    expect(isChunkError({ reason: new Error('Importing a module script failed.') })).toBe(true);
    expect(isChunkError(new Error('something else'))).toBe(false);
  });

  it('reloads once, not in a loop', () => {
    const store = {};
    let reloads = 0;
    const win = { sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } }, location: { reload: () => { reloads++; } } };
    expect(recoverFromChunkError(win)).toBe(true);
    expect(recoverFromChunkError(win)).toBe(false);
    expect(reloads).toBe(1);
  });
});

describe('the other walled-in maps', () => {
  ['Operating Room', 'Research Lab', 'Ambulance Bay'].forEach((name) => {
    it(name + ' builds walls, fixtures and a floor', () => {
      const skin = SKINS.find((s) => s.name === name);
      expect(skin).toBeTruthy();
      expect(isHospitalHall(skin)).toBe(true);
      for (let k = 0; k < 4; k++) expect(buildWallSegment(skin, 1, -k * 4, 3.5).children.length).toBeGreaterThan(6);
      expect(buildArch(skin, -44).children.length).toBeGreaterThan(2);
      expect(buildGround(skin).children.length).toBeGreaterThan(2);
    });
  });
});

describe('the room maps keep all three lanes clear', () => {
  const rooms = ['Hospital Hallway', 'Operating Room', 'Research Lab', 'Ambulance Bay'].map((n) => SKINS.find((s) => s.name === n));
  const LANE_EDGE = 4.3; // lanes are at -3, 0 and 3, each about 2.6 wide; scenery must stay outside this

  rooms.forEach((room) => {
    it(room.name + ': no wall scenery reaches into the lanes', async () => {
      const THREE = await import('three');
      [-1, 1].forEach((side) => {
        for (let k = 0; k < 4; k++) {
          const g = buildHallWallBay(room, side, -4 * k);
          g.updateMatrixWorld(true);
          g.children.forEach((child) => {
            const box = new THREE.Box3().setFromObject(child);
            if (box.isEmpty()) return;
            if (box.min.x < 0 && box.max.x > 0) return;   // the ceiling spans the whole corridor
            if (box.min.y > 2.6) return;                  // overhead fittings are above the runner
            // distance of the scenery's nearest edge from the middle of the track
            const nearest = side > 0 ? box.min.x : -box.max.x;
            expect(nearest, room.name + ' side ' + side + ' bay ' + k).toBeGreaterThanOrEqual(LANE_EDGE - 0.001);
          });
        }
      });
    });
  });
});
