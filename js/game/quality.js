/**
 * quality.js — which graphics tier to use, and how to keep frame rate steady.
 *
 * Three tiers:
 *   high   — everything: 3D characters and monsters, 3D scenery and obstacles,
 *            glow (bloom), shadows and full resolution.
 *   medium — the animated 3D character and monster, sky, reflections and lit
 *            materials, but simple built-in obstacles and scenery, no glow or
 *            shadows, and a capped resolution. Good for laptops and phones.
 *   low    — the simple built-in characters and obstacles, no model downloads,
 *            no glow or shadows, and normal resolution. The fast backup.
 *
 * The player can choose (Settings -> Graphics). "Auto" picks a tier from the
 * device: software rendering or very little memory/cores or data-saver ->
 * low; a modest device (4 GB or fewer, 4 cores or fewer, or a touch-first
 * phone/tablet) -> medium; otherwise high. It steps down a tier after
 * repeated sessions where the frame rate could not keep up.
 *
 * Adaptive resolution lowers the render resolution in small steps while the
 * game is running slowly and raises it again when there is headroom, which is
 * the cheapest way to hold a steady frame rate on any device (and on phones,
 * to save battery).
 */

import { storage } from '../storage.js';

var ORDER = ['low', 'medium', 'high'];

/**
 * @param {string} setting - 'auto' | 'high' | 'medium' | 'low'
 * @param {{deviceMemory?: number, cores?: number, saveData?: boolean, perfHint?: string, software?: boolean, touchFirst?: boolean}} [env]
 * @returns {'high'|'medium'|'low'}
 */
export function resolveQuality(setting, env) {
  if (ORDER.indexOf(setting) >= 0) return setting;
  env = env || {};
  var tier = 'high';
  if (env.software) return 'low'; // no graphics card: nothing heavier would run
  if ((env.deviceMemory && env.deviceMemory <= 2) || (env.cores && env.cores <= 2) || env.saveData) {
    tier = 'low';
  } else if ((env.deviceMemory && env.deviceMemory <= 4) || (env.cores && env.cores <= 4) || env.touchFirst) {
    tier = 'medium';
  }
  // A performance hint can only lower the tier, never raise it
  if (ORDER.indexOf(env.perfHint) >= 0 && ORDER.indexOf(env.perfHint) < ORDER.indexOf(tier)) tier = env.perfHint;
  return tier;
}

/** The next tier down, or the same one if already lowest. */
export function lowerTier(tier) {
  var i = ORDER.indexOf(tier);
  return ORDER[Math.max(0, i - 1)];
}

var _software = null;

/**
 * True when the browser draws WebGL on the CPU (SwiftShader, llvmpipe and the
 * like), which is far too slow for the higher tiers. Checked once.
 */
export function isSoftwareRenderer() {
  if (_software !== null) return _software;
  _software = false;
  try {
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      _software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) {
    _software = false;
  }
  return _software;
}

function touchFirst() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch (e) {
    return false;
  }
}

/** The tier in effect right now. */
export function getQuality() {
  var nav = typeof navigator !== 'undefined' ? navigator : {};
  var setting = storage.get('quality') || 'auto';
  return resolveQuality(setting, {
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    saveData: !!(nav.connection && nav.connection.saveData),
    software: setting === 'auto' ? isSoftwareRenderer() : false,
    touchFirst: touchFirst(),
    perfHint: storage.get('perfHint')
  });
}

export function isLowQuality() { return getQuality() === 'low'; }

/** Animated 3D character and monster models (medium and up). */
export function useCharacterModels() { return getQuality() !== 'low'; }

/** 3D obstacle and scenery models, bloom and shadows (high only). */
export function useSceneryModels() { return getQuality() === 'high'; }

/** Highest render-resolution multiplier for the tier. */
export function maxPixelRatio(tier, devicePixelRatio) {
  var dpr = devicePixelRatio || 1;
  if (tier === 'high') return Math.min(dpr, 2);
  if (tier === 'medium') return Math.min(dpr, 1.5);
  return 1;
}

// ===== ADAPTIVE RESOLUTION =====

var LEVELS = [1, 0.85, 0.7, 0.6]; // fractions of the tier's maximum resolution
var SLOW_MS = 24;                 // slower than ~41 fps: step down
var FAST_MS = 13;                 // faster than ~77 fps: step back up
var SAMPLE = 90;                  // frames per decision
var COOLDOWN_MS = 4000;           // minimum time between changes (resizes are not free)

export function createAdaptiveResolution() {
  return { level: 0, frames: 0, total: 0, lastChange: 0 };
}

/**
 * Feed one frame time; returns the new resolution scale when it should change,
 * otherwise null. Ignores stalls (tab switches) so they do not cause a drop.
 * @param {object} state from createAdaptiveResolution
 * @param {number} frameMs
 * @param {number} nowMs
 * @returns {number|null} scale (1 = full) to apply, or null for no change
 */
export function stepAdaptiveResolution(state, frameMs, nowMs) {
  if (frameMs > 250) return null;
  state.frames++;
  state.total += frameMs;
  if (state.frames < SAMPLE) return null;
  var avg = state.total / state.frames;
  state.frames = 0;
  state.total = 0;
  if (nowMs - state.lastChange < COOLDOWN_MS) return null;
  if (avg > SLOW_MS && state.level < LEVELS.length - 1) {
    state.level++;
    state.lastChange = nowMs;
    return LEVELS[state.level];
  }
  if (avg < FAST_MS && state.level > 0) {
    state.level--;
    state.lastChange = nowMs;
    return LEVELS[state.level];
  }
  return null;
}
