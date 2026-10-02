/* global window */
// Renders each hero's face and full body (default colors, idle pose, transparent background) to small WebP images.
// Driven by tools/make-portraits.mjs; not part of the app.
import * as THREE from 'three';
import { CHARACTER_MODELS, modelUrl } from '../js/game/modelcatalog.js';
import { loadCharacterModel, buildModelCharacter, updateModelAnimation } from '../js/game/charactermodel.js';
import { setupEnvironment } from '../js/game/materials.js';

const FACE = { w: 128, h: 128 };
const BODY = { w: 104, h: 160 };
// How much of the figure's height the face picture shows: realistic heroes have small heads, the chibi ones big.
const REALISTIC = ['avatar_intern', 'avatar_m_nurse', 'avatar_m_paramedic', 'avatar_m_adventurer', 'avatar_m_king'];
const HEAD_FRACTION = (id) => (REALISTIC.includes(id) ? 0.28 : id === 'avatar_m_rogue' ? 0.32 : 0.52);

window.renderPortraits = async function () {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  setupEnvironment(renderer, scene);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9999ff, 0.9); fill.position.set(-3, 2, 4); scene.add(fill);
  scene.add(new THREE.AmbientLight(0x8888aa, 1.3));

  const out = {};
  for (const m of CHARACTER_MODELS) {
    const url = modelUrl(m.file);
    await loadCharacterModel(url);
    const pg = buildModelCharacter(url, m.scale, undefined, []);
    pg.rotation.y = 0; // the runner already faces away from the game camera; here it faces the +Z camera
    pg.children[0].rotation.y = 0;
    updateModelAnimation(pg, 0.4, 'idle');
    scene.add(pg);
    pg.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pg, true);
    const size = box.getSize(new THREE.Vector3());
    const cx = (box.min.x + box.max.x) / 2;
    const shot = (frame, left, right, bottom, top) => {
      renderer.setSize(frame.w, frame.h, false);
      renderer.setPixelRatio(1);
      const cam = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 50);
      cam.position.set(0, 0, 10);
      cam.lookAt(0, 0, 0);
      renderer.render(scene, cam);
      return renderer.domElement.toDataURL('image/webp', 0.9);
    };
    const headH = size.y * HEAD_FRACTION(m.id);
    const headTop = box.max.y + size.y * 0.01;
    const face = shot(FACE, cx - headH / 2, cx + headH / 2, headTop - headH, headTop);
    const bodyH = size.y * 1.06;
    const bodyW = bodyH * (BODY.w / BODY.h);
    const bodyBottom = box.min.y - size.y * 0.04;
    const body = shot(BODY, cx - bodyW / 2, cx + bodyW / 2, bodyBottom, bodyBottom + bodyH);
    out[m.id] = { face, body, height: size.y };
    scene.remove(pg);
  }
  return out;
};
window.portraitsReady = true;
