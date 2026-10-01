/**
 * enginedefs.js — enums, constants and small helpers shared by engine.js and the files split out of it.
 */

import * as THREE from 'three';

// ─── Canonical Enums (Section 4, Architecture) ───

export var GAME_STATES = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DYING: 'dying',
  CONTINUE_PROMPT: 'continue_prompt',
  FINISHING: 'finishing',
  ENDED: 'ended',
  DISPOSED: 'disposed'
});

export var GAME_MODES = Object.freeze({
  ENDLESS: 'endless',
  STUDY: 'study',
  WEAKNESS: 'weakness',
  DAILY: 'daily',
  CHALLENGE: 'challenge',
  TOURNAMENT: 'tournament',
  VERSUS: 'versus',
  MP_HIGH_SCORE: 'mp_highscore',
  MP_SUDDEN_DEATH: 'mp_suddendeath',
  MP_RACE: 'mp_race',
  TIMED_PRACTICE: 'timed_practice'
});

export var RUN_END_REASONS = Object.freeze({
  OUT_OF_LIVES: 'out_of_lives',
  MANUAL_END: 'manual_end',
  NO_MATCHING_CARDS: 'no_matching_cards',
  DAILY_COMPLETE: 'daily_complete',
  CHALLENGE_COMPLETE: 'challenge_complete',
  TIMER_EXPIRED: 'timer_expired',
  SUDDEN_DEATH_ELIMINATION: 'sudden_death_elimination',
  RACE_FINISHED: 'race_finished',
  OPPONENT_FORFEIT: 'opponent_forfeit',
  LOCAL_FORFEIT: 'local_forfeit',
  DISCONNECTED: 'disconnected',
  FATAL_ERROR: 'fatal_error'
});

// ─── Constants ───

export var LANE_X = [-3, 0, 3];
export var ANSWER_LOCK_Z = -3;
/** Where the exam monster starts, as a distance to catch (3 = caught). Far enough to be out of sight. */
export var MONSTER_START_DIST = 26;
export var OBSTACLE_GATE_GAP = 14; // units an obstacle trails behind the gate it spawns with

// ─── Utility helpers ───

export function generateId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/** Models copied from a cache share their geometry and materials: never free those with one copy. */
export function isSharedMaterial(m) {
  var x = Array.isArray(m) ? m[0] : m;
  return !!(x && x.userData && x.userData.shared);
}

export function disposeObject(obj) {
  if (!obj) return;
  if (obj.children) {
    for (var i = obj.children.length - 1; i >= 0; i--) disposeObject(obj.children[i]);
  }
  if (obj.geometry && !(obj.geometry.userData && obj.geometry.userData.shared)) obj.geometry.dispose();
  if (obj.material && !isSharedMaterial(obj.material)) {
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

export function removeAndDispose(parent, obj) {
  if (parent && obj) {
    parent.remove(obj);
    disposeObject(obj);
  }
}

// ─── State machine transition table ───

export var ALLOWED_TRANSITIONS = {
  idle: ['preparing', 'disposed'],
  preparing: ['countdown', 'ended', 'idle', 'disposed'],
  countdown: ['playing', 'ended', 'idle', 'disposed'],
  playing: ['paused', 'dying', 'finishing', 'ended', 'disposed'],
  paused: ['playing', 'finishing', 'ended', 'disposed'],
  dying: ['continue_prompt', 'finishing', 'ended', 'disposed'],
  continue_prompt: ['playing', 'finishing', 'ended', 'disposed'],
  finishing: ['ended', 'disposed'],
  ended: ['preparing', 'idle', 'disposed'],
  disposed: []
};

// ─── Heart mesh builder ───

export function buildHeartMesh() {
  var group = new THREE.Group();
  var heartMat = new THREE.MeshStandardMaterial({ color: 0xff2255, emissive: 0xaa0022, emissiveIntensity: 0.55, roughness: 0.22, metalness: 0.1, envMapIntensity: 1.4 });
  var glowMat = new THREE.MeshBasicMaterial({ color: 0xff4477, transparent: true, opacity: 0.4 });
  var leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), heartMat);
  leftLobe.position.set(-0.12, 0.1, 0);
  group.add(leftLobe);
  var rightLobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), heartMat);
  rightLobe.position.set(0.12, 0.1, 0);
  group.add(rightLobe);
  var bottom = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 20), heartMat);
  bottom.position.set(0, -0.12, 0);
  bottom.rotation.z = Math.PI;
  group.add(bottom);
  var glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), glowMat);
  glow.position.set(0, 0, 0);
  group.add(glow);
  return group;
}

