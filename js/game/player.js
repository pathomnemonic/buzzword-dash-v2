/**
 * player.js — Avatar-based player character builder
 *
 * AGENT 15 REPLACEMENT — Architecture contract §24, §31:
 * - Disposes replaced characters properly
 * - Shares animation conventions (absolute positioning, no accumulative +=)
 * - Vehicle cosmetic compatibility: items declare compatibility;
 *   incompatible items are NOT silently hidden — the UI must explain
 * - Supports end-run celebration animation
 * - Honors reduced motion
 * - Chibi/cartoon proportions with rounded limbs
 * - All 13 avatar variants including 3 vehicles
 * - Clothing system support
 * - Faceplant animation support
 *
 * FIX: Vehicle facing direction — all vehicle builders apply
 * pg.rotation.y = Math.PI / 2 so eyes face negative Z (forward
 * in gameplay) instead of negative X (sideways).
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { SHOP_ITEMS, AVATARS } from './shopdata.js';

// ===== HELPERS =====

/**
 * Dispose all geometry and materials within a group recursively.
 * @param {THREE.Object3D} obj
 */
export function disposeCharacter(obj) {
    if (!obj) return;
    for (var i = obj.children.length - 1; i >= 0; i--) {
        disposeCharacter(obj.children[i]);
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

export function getAvatarConfig() {
    var equipped = storage.get('equipped');
    var skinId = equipped.skin || 'avatar_intern';
    for (var i = 0; i < AVATARS.length; i++) {
        if (AVATARS[i].id === skinId) return AVATARS[i];
    }
    return AVATARS[0];
}

// ===== HELPER: rounded limb (cylinder with sphere caps) =====
function buildRoundedLimb(radius, length, color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: color });

    var cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, length, 8),
        mat
    );
    g.add(cyl);

    var topCap = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 6),
        mat
    );
    topCap.position.y = length / 2;
    g.add(topCap);

    var botCap = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 6),
        mat
    );
    botCap.position.y = -length / 2;
    g.add(botCap);

    return g;
}

// ===== HELPER: build a capsule-shaped body =====
function buildCapsuleBody(radiusTop, radiusBottom, length, color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: color });

    try {
        var capsule = new THREE.Mesh(
            new THREE.CapsuleGeometry(radiusTop, length, 8, 12),
            mat
        );
        g.add(capsule);
    } catch (e) {
        var cyl = new THREE.Mesh(
            new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 10),
            mat
        );
        g.add(cyl);
        var top = new THREE.Mesh(new THREE.SphereGeometry(radiusTop, 10, 8), mat);
        top.position.y = length / 2;
        g.add(top);
        var bot = new THREE.Mesh(new THREE.SphereGeometry(radiusBottom, 10, 8), mat);
        bot.position.y = -length / 2;
        g.add(bot);
    }

    return g;
}

// ===== VEHICLE BUILDERS =====

