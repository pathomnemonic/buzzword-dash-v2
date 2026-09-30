/**
 * track.js — Track construction under trackRoot
 *
 * ARCHITECTURE CONTRACT (§23):
 * - buildTrack(trackRoot, skin, options) — canonical signature
 * - All environment objects are descendants of trackRoot
 * - Returns explicit references with dispose()
 * - No scene-wide cleanup traversal for map transitions
 * - Supports quality levels via options.quality
 * - Supports reduced motion via options.reducedMotion
 * - Supports deterministic RNG via options.rng
 *
 * The following must NOT be children of trackRoot:
 * Player, Player shadow, Exam monster, Gates, Obstacles,
 * Pickups, Trails, Power-up effects, Main camera.
 *
 * Track replacement pattern:
 *   scene.remove(trackRoot);
 *   trackRefs.dispose();
 *   trackRoot = new THREE.Group();
 *   scene.add(trackRoot);
 *   trackRefs = buildTrack(trackRoot, nextSkin, options);
 */

import * as THREE from 'three';
import {
  buildWallSegment,
  buildArch,
  buildGround,
  buildAtmosphericParticle,
  buildWallGlowStrips
} from './skinbuilders.js';
import { PROP_BUILDERS, getSpecialtyProps } from './props.js';
import { upgradeMaterials } from './materials.js';
import { isLowQuality } from './quality.js';

// ===== CONSTANTS =====
var WALL_SEGMENT_SPACING = 4;
var ARCH_SPACING = 22;
var RUNNING_LIGHT_SPACING = 3;

// Quality-dependent constants
var QUALITY_CONFIGS = {
  low: {
    particlePoolSize: 15,
    scrollLineCount: 15,
    wallPanelCount: 12,
    wallMarkerCount: 10,
    skyboxElementCount: 3,
    wallSegmentSpacing: 6,
    archSpacing: 30
  },
  medium: {
    particlePoolSize: 30,
    scrollLineCount: 25,
    wallPanelCount: 20,
    wallMarkerCount: 16,
    skyboxElementCount: 5,
    wallSegmentSpacing: 4,
    archSpacing: 22
  },
  high: {
    particlePoolSize: 40,
    scrollLineCount: 30,
    wallPanelCount: 24,
    wallMarkerCount: 20,
    skyboxElementCount: 6,
    wallSegmentSpacing: 4,
    archSpacing: 22
  }
};

// Scroll line constants
var SCROLL_LINE_FAR_Z = -80;
var SCROLL_LINE_NEAR_Z = 5;
var SCROLL_LINE_SPACING = 2.5;

// Wall scroll panel constants
var WALL_PANEL_SPACING = 3.5;
var WALL_PANEL_FAR_Z = -85;
var WALL_PANEL_NEAR_Z = 6;

// Wall marker constants
var WALL_MARKER_SPACING = 4;
var WALL_MARKER_FAR_Z = -80;
var WALL_MARKER_NEAR_Z = 8;

// Skybox element constants
var SKYBOX_FAR_Z = -200;
var SKYBOX_NEAR_Z = 10;
var SKYBOX_SPEED_RATIO = 0.1;

// ===== HELPER: dispose a group and all its children =====
function disposeGroup(group) {
  if (!group) return;
  group.traverse(function (child) {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        for (var m = 0; m < child.material.length; m++) {
          if (child.material[m].map) child.material[m].map.dispose();
          child.material[m].dispose();
        }
      } else {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
  });
}

function getQualityConfig(quality) {
  if (quality === 'low') return QUALITY_CONFIGS.low;
  if (quality === 'high') return QUALITY_CONFIGS.high;
  return QUALITY_CONFIGS.medium;
}

// ===== MAIN TRACK BUILDER =====

/**
 * Build the complete track environment under trackRoot.
 *
 * @param {THREE.Group} trackRoot - The dedicated group for all track objects
 * @param {object} skin - Skin definition from skins.js
 * @param {object} [options] - Build options
 * @param {string} [options.quality='medium'] - 'low' | 'medium' | 'high'
 * @param {boolean} [options.reducedMotion=false] - Disable animated elements
 * @param {function} [options.rng] - Deterministic RNG for multiplayer
 * @returns {object} Track references with dispose()
 */
