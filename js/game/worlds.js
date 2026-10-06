/**
 * worlds.js — the bright "world" maps, and how the track builder reaches them.
 *
 * A world map is described by a skin (colours, fog, light, sky: see skins.js) with a `world` id, and a world module in
 * js/game/maps/ that knows how to build one bay of wall, the floor, the fixtures overhead and the things that move.
 * Like the Hospital Hallway, a world repeats every WORLD_PERIOD units (four bays) so it scrolls without a seam.
 *
 * track.js and skinbuilders.js call in here when a skin has a world; everything else about a map (gates, coins, the
 * runner) works the same as on any other map.
 */

import * as THREE from 'three';
import { WORLD_BAY, LANE_EDGE, slab } from './mapkit.js';
import { playland } from './maps/playland.js';
import { garden } from './maps/garden.js';
import { cafeteria } from './maps/cafeteria.js';
import { nursery } from './maps/nursery.js';
import { amusement } from './maps/amusement.js';
import { pharmacy } from './maps/pharmacy.js';
import { aquarium } from './maps/aquarium.js';
import { rooftop } from './maps/rooftop.js';
import { farm } from './maps/farm.js';
import { holiday } from './maps/holiday.js';
import { neural } from './maps/neural.js';
import { vascular } from './maps/vascular.js';
import { neoner } from './maps/neoner.js';
import { theater } from './maps/theater.js';
import { candylab } from './maps/candylab.js';
import { sunset } from './maps/sunset.js';
import { skeletal } from './maps/skeletal.js';
import { cellular } from './maps/cellular.js';
import { dna } from './maps/dna.js';
import { cardiac } from './maps/cardiac.js';
import { xray } from './maps/xray.js';
import { defib } from './maps/defib.js';

/** Every world module, by id. Each is { bay, center?, arch?, ground?, extras? } (see the Playland for the shape). */
export var WORLDS = {
  playland: playland,
  garden: garden,
  cafeteria: cafeteria,
  nursery: nursery,
  amusement: amusement,
  pharmacy: pharmacy,
  aquarium: aquarium,
  rooftop: rooftop,
  farm: farm,
  holiday: holiday,
  neural: neural,
  vascular: vascular,
  neoner: neoner,
  theater: theater,
  candylab: candylab,
  sunset: sunset,
  skeletal: skeletal,
  cellular: cellular,
  dna: dna,
  cardiac: cardiac,
  xray: xray,
  defib: defib
};

export function worldOf(skin) {
  return (skin && skin.world && WORLDS[skin.world]) || null;
}

export function isWorld(skin) { return !!worldOf(skin); }

/** Which of the four bays this z is (0..3), stable as the track scrolls. */
export function worldBay(z) {
  var k = Math.round(z / WORLD_BAY);
  return ((k % 4) + 4) % 4;
}

/** One 4-unit bay of one side wall; the left call also builds the floor and ceiling pieces for the middle. */
export function buildWorldBay(skin, side, z) {
  var g = new THREE.Group();
  var w = worldOf(skin);
  var k = worldBay(z);
  w.bay(g, side, z, k, skin);
  keepLanesClear(g, side);
  if (side < 0 && w.center) w.center(g, z, k, skin);
  return g;
}

/**
 * A safety net under every bay: a low piece of scenery that reaches into the lanes is nudged back toward the wall, so
 * nothing the runner might take for an obstacle can ever sit on the track. (Overhead pieces, the floor and the ceiling
 * are left alone.)
 */
function keepLanesClear(g, side) {
  g.updateMatrixWorld(true);
  var box = new THREE.Box3();
  g.children.forEach(function (child) {
    box.setFromObject(child);
    if (box.isEmpty() || box.min.y > 2.0 || box.max.y < 0.12) return;
    if (box.min.x < 0 && box.max.x > 0) return;
    var nearest = side > 0 ? box.min.x : -box.max.x;
    var over = LANE_EDGE - nearest;
    if (over > 0 && over <= 0.7) child.position.x += side * over;
  });
}

/** Hanging fixtures across the track (bunting, banners, lamps, mobiles). */
export function buildWorldArch(skin, z) {
  var g = new THREE.Group();
  var w = worldOf(skin);
  // a counter that stays the same as the fixtures scroll past, so each one keeps its colours
  if (w.arch) w.arch(g, z, Math.abs(Math.round(z / 22)) % 6, skin);
  return g;
}

/**
 * The ground under everything: a lit base, the lane dividers, and anything the world adds beyond the walls
 * (grass, sand, water, a street).
 */
export function buildWorldGround(skin) {
  var g = new THREE.Group();
  var c = skin.colors;
  var w = worldOf(skin);
  var base = slab(g, 14, 400, c.ground, 0, 0, -190, { r: 0.8, env: 0.3 });
  base.receiveShadow = false;
  for (var lx = -1; lx <= 1; lx += 2) slab(g, 0.07, 400, c.lane, lx * 1.5, 0.02, -190, { bulb: true, op: 0.5 });
  if (w.ground) w.ground(g, skin);
  return g;
}

// ===== DAY SKY =====
// A bright gradient with a sun, drawn only where nothing else is (it is rendered after the scenery, so the shader
// never runs on pixels the walls and floor already cover).

export function buildDaySky(skin) {
  var s = skin.sky || {};
  var sunDir = new THREE.Vector3(s.sunX === undefined ? -0.35 : s.sunX, s.sunY === undefined ? 0.45 : s.sunY, -0.8).normalize();
  var material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(s.top || 0x4aa8f0) },
      horizon: { value: new THREE.Color(s.horizon || skin.colors.bg) },
      sunColor: { value: new THREE.Color(s.sun || 0xfff0c0) },
      sunDir: { value: sunDir }
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float h = clamp(d.y, 0.0, 1.0);',
      '  vec3 col = mix(horizon, top, pow(h, 0.3));',
      '  float s = max(dot(d, sunDir), 0.0);',
      '  col += sunColor * (pow(s, 5.0) * 0.28 + pow(s, 90.0) * 0.9);',
      '  col = mix(col, horizon, smoothstep(0.02, -0.25, d.y));',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n')
  });
  var dome = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 12), material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.userData.isSkyDome = true;
  return dome;
}