function buildAmbulanceVehicle(avatar) {
    var pg = new THREE.Group();
    var s = avatar.scale || 1.3;

    var bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0 });
    var body = new THREE.Mesh(
        new THREE.BoxGeometry(1.4 * s, 0.7 * s, 0.9 * s),
        bodyMat
    );
    body.position.set(0, 0.6 * s, 0);
    body.castShadow = true;
    body.name = 'vehicleBody';
    pg.add(body);

    var cabMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    var cab = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 * s, 0.5 * s, 0.85 * s),
        cabMat
    );
    cab.position.set(-0.8 * s, 0.5 * s, 0);
    pg.add(cab);

    var windshieldMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 });
    var windshield = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35 * s, 0.7 * s),
        windshieldMat
    );
    windshield.position.set(-1.05 * s, 0.55 * s, 0);
    windshield.rotation.y = Math.PI / 2;
    pg.add(windshield);

    var stripeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    var stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.42 * s, 0.1 * s, 0.92 * s),
        stripeMat
    );
    stripe.position.set(0, 0.65 * s, 0);
    pg.add(stripe);

    var crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.2 * s, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    crossH.position.set(0.2 * s, 0.8 * s, 0.46 * s);
    pg.add(crossH);
    var crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.06, 0.2 * s),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    crossV.position.set(0.2 * s, 0.8 * s, 0.46 * s);
    pg.add(crossV);

    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    var wheelPositions = [
        [-0.45 * s, 0.15 * s, 0.48 * s],
        [-0.45 * s, 0.15 * s, -0.48 * s],
        [0.45 * s, 0.15 * s, 0.48 * s],
        [0.45 * s, 0.15 * s, -0.48 * s]
    ];
    var wheels = [];
    for (var wi = 0; wi < wheelPositions.length; wi++) {
        var wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 0.08 * s, 12),
            wheelMat
        );
        wheel.position.set(wheelPositions[wi][0], wheelPositions[wi][1], wheelPositions[wi][2]);
        wheel.rotation.x = Math.PI / 2;
        wheel.name = 'wheel_' + wi;
        pg.add(wheel);
        wheels.push(wheel);
    }

    var light1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * s, 0.1 * s, 0.12 * s),
        new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    light1.position.set(-0.15 * s, 0.98 * s, 0);
    light1.name = 'light_0';
    pg.add(light1);

    var light2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * s, 0.1 * s, 0.12 * s),
        new THREE.MeshBasicMaterial({ color: 0x4444ff })
    );
    light2.position.set(0.15 * s, 0.98 * s, 0);
    light2.name = 'light_1';
    pg.add(light2);

    var eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (var ex = -1; ex <= 1; ex += 2) {
        var eyeW = new THREE.Mesh(
            new THREE.SphereGeometry(0.08 * s, 8, 8),
            eyeWhiteMat
        );
        eyeW.position.set(-1.0 * s, 0.6 * s, ex * 0.2 * s);
        pg.add(eyeW);

        var pupil = new THREE.Mesh(
            new THREE.SphereGeometry(0.04 * s, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        pupil.position.set(-1.06 * s, 0.6 * s, ex * 0.2 * s);
        pg.add(pupil);
    }

    pg.userData.wheels = wheels;
    pg.userData.isVehicle = true;
    pg.userData.vehicleType = 'ambulance';
    pg.rotation.y = Math.PI / 2;

    return pg;
}

function buildRaceCarVehicle(avatar) {
    var pg = new THREE.Group();
    var s = avatar.scale || 1.3;

    var bodyMat = new THREE.MeshStandardMaterial({ color: 0xdd2222 });
    var body = new THREE.Mesh(
        new THREE.BoxGeometry(1.6 * s, 0.4 * s, 0.8 * s),
        bodyMat
    );
    body.position.set(0, 0.4 * s, 0);
    body.castShadow = true;
    body.name = 'vehicleBody';
    pg.add(body);

    var cockpitMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 });
    var cockpit = new THREE.Mesh(
        new THREE.SphereGeometry(0.25 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        cockpitMat
    );
    cockpit.position.set(-0.1 * s, 0.6 * s, 0);
    pg.add(cockpit);

    var spoilerMat = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
    var spoilerWing = new THREE.Mesh(
        new THREE.BoxGeometry(0.05 * s, 0.02 * s, 0.7 * s),
        spoilerMat
    );
    spoilerWing.position.set(0.7 * s, 0.7 * s, 0);
    pg.add(spoilerWing);
    for (var ss = -1; ss <= 1; ss += 2) {
        var support = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.25 * s, 6),
            spoilerMat
        );
        support.position.set(0.7 * s, 0.55 * s, ss * 0.25 * s);
        pg.add(support);
    }

    var crossH2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * s, 0.04, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    crossH2.position.set(0, 0.62 * s, 0.41 * s);
    pg.add(crossH2);
    var crossV2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.04, 0.2 * s),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    crossV2.position.set(0, 0.62 * s, 0.41 * s);
    pg.add(crossV2);

    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    var wheelPositions = [
        [-0.55 * s, 0.12 * s, 0.42 * s],
        [-0.55 * s, 0.12 * s, -0.42 * s],
        [0.55 * s, 0.12 * s, 0.42 * s],
        [0.55 * s, 0.12 * s, -0.42 * s]
    ];
    var wheels = [];
    for (var wi = 0; wi < wheelPositions.length; wi++) {
        var wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.06 * s, 12),
            wheelMat
        );
        wheel.position.set(wheelPositions[wi][0], wheelPositions[wi][1], wheelPositions[wi][2]);
        wheel.rotation.x = Math.PI / 2;
        wheel.name = 'wheel_' + wi;
        pg.add(wheel);
        wheels.push(wheel);
    }

    var eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (var ex = -1; ex <= 1; ex += 2) {
        var eyeW = new THREE.Mesh(
            new THREE.SphereGeometry(0.07 * s, 8, 8),
            eyeWhiteMat
        );
        eyeW.position.set(-0.82 * s, 0.45 * s, ex * 0.2 * s);
        pg.add(eyeW);
        var pupil = new THREE.Mesh(
            new THREE.SphereGeometry(0.035 * s, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        pupil.position.set(-0.88 * s, 0.45 * s, ex * 0.2 * s);
        pg.add(pupil);
    }

    pg.userData.wheels = wheels;
    pg.userData.isVehicle = true;
    pg.userData.vehicleType = 'racecar';
    pg.rotation.y = Math.PI / 2;

    return pg;
}

function buildHearseVehicle(avatar) {
    var pg = new THREE.Group();
    var s = avatar.scale || 1.3;

    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
    var body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5 * s, 0.6 * s, 0.85 * s),
        bodyMat
    );
    body.position.set(0, 0.55 * s, 0);
    body.castShadow = true;
    body.name = 'vehicleBody';
    pg.add(body);

    var cabMat = new THREE.MeshStandardMaterial({ color: 0x111122 });
    var cab = new THREE.Mesh(
        new THREE.BoxGeometry(0.45 * s, 0.45 * s, 0.8 * s),
        cabMat
    );
    cab.position.set(-0.8 * s, 0.5 * s, 0);
    pg.add(cab);

    var glowMat = new THREE.MeshBasicMaterial({ color: 0x6622aa, transparent: true, opacity: 0.2 });
    var glow = new THREE.Mesh(
        new THREE.BoxGeometry(1.6 * s, 0.1 * s, 0.95 * s),
        glowMat
    );
    glow.position.set(0, 0.2 * s, 0);
    pg.add(glow);

    var glassMat = new THREE.MeshBasicMaterial({ color: 0x332244, transparent: true, opacity: 0.6 });
    for (var sx = -1; sx <= 1; sx += 2) {
        var window_ = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6 * s, 0.25 * s),
            glassMat
        );
        window_.position.set(0.1 * s, 0.7 * s, sx * 0.43 * s);
        window_.rotation.y = sx * Math.PI / 2;
        pg.add(window_);
    }

    var trimMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.6 });
    var trim = new THREE.Mesh(
        new THREE.BoxGeometry(1.52 * s, 0.03 * s, 0.87 * s),
        trimMat
    );
    trim.position.set(0, 0.86 * s, 0);
    pg.add(trim);

    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    var wheelPositions = [
        [-0.5 * s, 0.15 * s, 0.45 * s],
        [-0.5 * s, 0.15 * s, -0.45 * s],
        [0.5 * s, 0.15 * s, 0.45 * s],
        [0.5 * s, 0.15 * s, -0.45 * s]
    ];
    var wheels = [];
    for (var wi = 0; wi < wheelPositions.length; wi++) {
        var wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 0.07 * s, 12),
            wheelMat
        );
        wheel.position.set(wheelPositions[wi][0], wheelPositions[wi][1], wheelPositions[wi][2]);
        wheel.rotation.x = Math.PI / 2;
        wheel.name = 'wheel_' + wi;
        pg.add(wheel);
        wheels.push(wheel);
    }

    var eyeMat = new THREE.MeshBasicMaterial({ color: 0x8844cc });
    for (var ex = -1; ex <= 1; ex += 2) {
        var eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.06 * s, 8, 8),
            eyeMat
        );
        eye.position.set(-1.0 * s, 0.55 * s, ex * 0.2 * s);
        pg.add(eye);
    }

    pg.userData.wheels = wheels;
    pg.userData.isVehicle = true;
    pg.userData.vehicleType = 'hearse';
    pg.rotation.y = Math.PI / 2;

    return pg;
}

