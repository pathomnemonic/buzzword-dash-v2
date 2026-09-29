/**
 * skinbuilders.js — Geometry builders for track skin system
 *
 * Each function builds unique 3D geometry for a specific skin element type.
 * Uses MeshBasicMaterial for guaranteed visibility and performance,
 * as "MeshBasicMaterial is much cheaper to render than
 * MeshStandardMaterial" and "on some mobile devices even
 * MeshStandardMaterial is too expensive to fill the screen" [7] [9].
 *
 * Organized by element type:
 * - Wall builders: unique side-wall geometry per wallType
 * - Arch builders: unique overhead structures per archType
 * - Ground builders: track floor visual variations per groundType
 * - Particle builders: floating atmospheric elements per particleType
 *
 * Performance approach:
 * - Simple primitives (Box, Cylinder, Sphere, Torus) for fast rendering
 * - MeshBasicMaterial everywhere (no lighting calculations needed)
 * - Transparent materials only where glow effects are needed
 * - Minimal vertex count per decorative element
 */

import * as THREE from 'three';

// ===== WALL SEGMENT BUILDERS =====

/**
 * Build a wall segment for the given skin at a specific position.
 * Called repeatedly by track.js to construct side walls.
 *
 * @param {object} skin - Skin definition from skins.js
 * @param {number} side - -1 for left wall, +1 for right wall
 * @param {number} z - Z position along the track
 * @param {number} height - Wall height (default 3.5)
 * @returns {THREE.Group}
 */