export function buildTrack(trackRoot, skin, options) {
  if (!options) options = {};
  var quality = options.quality || 'medium';
  var reducedMotion = !!options.reducedMotion;
  var qc = getQualityConfig(quality);

  var trackRefs = {
    root: trackRoot,
    lights: [],
    runningLights: [],
    particlePool: [],
    particleStates: [],
    scrollLines: [],
    wallScrollPanels: [],
    wallMarkers: [],
    skyboxElements: [],
    scrollers: [],
    sharedResources: {},
    dispose: function () {
      // Safe disposal: only removes trackRoot's children
      disposeGroup(trackRoot);
      while (trackRoot.children.length > 0) {
        trackRoot.remove(trackRoot.children[0]);
      }
      // Clear references
      this.runningLights = [];
      this.particlePool = [];
      this.particleStates = [];
      this.scrollLines = [];
      this.wallScrollPanels = [];
      this.wallMarkers = [];
      this.skyboxElements = [];
      this.scrollers = [];
      this.lights = [];
    }
  };

  // Setup lighting (lights are added to trackRoot)
  var lightRefs = setupSkinLightingUnderRoot(skin, trackRoot);
  trackRefs.lights = lightRefs;

  // Sky and distance haze: depth instead of a black void
  if (!isLowQuality()) trackRoot.add(buildSkyDome(skin));
  if (trackRoot.isScene) trackRoot.fog = new THREE.Fog(skin.colors.bg, 70, 240);

  // Ground
  var groundGroup = buildGround(skin);
  trackRoot.add(groundGroup);

  // Walls
  buildWalls(trackRoot, skin, qc, trackRefs);

  // Arches
  buildArches(trackRoot, skin, qc, trackRefs);

  // Wall glow strips
  for (var glowSide = -1; glowSide <= 1; glowSide += 2) {
    var glowStrips = buildWallGlowStrips(skin, glowSide);
    trackRoot.add(glowStrips);
  }

  // Running lights
  buildRunningLights(trackRoot, skin, trackRefs);

  // Atmospheric particles (skip if reduced motion)
  if (!reducedMotion) {
    createParticlePool(trackRoot, skin, trackRefs, qc);
  }

  // Scroll lines
  buildScrollLines(trackRoot, skin, trackRefs, qc);

  // Wall scroll panels
  buildWallScrollPanels(trackRoot, skin, trackRefs, qc);

  // Wall markers
  buildWallMarkers(trackRoot, skin, trackRefs, qc);

  // Skybox elements (skip if reduced motion)
  if (!reducedMotion) {
    buildSkyboxElements(trackRoot, skin, trackRefs, qc);
  }

  return trackRefs;
}

// ===== SKY DOME =====
// A gradient sky with a horizon glow and stars, so the world reads as a place
// rather than a void. Static: the scenery scrolls, the sky does not.

function buildSkyDome(skin) {
  var c = skin.colors;
  var mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(c.sky || c.bg) },
      horizon: { value: new THREE.Color(c.wallGlow || c.lane || 0x18ffff) },
      base: { value: new THREE.Color(c.bg) }
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 base;',
      'float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
      'void main(){',
      '  float h = vDir.y;',
      '  vec3 col = mix(base, top, smoothstep(-0.05, 0.75, h));',
      '  float glow = exp(-abs(h) * 7.0);',
      '  col += horizon * glow * 0.32;',
      '  vec3 cell = floor(vDir * 170.0);',
      '  float s = hash(cell);',
      '  float star = step(0.9965, s) * smoothstep(0.02, 0.35, h);',
      '  col += vec3(star) * (0.5 + 0.5 * hash(cell + 7.0));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });
  var dome = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.userData.isSkyDome = true;
  return dome;
}

// ===== LIGHTING UNDER TRACKROOT =====

function setupSkinLightingUnderRoot(skin, trackRoot) {
  var c = skin.colors;
  var lights = [];

  var ambient = new THREE.AmbientLight(c.ambient, 0.6);
  ambient.userData.skinLight = true;
  trackRoot.add(ambient);
  lights.push(ambient);

  var hemi = new THREE.HemisphereLight(c.hemiTop, c.hemiBot, 0.5);
  hemi.userData.skinLight = true;
  trackRoot.add(hemi);
  lights.push(hemi);

  var dir = new THREE.DirectionalLight(c.dirLight, 0.8);
  dir.position.set(5, 18, 8);
  dir.castShadow = true;
  dir.userData.skinLight = true;
  trackRoot.add(dir);
  lights.push(dir);

  return lights;
}