function buildVehicle(avatar) {
    switch (avatar.vehicleType) {
        case 'ambulance': return buildAmbulanceVehicle(avatar);
        case 'racecar': return buildRaceCarVehicle(avatar);
        case 'hearse': return buildHearseVehicle(avatar);
        default: return buildAmbulanceVehicle(avatar);
    }
}

// ===== CLOTHING APPLIER =====

function applyClothing(pg, clothingId, avatar) {
    var s = avatar.scale || 1.0;
    if (!clothingId || clothingId === 'cloth_none') return;

    switch (clothingId) {
        case 'cloth_scrubs': {
            var scrubShell = new THREE.Mesh(
                new THREE.CylinderGeometry(0.34 * s, 0.32 * s, 0.78 * s, 10),
                new THREE.MeshStandardMaterial({ color: 0x4488cc })
            );
            scrubShell.position.set(0, 0.95 * s, 0);
            pg.add(scrubShell);
            var vneck = new THREE.Mesh(
                new THREE.ConeGeometry(0.08 * s, 0.15 * s, 3),
                new THREE.MeshStandardMaterial({ color: 0x3377bb })
            );
            vneck.position.set(0, 1.28 * s, -0.2 * s);
            vneck.rotation.z = Math.PI;
            pg.add(vneck);
            break;
        }
        case 'cloth_labcoat': {
            var coatBody = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35 * s, 0.33 * s, 0.8 * s, 10),
                new THREE.MeshStandardMaterial({ color: 0xf0f0f5 })
            );
            coatBody.position.set(0, 0.95 * s, 0);
            pg.add(coatBody);
            var coatTail = new THREE.Mesh(
                new THREE.PlaneGeometry(0.55 * s, 0.4 * s),
                new THREE.MeshStandardMaterial({ color: 0xf0f0f5, side: THREE.DoubleSide })
            );
            coatTail.position.set(0, 0.5 * s, 0.12 * s);
            coatTail.rotation.x = 0.1;
            coatTail.name = 'coatTail';
            pg.add(coatTail);
            var frontPanel = new THREE.Mesh(
                new THREE.PlaneGeometry(0.3 * s, 0.4 * s),
                new THREE.MeshStandardMaterial({ color: 0xf0f0f5, side: THREE.DoubleSide })
            );
            frontPanel.position.set(0, 0.5 * s, -0.12 * s);
            pg.add(frontPanel);
            break;
        }
        case 'cloth_surgical_gown': {
            var gown = new THREE.Mesh(
                new THREE.CylinderGeometry(0.36 * s, 0.34 * s, 0.85 * s, 10),
                new THREE.MeshStandardMaterial({ color: 0x44aa77 })
            );
            gown.position.set(0, 0.92 * s, 0);
            pg.add(gown);
            break;
        }
        case 'cloth_hawaiian': {
            var colors = [0xff6644, 0xffcc22, 0x44cc66, 0xff6644, 0x4488ff];
            for (var hi = 0; hi < 5; hi++) {
                var strip = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.34 * s, 0.32 * s, 0.15 * s, 10),
                    new THREE.MeshStandardMaterial({ color: colors[hi] })
                );
                strip.position.set(0, 0.65 * s + hi * 0.15 * s, 0);
                pg.add(strip);
            }
            break;
        }
        case 'cloth_tuxedo': {
            var tuxBody = new THREE.Mesh(
                new THREE.CylinderGeometry(0.34 * s, 0.32 * s, 0.78 * s, 10),
                new THREE.MeshStandardMaterial({ color: 0x111111 })
            );
            tuxBody.position.set(0, 0.95 * s, 0);
            pg.add(tuxBody);
            var shirtFront = new THREE.Mesh(
                new THREE.PlaneGeometry(0.15 * s, 0.5 * s),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            shirtFront.position.set(0, 0.95 * s, -0.26 * s);
            pg.add(shirtFront);
            var bowTie = new THREE.Mesh(
                new THREE.BoxGeometry(0.12 * s, 0.04 * s, 0.04 * s),
                new THREE.MeshBasicMaterial({ color: 0xdd2222 })
            );
            bowTie.position.set(0, 1.22 * s, -0.28 * s);
            pg.add(bowTie);
            break;
        }
        case 'cloth_cape_red': {
            var cape = new THREE.Mesh(
                new THREE.PlaneGeometry(0.75 * s, 1.0 * s),
                new THREE.MeshBasicMaterial({
                    color: 0xdd2222,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.85
                })
            );
            cape.position.set(0, 0.95 * s, 0.22 * s);
            cape.rotation.x = 0.15;
            cape.name = 'cape';
            pg.add(cape);
            break;
        }
        case 'cloth_cape_rainbow': {
            var capeR = new THREE.Mesh(
                new THREE.PlaneGeometry(0.75 * s, 1.0 * s),
                new THREE.MeshBasicMaterial({
                    color: 0xff44ff,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.8
                })
            );
            capeR.position.set(0, 0.95 * s, 0.22 * s);
            capeR.rotation.x = 0.15;
            capeR.name = 'cape';
            pg.add(capeR);
            break;
        }
        case 'cloth_jersey': {
            var jersey = new THREE.Mesh(
                new THREE.CylinderGeometry(0.34 * s, 0.32 * s, 0.78 * s, 10),
                new THREE.MeshStandardMaterial({ color: 0xff2222 })
            );
            jersey.position.set(0, 0.95 * s, 0);
            pg.add(jersey);
            var numBar = new THREE.Mesh(
                new THREE.BoxGeometry(0.04 * s, 0.2 * s, 0.02),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            numBar.position.set(0, 0.95 * s, -0.27 * s);
            pg.add(numBar);
            break;
        }
        case 'cloth_armor': {
            var armor = new THREE.Mesh(
                new THREE.CylinderGeometry(0.37 * s, 0.35 * s, 0.75 * s, 8),
                new THREE.MeshStandardMaterial({ color: 0x666677, metalness: 0.5, roughness: 0.4 })
            );
            armor.position.set(0, 0.95 * s, 0);
            pg.add(armor);
            for (var asp = -1; asp <= 1; asp += 2) {
                var pad = new THREE.Mesh(
                    new THREE.SphereGeometry(0.12 * s, 6, 6),
                    new THREE.MeshStandardMaterial({ color: 0x777788, metalness: 0.5 })
                );
                pad.position.set(asp * 0.4 * s, 1.15 * s, 0);
                pg.add(pad);
            }
            break;
        }
    }
}