export function buildWallSegment(skin, side, z, height) {
  var g = new THREE.Group();
  var c = skin.colors;
  if (!height) height = 3.5;
  var x = side * 5.5;

  switch (skin.wallType) {

    case "organic_tubes":
      // Twisted tube bundles resembling axon fiber tracts
      for (var i = 0; i < 4; i++) {
        var r = 0.1 + i * 0.06;
        var tube = new THREE.Mesh(
          new THREE.CylinderGeometry(r, r, height, 6),
          new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? c.wallA : c.wallB,
            transparent: true,
            opacity: 0.8 - i * 0.12
          })
        );
        tube.position.set(x + side * i * 0.18, height / 2, z);
        g.add(tube);
      }
      // Glow line running along tubes
      var glowLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, height, 0.04),
        new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.5 })
      );
      glowLine.position.set(x, height / 2, z);
      g.add(glowLine);
      break;

    case "artery_walls":
      // Layered vessel wall with inner lining
      var outerWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA })
      );
      outerWall.position.set(x, height / 2, z);
      g.add(outerWall);
      // Inner endothelial lining
      var lining = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, height * 0.85, 1.8),
        new THREE.MeshBasicMaterial({ color: c.wallB, transparent: true, opacity: 0.5 })
      );
      lining.position.set(x - side * 0.15, height / 2, z);
      g.add(lining);
      // Pulsing glow strip
      var pulse = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, height * 0.7, 1.6),
        new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.3 })
      );
      pulse.position.set(x - side * 0.2, height / 2, z);
      g.add(pulse);
      break;

    case "bone_pillars":
      // Vertebrae-like segmented bone pillars
      var numSegments = 4;
      for (var seg = 0; seg < numSegments; seg++) {
        var segH = height / numSegments;
        var segY = seg * segH + segH / 2;
        var boneR = 0.2 + Math.sin(seg * 1.2) * 0.05;
        var bone = new THREE.Mesh(
          new THREE.CylinderGeometry(boneR, boneR + 0.03, segH * 0.85, 6),
          new THREE.MeshBasicMaterial({ color: c.wallA })
        );
        bone.position.set(x, segY, z);
        g.add(bone);
        // Joint disc between segments
        if (seg < numSegments - 1) {
          var disc = new THREE.Mesh(
            new THREE.CylinderGeometry(boneR + 0.04, boneR + 0.04, segH * 0.15, 8),
            new THREE.MeshBasicMaterial({ color: c.wallB, transparent: true, opacity: 0.6 })
          );
          disc.position.set(x, (seg + 1) * segH, z);
          g.add(disc);
        }
      }
      // Top knob
      var knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 6),
        new THREE.MeshBasicMaterial({ color: c.wallGlow })
      );
      knob.position.set(x, height + 0.1, z);
      g.add(knob);
      break;

    case "membrane":
      // Phospholipid bilayer membrane wall
      var membranePanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA, transparent: true, opacity: 0.35 })
      );
      membranePanel.position.set(x, height / 2, z);
      g.add(membranePanel);
      // Protein channels embedded in membrane
      for (var ch = 0; ch < 2; ch++) {
        var channel = new THREE.Mesh(
          new THREE.TorusGeometry(0.18, 0.05, 6, 10),
          new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.6 })
        );
        channel.position.set(x, 0.8 + ch * 1.6, z);
        channel.rotation.y = Math.PI / 2;
        g.add(channel);
      }
      // Lipid head groups (small spheres along membrane)
      for (var lip = 0; lip < 6; lip++) {
        var lipid = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 4, 4),
          new THREE.MeshBasicMaterial({ color: c.wallB })
        );
        lipid.position.set(x - side * 0.08, 0.3 + lip * 0.5, z + (lip % 2) * 0.3 - 0.15);
        g.add(lipid);
      }
      break;

    case "helix_strands":
      // DNA double helix backbone running vertically
      var strandMat1 = new THREE.MeshBasicMaterial({ color: c.wallA });
      var strandMat2 = new THREE.MeshBasicMaterial({ color: c.wallB });
      var rungMat = new THREE.MeshBasicMaterial({ color: c.archMain, transparent: true, opacity: 0.4 });
      var helixR = 0.5;
      var helixSegs = 10;
      for (var hs = 0; hs < helixSegs; hs++) {
        var t = hs / helixSegs;
        var hy = t * height;
        var ha = t * Math.PI * 3;
        var s1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), strandMat1);
        s1.position.set(x + Math.cos(ha) * helixR * 0.3, hy, z + Math.sin(ha) * helixR);
        g.add(s1);
        var s2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), strandMat2);
        s2.position.set(x - Math.cos(ha) * helixR * 0.3, hy, z - Math.sin(ha) * helixR);
        g.add(s2);
        // Rungs every other segment
        if (hs % 2 === 0) {
          var rung = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, helixR * 0.6, 4),
            rungMat
          );
          rung.position.set(x, hy, z);
          rung.rotation.z = Math.PI / 2;
          rung.rotation.y = ha;
          g.add(rung);
        }
      }
      break;

    case "muscle_fibers":
      // Striated muscle fiber bundles
      for (var fb = 0; fb < 5; fb++) {
        var fiberMat = new THREE.MeshBasicMaterial({
          color: fb % 2 === 0 ? c.wallA : c.wallB,
          transparent: fb > 2,
          opacity: fb > 2 ? 0.6 : 1
        });
        var fiber = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, height, 5),
          fiberMat
        );
        fiber.position.set(x + side * (fb * 0.12 - 0.24), height / 2, z);
        g.add(fiber);
      }
      // Z-line striations
      for (var zl = 0; zl < 4; zl++) {
        var zline = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.02, 0.02),
          new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.3 })
        );
        zline.position.set(x, 0.5 + zl * 0.8, z);
        g.add(zline);
      }
      break;

    case "hospital_panels":
      // Clean hospital wall panels with trim
      var panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA })
      );
      panel.position.set(x, height / 2, z);
      g.add(panel);
      // Accent stripe at eye level
      var accentStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.12, 2),
        new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.5 })
      );
      accentStripe.position.set(x, height * 0.7, z);
      g.add(accentStripe);
      // Baseboard
      var baseboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.15, 2),
        new THREE.MeshBasicMaterial({ color: c.wallB })
      );
      baseboard.position.set(x, 0.075, z);
      g.add(baseboard);
      break;

    case "pill_shelves":
      // Pharmacy shelf-like wall with pill bottle shapes
      var shelfPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA })
      );
      shelfPanel.position.set(x, height / 2, z);
      g.add(shelfPanel);
      // Shelf lines
      for (var sh = 0; sh < 3; sh++) {
        var shelf = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.04, 2),
          new THREE.MeshBasicMaterial({ color: c.wallB })
        );
        shelf.position.set(x, 0.8 + sh * 1.0, z);
        g.add(shelf);
        // Pill bottles on shelf
        for (var pb = 0; pb < 3; pb++) {
          var bottle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6),
            new THREE.MeshBasicMaterial({ color: c.wallGlow })
          );
          bottle.position.set(x - side * 0.1, 0.9 + sh * 1.0, z - 0.6 + pb * 0.6);
          g.add(bottle);
        }
      }
      break;

    case "sterile_panels":
      // Smooth OR-style walls with subtle glow
      var sterileWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA })
      );
      sterileWall.position.set(x, height / 2, z);
      g.add(sterileWall);
      // Vertical glow strip
      var vStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, height, 0.04),
        new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.4 })
      );
      vStrip.position.set(x, height / 2, z);
      g.add(vStrip);
      break;

    case "test_tubes":
      // Test tube rack walls
      var rackBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA })
      );
      rackBack.position.set(x, height / 2, z);
      g.add(rackBack);
      // Test tubes
      var tubeColors = [c.wallGlow, c.wallB, c.archGlow, c.wallGlow];
      for (var tt = 0; tt < 4; tt++) {
        var testTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.03, 0.6, 6),
          new THREE.MeshBasicMaterial({ color: tubeColors[tt], transparent: true, opacity: 0.7 })
        );
        testTube.position.set(x - side * 0.1, 1.0 + tt * 0.7, z);
        g.add(testTube);
      }
      break;

    case "skeletal_xray":
      // X-ray style transparent bone outlines
      var xrayPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA, transparent: true, opacity: 0.2 })
      );
      xrayPanel.position.set(x, height / 2, z);
      g.add(xrayPanel);
      // Bone outline (simplified long bone)
      var boneOutline = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, height * 0.7, 6),
        new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.5 })
      );
      boneOutline.position.set(x, height / 2, z);
      g.add(boneOutline);
      // Epiphysis spheres at ends
      for (var ep = 0; ep < 2; ep++) {
        var epi = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 6, 6),
          new THREE.MeshBasicMaterial({ color: c.wallB, transparent: true, opacity: 0.4 })
        );
        epi.position.set(x, ep === 0 ? 0.4 : height - 0.4, z);
        g.add(epi);
      }
      break;

    case "circuit_panels":
      // Circuit board style panels with trace lines
      var circuitBoard = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA })
      );
      circuitBoard.position.set(x, height / 2, z);
      g.add(circuitBoard);
      // Circuit traces (horizontal lines)
      for (var tr = 0; tr < 5; tr++) {
        var trace = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.02, 1.8),
          new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.6 })
        );
        trace.position.set(x, 0.4 + tr * 0.65, z);
        g.add(trace);
      }
      // LED dots at intersections
      for (var led = 0; led < 3; led++) {
        var ledDot = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 4, 4),
          new THREE.MeshBasicMaterial({ color: c.wallGlow })
        );
        ledDot.position.set(x, 0.7 + led * 1.0, z + (led - 1) * 0.5);
        g.add(ledDot);
      }
      break;

    default:
      // Fallback: simple colored wall
      var defaultWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, height, 2),
        new THREE.MeshBasicMaterial({ color: c.wallA })
      );
      defaultWall.position.set(x, height / 2, z);
      g.add(defaultWall);
      break;
  }

  return g;
}

