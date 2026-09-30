/**
 * homecharacter.js — Fullscreen home scene with flying 3D medical props
 *
 * AGENT 15 REPLACEMENT — Architecture contract §24.1, §31:
 *
 * KEY CHANGES:
 * - REMOVED: Independent requestAnimationFrame() loop
 * - ADDED: update(deltaSeconds, nowMs) and render() APIs
 *   called by main.js in its own RAF loop
 * - ADDED: resize(width, height) API
 * - ADDED: setReducedMotion(enabled) API
 * - ADDED: playCelebration() for end-run celebration
 * - FIXED: Gesture cooldown ordering — completed gesture is
 *   evaluated BEFORE currentGesture is reset to GESTURE_NONE
 * - FIXED: Disposed replaced characters (GPU resource cleanup)
 * - All limb animations use absolute positioning with stored
 *   base values, never accumulative +=
 * - Vehicle avatars skip humanoid animation
 *
 * The main render loop is owned by main.js (Agent 6).
 * HomeCharacter must NOT call requestAnimationFrame().
 */

import * as THREE from 'three';
import { buildPlayer, getPlayerLimbs } from './player.js';
import { updateModelAnimation } from './charactermodel.js';
import { PROP_BUILDERS } from './props.js';

// ===== CONFIGURATION =====
var FLYING_PROP_COUNT = 14;
var AMBIENT_PARTICLE_COUNT = 30;
var PROP_SPEED_MIN = 0.5;
var PROP_SPEED_MAX = 1.5;
var PROP_SPAWN_X_RANGE = 14;
var PROP_SPAWN_Y_MIN = -2;
var PROP_SPAWN_Y_MAX = 6;
var PROP_SPAWN_Z_MIN = -20;
var PROP_SPAWN_Z_MAX = -5;
var PROP_RECYCLE_Z = 8;

// Gesture types
var GESTURE_NONE = 0;
var GESTURE_CLIPBOARD = 1;
var GESTURE_STETHOSCOPE = 2;
var GESTURE_HEAD_TILT = 3;
var GESTURE_WAVE = 4;
var GESTURE_STETHOSCOPE_LISTEN = 5;
var GESTURE_JUMPING_JACKS = 6;
var GESTURE_FLEXING = 7;
var GESTURE_LOOKING_AT_WATCH = 8;
var GESTURE_THUMBS_UP = 9;
var GESTURE_COUNT = 10;

/**
 * Recursively dispose all geometry and materials within a group.
 * @param {THREE.Object3D} obj
 */