// ===== GEAR APPLIER (extracted for readability) =====

function applyGear(pg, gearItem, avatar) {
    if (!gearItem || !gearItem.color) return;
    var s = avatar.scale || 1.0;

    if (gearItem.id === 'gear_steth') {
        var steth = new THREE.Mesh(
            new THREE.TorusGeometry(0.18 * s, 0.025 * s, 6, 12),
            new THREE.MeshStandardMaterial({ color: gearItem.color, metalness: 0.5 })
        );
        steth.position.set(0, 1.20 * s, -0.10 * s);
        steth.rotation.x = Math.PI / 2.5;
        pg.add(steth);
        var chestPiece = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04 * s, 0.03 * s, 0.03 * s, 8),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 })
        );
        chestPiece.position.set(0, 1.05 * s, -0.20 * s);
        pg.add(chestPiece);
    } else if (gearItem.id === 'gear_clip') {
        var clip = new THREE.Mesh(
            new THREE.BoxGeometry(0.20 * s, 0.28 * s, 0.04 * s),
            new THREE.MeshStandardMaterial({ color: gearItem.color })
        );
        clip.position.set(0.36 * s, 0.80 * s, -0.12 * s);
        pg.add(clip);
        var paper = new THREE.Mesh(
            new THREE.BoxGeometry(0.16 * s, 0.22 * s, 0.01 * s),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        paper.position.set(0.36 * s, 0.78 * s, -0.15 * s);
        pg.add(paper);
    } else if (gearItem.id === 'gear_syringe') {
        var syringe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.45 * s, 8),
            new THREE.MeshBasicMaterial({ color: 0xddddff, transparent: true, opacity: 0.7 })
        );
        syringe.position.set(0.33 * s, 0.95 * s, 0);
        syringe.rotation.z = 0.3;
        pg.add(syringe);
        var needleTip = new THREE.Mesh(
            new THREE.ConeGeometry(0.01 * s, 0.1 * s, 4),
            new THREE.MeshBasicMaterial({ color: 0xcccccc })
        );
        needleTip.position.set(0.27 * s, 0.72 * s, 0);
        needleTip.rotation.z = 0.3;
        pg.add(needleTip);
    } else if (gearItem.id === 'gear_defib') {
        for (var dx = -1; dx <= 1; dx += 2) {
            var paddle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.10 * s, 0.08 * s, 0.06 * s, 8),
                new THREE.MeshStandardMaterial({ color: gearItem.color })
            );
            paddle.position.set(dx * 0.33 * s, 0.70 * s, -0.18 * s);
            pg.add(paddle);
            var handle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.15 * s, 6),
                new THREE.MeshBasicMaterial({ color: 0x333333 })
            );
            handle.position.set(dx * 0.33 * s, 0.80 * s, -0.18 * s);
            pg.add(handle);
        }
    } else if (gearItem.id === 'gear_hammer') {
        var hammerHead = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08 * s, 0.06 * s, 0.12 * s, 8),
            new THREE.MeshStandardMaterial({ color: gearItem.color })
        );
        hammerHead.position.set(0.38 * s, 1.05 * s, 0);
        hammerHead.rotation.z = Math.PI / 2;
        pg.add(hammerHead);
        var hammerStick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.30 * s, 6),
            new THREE.MeshBasicMaterial({ color: 0x333333 })
        );
        hammerStick.position.set(0.38 * s, 0.85 * s, 0);
        pg.add(hammerStick);
    } else if (gearItem.id === 'gear_mask') {
        var mask = new THREE.Mesh(
            new THREE.SphereGeometry(0.18 * s, 8, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.3),
            new THREE.MeshBasicMaterial({ color: gearItem.color, side: THREE.DoubleSide })
        );
        mask.position.set(0, 1.58 * s, -0.15 * s);
        mask.rotation.x = Math.PI;
        pg.add(mask);
    } else if (gearItem.id === 'gear_coffee') {
        var cup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.15 * s, 8),
            new THREE.MeshStandardMaterial({ color: 0x8B4513 })
        );
        cup.position.set(0.35 * s, 0.80 * s, -0.1 * s);
        pg.add(cup);
    } else if (gearItem.id === 'gear_textbook') {
        var book = new THREE.Mesh(
            new THREE.BoxGeometry(0.18 * s, 0.24 * s, 0.05 * s),
            new THREE.MeshStandardMaterial({ color: 0x2255aa })
        );
        book.position.set(-0.36 * s, 0.80 * s, -0.1 * s);
        pg.add(book);
    } else if (gearItem.id === 'gear_badge') {
        var badge = new THREE.Mesh(
            new THREE.BoxGeometry(0.1 * s, 0.12 * s, 0.02 * s),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        badge.position.set(-0.25 * s, 1.1 * s, -0.25 * s);
        pg.add(badge);
    } else if (gearItem.id === 'gear_wings') {
        for (var wsx = -1; wsx <= 1; wsx += 2) {
            var wing = new THREE.Mesh(
                new THREE.PlaneGeometry(0.5 * s, 0.6 * s),
                new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
            );
            wing.position.set(wsx * 0.4 * s, 1.1 * s, 0.15 * s);
            wing.rotation.y = wsx * 0.3;
            pg.add(wing);
        }
    } else if (gearItem.id === 'gear_backpack') {
        var backpack = new THREE.Mesh(
            new THREE.BoxGeometry(0.25 * s, 0.3 * s, 0.15 * s),
            new THREE.MeshStandardMaterial({ color: 0x44aa44 })
        );
        backpack.position.set(0, 0.90 * s, 0.25 * s);
        pg.add(backpack);
    } else if (gearItem.id === 'gear_shield_item') {
        var shield = new THREE.Mesh(
            new THREE.CircleGeometry(0.2 * s, 8),
            new THREE.MeshStandardMaterial({ color: 0x4488ff, side: THREE.DoubleSide })
        );
        shield.position.set(-0.4 * s, 0.85 * s, -0.1 * s);
        pg.add(shield);
    } else if (gearItem.id === 'gear_katana') {
        var blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.03 * s, 0.5 * s, 0.01 * s),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7 })
        );
        blade.position.set(0.4 * s, 1.0 * s, 0.15 * s);
        blade.rotation.z = 0.2;
        pg.add(blade);
        var bHandle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.15 * s, 6),
            new THREE.MeshStandardMaterial({ color: 0x664422 })
        );
        bHandle.position.set(0.38 * s, 0.72 * s, 0.15 * s);
        bHandle.rotation.z = 0.2;
        pg.add(bHandle);
    }
}