// ===== ARCH BUILDERS =====

/**
 * Build an overhead arch structure for the given skin.
 *
 * @param {object} skin - Skin definition
 * @param {number} z - Z position along track
 * @returns {THREE.Group}
 */
export function buildArch(skin, z) {
  var g = new THREE.Group();
  var c = skin.colors;

  switch (skin.archType) {

    case "synapse_arcs":
      // Curved synaptic connection overhead with vesicle bulbs
      var arc = new THREE.Mesh(
        new THREE.TorusGeometry(5, 0.08, 8, 20, Math.PI),
        new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.25 })
      );
      arc.position.set(0, 5, z);
      arc.rotation.z = Math.PI;
      g.add(arc);
      // Synaptic bulbs at endpoints
      for (var sb = -1; sb <= 1; sb += 2) {
        var bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 6, 6),
          new THREE.MeshBasicMaterial({ color: c.archGlow })
        );
        bulb.position.set(sb * 5, 5, z);
        g.add(bulb);
        // Vesicles near bulb
        for (var v = 0; v < 2; v++) {
          var vesicle = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 4, 4),
            new THREE.MeshBasicMaterial({ color: c.archMain, transparent: true, opacity: 0.5 })
          );
          vesicle.position.set(sb * (4.5 - v * 0.4), 4.8 + v * 0.3, z);
          g.add(vesicle);
        }
      }
      break;

    case "capillary_branches":
      // Branching blood vessel network overhead
      var mainVessel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 11, 6),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      mainVessel.position.set(0, 5, z);
      mainVessel.rotation.z = Math.PI / 2;
      g.add(mainVessel);
      // Branch points with smaller vessels
      for (var br = -1; br <= 1; br += 2) {
        var branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.07, 1.5, 5),
          new THREE.MeshBasicMaterial({ color: c.archGlow })
        );
        branch.position.set(br * 2.5, 5.5, z);
        branch.rotation.z = br * 0.5;
        g.add(branch);
        // Capillary tips
        var tip = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 4, 4),
          new THREE.MeshBasicMaterial({ color: c.archGlow })
        );
        tip.position.set(br * 3.2, 6, z);
        g.add(tip);
      }
      break;

    case "rib_arches":
      // Curved rib bone spanning overhead
      var rib = new THREE.Mesh(
        new THREE.TorusGeometry(5.5, 0.15, 8, 18, Math.PI),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      rib.position.set(0, 4.5, z);
      rib.rotation.z = Math.PI;
      g.add(rib);
      // Costal cartilage at ends
      for (var rc = -1; rc <= 1; rc += 2) {
        var cartilage = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6),
          new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.5 })
        );
        cartilage.position.set(rc * 5.3, 4.2, z);
        g.add(cartilage);
      }
      break;

    case "organelle_bridges":
      // ER-like folded membrane bridges
      for (var fold = 0; fold < 4; fold++) {
        var sheet = new THREE.Mesh(
          new THREE.PlaneGeometry(10, 0.4),
          new THREE.MeshBasicMaterial({
            color: fold % 2 === 0 ? c.archMain : c.archGlow,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
          })
        );
        sheet.position.set(0, 4.5 + fold * 0.25, z);
        g.add(sheet);
      }
      // Ribosomes dotted along sheets
      for (var rb = 0; rb < 5; rb++) {
        var ribosome = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 4, 4),
          new THREE.MeshBasicMaterial({ color: c.archGlow })
        );
        ribosome.position.set(-3 + rb * 1.5, 4.4, z);
        g.add(ribosome);
      }
      break;

    case "base_pair_rungs":
      // DNA base pair rungs connecting overhead strands
      var mainRung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 10, 5),
        new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.4 })
      );
      mainRung.position.set(0, 4.8, z);
      mainRung.rotation.z = Math.PI / 2;
      g.add(mainRung);
      // Center hydrogen bond marker
      var hBond = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      hBond.position.set(0, 4.8, z);
      g.add(hBond);
      // Base pair indicators at ends
      for (var bp = -1; bp <= 1; bp += 2) {
        var base = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.15, 0.15),
          new THREE.MeshBasicMaterial({ color: bp === -1 ? c.wallA : c.wallB })
        );
        base.position.set(bp * 4.5, 4.8, z);
        g.add(base);
      }
      break;

    case "valve_leaflets":
      // Heart valve leaflets overhead
      for (var vl = -1; vl <= 1; vl += 2) {
        var leaflet = new THREE.Mesh(
          new THREE.SphereGeometry(2.5, 10, 6, 0, Math.PI, 0, Math.PI / 3),
          new THREE.MeshBasicMaterial({
            color: c.archMain,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
          })
        );
        leaflet.position.set(vl * 2, 5, z);
        leaflet.rotation.z = vl * 0.5;
        g.add(leaflet);
      }
      break;

    case "fluorescent_bars":
      // Hospital fluorescent light bars
      var lightBar = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.08, 0.3),
        new THREE.MeshBasicMaterial({ color: c.archGlow })
      );
      lightBar.position.set(0, 5, z);
      g.add(lightBar);
      // Housing
      var housing = new THREE.Mesh(
        new THREE.BoxGeometry(10.2, 0.12, 0.4),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      housing.position.set(0, 5.06, z);
      g.add(housing);
      // Glow effect below light
      var lightGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 1),
        new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
      );
      lightGlow.position.set(0, 4.5, z);
      lightGlow.rotation.x = Math.PI / 2;
      g.add(lightGlow);
      break;

    case "rx_signs":
      // Pharmacy Rx sign arches
      var signBar = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      signBar.position.set(0, 5, z);
      g.add(signBar);
      // Rx symbol (simplified as cross)
      var rxH = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.12, 0.08),
        new THREE.MeshBasicMaterial({ color: c.archGlow })
      );
      rxH.position.set(0, 5, z);
      g.add(rxH);
      var rxV = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.6, 0.08),
        new THREE.MeshBasicMaterial({ color: c.archGlow })
      );
      rxV.position.set(0, 5, z);
      g.add(rxV);
      break;

    case "surgical_lamps":
      // Bright surgical overhead lamp
      var lampArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      lampArm.position.set(0, 5.5, z);
      g.add(lampArm);
      // Lamp head
      var lampHead = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.5, 0.15, 12),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      lampHead.position.set(0, 4.8, z);
      g.add(lampHead);
      // Light surface
      var lampLight = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 12),
        new THREE.MeshBasicMaterial({ color: c.archGlow, side: THREE.DoubleSide })
      );
      lampLight.position.set(0, 4.72, z);
      lampLight.rotation.x = Math.PI / 2;
      g.add(lampLight);
      // Light cone glow
      var cone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 1.5, 3, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
      );
      cone.position.set(0, 3.2, z);
      g.add(cone);
      break;

    case "bubble_arches":
      // Floating bubble arches
      for (var bub = 0; bub < 7; bub++) {
        var bubR = 0.15 + Math.random() * 0.2;
        var bubble = new THREE.Mesh(
          new THREE.SphereGeometry(bubR, 8, 8),
          new THREE.MeshBasicMaterial({
            color: bub % 2 === 0 ? c.archGlow : c.archMain,
            transparent: true,
            opacity: 0.2
          })
        );
        bubble.position.set(-3.5 + bub * 1.2, 4.5 + Math.sin(bub) * 0.5, z);
        g.add(bubble);
      }
      break;

    case "scan_frames":
      // X-ray scan frame
      var frame = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      frame.position.set(0, 5, z);
      g.add(frame);
      // Scanning beam
      var beam = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 0.02),
        new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      beam.position.set(0, 4.9, z);
      g.add(beam);
      break;

    case "tesla_arcs":
      // Electric arc overhead
      var arcBar = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: c.archMain })
      );
      arcBar.position.set(0, 5, z);
      g.add(arcBar);
      // Electric discharge nodes
      for (var en = -2; en <= 2; en++) {
        var node = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 6, 6),
          new THREE.MeshBasicMaterial({ color: c.archGlow })
        );
        node.position.set(en * 2.2, 5, z);
        g.add(node);
        // Arc line down
        if (en % 2 === 0) {
          var arcLine = new THREE.Mesh(
            new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4),
            new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.5 })
          );
          arcLine.position.set(en * 2.2, 4.6, z);
          arcLine.rotation.z = (Math.random() - 0.5) * 0.4;
          g.add(arcLine);
        }
      }
      break;

    default:
      // Fallback: simple beam with center light
      var defaultBeam = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: c.archGlow, transparent: true, opacity: 0.3 })
      );
      defaultBeam.position.set(0, 5, z);
      g.add(defaultBeam);
      var defaultLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshBasicMaterial({ color: c.archGlow })
      );
      defaultLight.position.set(0, 4.9, z);
      g.add(defaultLight);
      break;
  }

  return g;
}