// ===== WALL CONSTRUCTION =====

/**
 * Walls and arches repeat every `spacing` units, so they scroll by sliding a
 * group forward and wrapping it by one period: seamless and allocation-free.
 */
function makeScroller(trackRoot, trackRefs, spacing) {
  var group = new THREE.Group();
  trackRoot.add(group);
  trackRefs.scrollers.push({ group: group, spacing: spacing });
  return group;
}

export function updateScrollers(scrollers, move) {
  if (!scrollers) return;
  for (var i = 0; i < scrollers.length; i++) {
    var s = scrollers[i];
    s.group.position.z = (s.group.position.z + move) % s.spacing;
  }
}

function buildWalls(trackRoot, skin, qc, trackRefs) {
  var spacing = qc.wallSegmentSpacing || WALL_SEGMENT_SPACING;
  var group = makeScroller(trackRoot, trackRefs, spacing);
  for (var side = -1; side <= 1; side += 2) {
    for (var z = -160 - spacing; z < 20; z += spacing) {
      var segment = buildWallSegment(skin, side, z, 3.5);
      group.add(segment);
    }
  }
  // Solid wall surfaces become lit; bright neon and see-through parts keep their glow
  upgradeMaterials(group, { glowAbove: 0.62, envIntensity: 0.6 });
}

// ===== ARCH CONSTRUCTION =====

function buildArches(trackRoot, skin, qc, trackRefs) {
  var spacing = qc.archSpacing || ARCH_SPACING;
  var group = makeScroller(trackRoot, trackRefs, spacing);
  for (var z = -155 - spacing; z < 15; z += spacing) {
    var arch = buildArch(skin, z);
    group.add(arch);

    for (var legSide = -1; legSide <= 1; legSide += 2) {
      var leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 5, 6),
        new THREE.MeshBasicMaterial({ color: skin.colors.archMain })
      );
      leg.position.set(legSide * 5.5, 2.5, z);
      group.add(leg);
    }
  }
  upgradeMaterials(group, { glowAbove: 0.62, envIntensity: 0.6 });
}

// ===== SCROLLING GROUND LINES =====

function buildScrollLines(trackRoot, skin, trackRefs, qc) {
  var c = skin.colors;
  var lineColor = c.lane || c.wallGlow || 0x18ffff;
  var count = qc.scrollLineCount;

  for (var i = 0; i < count; i++) {
    var z = SCROLL_LINE_FAR_Z + i * SCROLL_LINE_SPACING;

    var lineMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 0.06),
      new THREE.MeshBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: 0.15
      })
    );
    lineMesh.rotation.x = -Math.PI / 2;
    lineMesh.position.set(0, 0.02, z);
    lineMesh.userData = { type: 'scrollLine', baseOpacity: 0.15 };
    trackRoot.add(lineMesh);
    trackRefs.scrollLines.push(lineMesh);

    if (i % 3 === 0) {
      var centerLine = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 0.04),
        new THREE.MeshBasicMaterial({
          color: lineColor,
          transparent: true,
          opacity: 0.25
        })
      );
      centerLine.rotation.x = -Math.PI / 2;
      centerLine.position.set(0, 0.025, z + 1.2);
      centerLine.userData = { type: 'scrollLine', baseOpacity: 0.25 };
      trackRoot.add(centerLine);
      trackRefs.scrollLines.push(centerLine);
    }
  }
}

export function updateScrollLines(scrollLines, dt, move) {
  if (!scrollLines || scrollLines.length === 0) return;
  for (var i = 0; i < scrollLines.length; i++) {
    var line = scrollLines[i];
    line.position.z += move;
    if (line.position.z > SCROLL_LINE_NEAR_Z) {
      line.position.z = SCROLL_LINE_FAR_Z + (line.position.z - SCROLL_LINE_NEAR_Z);
    }
    var distRatio = 1.0 - Math.max(0, -line.position.z) / Math.abs(SCROLL_LINE_FAR_Z);
    var baseOp = line.userData.baseOpacity || 0.15;
    line.material.opacity = baseOp * (0.5 + distRatio * 0.5);
  }
}

// ===== WALL SCROLL PANELS =====

