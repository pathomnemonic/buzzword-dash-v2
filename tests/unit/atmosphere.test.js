import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SKINS } from '../../js/game/skins.js';
import { buildTrack } from '../../js/game/track.js';
import { updateAnimators } from '../../js/game/mapfx.js';
import { ATMOSPHERES, allowedAtmospheres, pickAtmosphere, applyAtmosphere } from '../../js/game/atmosphere.js';

const INDOOR_WORLDS = ['playland', 'cafeteria', 'pharmacy', 'aquarium', 'neural', 'vascular', 'neoner', 'theater', 'candylab', 'skeletal', 'cellular', 'dna', 'cardiac', 'xray', 'defib'];
const open = SKINS.filter((s) => s.world && !INDOOR_WORLDS.includes(s.world) && !s.fixedSky);

describe('time of day and weather', () => {
  it('only the open-air maps get a sky to change', () => {
    expect(open.map((s) => s.name).sort()).toEqual(['Anatomy Amusement Park', 'Holiday Wards', 'Neonatal Cloud Nursery', 'Rooftop Helipad Resort', 'Sunshine Rehab Garden', 'Vet and Farm Clinic']);
    expect(pickAtmosphere(SKINS.find((s) => s.name === 'Hospital Hallway'))).toBeNull();
  });

  it('the Prescription Sunset keeps its sunset: no random time of day or weather', () => {
    const sunset = SKINS.find((s) => s.name === 'Prescription Sunset');
    expect(sunset.fixedSky).toBe(true);
    expect(allowedAtmospheres(sunset)).toEqual([]);
    expect(pickAtmosphere(sunset)).toBeNull();
    const top = sunset.sky.top;
    applyAtmosphere(sunset, 'rain');
    expect(sunset.sky.top).toBe(top);
  });

  it('picks every kind of day over enough runs, snow only in a Holiday Wards winter', () => {
    const garden = SKINS.find((s) => s.name === 'Sunshine Rehab Garden');
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(pickAtmosphere(garden, () => i / 400));
    expect([...seen].sort()).toEqual(['day', 'golden', 'overcast', 'rain', 'sunrise']);
    expect(allowedAtmospheres(garden)).not.toContain('snow');
    const holiday = SKINS.find((s) => s.name === 'Holiday Wards');
    holiday.season = 'winter';
    expect(allowedAtmospheres(holiday)).toContain('snow');
    holiday.season = 'autumn';
    expect(allowedAtmospheres(holiday)).not.toContain('snow');
  });

  it('tints the sky and dims the light a little, never by more than 15%, and comes back to a clear day', () => {
    const garden = SKINS.find((s) => s.name === 'Sunshine Rehab Garden');
    applyAtmosphere(garden, 'day');
    const clear = { bg: garden.colors.bg, top: garden.sky.top, amb: garden.light.ambient };
    Object.keys(ATMOSPHERES).forEach((n) => expect(ATMOSPHERES[n].light, n).toBeGreaterThanOrEqual(0.85));
    applyAtmosphere(garden, 'rain');
    expect(garden.colors.bg).not.toBe(clear.bg);
    expect(garden.light.ambient).toBeLessThan(clear.amb);
    expect(garden.light.ambient).toBeGreaterThanOrEqual(clear.amb * 0.85);
    applyAtmosphere(garden, 'day');
    expect(garden.colors.bg).toBe(clear.bg);
    expect(garden.sky.top).toBe(clear.top);
    expect(garden.light.ambient).toBe(clear.amb);
  });

  it('builds every open map in every kind of weather, with rain or snow where it falls, within budget', () => {
    open.forEach((skin) => {
      allowedAtmospheres(skin).concat(['rain', 'snow']).forEach((name) => {
        const root = new THREE.Scene();
        const refs = buildTrack(root, skin, { quality: 'medium', atmosphere: name });
        expect(refs.atmosphere).toBe(name);
        let calls = 0;
        root.traverse((o) => { if (o.isMesh) calls++; });
        expect(calls, skin.name + ' ' + name).toBeLessThan(260);
        const falls = !!ATMOSPHERES[name].precipitation;
        const swarms = refs.worldMovers.children.filter((m) => m.userData.swarmCount).length;
        for (let f = 0; f < 30; f++) updateAnimators(refs.animators, f / 60, 1 / 60, 0.3);
        if (falls) expect(swarms, name).toBeGreaterThan(0);
        refs.dispose();
      });
    });
  }, 120000);
});