// === Part 1 ends here. Part 2 will contain: buildGroundPattern, buildAtmosphericParticle, setupSkinLighting ===
// ===== GROUND PATTERN BUILDERS =====

/**
 * Build ground visual elements for the given skin.
 * Creates the track floor with visual patterns that differ per skin.
 * Uses a base PlaneGeometry with additional decorative elements on top.
 *
 * @param {object} skin - Skin definition from skins.js
 * @param {THREE.Scene} scene - Scene to add ground elements to
 * @returns {THREE.Group} Group containing all ground elements
 */
export function buildGround(skin) {
  var g = new THREE.Group();
  var c = skin.colors;

  // Base ground plane (always present)
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 400),
    new THREE.MeshBasicMaterial({ color: c.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -190);
  g.add(ground);

  // Lane divider lines
  for (var lx = -1; lx <= 1; lx += 2) {
    var lane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 400),
      new THREE.MeshBasicMaterial({ color: c.lane, transparent: true, opacity: 0.3 })
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(lx * 1.5, 0.02, -190);
    g.add(lane);
  }

  // Skin-specific ground decorations
  switch (skin.groundType) {

    case "myelin":
      // Neural pathway stripes running along the track
      for (var ms = -3; ms <= 3; ms++) {
        var stripe = new THREE.Mesh(
          new THREE.PlaneGeometry(0.3, 400),
          new THREE.MeshBasicMaterial({
            color: c.groundStripe,
            transparent: true,
            opacity: 0.08 + Math.abs(ms) * 0.02
          })
        );
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(ms * 1.8, 0.01, -190);
        g.add(stripe);
      }
      // Nodes of Ranvier (periodic gaps)
      for (var nr = -160; nr < 20; nr += 8) {
        var ranvier = new THREE.Mesh(
          new THREE.PlaneGeometry(12, 0.3),
          new THREE.MeshBasicMaterial({ color: c.groundAccent, transparent: true, opacity: 0.1 })
        );
        ranvier.rotation.x = -Math.PI / 2;
        ranvier.position.set(0, 0.015, nr);
        g.add(ranvier);
      }
      break;

    case "endothelium":
      // Blood vessel inner lining with flowing stripes
      for (var ev = -2; ev <= 2; ev++) {
        var vStripe = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 400),
          new THREE.MeshBasicMaterial({
            color: c.groundStripe,
            transparent: true,
            opacity: 0.06
          })
        );
        vStripe.rotation.x = -Math.PI / 2;
        vStripe.position.set(ev * 2.5, 0.01, -190);
        g.add(vStripe);
      }
      break;

    case "cartilage":
      // Subtle grid pattern like cartilage matrix
      for (var cx = -6; cx <= 6; cx += 2) {
        var cLine = new THREE.Mesh(
          new THREE.PlaneGeometry(0.03, 400),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.06 })
        );
        cLine.rotation.x = -Math.PI / 2;
        cLine.position.set(cx, 0.01, -190);
        g.add(cLine);
      }
      for (var cz = -160; cz < 20; cz += 2) {
        var czLine = new THREE.Mesh(
          new THREE.PlaneGeometry(12, 0.03),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.06 })
        );
        czLine.rotation.x = -Math.PI / 2;
        czLine.position.set(0, 0.01, cz);
        g.add(czLine);
      }
      break;

    case "cytoplasm":
      // Organic blobs on the ground suggesting cellular contents
      for (var cb = 0; cb < 30; cb++) {
        var blob = new THREE.Mesh(
          new THREE.CircleGeometry(0.3 + Math.random() * 0.5, 8),
          new THREE.MeshBasicMaterial({ color: c.groundAccent, transparent: true, opacity: 0.05 })
        );
        blob.rotation.x = -Math.PI / 2;
        blob.position.set(
          (Math.random() - 0.5) * 12,
          0.01,
          -160 + Math.random() * 180
        );
        g.add(blob);
      }
      break;

    case "linoleum":
      // Hospital floor tile grid
      for (var tx = -6; tx <= 6; tx += 1.5) {
        var tileLine = new THREE.Mesh(
          new THREE.PlaneGeometry(0.02, 400),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.08 })
        );
        tileLine.rotation.x = -Math.PI / 2;
        tileLine.position.set(tx, 0.01, -190);
        g.add(tileLine);
      }
      for (var tz = -160; tz < 20; tz += 1.5) {
        var tileLineZ = new THREE.Mesh(
          new THREE.PlaneGeometry(12, 0.02),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.08 })
        );
        tileLineZ.rotation.x = -Math.PI / 2;
        tileLineZ.position.set(0, 0.01, tz);
        g.add(tileLineZ);
      }
      break;

    case "phosphate":
      // DNA sugar-phosphate backbone pattern
      for (var dp = -3; dp <= 3; dp += 3) {
        var backbone = new THREE.Mesh(
          new THREE.PlaneGeometry(0.15, 400),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.12 })
        );
        backbone.rotation.x = -Math.PI / 2;
        backbone.position.set(dp, 0.01, -190);
        g.add(backbone);
      }
      break;

    case "pharmacy_floor":
      // Warm checkered pattern
      for (var px = -6; px <= 6; px += 2) {
        for (var pz = -160; pz < 20; pz += 2) {
          if ((Math.floor(px / 2) + Math.floor(pz / 2)) % 2 === 0) {
            var tile = new THREE.Mesh(
              new THREE.PlaneGeometry(1.9, 1.9),
              new THREE.MeshBasicMaterial({ color: c.groundAccent, transparent: true, opacity: 0.06 })
            );
            tile.rotation.x = -Math.PI / 2;
            tile.position.set(px, 0.01, pz);
            g.add(tile);
          }
        }
      }
      break;

    case "endocardium":
      // Heart inner lining with flowing curves
      for (var hf = 0; hf < 5; hf++) {
        var flow = new THREE.Mesh(
          new THREE.PlaneGeometry(0.5 + hf * 0.3, 400),
          new THREE.MeshBasicMaterial({
            color: c.groundStripe,
            transparent: true,
            opacity: 0.04
          })
        );
        flow.rotation.x = -Math.PI / 2;
        flow.position.set((hf - 2) * 2.2, 0.01, -190);
        g.add(flow);
      }
      break;

    case "surgical_floor":
      // Clean surgical floor with subtle cross marks
      for (var sf = -160; sf < 20; sf += 6) {
        var crossH = new THREE.Mesh(
          new THREE.PlaneGeometry(1.0, 0.02),
          new THREE.MeshBasicMaterial({ color: c.groundAccent, transparent: true, opacity: 0.06 })
        );
        crossH.rotation.x = -Math.PI / 2;
        crossH.position.set(0, 0.01, sf);
        g.add(crossH);
        var crossV = new THREE.Mesh(
          new THREE.PlaneGeometry(0.02, 1.0),
          new THREE.MeshBasicMaterial({ color: c.groundAccent, transparent: true, opacity: 0.06 })
        );
        crossV.rotation.x = -Math.PI / 2;
        crossV.position.set(0, 0.01, sf);
        g.add(crossV);
      }
      break;

    case "petri_dish":
      // Circular patterns suggesting colonies
      for (var pd = 0; pd < 20; pd++) {
        var colony = new THREE.Mesh(
          new THREE.RingGeometry(0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.5, 12),
          new THREE.MeshBasicMaterial({ color: c.groundAccent, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
        );
        colony.rotation.x = -Math.PI / 2;
        colony.position.set(
          (Math.random() - 0.5) * 10,
          0.01,
          -150 + Math.random() * 170
        );
        g.add(colony);
      }
      break;

    case "lightbox":
      // X-ray lightbox grid
      for (var lbx = -6; lbx <= 6; lbx += 3) {
        for (var lbz = -160; lbz < 20; lbz += 4) {
          var lightPanel = new THREE.Mesh(
            new THREE.PlaneGeometry(2.8, 3.8),
            new THREE.MeshBasicMaterial({ color: c.groundAccent, transparent: true, opacity: 0.03 })
          );
          lightPanel.rotation.x = -Math.PI / 2;
          lightPanel.position.set(lbx, 0.01, lbz);
          g.add(lightPanel);
        }
      }
      break;

    case "conductor_grid":
      // Circuit board conductor pattern
      for (var cgx = -6; cgx <= 6; cgx += 1) {
        var conductor = new THREE.Mesh(
          new THREE.PlaneGeometry(0.03, 400),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.1 })
        );
        conductor.rotation.x = -Math.PI / 2;
        conductor.position.set(cgx, 0.01, -190);
        g.add(conductor);
      }
      for (var cgz = -160; cgz < 20; cgz += 1) {
        var condZ = new THREE.Mesh(
          new THREE.PlaneGeometry(12, 0.03),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.1 })
        );
        condZ.rotation.x = -Math.PI / 2;
        condZ.position.set(0, 0.01, cgz);
        g.add(condZ);
      }
      break;

    default:
      // Simple accent stripes for any unmatched ground type
      for (var ds = -2; ds <= 2; ds++) {
        var defStripe = new THREE.Mesh(
          new THREE.PlaneGeometry(0.2, 400),
          new THREE.MeshBasicMaterial({ color: c.groundStripe, transparent: true, opacity: 0.06 })
        );
        defStripe.rotation.x = -Math.PI / 2;
        defStripe.position.set(ds * 2.5, 0.01, -190);
        g.add(defStripe);
      }
      break;
  }

  return g;
}

