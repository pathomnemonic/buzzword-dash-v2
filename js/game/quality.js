/**
 * quality.js — which graphics tier to use.
 *
 * "high" uses the animated 3D models, reflections, sky and rounded geometry.
 * "low" is the fast backup for weaker computers: the simple built-in
 * characters, monsters and obstacles, no downloads of model files, no
 * reflections or glow, and a lower render resolution.
 *
 * The player can choose (Settings -> Graphics). "Auto" picks low on devices
 * that report little memory, few cores or data-saver mode, and after a session
 * where the frame rate could not keep up.
 */

import { storage } from '../storage.js';

/**
 * @param {string} setting - 'auto' | 'high' | 'low'
 * @param {{deviceMemory?: number, cores?: number, saveData?: boolean, perfHint?: string}} [env]
 * @returns {'high'|'low'}
 */
export function resolveQuality(setting, env) {
  if (setting === 'low' || setting === 'high') return setting;
  env = env || {};
  if (env.perfHint === 'low') return 'low';
  if (env.deviceMemory && env.deviceMemory <= 2) return 'low';
  if (env.cores && env.cores <= 2) return 'low';
  if (env.saveData) return 'low';
  return 'high';
}

/** The tier in effect right now. */
export function getQuality() {
  var nav = typeof navigator !== 'undefined' ? navigator : {};
  return resolveQuality(storage.get('quality'), {
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    saveData: !!(nav.connection && nav.connection.saveData),
    perfHint: storage.get('perfHint')
  });
}

export function isLowQuality() {
  return getQuality() === 'low';
}
