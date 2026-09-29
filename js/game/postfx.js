/**
 * postfx.js — optional bloom post-processing for the runner scene.
 *
 * Makes neon gates, coins and power-ups glow. It is skipped entirely when the
 * player turns "Glow effects" off, and it switches itself off for the session
 * if the frame rate drops (dynamic quality) so weaker devices keep playing
 * smoothly.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

var SLOW_FRAME_MS = 30;     // average frame time considered "too slow"
var SAMPLE_FRAMES = 120;    // frames averaged before deciding

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {{render: function, setSize: function, degraded: boolean, dispose: function}}
 */
export function createPostFX(renderer, scene, camera) {
  var size = renderer.getSize(new THREE.Vector2());
  var pixelRatio = renderer.getPixelRatio();

  // Multisampled target keeps edges smooth (the composer bypasses canvas MSAA).
  var target = new THREE.WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
    type: THREE.HalfFloatType,
    samples: 4
  });

  var composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.addPass(new RenderPass(scene, camera));
  var bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  var frames = 0;
  var elapsed = 0;
  var last = 0;

  var api = {
    degraded: false,

    render: function () {
      if (api.degraded) {
        renderer.render(scene, camera);
        return;
      }
      var now = performance.now();
      if (last) {
        var dt = now - last;
        // Ignore stalls from tab switches; only count real frames.
        if (dt < 250) {
          elapsed += dt;
          frames++;
          if (frames >= SAMPLE_FRAMES) {
            if (elapsed / frames > SLOW_FRAME_MS) api.degraded = true;
            frames = 0;
            elapsed = 0;
          }
        }
      }
      last = now;
      composer.render();
    },

    setSize: function (width, height, ratio) {
      composer.setPixelRatio(ratio || renderer.getPixelRatio());
      composer.setSize(width, height);
    },

    dispose: function () {
      composer.dispose();
      target.dispose();
    }
  };

  return api;
}