// ===== ATMOSPHERIC PARTICLE BUILDER =====

/**
 * Create a single atmospheric particle mesh for the given skin.
 * These float in the air around the track creating ambiance.
 * Each skin type produces visually distinct particles.
 *
 * For performance, particles use MeshBasicMaterial with transparency
 * and simple geometry. The instanced rendering approach from the
 * weather visualization tutorial confirms that reusing geometry with
 * per-instance transforms is the most efficient approach for
 * particle systems [3].
 *
 * @param {object} skin - Skin definition
 * @returns {THREE.Mesh} Single particle mesh
 */
export function buildAtmosphericParticle(skin) {
  var c = skin.colors;
  var mesh;

  switch (skin.particleType) {

    case "sparks":
      // Neural electric sparks — small bright points
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.6 })
      );
      break;

    case "blood_cells":
      // Flattened discs resembling red blood cells
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 6),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.4 })
      );
      mesh.scale.set(1, 0.35, 1);
      break;

    case "calcium_dust":
      // Small irregular bone dust particles
      mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.05, 0),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.3 })
      );
      break;

    case "vesicles":
      // Cellular vesicles — small transparent spheres
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.25 })
      );
      break;

    case "dust_motes":
      // Tiny floating dust in hospital air
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.35 })
      );
      break;

    case "nucleotides":
      // DNA building blocks — small colored cubes
      var isA = Math.random() > 0.5;
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshBasicMaterial({
          color: isA ? c.particle : c.particleB,
          transparent: true,
          opacity: 0.4
        })
      );
      break;

    case "capsule_bits":
      // Tiny pill capsule fragments
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.35 })
      );
      break;

    case "platelets":
      // Small irregular platelet shapes
      mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.05, 0),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.35 })
      );
      mesh.scale.set(1, 0.5, 1);
      break;

    case "sterile_sparkles":
      // Tiny bright sparkles in sterile OR air
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 4, 4),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.7 })
      );
      break;

    case "bubbles":
      // Lab bubbles — transparent spheres with ring
      var group = new THREE.Group();
      var bubbleR = 0.06 + Math.random() * 0.06;
      var bubble = new THREE.Mesh(
        new THREE.SphereGeometry(bubbleR, 8, 8),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.15 })
      );
      group.add(bubble);
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(bubbleR * 0.8, bubbleR, 8),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
      );
      group.add(ring);
      return group;

    case "photons":
      // X-ray photon scatter — tiny bright dots
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 4, 4),
        new THREE.MeshBasicMaterial({ color: c.particle })
      );
      break;

    case "electric_arcs":
      // Tiny lightning bolt segments
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.015, 0.12),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.6 })
      );
      break;

    default:
      // Generic floating mote
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: c.particle, transparent: true, opacity: 0.3 })
      );
      break;
  }

  return mesh;
}