function buildWallScrollPanels(trackRoot, skin, trackRefs, qc) {
  var c = skin.colors;
  var panelColor = c.wallGlow || c.lane || 0x18ffff;
  var panelColorDim = c.wallB || c.wallA || 0x222266;
  var count = qc.wallPanelCount;

  for (var i = 0; i < count; i++) {
    var z = WALL_PANEL_FAR_Z + i * WALL_PANEL_SPACING;

    for (var side = -1; side <= 1; side += 2) {
      var x = side * 5.48;

      var stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 2.0),
        new THREE.MeshBasicMaterial({ color: panelColor, transparent: true, opacity: 0.25 })
      );
      stripe.position.set(x, 1.5, z);
      stripe.rotation.y = side * (-Math.PI / 2);
      stripe.userData = { type: 'wallScrollPanel', side: side, baseOpacity: 0.25 };
      trackRoot.add(stripe);
      trackRefs.wallScrollPanels.push(stripe);

      var stripe2 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.04, 1.2),
        new THREE.MeshBasicMaterial({ color: panelColor, transparent: true, opacity: 0.15 })
      );
      stripe2.position.set(x, 2.8, z + WALL_PANEL_SPACING * 0.5);
      stripe2.rotation.y = side * (-Math.PI / 2);
      stripe2.userData = { type: 'wallScrollPanel', side: side, baseOpacity: 0.15 };
      trackRoot.add(stripe2);
      trackRefs.wallScrollPanels.push(stripe2);

      var stripe3 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.05, 0.8),
        new THREE.MeshBasicMaterial({ color: panelColorDim, transparent: true, opacity: 0.18 })
      );
      stripe3.position.set(x, 0.4, z + WALL_PANEL_SPACING * 0.3);
      stripe3.rotation.y = side * (-Math.PI / 2);
      stripe3.userData = { type: 'wallScrollPanel', side: side, baseOpacity: 0.18 };
      trackRoot.add(stripe3);
      trackRefs.wallScrollPanels.push(stripe3);

      if (i % 2 === 0) {
        var hPanel = new THREE.Mesh(
          new THREE.PlaneGeometry(2.0, 0.04),
          new THREE.MeshBasicMaterial({ color: panelColor, transparent: true, opacity: 0.12 })
        );
        hPanel.position.set(x, 1.5 + (i % 3) * 0.6, z);
        hPanel.rotation.y = side * (-Math.PI / 2);
        hPanel.userData = { type: 'wallScrollPanel', side: side, baseOpacity: 0.12 };
        trackRoot.add(hPanel);
        trackRefs.wallScrollPanels.push(hPanel);
      }
    }
  }
}

export function updateWallScrollPanels(wallScrollPanels, dt, move) {
  if (!wallScrollPanels || wallScrollPanels.length === 0) return;
  for (var i = 0; i < wallScrollPanels.length; i++) {
    var panel = wallScrollPanels[i];
    panel.position.z += move;
    if (panel.position.z > WALL_PANEL_NEAR_Z) {
      panel.position.z = WALL_PANEL_FAR_Z + (panel.position.z - WALL_PANEL_NEAR_Z);
    }
    var distRatio = 1.0 - Math.max(0, -panel.position.z) / Math.abs(WALL_PANEL_FAR_Z);
    var baseOp = panel.userData.baseOpacity || 0.2;
    panel.material.opacity = baseOp * (0.4 + distRatio * 0.6);
  }
}

// ===== WALL ACCENT MARKERS =====

function buildWallMarkers(trackRoot, skin, trackRefs, qc) {
  var c = skin.colors;
  var markerColor = c.wallGlow || c.lane || 0x18ffff;
  var count = qc.wallMarkerCount;

  for (var i = 0; i < count; i++) {
    var z = WALL_MARKER_FAR_Z + i * WALL_MARKER_SPACING;

    for (var side = -1; side <= 1; side += 2) {
      var x = side * 5.45;

      var marker = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 0.4),
        new THREE.MeshBasicMaterial({ color: markerColor, transparent: true, opacity: 0.35 })
      );
      marker.position.set(x, 1.0 + (i % 3) * 0.5, z);
      marker.rotation.y = side * (-Math.PI / 2);
      marker.userData = { type: 'wallMarker', side: side };
      trackRoot.add(marker);
      trackRefs.wallMarkers.push(marker);

      if (i % 2 === 0) {
        var dot = new THREE.Mesh(
          new THREE.PlaneGeometry(0.12, 0.12),
          new THREE.MeshBasicMaterial({ color: markerColor, transparent: true, opacity: 0.2 })
        );
        dot.position.set(x, 2.5 + (i % 4) * 0.3, z + 2);
        dot.rotation.y = side * (-Math.PI / 2);
        dot.userData = { type: 'wallMarker', side: side };
        trackRoot.add(dot);
        trackRefs.wallMarkers.push(dot);
      }
    }
  }
}