// ===== HAT APPLIER (extracted for readability) =====

function applyHat(pg, hatItem, avatar) {
    if (!hatItem || !hatItem.color || avatar.hasWizardHat || avatar.hasAntenna) return;
    var s = avatar.scale || 1.0;
    var hat;
    var hatY = 2.0 * s;

    if (hatItem.id === 'hat_crown') {
        hat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24 * s, 0.30 * s, 0.15 * s, 8),
            new THREE.MeshBasicMaterial({ color: hatItem.color })
        );
        for (var ci = 0; ci < 5; ci++) {
            var point = new THREE.Mesh(
                new THREE.ConeGeometry(0.04 * s, 0.1 * s, 4),
                new THREE.MeshBasicMaterial({ color: 0xffd700 })
            );
            var cAngle = (ci / 5) * Math.PI * 2;
            point.position.set(Math.cos(cAngle) * 0.22 * s, 0.1 * s, Math.sin(cAngle) * 0.22 * s);
            hat.add(point);
        }
    } else if (hatItem.id === 'hat_halo') {
        hat = new THREE.Mesh(
            new THREE.TorusGeometry(0.32 * s, 0.035 * s, 8, 16),
            new THREE.MeshBasicMaterial({ color: hatItem.color })
        );
        hat.rotation.x = Math.PI / 2;
        hatY = 2.12 * s;
    } else if (hatItem.id === 'hat_viking') {
        hat = new THREE.Mesh(
            new THREE.SphereGeometry(0.30 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: hatItem.color })
        );
        for (var hx = -1; hx <= 1; hx += 2) {
            var horn = new THREE.Mesh(
                new THREE.ConeGeometry(0.05 * s, 0.28 * s, 6),
                new THREE.MeshStandardMaterial({ color: 0xeeeecc })
            );
            horn.position.set(hx * 0.28 * s, 0.1 * s, 0);
            horn.rotation.z = -hx * 0.4;
            hat.add(horn);
        }
    } else if (hatItem.id === 'hat_party') {
        hat = new THREE.Mesh(
            new THREE.ConeGeometry(0.16 * s, 0.35 * s, 8),
            new THREE.MeshBasicMaterial({ color: hatItem.color })
        );
        var pom = new THREE.Mesh(
            new THREE.SphereGeometry(0.05 * s, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffff00 })
        );
        pom.position.set(0, 0.2 * s, 0);
        hat.add(pom);
    } else if (hatItem.id === 'hat_chef') {
        hat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26 * s, 0.22 * s, 0.25 * s, 10),
            new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        var puff = new THREE.Mesh(
            new THREE.SphereGeometry(0.28 * s, 10, 10),
            new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        puff.position.set(0, 0.18 * s, 0);
        hat.add(puff);
    } else if (hatItem.id === 'hat_graduation') {
        hat = new THREE.Group();
        var board2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.5 * s, 0.03 * s, 0.5 * s),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        hat.add(board2);
        var capBase2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22 * s, 0.24 * s, 0.12 * s, 8),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        capBase2.position.y = -0.06 * s;
        hat.add(capBase2);
        var tassel2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 0.15 * s, 4),
            new THREE.MeshBasicMaterial({ color: 0xffcc00 })
        );
        tassel2.position.set(0.2 * s, -0.05 * s, 0);
        hat.add(tassel2);
    } else if (hatItem.id === 'hat_cowboy') {
        hat = new THREE.Group();
        var cowboyTop = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18 * s, 0.2 * s, 0.2 * s, 8),
            new THREE.MeshStandardMaterial({ color: hatItem.color })
        );
        hat.add(cowboyTop);
        var cowboyBrim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.03 * s, 12),
            new THREE.MeshStandardMaterial({ color: hatItem.color })
        );
        cowboyBrim.position.y = -0.08 * s;
        hat.add(cowboyBrim);
    } else if (hatItem.id === 'hat_tiara') {
        hat = new THREE.Mesh(
            new THREE.TorusGeometry(0.28 * s, 0.025 * s, 6, 12, Math.PI),
            new THREE.MeshBasicMaterial({ color: 0xffd700 })
        );
        hat.rotation.x = -0.3;
        for (var gi = 0; gi < 3; gi++) {
            var gem = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.03 * s, 0),
                new THREE.MeshBasicMaterial({ color: gi === 1 ? 0xff2244 : 0x44aaff })
            );
            var gAngle = (gi / 3) * Math.PI;
            gem.position.set(Math.cos(gAngle) * 0.28 * s, Math.sin(gAngle) * 0.28 * s, 0);
            hat.add(gem);
        }
    } else if (hatItem.id === 'hat_propeller') {
        hat = new THREE.Group();
        var propCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.26 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: hatItem.color })
        );
        hat.add(propCap);
        for (var pi2 = 0; pi2 < 3; pi2++) {
            var blade2 = new THREE.Mesh(
                new THREE.BoxGeometry(0.3 * s, 0.02 * s, 0.06 * s),
                new THREE.MeshBasicMaterial({ color: [0xff4444, 0x44ff44, 0x4444ff][pi2] })
            );
            blade2.rotation.y = (pi2 / 3) * Math.PI * 2;
            blade2.position.y = 0.12 * s;
            hat.add(blade2);
        }
    } else {
        hat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.30 * s, 0.32 * s, 0.12 * s, 8),
            new THREE.MeshStandardMaterial({ color: hatItem.color })
        );
        if (hatItem.id === 'hat_headlamp') {
            var lamp = new THREE.Mesh(
                new THREE.SphereGeometry(0.06 * s, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xffffaa })
            );
            lamp.position.set(0, 0.02 * s, -0.30 * s);
            hat.add(lamp);
        }
        if (hatItem.id === 'hat_headmirror') {
            var mirror = new THREE.Mesh(
                new THREE.CircleGeometry(0.08 * s, 10),
                new THREE.MeshBasicMaterial({ color: 0xcccccc })
            );
            mirror.position.set(0, 0.02 * s, -0.30 * s);
            hat.add(mirror);
        }
        if (hatItem.id === 'hat_beanie') {
            hat.geometry.dispose();
            hat.geometry = new THREE.SphereGeometry(0.30 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.45);
        }
        if (hatItem.id === 'hat_bandana') {
            hat.scale.y = 0.5;
        }
        if (hatItem.id === 'hat_tophat') {
            hat.geometry.dispose();
            hat.geometry = new THREE.CylinderGeometry(0.2 * s, 0.22 * s, 0.35 * s, 8);
            var topBrim = new THREE.Mesh(
                new THREE.CylinderGeometry(0.32 * s, 0.32 * s, 0.03 * s, 10),
                new THREE.MeshStandardMaterial({ color: hatItem.color })
            );
            topBrim.position.y = -0.16 * s;
            hat.add(topBrim);
        }
    }
    if (hat) {
        hat.position.set(0, hatY, 0);
        pg.add(hat);
    }
}

