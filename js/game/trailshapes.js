/**
 * trailshapes.js — the little shapes each trail is made of.
 *
 * Every trail used to be coloured circles, whatever its name said: "Hearts" streamed pink balls. Each trail now has
 * a shape that matches its name and description (a heart, a music note, a pill...). All shapes are flat or tiny,
 * drawn once and shared, and sized so that their longest side is the same as the old circle's diameter, so the
 * particle budgets and scales in trails.js do not change.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

var SIZE = 0.2; // longest side of every shape

/** Centre a geometry on the origin and scale its longest side to SIZE. */
function normalize(geo) {
  geo.computeBoundingBox();
  var box = geo.boundingBox;
  var c = new THREE.Vector3();
  box.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);
  var size = new THREE.Vector3();
  box.getSize(size);
  var k = SIZE / Math.max(size.x, size.y, size.z, 1e-6);
  geo.scale(k, k, k);
  return geo;
}

/** A thick line through points, as flat quads in the XY plane. */
function stroke(points, width) {
  var parts = [];
  for (var i = 0; i < points.length - 1; i++) {
    var a = points[i];
    var b = points[i + 1];
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len * width / 2;
    var ny = dx / len * width / 2;
    var shape = new THREE.Shape();
    shape.moveTo(a[0] + nx, a[1] + ny);
    shape.lineTo(b[0] + nx, b[1] + ny);
    shape.lineTo(b[0] - nx, b[1] - ny);
    shape.lineTo(a[0] - nx, a[1] - ny);
    shape.closePath();
    parts.push(new THREE.ShapeGeometry(shape));
  }
  return mergeGeometries(parts);
}

function heart() {
  var s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.25, -0.05, 0, -0.25, 0);
  s.bezierCurveTo(-0.55, 0, -0.55, 0.35, -0.55, 0.35);
  s.bezierCurveTo(-0.55, 0.55, -0.35, 0.77, 0, 0.95);
  s.bezierCurveTo(0.35, 0.77, 0.55, 0.55, 0.55, 0.35);
  s.bezierCurveTo(0.55, 0.35, 0.55, 0, 0.25, 0);
  s.bezierCurveTo(0.1, 0, 0, 0.25, 0, 0.25);
  return new THREE.ShapeGeometry(s);
}

function note() {
  var head = new THREE.Shape();
  head.absellipse(-0.25, -0.45, 0.28, 0.2, 0, Math.PI * 2, false, 0.4);
  var stem = new THREE.Shape();
  stem.moveTo(-0.03, -0.4); stem.lineTo(0.09, -0.4); stem.lineTo(0.09, 0.7); stem.lineTo(-0.03, 0.7); stem.closePath();
  var flag = new THREE.Shape();
  flag.moveTo(0.09, 0.7); flag.bezierCurveTo(0.35, 0.55, 0.55, 0.4, 0.4, 0.05);
  flag.bezierCurveTo(0.45, 0.45, 0.3, 0.45, 0.09, 0.4); flag.closePath();
  return mergeGeometries([new THREE.ShapeGeometry(head), new THREE.ShapeGeometry(stem), new THREE.ShapeGeometry(flag)]);
}

function bolt() {
  return stroke([[0.25, 1], [-0.2, 0.15], [0.15, 0.1], [-0.25, -1]], 0.28);
}

function ekg() {
  // a flat line with the sharp spike of a heartbeat
  return stroke([[-1, 0], [-0.45, 0], [-0.3, 0.25], [-0.15, -0.2], [0, 1], [0.15, -0.55], [0.3, 0], [1, 0]], 0.16);
}

function star() {
  var s = new THREE.Shape();
  var pts = 4;
  for (var i = 0; i < pts * 2; i++) {
    var r = i % 2 === 0 ? 1 : 0.28;
    var a = i / (pts * 2) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function flame() {
  var s = new THREE.Shape();
  s.moveTo(0, 1);
  s.bezierCurveTo(0.15, 0.55, 0.6, 0.35, 0.5, -0.15);
  s.bezierCurveTo(0.45, -0.7, -0.45, -0.7, -0.5, -0.15);
  s.bezierCurveTo(-0.55, 0.15, -0.2, 0.3, -0.12, 0.5);
  s.bezierCurveTo(-0.08, 0.7, -0.02, 0.8, 0, 1);
  return new THREE.ShapeGeometry(s);
}

function cell() {
  // a red blood cell: a round disc with a dimple (a flat ring seen face on)
  return new THREE.RingGeometry(0.28, 0.5, 20);
}

function pill() {
  var g = new THREE.CapsuleGeometry(0.22, 0.5, 4, 10);
  g.rotateZ(Math.PI / 2);
  return g;
}

function bubble() {
  return new THREE.SphereGeometry(0.5, 12, 10);
}

function confetti() {
  return new THREE.PlaneGeometry(1, 0.55);
}

function ribbon() {
  return new THREE.PlaneGeometry(1, 0.28);
}

function bead() {
  return new THREE.SphereGeometry(0.5, 10, 8);
}

/** shape name -> how to draw it, and the plain words a description can use for it. */
var BUILDERS = {
  heart:    { build: heart,    words: ['heart'] },
  note:     { build: note,     words: ['music note', 'note'] },
  bolt:     { build: bolt,     words: ['lightning bolt', 'bolt'] },
  ekg:      { build: ekg,      words: ['heartbeat', 'ekg'] },
  star:     { build: star,     words: ['spark'] },
  flame:    { build: flame,    words: ['flame'] },
  cell:     { build: cell,     words: ['blood cell'] },
  pill:     { build: pill,     words: ['pill', 'capsule'] },
  bubble:   { build: bubble,   words: ['bubble'] },
  confetti: { build: confetti, words: ['confetti'] },
  ribbon:   { build: ribbon,   words: ['rainbow', 'ribbon'] },
  bead:     { build: bead,     words: ['bead', 'rung', 'strand'] }
};

export var TRAIL_SHAPES = Object.keys(BUILDERS);

/** The words a description may use to name each shape (used by the test that keeps descriptions honest). */
export function shapeWords(shape) {
  return BUILDERS[shape] ? BUILDERS[shape].words.slice() : [];
}

var _cache = {};

/** The shared geometry for a shape (built on first use). */
export function getTrailGeometry(shape) {
  if (!BUILDERS[shape]) shape = 'bead';
  if (!_cache[shape]) _cache[shape] = normalize(BUILDERS[shape].build());
  return _cache[shape];
}