export function updateWallMarkers(wallMarkers, dt, move) {
  if (!wallMarkers || wallMarkers.length === 0) return;
  for (var i = 0; i < wallMarkers.length; i++) {
    var marker = wallMarkers[i];
    marker.position.z += move;
    if (marker.position.z > WALL_MARKER_NEAR_Z) {
      marker.position.z = WALL_MARKER_FAR_Z + (marker.position.z - WALL_MARKER_NEAR_Z);
    }
    var distRatio = 1.0 - Math.max(0, -marker.position.z) / Math.abs(WALL_MARKER_FAR_Z);
    marker.material.opacity = (0.15 + distRatio * 0.25);
  }
}

// ===== DYNAMIC SKYBOX ELEMENTS =====

function buildSkyboxElements(trackRoot, skin, trackRefs, qc) {
  var c = skin.colors;
  var skyColor = c.archGlow || c.wallGlow || 0x18ffff;
  var count = qc.skyboxElementCount;

  var builders = [
    buildSkyboxPillCapsule,
    buildSkyboxDNAHelix,
    buildSkyboxHospital,
    buildSkyboxCross,
    buildSkyboxHeartbeat,
    buildSkyboxMolecule
  ];

  for (var i = 0; i < count; i++) {
    var builder = builders[i % builders.length];
    var element = builder(skyColor);

    var side = (i % 2 === 0) ? -1 : 1;
    var x = side * (15 + Math.random() * 10);
    var y = 5 + Math.random() * 10;
    var z = SKYBOX_FAR_Z + (i / count) * (Math.abs(SKYBOX_FAR_Z) - 40);

    element.position.set(x, y, z);
    element.rotation.y = Math.random() * Math.PI * 2;

    var scale = 3 + Math.random() * 4;
    element.scale.set(scale, scale, scale);

    element.userData = { type: 'skyboxElement', rotSpeed: (Math.random() - 0.5) * 0.1 };
    trackRoot.add(element);
    trackRefs.skyboxElements.push(element);
  }
}

function buildSkyboxPillCapsule(color) {
  var g = new THREE.Group();
  var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
  var mat2 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08 });
  var top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  top.position.y = 0.5; g.add(top);
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 8), mat);
  g.add(body);
  var bottom = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat2);
  bottom.position.y = -0.5; g.add(bottom);
  return g;
}

function buildSkyboxDNAHelix(color) {
  var g = new THREE.Group();
  var mat1 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
  var mat2 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.07 });
  var segments = 16;
  for (var i = 0; i < segments; i++) {
    var t = i / segments;
    var y = t * 3 - 1.5;
    var angle = t * Math.PI * 4;
    var s1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat1);
    s1.position.set(Math.cos(angle) * 0.5, y, Math.sin(angle) * 0.5); g.add(s1);
    var s2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat2);
    s2.position.set(-Math.cos(angle) * 0.5, y, -Math.sin(angle) * 0.5); g.add(s2);
    if (i % 3 === 0) {
      var rung = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 4), mat2);
      rung.position.set(0, y, 0); rung.rotation.z = Math.PI / 2; rung.rotation.y = angle; g.add(rung);
    }
  }
  return g;
}

function buildSkyboxHospital(color) {
  var g = new THREE.Group();
  var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08 });
  var main = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1.5), mat);
  main.position.y = 1.5; g.add(main);
  var winMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15 });
  for (var row = 0; row < 4; row++) {
    for (var col = 0; col < 3; col++) {
      var win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), winMat);
      win.position.set(-0.5 + col * 0.5, 0.8 + row * 0.7, 0.76); g.add(win);
    }
  }
  return g;
}

function buildSkyboxCross(color) {
  var g = new THREE.Group();
  var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.1), mat));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.1), mat));
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.04, 8, 20),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.06 })
  );
  g.add(ring);
  return g;
}