function disposeGroup(obj) {
    if (!obj) return;
    for (var i = obj.children.length - 1; i >= 0; i--) {
        disposeGroup(obj.children[i]);
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

export class HomeCharacter {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.character = null;
        this.limbs = null;
        this.time = 0;
        this.initialized = false;
        this._active = false;

        // Reduced motion
        this._reducedMotion = false;

        // Flying props
        this.flyingProps = [];

        // Ambient particles
        this.ambientParticles = [];

        // Gesture system
        this.currentGesture = GESTURE_NONE;
        this.gestureTimer = 0;
        this.gestureDuration = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 2.0;

        // Celebration state
        this._celebrationTimer = 0;
        this._celebrationActive = false;

        // Stored base positions for limbs (prevents head detach bug)
        this._headBaseY = 0;
        this._headBaseX = 0;
        this._headBaseZ = 0;
        this._leftArmBaseX = 0;
        this._rightArmBaseX = 0;

        // Camera sway
        this._cameraBaseX = 0;
        this._cameraBaseY = 3.5;
        this._cameraBaseZ = 9;

        // Resize handler reference for cleanup
        this._resizeHandler = null;
    }

    /**
     * Initialize the home scene.
     * Uses the existing game renderer.
     * DOES NOT create its own animation loop (architecture §24.1).
     *
     * @param {THREE.WebGLRenderer} existingRenderer
     */
    init(existingRenderer) {
        if (this.initialized) {
            this.rebuildCharacter();
            return;
        }

        if (existingRenderer) {
            this.renderer = existingRenderer;
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x120828);
        this.scene.fog = new THREE.FogExp2(0x120828, 0.015);

        this.camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.set(this._cameraBaseX, this._cameraBaseY, this._cameraBaseZ);
        this.camera.lookAt(0, 1.2, 0);

        // ===== LIGHTING =====
        var ambient = new THREE.AmbientLight(0x8877aa, 1.2);
        this.scene.add(ambient);

        var hemi = new THREE.HemisphereLight(0x8866cc, 0x112244, 0.5);
        this.scene.add(hemi);

        var keyLight = new THREE.DirectionalLight(0xffeedd, 1.8);
        keyLight.position.set(5, 8, 10);
        this.scene.add(keyLight);

        var fillLight = new THREE.DirectionalLight(0x6688ff, 0.3);
        fillLight.position.set(-5, 4, 8);
        this.scene.add(fillLight);

        var rimLight = new THREE.DirectionalLight(0x00eeff, 0.25);
        rimLight.position.set(0, 5, -5);
        this.scene.add(rimLight);

        // ===== GROUND PLATFORM =====
        var platformGeo = new THREE.CircleGeometry(2.0, 32);
        var platformMat = new THREE.MeshBasicMaterial({
            color: 0x1a0a40,
            transparent: true,
            opacity: 0.4
        });
        var platform = new THREE.Mesh(platformGeo, platformMat);
        platform.rotation.x = -Math.PI / 2;
        platform.position.y = -0.3;
        this.scene.add(platform);

        var ringGeo = new THREE.RingGeometry(1.9, 2.1, 48);
        var ringMat = new THREE.MeshBasicMaterial({
            color: 0xbb66ff,
            transparent: true,
            opacity: 0.15
        });
        var ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.29;
        this.scene.add(ring);

        var ring2Geo = new THREE.RingGeometry(2.3, 2.4, 48);
        var ring2Mat = new THREE.MeshBasicMaterial({
            color: 0x00eeff,
            transparent: true,
            opacity: 0.08
        });
        var ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.rotation.x = -Math.PI / 2;
        ring2.position.y = -0.29;
        this.scene.add(ring2);

        // ===== BUILD CHARACTER =====
        this.rebuildCharacter();

        // ===== SPAWN FLYING PROPS =====
        this._spawnFlyingProps();

        // ===== SPAWN AMBIENT PARTICLES =====
        this._spawnAmbientParticles();

        // ===== BACKGROUND STARS =====
        this._createBackgroundStars();

        this.initialized = true;
    }

    /**
     * Rebuild the character mesh (call when equipment changes).
     * Properly disposes the old character's GPU resources (architecture §31).
     */
    rebuildCharacter() {
        // Dispose old character
        if (this.character && this.scene) {
            this.scene.remove(this.character);
            disposeGroup(this.character);
            this.character = null;
        }

        this.character = buildPlayer();
        this.limbs = getPlayerLimbs(this.character);

        // Face toward camera
        this.character.rotation.y = Math.PI;

        if (this.scene) {
            this.scene.add(this.character);
        }

        // Store base positions for all animated limbs (absolute positioning fix)
        if (this.limbs && this.limbs.head) {
            this._headBaseY = this.limbs.head.position.y;
            this._headBaseX = this.limbs.head.position.x;
            this._headBaseZ = this.limbs.head.position.z;
        }
        if (this.limbs && this.limbs.leftArm) {
            this._leftArmBaseX = this.limbs.leftArm.position.x;
        }
        if (this.limbs && this.limbs.rightArm) {
            this._rightArmBaseX = this.limbs.rightArm.position.x;
        }
    }

    /**
     * Set reduced motion preference (architecture §31).
     * @param {boolean} enabled
     */
    setReducedMotion(enabled) {
        this._reducedMotion = !!enabled;
    }

    /**
     * Resize camera and projection (architecture §24.1).
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        if (this.camera) {
            this.camera.aspect = (width || window.innerWidth) / (height || window.innerHeight);
            this.camera.updateProjectionMatrix();
        }
    }

    /**
     * Trigger end-run celebration animation (architecture §31).
     */
    playCelebration() {
        this._celebrationActive = true;
        this._celebrationTimer = 2.0;
    }

    /**
     * Start animation flag. Does NOT create RAF loop.
     * Called by main.js to indicate the home scene should be active.
     */
    startAnimation() {
        this._active = true;
    }

    /**
     * Stop animation flag.
     */
    stopAnimation() {
        this._active = false;
    }

    /**
     * Update all animation state. Called by main.js in its RAF loop.
     * @param {number} dt - deltaSeconds
     * @param {number} nowMs - current time in ms (unused currently)
     */
    update(dt) {
        if (!this._active || !this.initialized) return;
        if (dt > 0.1) dt = 0.016;

        this.time += dt;
        this._updateCharacterAnimation(dt);
        this._updateFlyingProps(dt);
        this._updateAmbientParticles(dt);
        this._updateCamera(dt);
    }

    /**
     * Render the home scene. Called by main.js in its RAF loop.
     */
    render() {
        if (!this._active || !this.initialized) return;
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // ===== PRIVATE: Flying Props =====

    _spawnFlyingProps() {
        for (var i = 0; i < FLYING_PROP_COUNT; i++) {
            this._spawnOneProp(true);
        }
    }

    _spawnOneProp(randomizeZ) {
        var builderIndex = Math.floor(Math.random() * PROP_BUILDERS.length);
        var builder = PROP_BUILDERS[builderIndex];
        var prop = builder();

        var side = Math.random() > 0.5 ? 1 : -1;
        var x = side * (3 + Math.random() * PROP_SPAWN_X_RANGE * 0.5);
        var y = PROP_SPAWN_Y_MIN + Math.random() * (PROP_SPAWN_Y_MAX - PROP_SPAWN_Y_MIN);
        var z = randomizeZ
            ? PROP_SPAWN_Z_MIN + Math.random() * (PROP_SPAWN_Z_MAX - PROP_SPAWN_Z_MIN + PROP_RECYCLE_Z)
            : PROP_SPAWN_Z_MIN - Math.random() * 5;

        prop.position.set(x, y, z);
        prop.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 0.5
        );

        var scale = 0.25 + Math.random() * 0.35;
        prop.scale.set(scale, scale, scale);

        prop.traverse(function (child) {
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(function (m) {
                        m.transparent = true;
                        m.opacity = Math.min(m.opacity || 1, 0.7 + Math.random() * 0.25);
                    });
                } else {
                    child.material.transparent = true;
                    child.material.opacity = Math.min(child.material.opacity || 1, 0.7 + Math.random() * 0.25);
                }
            }
        });

        var propSpeed = this._reducedMotion ? 0.15 : (PROP_SPEED_MIN + Math.random() * (PROP_SPEED_MAX - PROP_SPEED_MIN));

        prop.userData = {
            speedZ: propSpeed,
            speedX: (Math.random() - 0.5) * 0.3,
            rotSpeedX: (Math.random() - 0.5) * 0.3,
            rotSpeedY: (Math.random() - 0.5) * 0.5,
            rotSpeedZ: (Math.random() - 0.5) * 0.2,
            bobPhase: Math.random() * Math.PI * 2,
            bobSpeed: 0.3 + Math.random() * 0.4,
            bobAmount: this._reducedMotion ? 0.02 : (0.1 + Math.random() * 0.2),
            baseY: y
        };

        this.scene.add(prop);
        this.flyingProps.push(prop);
    }

    _updateFlyingProps(dt) {
        for (var i = 0; i < this.flyingProps.length; i++) {
            var prop = this.flyingProps[i];
            var d = prop.userData;

            prop.position.z += d.speedZ * dt;
            prop.position.x += d.speedX * dt;
            prop.position.y = d.baseY + Math.sin(this.time * d.bobSpeed + d.bobPhase) * d.bobAmount;

            if (!this._reducedMotion) {
                prop.rotation.x += d.rotSpeedX * dt;
                prop.rotation.y += d.rotSpeedY * dt;
                prop.rotation.z += d.rotSpeedZ * dt;
            }

            if (prop.position.z > PROP_RECYCLE_Z) {
                this.scene.remove(prop);
                disposeGroup(prop);
                this.flyingProps.splice(i, 1);
                i--;
                this._spawnOneProp(false);
            }
        }
    }

    // ===== PRIVATE: Ambient Particles =====

    _spawnAmbientParticles() {
        var colors = [0xbb66ff, 0x00eeff, 0xff44aa, 0xffcc00, 0x44aaff, 0x00ff88];

        for (var i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
            var color = colors[i % colors.length];
            var particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 6, 6),
                new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.2 + Math.random() * 0.3
                })
            );

            particle.position.set(
                (Math.random() - 0.5) * 20,
                Math.random() * 8 - 1,
                (Math.random() - 0.5) * 25
            );

            particle.userData = {
                baseX: particle.position.x,
                baseY: particle.position.y,
                baseZ: particle.position.z,
                phaseX: Math.random() * Math.PI * 2,
                phaseY: Math.random() * Math.PI * 2,
                phaseZ: Math.random() * Math.PI * 2,
                speedX: 0.2 + Math.random() * 0.3,
                speedY: 0.3 + Math.random() * 0.4,
                speedZ: 0.1 + Math.random() * 0.2,
                driftX: 0.5 + Math.random() * 1.0,
                driftY: 0.3 + Math.random() * 0.5,
                driftZ: 0.4 + Math.random() * 0.8
            };

            this.scene.add(particle);
            this.ambientParticles.push(particle);
        }
    }

    _updateAmbientParticles(dt) {
        if (this._reducedMotion) return; // Skip particle animation in reduced motion

        for (var i = 0; i < this.ambientParticles.length; i++) {
            var p = this.ambientParticles[i];
            var d = p.userData;
            var t = this.time;

            p.position.x = d.baseX + Math.sin(t * d.speedX + d.phaseX) * d.driftX;
            p.position.y = d.baseY + Math.sin(t * d.speedY + d.phaseY) * d.driftY;
            p.position.z = d.baseZ + Math.sin(t * d.speedZ + d.phaseZ) * d.driftZ;

            p.material.opacity = 0.15 + Math.sin(t * 0.8 + i * 0.5) * 0.1;
        }
    }

    // ===== PRIVATE: Background Stars =====

    _createBackgroundStars() {
        var starMat = new THREE.MeshBasicMaterial({
            color: 0xaaaaff,
            transparent: true,
            opacity: 0.15
        });

        for (var i = 0; i < 60; i++) {
            var star = new THREE.Mesh(
                new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 4, 4),
                starMat.clone()
            );
            star.position.set(
                (Math.random() - 0.5) * 40,
                Math.random() * 15 - 3,
                -10 - Math.random() * 30
            );
            star.material.opacity = 0.05 + Math.random() * 0.15;
            this.scene.add(star);
        }
    }

    // ===== PRIVATE: Camera =====

    _updateCamera(dt) {
        if (!this.camera) return;

        if (this._reducedMotion) {
            // Minimal sway in reduced motion
            this.camera.position.x = this._cameraBaseX;
            this.camera.position.y = this._cameraBaseY;
            this.camera.lookAt(0, 1.2, 0);
            return;
        }

        var t = this.time;
        this.camera.position.x = this._cameraBaseX + Math.sin(t * 0.15) * 0.3;
        this.camera.position.y = this._cameraBaseY + Math.sin(t * 0.2) * 0.15;

        this.camera.lookAt(
            Math.sin(t * 0.1) * 0.1,
            1.2 + Math.sin(t * 0.25) * 0.05,
            0
        );
    }

    // ===== PRIVATE: Character Animation =====

    /**
     * Character idle animation with gesture system.
     *
     * KEY FIX (architecture §31 gesture cooldown ordering):
     * When gestureProgress >= 1.0, we first evaluate the completed
     * gesture (store it in a local variable), THEN reset the state.
     * This ensures any post-gesture logic uses the correct gesture ID.
     *
     * All position modifications use ABSOLUTE values with stored bases,
     * never accumulative += (prevents head detach bug).
     *
     * Vehicle avatars skip animation entirely.
     */
    _updateCharacterAnimation(dt) {
        if (!this.character || !this.limbs) return;
        if (this.character.userData.animator) {
            this.character.rotation.y = Math.PI;
            updateModelAnimation(this.character, dt, 'idle');
            return;
        }
        if (this.limbs.isVehicle) return;

        // Reduced motion: only minimal breathing
        if (this._reducedMotion) {
            var breathe = Math.sin(this.time * 0.8) * 0.005;
            this.character.position.y = breathe;
            this.character.rotation.y = Math.PI;
            return;
        }

        var t = this.time;

        // ===== CELEBRATION ANIMATION =====
        if (this._celebrationActive) {
            this._celebrationTimer -= dt;
            var celebP = 1.0 - Math.max(0, this._celebrationTimer / 2.0);
            var celebBounce = Math.abs(Math.sin(celebP * Math.PI * 6)) * 0.15;
            this.character.position.y = celebBounce;

            if (this.limbs.leftArm) {
                this.limbs.leftArm.rotation.x = 2.0 * Math.abs(Math.sin(celebP * Math.PI * 4));
            }
            if (this.limbs.rightArm) {
                this.limbs.rightArm.rotation.x = 2.0 * Math.abs(Math.sin(celebP * Math.PI * 4 + 0.5));
            }

            if (this._celebrationTimer <= 0) {
                this._celebrationActive = false;
            }
            return;
        }

        // ===== BASE IDLE LAYERS =====
        var breathe2 = Math.sin(t * 1.3) * 0.012;
        this.character.position.y = breathe2;

        var sway = Math.sin(t * 0.6) * 0.006;
        this.character.position.x = sway;

        var lean = Math.sin(t * 0.8) * 0.004;
        var rotOsc = Math.sin(t * 0.4) * 0.015;
        this.character.rotation.y = Math.PI + rotOsc;

        var baseArmSwingL = Math.sin(t * 0.9) * 0.06;
        var baseArmSwingR = Math.sin(t * 1.1 + 0.5) * 0.06;
        var baseLegSwingL = Math.sin(t * 0.7) * 0.03;
        var baseLegSwingR = Math.sin(t * 0.7 + Math.PI) * 0.03;
        var headBob = Math.sin(t * 1.0) * 0.01;

        // ===== GESTURE SYSTEM =====
        var gestureArmL = 0;
        var gestureArmR = 0;
        var gestureHeadTiltZ = 0;
        var gestureHeadTiltX = 0;
        var gestureLeanX = 0;
        var gestureLegL = 0;
        var gestureLegR = 0;

        if (this.currentGesture === GESTURE_NONE) {
            this.gestureDelayTimer -= dt;
            if (this.gestureDelayTimer <= 0) {
                this.currentGesture = 1 + Math.floor(Math.random() * (GESTURE_COUNT - 1));
                this.gestureTimer = 0;

                switch (this.currentGesture) {
                    case GESTURE_CLIPBOARD: this.gestureDuration = 1.8; break;
                    case GESTURE_STETHOSCOPE: this.gestureDuration = 1.5; break;
                    case GESTURE_HEAD_TILT: this.gestureDuration = 1.2; break;
                    case GESTURE_WAVE: this.gestureDuration = 2.0; break;
                    case GESTURE_STETHOSCOPE_LISTEN: this.gestureDuration = 2.0; break;
                    case GESTURE_JUMPING_JACKS: this.gestureDuration = 2.5; break;
                    case GESTURE_FLEXING: this.gestureDuration = 2.0; break;
                    case GESTURE_LOOKING_AT_WATCH: this.gestureDuration = 1.8; break;
                    case GESTURE_THUMBS_UP: this.gestureDuration = 1.5; break;
                    default: this.gestureDuration = 1.5;
                }
            }
        } else {
            this.gestureTimer += dt;
            this.gestureProgress = Math.min(this.gestureTimer / this.gestureDuration, 1.0);

            var bell = Math.sin(this.gestureProgress * Math.PI);

            switch (this.currentGesture) {
                case GESTURE_CLIPBOARD:
                    gestureArmR = -0.8 * bell;
                    gestureArmL = -0.5 * bell;
                    gestureHeadTiltX = 0.12 * bell;
                    gestureLeanX = 0.04 * bell;
                    break;

                case GESTURE_STETHOSCOPE:
                    gestureArmR = -1.0 * bell;
                    gestureArmL = -0.2 * bell;
                    gestureHeadTiltZ = -0.08 * bell;
                    break;

                case GESTURE_HEAD_TILT:
                    var tiltPhase = this.gestureProgress * Math.PI * 2;
                    gestureHeadTiltZ = Math.sin(tiltPhase) * 0.15;
                    gestureArmR = 0.1 * bell;
                    break;

                case GESTURE_WAVE:
                    var wavePhase = this.gestureProgress * Math.PI * 6;
                    gestureArmR = -1.2 * bell + Math.sin(wavePhase) * 0.3 * bell;
                    gestureLeanX = -0.03 * bell;
                    break;

                case GESTURE_STETHOSCOPE_LISTEN:
                    gestureArmR = -1.3 * bell;
                    gestureHeadTiltZ = 0.1 * bell;
                    gestureLeanX = 0.08 * bell;
                    gestureHeadTiltX = 0.05 * bell;
                    break;

                case GESTURE_JUMPING_JACKS:
                    var jjPhase = this.gestureProgress * Math.PI * 4;
                    var jjBell = Math.abs(Math.sin(jjPhase));
                    gestureArmL = -1.5 * jjBell;
                    gestureArmR = -1.5 * jjBell;
                    gestureLegL = -0.4 * jjBell;
                    gestureLegR = 0.4 * jjBell;
                    break;

                case GESTURE_FLEXING:
                    gestureArmL = -1.8 * bell;
                    gestureArmR = -1.8 * bell;
                    gestureLeanX = -0.02 * bell;
                    break;

                case GESTURE_LOOKING_AT_WATCH:
                    gestureArmL = -1.0 * bell;
                    gestureHeadTiltX = 0.15 * bell;
                    gestureHeadTiltZ = -0.1 * bell;
                    gestureLegR = Math.sin(this.gestureProgress * Math.PI * 6) * 0.1 * bell;
                    break;

                case GESTURE_THUMBS_UP:
                    gestureArmR = -1.4 * bell;
                    gestureLeanX = -0.03 * bell;
                    break;
            }

            // ===== GESTURE COOLDOWN FIX (architecture §31) =====
            // Evaluate the completed gesture BEFORE resetting state
            if (this.gestureProgress >= 1.0) {
                // Store completed gesture for any post-gesture logic
                var completedGesture = this.currentGesture;

                // Now reset state
                this.currentGesture = GESTURE_NONE;
                this.gestureTimer = 0;
                this.gestureProgress = 0;
                this.gestureDelayTimer = 2.0 + Math.random() * 3.0;

                // Post-gesture effects could be evaluated here using completedGesture
                // (e.g. logging, triggering particles, avoiding repeat selection)
                void completedGesture; // suppress unused warning
            }
        }

        // ===== APPLY TO LIMBS (all absolute, never accumulative) =====
        if (this.limbs.leftArm) {
            this.limbs.leftArm.rotation.x = baseArmSwingL - gestureArmL;
        }
        if (this.limbs.rightArm) {
            this.limbs.rightArm.rotation.x = baseArmSwingR - gestureArmR;
        }
        if (this.limbs.leftLeg) {
            this.limbs.leftLeg.rotation.x = baseLegSwingL + gestureLegL;
        }
        if (this.limbs.rightLeg) {
            this.limbs.rightLeg.rotation.x = baseLegSwingR + gestureLegR;
        }

        // HEAD — absolute positioning (prevents detach bug)
        if (this.limbs.head) {
            this.limbs.head.position.y = this._headBaseY + headBob;
            this.limbs.head.position.x = this._headBaseX;
            this.limbs.head.position.z = this._headBaseZ;
            this.limbs.head.rotation.z = gestureHeadTiltZ;
            this.limbs.head.rotation.x = gestureHeadTiltX;
        }

        // Apply gesture lean on top of base lean (absolute)
        this.character.rotation.x = lean + gestureLeanX;

        // Mouth animation
        if (this.limbs.mouth) {
            var smileScale = 1.0 + Math.sin(t * 0.5) * 0.05;
            this.limbs.mouth.scale.set(smileScale, smileScale, 1);
        }

        // Cape animation
        if (this.limbs.cape) {
            this.limbs.cape.rotation.x = 0.15 + Math.sin(t * 1.2) * 0.05;
        }

        // Coat tail animation
        if (this.limbs.coatTail) {
            this.limbs.coatTail.rotation.x = 0.1 + Math.sin(t * 0.9) * 0.03;
        }
    }

    /**
     * Full cleanup — dispose all GPU resources (architecture §31).
     */
    dispose() {
        this.stopAnimation();

        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }

        if (this.scene) {
            var toDispose = [];
            this.scene.traverse(function (child) {
                toDispose.push(child);
            });
            for (var i = 0; i < toDispose.length; i++) {
                disposeGroup(toDispose[i]);
            }
        }

        this.character = null;
        this.limbs = null;
        this.flyingProps = [];
        this.ambientParticles = [];
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.initialized = false;
    }
}
