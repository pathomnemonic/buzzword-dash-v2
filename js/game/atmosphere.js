/**
 * atmosphere.js — time of day and weather for the open-air maps.
 *
 * A map you have run fifty times should still surprise you: this run it is sunrise, the next golden hour, then a
 * grey day with light rain. Each run picks one at random (the indoor maps have no sky and are left alone). It is only
 * a tint on the sky, haze and light, plus a gentle shower where it rains; it never hides a gate, and it is the same
 * brightness or only a little dimmer than a clear day.
 */

import * as THREE from 'three';
import { combine } from './mapkit.js';
import { swarm } from './mapfx.js';

/**
 * name -> how far to push the sky/haze toward `tint` (0..1), how bright each light gets, the direct light's colour and
 * whether it rains or snows. `weight` is how often it is picked.
 */
export var ATMOSPHERES = {
  day: { weight: 40, tint: null, mix: 0, light: 1, dir: null },
  sunrise: { weight: 16, tint: 0xffb28a, mix: 0.5, light: 0.95, dir: 0xffd2a8 },
  golden: { weight: 18, tint: 0xffc060, mix: 0.45, light: 0.95, dir: 0xffd890 },
  overcast: { weight: 10, tint: 0xb8c4d0, mix: 0.6, light: 0.88, dir: 0xdfe6ee },
  rain: { weight: 12, tint: 0xa8b8c8, mix: 0.6, light: 0.85, dir: 0xd8e2ee, precipitation: 'rain' },
  snow: { weight: 0, tint: 0xdfe8f4, mix: 0.55, light: 0.92, dir: 0xeef4ff, precipitation: 'snow' }
};

/** Which atmospheres this map may have (snow only falls on the Holiday Wards in winter; rain never falls indoors). */
export function allowedAtmospheres(skin) {
  if (!skin || !skin.world || skin.indoor) return [];
  var names = ['day', 'sunrise', 'golden', 'overcast', 'rain'];
  if (skin.season === 'winter') names = ['day', 'overcast', 'snow', 'snow'];
  return names;
}

/**
 * Choose one at random, weighted.
 * @param {object} skin
 * @param {function(): number} [rand]
 * @returns {string|null} null for maps with no sky
 */
export function pickAtmosphere(skin, rand) {
  var names = allowedAtmospheres(skin);
  if (!names.length) return null;
  var r = (rand || Math.random)();
  var weights = names.map(function (n) { return n === 'snow' ? 20 : ATMOSPHERES[n].weight; });
  var total = weights.reduce(function (a, b) { return a + b; }, 0);
  var acc = 0;
  for (var i = 0; i < names.length; i++) {
    acc += weights[i] / total;
    if (r < acc) return names[i];
  }
  return names[names.length - 1];
}

function mixHex(base, tint, amount) {
  return new THREE.Color(base).lerp(new THREE.Color(tint), amount).getHex();
}

/**
 * Put an atmosphere on a skin: tints its sky, haze and light. The skin remembers its clear-day look the first time, so
 * the next run starts from it again (skins are shared; nothing here is saved).
 * @param {object} skin
 * @param {string|null} name
 */
export function applyAtmosphere(skin, name) {
  if (!skin || !skin.world) return;
  if (!skin._clear) {
    skin._clear = {
      bg: skin.colors.bg, sky: skin.sky ? Object.assign({}, skin.sky) : null, dirLight: skin.colors.dirLight,
      light: skin.light ? Object.assign({}, skin.light) : null
    };
  }
  var base = skin._clear;
  skin.colors.bg = base.bg;
  skin.colors.dirLight = base.dirLight;
  skin.sky = base.sky ? Object.assign({}, base.sky) : null;
  skin.light = base.light ? Object.assign({}, base.light) : null;
  skin.atmosphere = name || 'day';
  var a = name && ATMOSPHERES[name];
  if (!a || !a.tint || !skin.sky) return;
  skin.colors.bg = mixHex(base.bg, a.tint, a.mix);
  skin.sky.top = mixHex(base.sky.top || base.bg, a.tint, a.mix * 0.8);
  skin.sky.horizon = mixHex(base.sky.horizon || base.bg, a.tint, a.mix);
  skin.sky.sun = mixHex(base.sky.sun || 0xffffff, a.tint, 0.5);
  if (a.dir) skin.colors.dirLight = mixHex(base.dirLight || 0xffffff, a.dir, 0.6);
  if (skin.light) Object.keys(skin.light).forEach(function (k) { skin.light[k] = base.light[k] * a.light; });
}

/** Rain or snow falling on both sides of the track and a little over it. Call while a build context is open. */
export function addPrecipitation(name) {
  var a = ATMOSPHERES[name];
  if (!a || !a.precipitation) return;
  var rain = a.precipitation === 'rain';
  var geo = rain
    ? combine([{ geo: new THREE.BoxGeometry(0.025, 0.9, 0.025), color: 0xffffff }])
    : combine([{ geo: new THREE.SphereGeometry(0.06, 5, 4), color: 0xffffff }]);
  var material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: rain ? 0.5 : 0.85, depthWrite: false });
  swarm({
    geo: geo, material: material, count: rain ? 140 : 70, seed: rain ? 313 : 717, colors: rain ? [0xcfe4ff] : [0xffffff],
    area: { x: [-14, 14], y: [0, 12], z: [-70, 6] }, k: 1, vy: rain ? [-14, -10] : [-1.2, -0.6], wobble: rain ? 0 : 0.3,
    scale: rain ? [0.8, 1.2] : [0.8, 1.6]
  });
}