function buildSkyboxHeartbeat(color) {
  var g = new THREE.Group();
  var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
  var segments = [
    { x: -1.5, y: 0, w: 0.6, h: 0.04 }, { x: -0.8, y: 0.2, w: 0.04, h: 0.4 },
    { x: -0.5, y: -0.3, w: 0.04, h: 0.6 }, { x: -0.2, y: 0.5, w: 0.04, h: 1.0 },
    { x: 0.1, y: -0.2, w: 0.04, h: 0.4 }, { x: 0.4, y: 0, w: 0.8, h: 0.04 },
    { x: 1.2, y: 0, w: 0.6, h: 0.04 }
  ];
  for (var i = 0; i < segments.length; i++) {
    var s = segments[i];
    var seg = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.04), mat);
    seg.position.set(s.x, s.y, 0); g.add(seg);
  }
  return g;
}

function buildSkyboxMolecule(color) {
  var g = new THREE.Group();
  var atomMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
  var bondMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.06 });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), atomMat));
  var positions = [[1, 0.5, 0], [-0.8, 0.7, 0.3], [0.3, -1, 0.2], [-0.5, -0.3, -0.8], [0.7, 0.2, -0.6]];
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var atom = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), atomMat);
    atom.position.set(p[0], p[1], p[2]); g.add(atom);
    var len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    var bond = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 4), bondMat);
    bond.position.set(p[0] / 2, p[1] / 2, p[2] / 2);
    bond.lookAt(new THREE.Vector3(p[0], p[1], p[2]));
    bond.rotateX(Math.PI / 2); g.add(bond);
  }
  return g;
}

export function updateSkyboxElements(skyboxElements, dt, move, time) {
  if (!skyboxElements || skyboxElements.length === 0) return;
  var skyboxMove = move * SKYBOX_SPEED_RATIO;

  for (var i = 0; i < skyboxElements.length; i++) {
    var el = skyboxElements[i];
    el.position.z += skyboxMove;
    if (el.userData.rotSpeed) el.rotation.y += el.userData.rotSpeed * dt;
    if (el.position.z > SKYBOX_NEAR_Z) {
      el.position.z = SKYBOX_FAR_Z + (el.position.z - SKYBOX_NEAR_Z);
      var side = (Math.random() > 0.5) ? 1 : -1;
      el.position.x = side * (15 + Math.random() * 10);
      el.position.y = 5 + Math.random() * 10;
    }
  }
}

// ===== RUNNING LIGHTS =====

function buildRunningLights(trackRoot, skin, trackRefs) {
  var c = skin.colors;

  for (var side = -1; side <= 1; side += 2) {
    for (var z = -160; z < 20; z += RUNNING_LIGHT_SPACING) {
      var light = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({
          color: c.wallGlow,
          transparent: true,
          opacity: 0.15
        })
      );
      light.position.set(side * 4.5, 0.06, z);
      light.userData = { baseZ: z, side: side, baseOpacity: 0.15, maxOpacity: 0.7 };
      trackRoot.add(light);
      trackRefs.runningLights.push(light);
    }
  }
}

export function updateRunningLights(runningLights, time, speed) {
  if (!runningLights || runningLights.length === 0) return;
  var waveSpeed = speed * 0.3;
  var waveLength = 20;

  for (var i = 0; i < runningLights.length; i++) {
    var light = runningLights[i];
    var d = light.userData;
    var phase = (d.baseZ + time * waveSpeed) / waveLength;
    var wave = (Math.sin(phase * Math.PI * 2) + 1) * 0.5;
    light.material.opacity = d.baseOpacity + wave * (d.maxOpacity - d.baseOpacity);
  }
}

// ===== ATMOSPHERIC PARTICLE POOL =====

function createParticlePool(trackRoot, skin, trackRefs, qc) {
  var count = qc.particlePoolSize;
  for (var i = 0; i < count; i++) {
    var particle = buildAtmosphericParticle(skin);
    var px = (Math.random() - 0.5) * 10;
    var py = 0.5 + Math.random() * 4;
    var pz = -150 + Math.random() * 170;
    particle.position.set(px, py, pz);
    particle.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    trackRoot.add(particle);
    trackRefs.particlePool.push(particle);
    trackRefs.particleStates.push({
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.1 + 0.05,
      vz: 0,
      rotSpeed: (Math.random() - 0.5) * 0.5,
      driftPhase: Math.random() * Math.PI * 2,
      baseY: py
    });
  }
}

