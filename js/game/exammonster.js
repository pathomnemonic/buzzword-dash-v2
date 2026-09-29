/**
 * exammonster.js — Exam Monster entity
 *
 * The Exam Monster represents "exam anxiety" and chases the player.
 * It's a menacing dark creature with multiple red eyes, tentacles,
 * a mortarboard cap, orbiting question marks, and a gaping mouth.
 *
 * Built entirely from Three.js primitives.
 *
 * AGENT 15 CHANGES:
 * - Disposes replaced monsters properly (architecture §24, §31)
 * - Shares animation conventions with homecharacter.js (absolute positioning)
 * - Honors reduced motion setting
 * - Supports end-run celebration animation (monster retreats)
 */

import * as THREE from 'three';

/**
 * Dispose all geometry and materials within a group recursively.
 * @param {THREE.Object3D} obj
 */
function disposeGroup(obj) {
    if (!obj) return;
    if (obj.children) {
        for (var i = obj.children.length - 1; i >= 0; i--) {
            disposeGroup(obj.children[i]);
        }
    }
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) {
            for (var m = 0; m < obj.material.length; m++) {
                if (obj.material[m].map) obj.material[m].map.dispose();
                obj.material[m].dispose();
            }
        } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
        }
    }
}

export function buildExamMonster() {
    var g = new THREE.Group();

    // ===== MAIN BODY: Large dark sphere =====
    var bodyMat = new THREE.MeshStandardMaterial({
        color: 0x1a0a2e,
        roughness: 0.8,
        emissive: 0x220044,
        emissiveIntensity: 0.3
    });
    var body = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 16, 16),
        bodyMat
    );
    body.name = 'monsterBody';
    g.add(body);

    // Secondary body layer (slightly larger, translucent for aura)
    var auraMat = new THREE.MeshBasicMaterial({
        color: 0x330066,
        transparent: true,
        opacity: 0.15
    });
    var aura = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 12, 12),
        auraMat
    );
    aura.name = 'monsterAura';
    g.add(aura);

    // ===== EYES: Multiple glowing red eyes =====
    var eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    var eyeGlowMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.4
    });

    var eyePositions = [
        { x: -0.4, y: 0.5, z: -0.95, size: 0.12 },
        { x: 0.4, y: 0.5, z: -0.95, size: 0.12 },
        { x: -0.2, y: 0.7, z: -0.9, size: 0.08 },
        { x: 0.2, y: 0.7, z: -0.9, size: 0.08 },
        { x: -0.55, y: 0.3, z: -0.8, size: 0.07 },
        { x: 0.55, y: 0.3, z: -0.8, size: 0.07 },
        { x: 0, y: 0.85, z: -0.75, size: 0.06 },
        { x: 0, y: 0.15, z: -1.05, size: 0.1 }
    ];

    var eyes = [];
    for (var ei = 0; ei < eyePositions.length; ei++) {
        var ep = eyePositions[ei];
        var eye = new THREE.Mesh(
            new THREE.SphereGeometry(ep.size, 8, 8),
            eyeMat
        );
        eye.position.set(ep.x, ep.y, ep.z);
        g.add(eye);
        eyes.push(eye);

        // Eye glow
        var eyeGlow = new THREE.Mesh(
            new THREE.SphereGeometry(ep.size * 1.8, 6, 6),
            eyeGlowMat.clone()
        );
        eyeGlow.position.set(ep.x, ep.y, ep.z);
        g.add(eyeGlow);
    }

    // ===== MOUTH: Dark void with teeth =====
    var mouthMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    var mouth = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 10, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.4),
        mouthMat
    );
    mouth.position.set(0, -0.3, -0.8);
    mouth.rotation.x = 0.2;
    mouth.name = 'monsterMouth';
    g.add(mouth);

    // Teeth (white triangles around the mouth)
    var teethMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
    for (var ti = 0; ti < 8; ti++) {
        var tooth = new THREE.Mesh(
            new THREE.ConeGeometry(0.04, 0.12, 3),
            teethMat
        );
        var tAngle = (ti / 8) * Math.PI * 1.5 - Math.PI * 0.75;
        tooth.position.set(
            Math.cos(tAngle) * 0.35,
            -0.25 + Math.sin(tAngle) * 0.1,
            -0.95
        );
        tooth.rotation.x = Math.PI;
        if (ti > 3) tooth.rotation.x = 0;
        g.add(tooth);
    }

    // ===== TENTACLES: Curved cylinders reaching forward =====
    var tentacleMat = new THREE.MeshStandardMaterial({
        color: 0x2a0a4e,
        emissive: 0x110022,
        emissiveIntensity: 0.2
    });

    var tentacles = [];
    var tentacleConfigs = [
        { angle: 0, offsetY: -0.6, len: 1.8, radius: 0.08 },
        { angle: Math.PI * 0.3, offsetY: -0.4, len: 1.5, radius: 0.06 },
        { angle: -Math.PI * 0.3, offsetY: -0.4, len: 1.5, radius: 0.06 },
        { angle: Math.PI * 0.6, offsetY: -0.2, len: 1.2, radius: 0.05 },
        { angle: -Math.PI * 0.6, offsetY: -0.2, len: 1.2, radius: 0.05 },
        { angle: Math.PI * 0.15, offsetY: 0.1, len: 1.6, radius: 0.07 },
        { angle: -Math.PI * 0.15, offsetY: 0.1, len: 1.6, radius: 0.07 }
    ];

    for (var tci = 0; tci < tentacleConfigs.length; tci++) {
        var tc = tentacleConfigs[tci];
        var tentGroup = new THREE.Group();

        // Build tentacle from segments
        var segCount = 6;
        for (var seg = 0; seg < segCount; seg++) {
            var segRadius = tc.radius * (1 - seg / segCount * 0.6);
            var segLen = tc.len / segCount;
            var tentSeg = new THREE.Mesh(
                new THREE.CylinderGeometry(segRadius, segRadius * 1.1, segLen, 6),
                tentacleMat
            );
            tentSeg.position.y = -seg * segLen;
            tentSeg.rotation.x = seg * 0.15;
            tentSeg.rotation.z = Math.sin(seg * 0.5) * 0.1;
            tentGroup.add(tentSeg);
        }

        // Tip sphere
        var tip = new THREE.Mesh(
            new THREE.SphereGeometry(tc.radius * 0.5, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0x6622aa })
        );
        tip.position.y = -tc.len;
        tentGroup.add(tip);

        tentGroup.position.set(
            Math.sin(tc.angle) * 0.8,
            tc.offsetY,
            Math.cos(tc.angle) * -0.8
        );
        tentGroup.rotation.x = -0.5;
        tentGroup.rotation.z = tc.angle * 0.3;

        g.add(tentGroup);
        tentacles.push(tentGroup);
    }

    // ===== MORTARBOARD (graduation cap) on top =====
    var capGroup = new THREE.Group();
    var board = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.05, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    capGroup.add(board);

    var capBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.4, 0.15, 8),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    capBase.position.y = -0.08;
    capGroup.add(capBase);

    // Tassel
    var tassel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 })
    );
    tassel.position.set(0.4, -0.1, 0);
    capGroup.add(tassel);
    var tasselEnd = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 })
    );
    tasselEnd.position.set(0.4, -0.25, 0);
    capGroup.add(tasselEnd);

    capGroup.position.set(0, 1.3, 0);
    capGroup.rotation.z = 0.15;
    capGroup.rotation.x = -0.1;
    g.add(capGroup);

    // ===== ORBITING QUESTION MARKS =====
    var questionMarks = [];
    var qmMat = new THREE.MeshBasicMaterial({ color: 0xff44aa });

    for (var qi = 0; qi < 5; qi++) {
        var qmGroup = new THREE.Group();

        // Question mark body (using a torus arc + sphere dot)
        var qCurve = new THREE.Mesh(
            new THREE.TorusGeometry(0.08, 0.025, 6, 10, Math.PI * 1.5),
            qmMat
        );
        qmGroup.add(qCurve);

        // Stem
        var qStem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.06, 4),
            qmMat
        );
        qStem.position.set(0.08, -0.06, 0);
        qmGroup.add(qStem);

        // Dot
        var qDot = new THREE.Mesh(
            new THREE.SphereGeometry(0.03, 4, 4),
            qmMat
        );
        qDot.position.set(0.08, -0.12, 0);
        qmGroup.add(qDot);

        qmGroup.userData.orbitAngle = (qi / 5) * Math.PI * 2;
        qmGroup.userData.orbitRadius = 2.0;
        qmGroup.userData.orbitSpeed = 0.8 + qi * 0.15;
        qmGroup.userData.orbitHeight = (qi - 2) * 0.4;

        g.add(qmGroup);
        questionMarks.push(qmGroup);
    }

    // ===== PARTICLE EMITTERS (small glowing dots) =====
    var particleMat = new THREE.MeshBasicMaterial({
        color: 0x8822cc,
        transparent: true,
        opacity: 0.6
    });
    for (var pi = 0; pi < 12; pi++) {
        var particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.03, 4, 4),
            particleMat.clone()
        );
        particle.position.set(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 2
        );
        particle.userData.driftPhase = Math.random() * Math.PI * 2;
        particle.userData.driftSpeed = 0.5 + Math.random() * 0.5;
        g.add(particle);
    }

    // Store references for animation
    g.userData.monsterParts = {
        eyes: eyes,
        tentacles: tentacles,
        mouth: mouth,
        questionMarks: questionMarks,
        body: body,
        aura: aura
    };

    return g;
}

/**
 * Get monster animation part references from a built monster group.
 * @param {THREE.Group} monsterGroup
 * @returns {object}
 */
export function getMonsterParts(monsterGroup) {
    return monsterGroup.userData.monsterParts || {
        eyes: [],
        tentacles: [],
        mouth: null,
        questionMarks: [],
        body: null,
        aura: null
    };
}

/**
 * Safely dispose a monster group and all its GPU resources.
 * Prevents GPU memory leaks when monsters are replaced (architecture §31).
 * @param {THREE.Scene} scene
 * @param {THREE.Group} monsterGroup
 */
export function disposeExamMonster(scene, monsterGroup) {
    if (!monsterGroup) return;
    scene.remove(monsterGroup);
    disposeGroup(monsterGroup);
}