// ===== MAIN BUILD FUNCTION =====

export function buildPlayer() {
    var avatar = getAvatarConfig();
    var equipped = storage.get('equipped');

    if (avatar.isVehicle) {
        return buildVehicle(avatar);
    }

    return buildHumanoid(avatar, equipped);
}

function buildHumanoid(avatar, equipped) {
    var pg = new THREE.Group();
    var hatItem = null;
    var gearItem = null;
    var clothingId = equipped.clothing || 'cloth_none';

    for (var si = 0; si < SHOP_ITEMS.length; si++) {
        if (SHOP_ITEMS[si].id === equipped.hat) hatItem = SHOP_ITEMS[si];
        if (SHOP_ITEMS[si].id === equipped.gear) gearItem = SHOP_ITEMS[si];
    }

    var s = avatar.scale || 1.0;

    // ===== BODY =====
    var bodyGroup = buildCapsuleBody(0.32 * s, 0.30 * s, 0.75 * s, avatar.bodyColor);
    bodyGroup.position.set(0, 0.95 * s, 0);
    bodyGroup.castShadow = true;
    pg.add(bodyGroup);

    // Collar
    var collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.25 * s, 0.05 * s, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xeeeeff })
    );
    collar.position.set(0, 1.30 * s, 0);
    collar.rotation.x = Math.PI / 2;
    pg.add(collar);

    // ===== HEAD =====
    var headRadius = 0.38 * s;
    var head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 14, 14),
        new THREE.MeshStandardMaterial({ color: avatar.skinColor })
    );
    head.position.set(0, 1.68 * s, 0);
    head.name = 'head';
    pg.add(head);

    // Hair
    var hair = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius * 0.95, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: avatar.hairColor })
    );
    hair.position.set(0, 1.75 * s, 0);
    pg.add(hair);

    var hairBack = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius * 0.88, 10, 8, 0, Math.PI * 2, 0.3, Math.PI * 0.5),
        new THREE.MeshStandardMaterial({ color: avatar.hairColor })
    );
    hairBack.position.set(0, 1.72 * s, 0.08 * s);
    pg.add(hairBack);

    // ===== EYES =====
    var eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var eyeColorMat = new THREE.MeshBasicMaterial({ color: 0x222244 });
    var eyeHighlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    if (avatar.glowColor) {
        eyeColorMat = new THREE.MeshBasicMaterial({ color: avatar.glowColor });
    }

    for (var ex = -1; ex <= 1; ex += 2) {
        var eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.10 * s, 8, 8), eyeWhiteMat);
        eyeW.position.set(ex * 0.13 * s, 1.72 * s, -0.30 * s);
        eyeW.scale.set(1, 1.1, 0.7);
        pg.add(eyeW);

        var eyeIris = new THREE.Mesh(new THREE.SphereGeometry(0.065 * s, 8, 8), eyeColorMat);
        eyeIris.position.set(ex * 0.13 * s, 1.72 * s, -0.35 * s);
        pg.add(eyeIris);

        var pupil = new THREE.Mesh(
            new THREE.SphereGeometry(0.035 * s, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        pupil.position.set(ex * 0.13 * s, 1.72 * s, -0.38 * s);
        pg.add(pupil);

        var highlight = new THREE.Mesh(new THREE.SphereGeometry(0.02 * s, 4, 4), eyeHighlightMat);
        highlight.position.set(ex * 0.11 * s, 1.75 * s, -0.39 * s);
        pg.add(highlight);
    }

    // Eyebrows
    for (var bx = -1; bx <= 1; bx += 2) {
        var brow = new THREE.Mesh(
            new THREE.TorusGeometry(0.06 * s, 0.015 * s, 4, 8, Math.PI * 0.8),
            new THREE.MeshBasicMaterial({ color: avatar.hairColor })
        );
        brow.position.set(bx * 0.13 * s, 1.82 * s, -0.32 * s);
        brow.rotation.x = -0.2;
        brow.rotation.z = bx * 0.15;
        pg.add(brow);
    }

    // Mouth / Smile
    var smile = new THREE.Mesh(
        new THREE.TorusGeometry(0.07 * s, 0.018 * s, 6, 10, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0xdd5544 })
    );
    smile.position.set(0, 1.58 * s, -0.33 * s);
    smile.rotation.z = Math.PI;
    smile.name = 'mouth';
    pg.add(smile);

    // Cheek blush
    var blushMat = new THREE.MeshBasicMaterial({ color: 0xff8888, transparent: true, opacity: 0.25 });
    for (var cx = -1; cx <= 1; cx += 2) {
        var blush = new THREE.Mesh(new THREE.CircleGeometry(0.05 * s, 8), blushMat);
        blush.position.set(cx * 0.22 * s, 1.63 * s, -0.34 * s);
        pg.add(blush);
    }

    // Nose
    var nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 * s, 6, 6),
        new THREE.MeshStandardMaterial({ color: avatar.skinColor })
    );
    nose.position.set(0, 1.65 * s, -0.37 * s);
    pg.add(nose);

    // ===== LEGS =====
    var leftLegGroup = buildRoundedLimb(0.10 * s, 0.50 * s, avatar.pantsColor);
    leftLegGroup.position.set(-0.14 * s, 0.30 * s, 0);
    leftLegGroup.name = 'leftLeg';
    pg.add(leftLegGroup);

    var rightLegGroup = buildRoundedLimb(0.10 * s, 0.50 * s, avatar.pantsColor);
    rightLegGroup.position.set(0.14 * s, 0.30 * s, 0);
    rightLegGroup.name = 'rightLeg';
    pg.add(rightLegGroup);

    // Shoes
    var shoeColor = avatar.shoeColor || 0xff3333;
    var shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor });

    var shoeL = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 8, 6), shoeMat);
    shoeL.scale.set(1.0, 0.55, 1.4);
    shoeL.position.set(0, -0.28 * s, -0.03 * s);
    leftLegGroup.add(shoeL);

    var shoeR = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 8, 6), shoeMat);
    shoeR.scale.set(1.0, 0.55, 1.4);
    shoeR.position.set(0, -0.28 * s, -0.03 * s);
    rightLegGroup.add(shoeR);

    // ===== ARMS =====
    var armColor = avatar.bodyColor;
    var leftArmGroup = buildRoundedLimb(0.08 * s, 0.40 * s, armColor);
    leftArmGroup.position.set(-0.38 * s, 0.95 * s, 0);
    leftArmGroup.name = 'leftArm';
    pg.add(leftArmGroup);

    var rightArmGroup = buildRoundedLimb(0.08 * s, 0.40 * s, armColor);
    rightArmGroup.position.set(0.38 * s, 0.95 * s, 0);
    rightArmGroup.name = 'rightArm';
    pg.add(rightArmGroup);

    // Hands
    var handMat = new THREE.MeshStandardMaterial({ color: avatar.skinColor });
    var handL = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 6), handMat);
    handL.position.set(0, -0.24 * s, 0);
    leftArmGroup.add(handL);

    var handR = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 6), handMat);
    handR.position.set(0, -0.24 * s, 0);
    rightArmGroup.add(handR);

    // ===== AVATAR SPECIAL FEATURES =====

    // Cape (Superhero)
    if (avatar.hasCape && clothingId !== 'cloth_cape_red' && clothingId !== 'cloth_cape_rainbow') {
        var cape2 = new THREE.Mesh(
            new THREE.PlaneGeometry(0.75 * s, 1.0 * s),
            new THREE.MeshBasicMaterial({
                color: avatar.capeColor,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85
            })
        );
        cape2.position.set(0, 0.95 * s, 0.22 * s);
        cape2.rotation.x = 0.15;
        cape2.name = 'cape';
        pg.add(cape2);
    }

    // Antenna (Robot)
    if (avatar.hasAntenna) {
        var antennaPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.35 * s, 6),
            new THREE.MeshBasicMaterial({ color: 0x888899 })
        );
        antennaPole.position.set(0, 2.05 * s, 0);
        pg.add(antennaPole);

        var antennaBall = new THREE.Mesh(
            new THREE.SphereGeometry(0.07 * s, 8, 8),
            new THREE.MeshBasicMaterial({ color: avatar.glowColor || 0x44aaff })
        );
        antennaBall.position.set(0, 2.25 * s, 0);
        pg.add(antennaBall);
    }

    // Wizard Hat
    if (avatar.hasWizardHat) {
        var wizHat = new THREE.Mesh(
            new THREE.ConeGeometry(0.32 * s, 0.55 * s, 8),
            new THREE.MeshStandardMaterial({ color: avatar.hatColor || 0x6622aa })
        );
        wizHat.position.set(0, 2.10 * s, 0);
        pg.add(wizHat);

        var brim = new THREE.Mesh(
            new THREE.TorusGeometry(0.38 * s, 0.04 * s, 4, 14),
            new THREE.MeshStandardMaterial({ color: avatar.hatColor || 0x6622aa })
        );
        brim.position.set(0, 1.88 * s, 0);
        brim.rotation.x = Math.PI / 2;
        pg.add(brim);

        var starMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
        for (var ws = 0; ws < 3; ws++) {
            var star = new THREE.Mesh(new THREE.OctahedronGeometry(0.03 * s, 0), starMat);
            var wsAngle = (ws / 3) * Math.PI * 2;
            star.position.set(
                Math.cos(wsAngle) * 0.25 * s,
                2.0 * s + ws * 0.12 * s,
                Math.sin(wsAngle) * 0.25 * s
            );
            pg.add(star);
        }
    }

    // Zombie dark circles
    if (avatar.id === 'avatar_zombie') {
        var darkCircleMat = new THREE.MeshBasicMaterial({ color: 0x335533, transparent: true, opacity: 0.5 });
        for (var zx = -1; zx <= 1; zx += 2) {
            var darkCircle = new THREE.Mesh(new THREE.CircleGeometry(0.06 * s, 6), darkCircleMat);
            darkCircle.position.set(zx * 0.13 * s, 1.67 * s, -0.32 * s);
            pg.add(darkCircle);
        }
    }

    // Attending coat tails
    if (avatar.id === 'avatar_attending' && clothingId === 'cloth_none') {
        var coatTail2 = new THREE.Mesh(
            new THREE.PlaneGeometry(0.55 * s, 0.5 * s),
            new THREE.MeshStandardMaterial({ color: avatar.bodyColor, side: THREE.DoubleSide })
        );
        coatTail2.position.set(0, 0.55 * s, 0.18 * s);
        coatTail2.rotation.x = 0.1;
        coatTail2.name = 'coatTail';
        pg.add(coatTail2);
    }

    // Apply clothing, hat, gear
    applyClothing(pg, clothingId, avatar);
    applyHat(pg, hatItem, avatar);
    applyGear(pg, gearItem, avatar);

    return pg;
}