// ===== LIGHTING SETUP =====

/**
 * Configure scene lighting for the given skin.
 * Each skin gets a unique lighting mood through different
 * ambient, hemisphere, and directional light colors and intensities.
 *
 * The Three.js forum lighting discussion confirms that combining
 * HemisphereLight (sky/ground color gradient) with DirectionalLight
 * (key light with shadows) and AmbientLight (fill) produces the
 * most natural results for stylized 3D scenes [7].
 *
 * "Never put the main light in front or on top — it has to come
 * from an angle to create shadow and thereby depth" [7].
 *
 * @param {object} skin - Skin definition
 * @param {THREE.Scene} scene - Scene to configure lighting for
 * @returns {object} References to created lights for later modification
 */
export function setupSkinLighting(skin, scene) {
  var c = skin.colors;

  // Clear existing lights (except any that the engine manages)
  var lightsToRemove = [];
  scene.traverse(function (child) {
    if (child.isLight && child.userData.skinLight) {
      lightsToRemove.push(child);
    }
  });
  for (var i = 0; i < lightsToRemove.length; i++) {
    scene.remove(lightsToRemove[i]);
  }

  // Ambient light — base illumination ensuring nothing is pitch black
  var ambient = new THREE.AmbientLight(c.ambient, 0.6);
  ambient.userData.skinLight = true;
  scene.add(ambient);

  // Hemisphere light — sky/ground gradient for natural fill
  var hemi = new THREE.HemisphereLight(c.hemiTop, c.hemiBot, 0.5);
  hemi.userData.skinLight = true;
  scene.add(hemi);

  // Directional light — key light from an angle for depth [7]
  var dir = new THREE.DirectionalLight(c.dirLight, 0.8);
  dir.position.set(5, 18, 8);
  dir.castShadow = true;
  dir.userData.skinLight = true;
  scene.add(dir);

  // Set scene background and fog color
  scene.background = new THREE.Color(c.bg);

  return {
    ambient: ambient,
    hemisphere: hemi,
    directional: dir
  };
}

// ===== WALL GLOW STRIP BUILDER =====

/**
 * Build continuous glow strips along the top and bottom of walls.
 * These provide the neon-like accent lighting that makes the
 * track feel vibrant and game-like.
 *
 * @param {object} skin - Skin definition
 * @param {number} side - -1 for left, +1 for right
 * @returns {THREE.Group}
 */
export function buildWallGlowStrips(skin, side) {
  var g = new THREE.Group();
  var c = skin.colors;
  var x = side * 5.5;

  // Top glow strip
  var topGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.1, 400),
    new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.35 })
  );
  topGlow.position.set(x, 3.55, -190);
  g.add(topGlow);

  // Bottom glow strip
  var bottomGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.06, 400),
    new THREE.MeshBasicMaterial({ color: c.wallGlow, transparent: true, opacity: 0.2 })
  );
  bottomGlow.position.set(x, 0.03, -190);
  g.add(bottomGlow);

  return g;
}
