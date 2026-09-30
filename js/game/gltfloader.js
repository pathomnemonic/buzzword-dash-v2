/**
 * gltfloader.js — one place to create model loaders.
 *
 * The animated characters and monsters are stored mesh-compressed
 * (EXT_meshopt_compression, see tools/optimize-models.mjs), so every loader
 * needs the decoder.
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function createGLTFLoader() {
  var loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}
