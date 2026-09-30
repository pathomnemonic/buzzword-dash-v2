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
 * @param {{deviceMemory?: number, cores?: number, saveData?: boolean, perfHint?: string, software?: boolean}} [env]
 * @returns {'high'|'low'}
 */
export function resolveQuality(setting, env) {
  if (setting === 'low' || setting === 'high') return setting;
  env = env || {};
  if (env.perfHint === 'low') return 'low';
  if (env.software) return 'low'; // no graphics card: the heavy tier would crawl
  if (env.deviceMemory && env.deviceMemory <= 2) return 'low';
  if (env.cores && env.cores <= 2) return 'low';
  if (env.saveData) return 'low';
  return 'high';
}

var _software = null;

/**
 * True when the browser draws WebGL on the CPU (SwiftShader, llvmpipe and the
 * like), which is far too slow for the high tier. Checked once.
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

/** The tier in effect right now. */
export function getQuality() {
  var nav = typeof navigator !== 'undefined' ? navigator : {};
  return resolveQuality(storage.get('quality'), {
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    saveData: !!(nav.connection && nav.connection.saveData),
    software: storage.get('quality') === 'auto' || !storage.get('quality') ? isSoftwareRenderer() : false,
    perfHint: storage.get('perfHint')
  });
}

export function isLowQuality() {
  return getQuality() === 'low';
}