export function getPlayerLimbs(playerGroup) {
    // For vehicles, return wheel references
    if (playerGroup.userData && playerGroup.userData.isVehicle) {
        var wheels = [];
        var lights = [];
        playerGroup.traverse(function (child) {
            if (child.name && child.name.indexOf('wheel_') === 0) wheels.push(child);
            if (child.name && child.name.indexOf('light_') === 0) lights.push(child);
        });
        return {
            wheels: wheels,
            lights: lights,
            body: playerGroup.getObjectByName('vehicleBody'),
            leftLeg: null,
            rightLeg: null,
            leftArm: null,
            rightArm: null,
            cape: null,
            head: null,
            mouth: null,
            coatTail: null,
            isVehicle: true
        };
    }

    return {
        leftLeg: playerGroup.getObjectByName('leftLeg'),
        rightLeg: playerGroup.getObjectByName('rightLeg'),
        leftArm: playerGroup.getObjectByName('leftArm'),
        rightArm: playerGroup.getObjectByName('rightArm'),
        cape: playerGroup.getObjectByName('cape'),
        head: playerGroup.getObjectByName('head'),
        mouth: playerGroup.getObjectByName('mouth'),
        coatTail: playerGroup.getObjectByName('coatTail'),
        isVehicle: false
    };
}
