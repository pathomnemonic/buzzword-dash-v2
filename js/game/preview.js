/**
 * preview.js — Character preview renderer for the On-Call Locker
 *
 * AGENT 15 REPLACEMENT — Architecture contract §24.2, §31:
 *
 * KEY CHANGES:
 * - FIXED: Gesture cooldown ordering — completed gesture type is
 *   evaluated BEFORE currentGesture is reset to GESTURE_NONE
 * - FIXED: Disposed replaced characters properly (GPU resource cleanup)
 * - FIXED: Preserved drag rotation across character rebuilds
 * - ADDED: setReducedMotion(enabled) support
 * - ADDED: isCurrentAvatarVehicle() for UI vehicle compatibility queries
 * - All limb animations use absolute positioning with stored base values
 * - Vehicle avatars skip gesture animation entirely
 *
 * The Locker preview MAY use its own renderer and loop (per §24.2).
 * It uses a separate WebGL renderer and canvas from the game scene.
 *
 * 15-gesture AAA animation system:
 * - Medical: stethoscope listen, clipboard, check watch
 * - Personality: wave, flexing, thumbs up, thinking pose
 * - Athletic: somersault, cartwheel, spin kick, celebratory jump
 * - Fun: air guitar, sneeze, dance move, yawn & stretch
 *
 * Disney 12 Principles observed:
 * - Anticipation before major actions
 * - Follow-through and overlapping action
 * - Slow in / slow out via bell curves
 * - Secondary action (foot tapping, head bobbing)
 * - Exaggeration for personality
 * - Avoid twinning (arms never at exact same position)
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { buildPlayer, getPlayerLimbs, disposeCharacter } from './player.js';

// Gesture constants
var GESTURE_NONE = 0;
var GESTURE_WAVE = 1;
var GESTURE_STETHOSCOPE = 2;
var GESTURE_JUMPING_JACKS = 3;
var GESTURE_FLEXING = 4;
var GESTURE_CHECK_WATCH = 5;
var GESTURE_THUMBS_UP = 6;
var GESTURE_SOMERSAULT = 7;
var GESTURE_CARTWHEEL = 8;
var GESTURE_SPIN_KICK = 9;
var GESTURE_CELEBRATORY_JUMP = 10;
var GESTURE_AIR_GUITAR = 11;
var GESTURE_SNEEZE = 12;
var GESTURE_DANCE_MOVE = 13;
var GESTURE_THINKING_POSE = 14;
var GESTURE_YAWN_STRETCH = 15;
var GESTURE_COUNT = 16;

export class CharacterPreview {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.character = null;
        this.container = null;
        this.animFrameId = null;
        this.time = 0;
        this.initialized = false;

        // Reduced motion
        this._reducedMotion = false;

        // Rotation state for drag interaction
        this.rotationY = Math.PI;
        this.targetRotationY = Math.PI;
        this.isDragging = false;
        this.lastPointerX = 0;

        // Temporary preview overrides for try-on
        this.previewOverrides = null;

        // Limbs reference
        this.limbs = null;

        // Gesture system state
        this.currentGesture = GESTURE_NONE;
        this.gestureTimer = 0;
        this.gestureDuration = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 2.5;

        // Track recent gestures to avoid repeats
        this._recentGestures = [];

        // Base positions for absolute animation (prevents drift)
        this._headBaseY = 0;
        this._headBaseX = 0;
        this._headBaseZ = 0;
        this._leftArmBaseX = 0;
        this._rightArmBaseX = 0;

        // Whether user triggered current gesture via click
        this._userTriggered = false;
    }

    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e27);

        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
        this.camera.position.set(0, 1.2, 4);
        this.camera.lookAt(0, 0.9, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setClearColor(0x0a0e27, 1);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.resize();

        // Lighting
        var keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(3, 4, 5);
        this.scene.add(keyLight);

        var fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
        fillLight.position.set(-3, 2, 4);
        this.scene.add(fillLight);

        var rimLight = new THREE.DirectionalLight(0x4488ff, 0.3);
        rimLight.position.set(0, 3, -3);
        this.scene.add(rimLight);

        var ambient = new THREE.AmbientLight(0x666688, 0.5);
        this.scene.add(ambient);

        // Ground disc
        var groundDisc = new THREE.Mesh(
            new THREE.CircleGeometry(1.2, 24),
            new THREE.MeshBasicMaterial({ color: 0x111428, transparent: true, opacity: 0.6 })
        );
        groundDisc.rotation.x = -Math.PI / 2;
        groundDisc.position.y = -0.2;
        this.scene.add(groundDisc);

        var groundRing = new THREE.Mesh(
            new THREE.RingGeometry(1.15, 1.25, 32),
            new THREE.MeshBasicMaterial({ color: 0x18ffff, transparent: true, opacity: 0.15 })
        );
        groundRing.rotation.x = -Math.PI / 2;
        groundRing.position.y = -0.19;
        this.scene.add(groundRing);

        this.rebuildCharacter();
        this.setupInteraction();

        this.initialized = true;
    }

    /**
     * Set reduced motion preference (architecture §31).
     * @param {boolean} enabled
     */
    setReducedMotion(enabled) {
        this._reducedMotion = !!enabled;
    }

    /**
     * Query whether the current avatar is a vehicle.
     * Used by UI to show vehicle compatibility messages (§24.3).
     * @returns {boolean}
     */
    isCurrentAvatarVehicle() {
        return !!(this.limbs && this.limbs.isVehicle);
    }

    resize() {
        if (!this.container || !this.renderer) return;
        var w = this.container.clientWidth;
        var h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    /**
     * Rebuild the character mesh.
     * Properly disposes old character GPU resources (architecture §31).
     * Preserves drag rotation across rebuilds (architecture §24.2).
     */
    rebuildCharacter() {
        // Dispose old character
        if (this.character && this.scene) {
            this.scene.remove(this.character);
            disposeCharacter(this.character);
            this.character = null;
        }

        // If we have preview overrides, temporarily swap storage values
        var originalEquipped = null;
        if (this.previewOverrides) {
            originalEquipped = JSON.parse(JSON.stringify(storage.get('equipped')));
            var eq = storage.get('equipped');
            for (var key in this.previewOverrides) {
                if (this.previewOverrides[key] !== null && this.previewOverrides[key] !== undefined) {
                    eq[key] = this.previewOverrides[key];
                }
            }
            storage.set('equipped', eq);
        }

        this.character = buildPlayer();

        // Restore original equipped if we swapped
        if (originalEquipped) {
            storage.set('equipped', originalEquipped);
        }

        this.limbs = getPlayerLimbs(this.character);

        // Store base limb positions for absolute animation
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

        // Reset gesture state on rebuild
        this.currentGesture = GESTURE_NONE;
        this.gestureTimer = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 1.5 + Math.random() * 2.0;
        this._recentGestures = [];

        // Preserve drag rotation across rebuilds
        this.character.rotation.y = this.rotationY;

        if (this.scene) {
            this.scene.add(this.character);
        }
    }

    setupInteraction() {
        var self = this;
        var canvas = this.renderer.domElement;
        var dragDistance = 0;
        var pointerStartX = 0;

        canvas.addEventListener('pointerdown', function (e) {
            self.isDragging = true;
            self.lastPointerX = e.clientX;
            pointerStartX = e.clientX;
            dragDistance = 0;
            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener('pointermove', function (e) {
            if (!self.isDragging) return;
            var deltaX = e.clientX - self.lastPointerX;
            self.targetRotationY += deltaX * 0.01;
            self.lastPointerX = e.clientX;
            dragDistance += Math.abs(e.clientX - pointerStartX);
        });

        canvas.addEventListener('pointerup', function (e) {
            self.isDragging = false;
            canvas.releasePointerCapture(e.pointerId);
            if (dragDistance < 10) {
                self.triggerRandomGesture();
            }
        });

        canvas.addEventListener('pointerleave', function () {
            self.isDragging = false;
        });

        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    /**
     * Trigger a random gesture immediately (on user click/tap).
     */
    triggerRandomGesture() {
        if (!this.limbs || this.limbs.isVehicle) return;
        if (this._reducedMotion) return;
        if (this.currentGesture !== GESTURE_NONE) return;

        var available = [];
        for (var g = 1; g < GESTURE_COUNT; g++) {
            if (this._recentGestures.indexOf(g) < 0) {
                available.push(g);
            }
        }
        if (available.length === 0) {
            this._recentGestures = [];
            for (var g2 = 1; g2 < GESTURE_COUNT; g2++) available.push(g2);
        }

        var chosen = available[Math.floor(Math.random() * available.length)];
        this._recentGestures.push(chosen);
        if (this._recentGestures.length > 5) this._recentGestures.shift();

        this.currentGesture = chosen;
        this.gestureTimer = 0;
        this.gestureProgress = 0;
        this._userTriggered = true;
        this._setGestureDuration(chosen);
    }

    _setGestureDuration(gesture) {
        switch (gesture) {
            case GESTURE_WAVE: this.gestureDuration = 2.2; break;
            case GESTURE_STETHOSCOPE: this.gestureDuration = 2.0; break;
            case GESTURE_JUMPING_JACKS: this.gestureDuration = 2.8; break;
            case GESTURE_FLEXING: this.gestureDuration = 2.2; break;
            case GESTURE_CHECK_WATCH: this.gestureDuration = 2.0; break;
            case GESTURE_THUMBS_UP: this.gestureDuration = 1.6; break;
            case GESTURE_SOMERSAULT: this.gestureDuration = 2.0; break;
            case GESTURE_CARTWHEEL: this.gestureDuration = 1.8; break;
            case GESTURE_SPIN_KICK: this.gestureDuration = 1.6; break;
            case GESTURE_CELEBRATORY_JUMP: this.gestureDuration = 1.8; break;
            case GESTURE_AIR_GUITAR: this.gestureDuration = 2.5; break;
            case GESTURE_SNEEZE: this.gestureDuration = 1.5; break;
            case GESTURE_DANCE_MOVE: this.gestureDuration = 2.8; break;
            case GESTURE_THINKING_POSE: this.gestureDuration = 2.2; break;
            case GESTURE_YAWN_STRETCH: this.gestureDuration = 2.5; break;
            default: this.gestureDuration = 1.8;
        }
    }

    previewItem(itemId, slot) {
        if (!this.previewOverrides) {
            this.previewOverrides = {};
        }
        this.previewOverrides[slot] = itemId;
        this.rebuildCharacter();
    }

    clearPreview() {
        this.previewOverrides = null;
        this.rebuildCharacter();
    }

    startAnimation() {
        if (this.animFrameId) return;
        var self = this;
        var lastTime = performance.now();

        function animate(now) {
            self.animFrameId = requestAnimationFrame(animate);

            var dt = (now - lastTime) / 1000;
            lastTime = now;
            if (dt > 0.1) dt = 0.016;

            self.time += dt;

            if (!self.character) return;

            // Smooth rotation toward target
            var rotDiff = self.targetRotationY - self.rotationY;
            self.rotationY += rotDiff * 0.1;

            self.updateIdleAnimation(dt);

            self.renderer.render(self.scene, self.camera);
        }

        animate(performance.now());
    }

    // Ease helpers
    _easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    /**
     * Idle animation with gesture system.
     *
     * ARCHITECTURE FIX (§24.2, §31): Gesture cooldown ordering —
     * when gestureProgress >= 1.0, we FIRST store the completed gesture
     * type in a local variable, THEN reset state. This ensures any
     * post-gesture logic (like avoiding repeat selection) uses the
     * correct completed gesture ID.
     */
    updateIdleAnimation(dt) {
        if (!this.character) return;

        var t = this.time;

        // Base idle layers
        var breathe = Math.sin(t * 1.2) * (this._reducedMotion ? 0.005 : 0.015);
        var sway = Math.sin(t * 0.7) * (this._reducedMotion ? 0.002 : 0.008);
        var lean = Math.sin(t * 0.9) * (this._reducedMotion ? 0.001 : 0.003);
        var rotOsc = Math.sin(t * 0.4) * (this._reducedMotion ? 0.005 : 0.015);

        // Skip gestures for vehicles
        if (!this.limbs || this.limbs.isVehicle) {
            this.character.position.y = breathe;
            this.character.position.x = sway;
            this.character.rotation.x = lean;
            this.character.rotation.y = this.rotationY + rotOsc;
            return;
        }

        // Skip gestures in reduced motion
        if (this._reducedMotion) {
            this.character.position.y = breathe;
            this.character.position.x = sway;
            this.character.rotation.x = lean;
            this.character.rotation.y = this.rotationY + rotOsc;
            return;
        }

        // Gesture output variables
        var gArmL = 0, gArmR = 0;
        var gHeadZ = 0, gHeadX = 0;
        var gLeanX = 0;
        var gLegL = 0, gLegR = 0;
        var gBodyRotX = 0, gBodyRotZ = 0;
        var gBodyPosY = 0;
        var gBodyRotYaw = 0;

        // Base sway (asymmetric)
        var baseArmL = Math.sin(t * 0.9) * 0.06;
        var baseArmR = Math.sin(t * 1.1 + 0.5) * 0.06;
        var baseLegL = Math.sin(t * 0.7) * 0.03;
        var baseLegR = Math.sin(t * 0.7 + Math.PI) * 0.03;

        if (this.currentGesture === GESTURE_NONE) {
            this.gestureDelayTimer -= dt;
            if (this.gestureDelayTimer <= 0) {
                var available = [];
                for (var g = 1; g < GESTURE_COUNT; g++) {
                    if (this._recentGestures.indexOf(g) < 0) available.push(g);
                }
                if (available.length === 0) {
                    this._recentGestures = [];
                    for (var g2 = 1; g2 < GESTURE_COUNT; g2++) available.push(g2);
                }
                var chosen = available[Math.floor(Math.random() * available.length)];
                this._recentGestures.push(chosen);
                if (this._recentGestures.length > 5) this._recentGestures.shift();

                this.currentGesture = chosen;
                this.gestureTimer = 0;
                this._userTriggered = false;
                this._setGestureDuration(chosen);
            }
        } else {
            this.gestureTimer += dt;
            this.gestureProgress = Math.min(this.gestureTimer / this.gestureDuration, 1.0);

            var bell = Math.sin(this.gestureProgress * Math.PI);
            var p = this.gestureProgress;

            switch (this.currentGesture) {

                case GESTURE_WAVE: {
                    var wavePhase = p * Math.PI * 8;
                    gArmR = -1.4 * bell + Math.sin(wavePhase) * 0.35 * bell;
                    gArmL = -0.2 * bell;
                    gHeadZ = -0.1 * bell;
                    gLeanX = -0.04 * bell;
                    gLegR = -0.08 * bell;
                    break;
                }

                case GESTURE_STETHOSCOPE: {
                    gArmR = -1.3 * bell;
                    gArmL = -0.4 * bell;
                    gHeadZ = 0.12 * bell;
                    gHeadX = 0.06 * bell;
                    gLeanX = 0.1 * bell;
                    if (p > 0.5) {
                        gHeadX += Math.sin((p - 0.5) * Math.PI * 4) * 0.05 * (1 - p);
                    }
                    break;
                }

                case GESTURE_JUMPING_JACKS: {
                    var jjPhase = p * Math.PI * 5;
                    var jjBell = Math.abs(Math.sin(jjPhase));
                    gArmL = -2.0 * jjBell;
                    gArmR = -2.0 * jjBell;
                    gLegL = -0.4 * jjBell;
                    gLegR = 0.4 * jjBell;
                    gBodyPosY = jjBell * 0.12;
                    gHeadX = -0.05 * jjBell;
                    break;
                }

                case GESTURE_FLEXING: {
                    if (p < 0.2) {
                        var crouchP = p / 0.2;
                        gLeanX = 0.04 * crouchP;
                        gBodyPosY = -0.03 * crouchP;
                    } else {
                        var flexP = (p - 0.2) / 0.8;
                        var flexBell = Math.sin(flexP * Math.PI);
                        gArmL = -1.9 * flexBell;
                        gArmR = -1.7 * Math.sin(Math.min(1, flexP * 1.15) * Math.PI);
                        gLeanX = -0.05 * flexBell;
                        gBodyPosY = 0.04 * flexBell;
                        if (flexP > 0.3 && flexP < 0.7) {
                            gBodyPosY += Math.sin(flexP * Math.PI * 6) * 0.02;
                        }
                        gHeadX = -0.06 * flexBell;
                    }
                    break;
                }

                case GESTURE_CHECK_WATCH: {
                    gArmL = -1.1 * bell;
                    gHeadX = 0.18 * bell;
                    gHeadZ = -0.12 * bell;
                    gLegR = Math.sin(p * Math.PI * 10) * 0.15 * bell;
                    gArmR = -0.3 * bell;
                    if (p > 0.6) {
                        gHeadZ += Math.sin((p - 0.6) * Math.PI * 6) * 0.08 * (1 - p);
                    }
                    break;
                }

                case GESTURE_THUMBS_UP: {
                    var thumbT = p < 0.15 ? 0 : Math.sin(((p - 0.15) / 0.85) * Math.PI);
                    gArmR = -1.5 * thumbT;
                    gHeadZ = -0.06 * thumbT;
                    gLeanX = -0.04 * thumbT;
                    if (p > 0.15 && p < 0.35) {
                        gBodyPosY = 0.03 * Math.sin(((p - 0.15) / 0.2) * Math.PI);
                    }
                    break;
                }

                case GESTURE_SOMERSAULT: {
                    if (p < 0.15) {
                        var cr = p / 0.15;
                        gLegL = 0.5 * cr;
                        gLegR = 0.5 * cr;
                        gArmL = -0.3 * cr;
                        gArmR = -0.3 * cr;
                        gBodyPosY = -0.15 * cr;
                        gLeanX = 0.1 * cr;
                    } else if (p < 0.3) {
                        var launchP = (p - 0.15) / 0.15;
                        gBodyPosY = -0.15 + 0.65 * launchP;
                        gArmL = -0.3 - 1.5 * launchP;
                        gArmR = -0.3 - 1.5 * launchP;
                        gBodyRotX = launchP * Math.PI * 0.3;
                    } else if (p < 0.8) {
                        var airP = (p - 0.3) / 0.5;
                        var height = Math.sin(airP * Math.PI);
                        gBodyPosY = 0.50 + height * 0.55;
                        gBodyRotX = Math.PI * 0.3 + airP * Math.PI * 1.7;
                        var tuck = Math.sin(airP * Math.PI);
                        gLegL = 1.5 * tuck;
                        gLegR = 1.5 * tuck;
                        gArmL = -1.8 + 1.0 * tuck;
                        gArmR = -1.8 + 1.0 * tuck;
                    } else {
                        var landP = (p - 0.8) / 0.2;
                        var easeOut = 1 - (1 - landP) * (1 - landP);
                        gBodyPosY = 0.50 * (1 - easeOut);
                        gBodyRotX = Math.PI * 2.0 * (1 - easeOut * easeOut);
                        gLegL = 0.3 * (1 - easeOut);
                        gLegR = 0.3 * (1 - easeOut);
                        gArmL = -0.8 * (1 - easeOut);
                        gArmR = -0.8 * (1 - easeOut);
                    }
                    break;
                }

                case GESTURE_CARTWHEEL: {
                    if (p < 0.2) {
                        var windP = p / 0.2;
                        gArmL = -2.0 * windP;
                        gArmR = -2.0 * windP;
                        gBodyRotZ = -0.2 * windP;
                        gBodyPosY = 0.05 * windP;
                    } else if (p < 0.8) {
                        var cartP = (p - 0.2) / 0.6;
                        var cartHeight = Math.sin(cartP * Math.PI);
                        gBodyPosY = 0.05 + cartHeight * 0.65;
                        gBodyRotZ = -0.2 + (-Math.PI * 2 + 0.2) * cartP;
                        gArmL = -2.0;
                        gArmR = -2.0;
                        var legSpread = Math.sin(cartP * Math.PI);
                        gLegL = -0.8 * legSpread;
                        gLegR = 0.8 * legSpread;
                    } else {
                        var cLandP = (p - 0.8) / 0.2;
                        var cEase = cLandP * cLandP * cLandP;
                        gBodyPosY = 0.05 * (1 - cLandP);
                        gBodyRotZ = -Math.PI * 2 * (1 - cEase);
                        gArmL = -2.0 * (1 - cLandP);
                        gArmR = -2.0 * (1 - cLandP);
                    }
                    break;
                }

                case GESTURE_SPIN_KICK: {
                    if (p < 0.15) {
                        var skW = p / 0.15;
                        gArmL = -0.5 * skW;
                        gArmR = 0.3 * skW;
                        gLeanX = 0.05 * skW;
                        gBodyPosY = 0.05 * skW;
                    } else if (p < 0.7) {
                        var spinP = (p - 0.15) / 0.55;
                        gBodyRotYaw = spinP * Math.PI * 2;
                        gBodyPosY = 0.05 + Math.sin(spinP * Math.PI) * 0.4;
                        gLegR = 1.5 * Math.sin(spinP * Math.PI);
                        gLegL = 0.3;
                        gArmL = -1.0 * Math.sin(spinP * Math.PI);
                        gArmR = -0.8 * Math.sin(spinP * Math.PI + Math.PI * 0.5);
                        gLeanX = 0.12 * Math.sin(spinP * Math.PI);
                    } else {
                        var skLandP = (p - 0.7) / 0.3;
                        var skEase = 1 - (1 - skLandP) * (1 - skLandP);
                        gBodyRotYaw = Math.PI * 2 * (1 - skEase);
                        gBodyPosY = 0.05 * (1 - skLandP);
                        gArmL = -0.3 * (1 - skLandP);
                        gArmR = -0.3 * (1 - skLandP);
                    }
                    break;
                }

                case GESTURE_CELEBRATORY_JUMP: {
                    if (p < 0.18) {
                        var cCr = p / 0.18;
                        gBodyPosY = -0.14 * cCr;
                        gLegL = 0.4 * cCr;
                        gLegR = 0.4 * cCr;
                        gArmL = 0.3 * cCr;
                        gArmR = 0.3 * cCr;
                    } else if (p < 0.45) {
                        var cJumpP = (p - 0.18) / 0.27;
                        gBodyPosY = -0.14 + 0.7 * cJumpP;
                        gArmL = 0.3 - 2.8 * cJumpP;
                        gArmR = 0.3 - 2.6 * cJumpP;
                        gLegL = 0.4 * (1 - cJumpP);
                        gLegR = 0.4 * (1 - cJumpP);
                    } else if (p < 0.68) {
                        var peakP = (p - 0.45) / 0.23;
                        gBodyPosY = 0.56;
                        gArmR = -2.3 + Math.sin(peakP * Math.PI * 5) * 0.45;
                        gArmL = -1.6 + Math.sin(peakP * Math.PI * 3.5) * 0.3;
                        gLegL = -0.35 * Math.sin(peakP * Math.PI);
                        gLegR = 0.35 * Math.sin(peakP * Math.PI);
                        gHeadX = -0.15;
                    } else {
                        var ceLandP = (p - 0.68) / 0.32;
                        var ceEase = 1 - (1 - ceLandP) * (1 - ceLandP);
                        gBodyPosY = 0.56 * (1 - ceEase);
                        gArmL = -1.6 * (1 - ceEase);
                        gArmR = -2.3 * (1 - ceEase);
                        gHeadX = -0.15 * (1 - ceEase);
                        if (ceLandP < 0.3) {
                            gBodyPosY -= 0.06 * Math.sin((ceLandP / 0.3) * Math.PI);
                        }
                    }
                    break;
                }

                case GESTURE_AIR_GUITAR: {
                    var rockPhase = p * Math.PI * 6;
                    gArmR = -0.6 * bell + Math.sin(rockPhase) * 0.8 * bell;
                    gArmL = -1.6 * bell;
                    gLeanX = Math.sin(rockPhase * 0.5) * 0.08 * bell;
                    gLegL = -0.2 * bell;
                    gLegR = 0.2 * bell;
                    gHeadX = Math.sin(rockPhase) * 0.12 * bell;
                    gHeadZ = Math.sin(rockPhase * 0.5) * 0.06 * bell;
                    gBodyPosY = Math.abs(Math.sin(rockPhase * 0.5)) * 0.04 * bell;
                    break;
                }

                case GESTURE_SNEEZE: {
                    if (p < 0.35) {
                        var sneezeAnticip = p / 0.35;
                        gHeadX = -0.25 * sneezeAnticip;
                        gArmL = -0.4 * sneezeAnticip;
                        gArmR = -0.4 * sneezeAnticip;
                        gLeanX = -0.06 * sneezeAnticip;
                    } else if (p < 0.5) {
                        var snapP = (p - 0.35) / 0.15;
                        gHeadX = -0.25 + 0.5 * snapP;
                        gArmL = -0.4 - 0.6 * snapP;
                        gArmR = -0.4 - 0.6 * snapP;
                        gLeanX = -0.06 + 0.2 * snapP;
                        gBodyPosY = -0.08 * snapP;
                        gLegL = 0.15 * snapP;
                        gLegR = 0.15 * snapP;
                    } else {
                        var recoverP = (p - 0.5) / 0.5;
                        var recEase = 1 - (1 - recoverP) * (1 - recoverP);
                        gHeadX = 0.25 * (1 - recEase);
                        gArmL = (-1.0 + 0.3 * Math.sin(recoverP * Math.PI * 2)) * (1 - recEase);
                        gArmR = (-1.0) * (1 - recEase);
                        gLeanX = 0.14 * (1 - recEase);
                        gBodyPosY = -0.08 * (1 - recEase);
                    }
                    break;
                }

                case GESTURE_DANCE_MOVE: {
                    var dancePhase = p * Math.PI * 5;
                    var danceBell = bell;
                    gArmL = (-0.5 + Math.sin(dancePhase) * 0.9) * danceBell;
                    gArmR = (-0.5 + Math.sin(dancePhase + Math.PI) * 0.9) * danceBell;
                    gLegL = Math.sin(dancePhase * 0.5) * 0.25 * danceBell;
                    gLegR = Math.sin(dancePhase * 0.5 + Math.PI) * 0.25 * danceBell;
                    gHeadX = Math.sin(dancePhase) * 0.08 * danceBell;
                    gHeadZ = Math.sin(dancePhase * 0.5) * 0.1 * danceBell;
                    gLeanX = Math.sin(dancePhase * 0.5) * 0.06 * danceBell;
                    gBodyPosY = Math.abs(Math.sin(dancePhase)) * 0.06 * danceBell;
                    if (p > 0.85) {
                        gBodyRotYaw = ((p - 0.85) / 0.15) * Math.PI * 2 * (1 - ((p - 0.85) / 0.15));
                    }
                    break;
                }

                case GESTURE_THINKING_POSE: {
                    if (p < 0.65) {
                        var thinkP = Math.sin((p / 0.65) * Math.PI);
                        gArmR = -1.1 * thinkP;
                        gArmL = -0.4 * thinkP;
                        gHeadZ = 0.08 * thinkP;
                        gHeadX = 0.06 * thinkP;
                        gLegL = -0.12 * thinkP;
                        gLeanX = 0.03 * thinkP;
                        gHeadZ += Math.sin(p * Math.PI * 3) * 0.05 * thinkP;
                    } else {
                        var eurekaP = (p - 0.65) / 0.35;
                        var eurekaBell = Math.sin(eurekaP * Math.PI);
                        gArmR = -1.6 * eurekaBell;
                        gArmL = -0.2 * eurekaBell;
                        gHeadX = -0.1 * eurekaBell;
                        gBodyPosY = 0.05 * eurekaBell;
                        gLeanX = -0.04 * eurekaBell;
                    }
                    break;
                }

                case GESTURE_YAWN_STRETCH: {
                    if (p < 0.6) {
                        var stretchP = this._easeInOutCubic(p / 0.6);
                        gArmL = -2.0 * stretchP;
                        gArmR = -1.7 * stretchP;
                        gLeanX = -0.08 * stretchP;
                        gHeadX = -0.12 * stretchP;
                        gBodyPosY = 0.04 * stretchP;
                        gLegL = -0.08 * stretchP;
                        gLegR = -0.05 * stretchP;
                    } else {
                        var dropP = (p - 0.6) / 0.4;
                        var dropEase = 1 - (1 - dropP) * (1 - dropP);
                        gArmL = -2.0 * (1 - dropEase);
                        gArmR = -1.7 * (1 - dropEase);
                        gLeanX = -0.08 * (1 - dropEase);
                        gHeadX = -0.12 * (1 - dropEase);
                        gBodyPosY = 0.04 * (1 - dropEase);
                        if (dropP > 0.5) {
                            gHeadZ = Math.sin((dropP - 0.5) * Math.PI * 6) * 0.08 * (1 - dropP);
                        }
                    }
                    break;
                }
            }

            // ===== GESTURE COOLDOWN FIX (architecture §24.2, §31) =====
            // Evaluate the completed gesture BEFORE resetting state
            if (this.gestureProgress >= 1.0) {
                // Store completed gesture for post-gesture logic
                var completedGesture = this.currentGesture;

                // Now reset state
                this.currentGesture = GESTURE_NONE;
                this.gestureTimer = 0;
                this.gestureProgress = 0;
                this._userTriggered = false;

                // Post-gesture delay depends on the completed gesture type
                var isAcrobatic = (completedGesture >= GESTURE_SOMERSAULT && completedGesture <= GESTURE_CELEBRATORY_JUMP);
                this.gestureDelayTimer = isAcrobatic ? (3.0 + Math.random() * 4.0) : (2.0 + Math.random() * 3.5);
            }
        }

        // Apply character position
        this.character.position.y = breathe + gBodyPosY;
        this.character.position.x = sway;

        // Apply to limbs (all absolute, never cumulative)
        if (this.limbs.leftArm) this.limbs.leftArm.rotation.x = baseArmL + gArmL;
        if (this.limbs.rightArm) this.limbs.rightArm.rotation.x = baseArmR + gArmR;
        if (this.limbs.leftLeg) this.limbs.leftLeg.rotation.x = baseLegL + gLegL;
        if (this.limbs.rightLeg) this.limbs.rightLeg.rotation.x = baseLegR + gLegR;

        // Head — absolute positioning (prevents detach bug)
        if (this.limbs.head) {
            this.limbs.head.position.y = this._headBaseY + Math.sin(t * 1.0) * 0.01;
            this.limbs.head.position.x = this._headBaseX;
            this.limbs.head.position.z = this._headBaseZ;
            this.limbs.head.rotation.z = gHeadZ;
            this.limbs.head.rotation.x = gHeadX;
        }

        // Cape animation
        if (this.limbs.cape) {
            this.limbs.cape.rotation.x = 0.15 + Math.sin(t * 1.2) * 0.05;
        }

        // Mouth animation
        if (this.limbs.mouth) {
            var smileScale = 1.0 + Math.sin(t * 0.5) * 0.05;
            this.limbs.mouth.scale.set(smileScale, smileScale, 1);
        }

        // Coat tail
        if (this.limbs.coatTail) {
            this.limbs.coatTail.rotation.x = 0.1 + Math.sin(t * 0.9) * 0.03;
        }

        // Apply body rotations
        this.character.rotation.x = lean + gLeanX + gBodyRotX;
        this.character.rotation.z = gBodyRotZ;

        if (gBodyRotYaw !== 0) {
            this.character.rotation.y = this.rotationY + rotOsc + gBodyRotYaw;
        } else {
            this.character.rotation.y = this.rotationY + rotOsc;
        }
    }

    stopAnimation() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    /**
     * Full cleanup — dispose all resources (architecture §31).
     */
    dispose() {
        this.stopAnimation();
        if (this.character && this.scene) {
            this.scene.remove(this.character);
            disposeCharacter(this.character);
            this.character = null;
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }
        this.limbs = null;
        this.scene = null;
        this.camera = null;
        this.initialized = false;
    }
}
