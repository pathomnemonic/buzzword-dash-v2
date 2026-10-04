/**
 * safecompile.js — warm up the shaders for what is on screen without blocking, safely.
 *
 * Does what WebGLRenderer.compileAsync does (compile now, then wait until the graphics driver says every program is
 * ready), but it survives the scene being thrown away while it waits. three's own version reads
 * `properties.get(material).currentProgram.isReady()` on a timer, and when a material has been disposed in the
 * meantime (a quick exit, a quick restart, a very slow phone) that read throws from the timer, where nothing can catch it,
 * and the player's crash report shows "Cannot read properties of undefined (reading 'isReady')".
 */

var POLL_MS = 10;
var MAX_POLLS = 500; // give up after about five seconds: this is only an optimisation

/**
 * @param {{compile: function, properties: {get: function}}} renderer a THREE.WebGLRenderer (anything shaped like one)
 * @param {object} scene
 * @param {object} camera
 * @returns {Promise<void>} always resolves, never rejects
 */
export function compileSafely(renderer, scene, camera) {
  return new Promise(function (resolve) {
    var pending;
    try {
      pending = renderer.compile(scene, camera);
    } catch (e) {
      resolve();
      return;
    }
    if (!pending || typeof pending.forEach !== 'function' || !renderer.properties) {
      resolve();
      return;
    }
    var polls = 0;
    function check() {
      try {
        pending.forEach(function (material) {
          var props = renderer.properties.get(material);
          var program = props && props.currentProgram;
          // a material that was disposed has no program any more: nothing left to wait for
          if (!program || typeof program.isReady !== 'function' || program.isReady()) pending.delete(material);
        });
      } catch (e) {
        resolve();
        return;
      }
      if (pending.size === 0 || ++polls > MAX_POLLS) {
        resolve();
        return;
      }
      setTimeout(check, POLL_MS);
    }
    check();
  });
}