export function updateAtmosphericParticles(particlePool, particleStates, dt, move, time) {
  if (!particlePool || particlePool.length === 0) return;

  for (var i = 0; i < particlePool.length; i++) {
    var p = particlePool[i];
    var s = particleStates[i];
    p.position.z += move * 0.5;
    p.position.x += s.vx * dt;
    p.position.y = s.baseY + Math.sin(time * 0.5 + s.driftPhase) * 0.3;
    p.rotation.y += s.rotSpeed * dt;
    p.rotation.x += s.rotSpeed * dt * 0.3;
    if (p.position.z > 8) {
      p.position.z = -150 - Math.random() * 30;
      p.position.x = (Math.random() - 0.5) * 10;
      s.baseY = 0.5 + Math.random() * 4;
      p.position.y = s.baseY;
      s.vx = (Math.random() - 0.5) * 0.3;
      s.driftPhase = Math.random() * Math.PI * 2;
    }
    if (p.position.x > 5) { p.position.x = 5; s.vx *= -1; }
    if (p.position.x < -5) { p.position.x = -5; s.vx *= -1; }
  }
}

// ===== FLYING ENVIRONMENT PROPS =====
// NOTE: Props are NOT added to trackRoot — they are gameplay objects
// managed by the engine (envPropMeshes array). This function adds to scene directly.

export function spawnEnvProp(scene, envPropMeshes, selectedSubjects) {
  var builders = selectedSubjects ? getSpecialtyProps(selectedSubjects) : PROP_BUILDERS;
  var builder = builders[Math.floor(Math.random() * builders.length)];
  var prop = builder();
  upgradeMaterials(prop, { glowAbove: 0.8 });

  var placement = Math.random();
  if (placement < 0.35) {
    prop.position.set(-7 - Math.random() * 4, Math.random() * 3, -80 - Math.random() * 20);
  } else if (placement < 0.7) {
    prop.position.set(7 + Math.random() * 4, Math.random() * 3, -80 - Math.random() * 20);
  } else if (placement < 0.9) {
    prop.position.set((Math.random() - 0.5) * 10, 4 + Math.random() * 4, -80 - Math.random() * 20);
  } else {
    prop.position.set((Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 2), 1 + Math.random() * 2, -90 - Math.random() * 10);
  }

  prop.rotation.y = Math.random() * Math.PI * 2;
  prop.rotation.x = (Math.random() - 0.5) * 0.3;
  var scale = 0.5 + Math.random() * 1.0;
  prop.scale.set(scale, scale, scale);
  prop.userData = { isEnvProp: true };
  scene.add(prop);
  envPropMeshes.push(prop);
}

// ===== CAMERA FOV ANIMATION =====

export function calculateTargetFOV(baseSpeed, currentSpeed, baseFOV, maxFOV, isRushing) {
  if (!baseFOV) baseFOV = 70;
  if (!maxFOV) maxFOV = 85;
  var speedRatio = currentSpeed / Math.max(baseSpeed, 0.01);
  var normalizedSpeed = Math.min(Math.max((speedRatio - 1) / 1.5, 0), 1);
  var targetFOV = baseFOV + normalizedSpeed * (maxFOV - baseFOV);
  if (isRushing) targetFOV = Math.min(targetFOV + 5, maxFOV + 5);
  return targetFOV;
}

export function updateCameraFOV(camera, targetFOV, dt, lerpSpeed) {
  if (!lerpSpeed) lerpSpeed = 2.0;
  var diff = targetFOV - camera.fov;
  if (Math.abs(diff) > 0.01) {
    camera.fov += diff * Math.min(1, lerpSpeed * dt);
    camera.updateProjectionMatrix();
  }
}

// ===== CAMERA LANE LEAN =====

export function calculateCameraLean(currentCameraX, targetLane, dt, baseCameraX) {
  if (baseCameraX === undefined) baseCameraX = 0;
  var laneOffset = (targetLane - 1) * 0.5;
  var targetX = baseCameraX + laneOffset;
  var diff = targetX - currentCameraX;
  return currentCameraX + diff * Math.min(1, 4 * dt);
}

// ===== STREAK VISUAL ENHANCEMENT =====

export function getStreakVisualIntensity(streak) {
  return {
    glowMultiplier: 1.0 + Math.min(streak * 0.02, 0.5),
    particleDensity: 1.0 + Math.min(streak * 0.05, 1.5),
    fovBoost: Math.min(streak * 0.1, 2.0),
    colorShift: Math.min(streak * 0.01, 0.3)
  };
}
