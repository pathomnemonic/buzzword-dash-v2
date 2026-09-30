// tools/optimize-models.mjs
// Shrinks the animated character and monster models: drops animation clips the
// game never plays and applies mesh compression (EXT_meshopt_compression).
//
//   node tools/optimize-models.mjs            (rewrites public/models/characters and monsters)
//
// Safe to run again: already-optimized files are read, re-pruned and rewritten.
// Static scenery (obstacles, props) is tiny and is merged at runtime, so it is
// left untouched.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { resolveClipName } from '../js/game/clipnames.js';

const STATES = ['run', 'jump', 'slide', 'celebrate', 'death', 'idle', 'wave', 'attack'];

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

let before = 0;
let after = 0;
for (const dir of ['characters', 'monsters']) {
  const folder = join('public', 'models', dir);
  for (const file of readdirSync(folder).filter((f) => f.endsWith('.glb'))) {
    const path = join(folder, file);
    const size = statSync(path).size;
    const doc = await io.read(path);
    const root = doc.getRoot();

    const names = root.listAnimations().map((a) => a.getName());
    const keep = new Set();
    for (const state of STATES) {
      const found = resolveClipName(names, state);
      if (found) keep.add(found.clip);
    }
    let dropped = 0;
    for (const anim of root.listAnimations()) {
      if (!keep.has(anim.getName())) { anim.dispose(); dropped++; }
    }

    await doc.transform(dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(path, doc);

    const now = statSync(path).size;
    before += size;
    after += now;
    console.log(`${dir}/${file}: ${Math.round(size / 1024)} KB -> ${Math.round(now / 1024)} KB (${keep.size} clips kept, ${dropped} dropped)`);
  }
}
console.log(`Total: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
