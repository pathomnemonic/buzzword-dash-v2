// tools/import-character.mjs
// Prepares a third-party character model for the game: removes accessory meshes (weapons and the like),
// then drops clips the game never plays and compresses the meshes.
//
//   node tools/import-character.mjs <source.glb> <public/models/characters/name.glb> [NodeToRemove ...]
//
// Used for the Scout (KayKit "Adventurers" Rogue, CC0 by Kay Lousberg), whose file carries a knife,
// crossbows and a throwable as extra nodes.

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt, resample, sparse } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { resolveClipName } from '../js/game/clipnames.js';

const [src, dest, ...remove] = process.argv.slice(2);
if (!src || !dest) { console.error('usage: node tools/import-character.mjs <source.glb> <dest.glb> [NodeToRemove ...]'); process.exit(1); }

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();

let removed = 0;
for (const node of root.listNodes()) {
  if (remove.includes(node.getName())) { node.dispose(); removed++; }
}

const names = root.listAnimations().map((a) => a.getName());
const keep = new Set();
for (const state of ['run', 'jump', 'slide', 'celebrate', 'death', 'idle', 'wave']) {
  const found = resolveClipName(names, state);
  if (found) keep.add(found.clip);
}
let dropped = 0;
for (const anim of root.listAnimations()) {
  if (!keep.has(anim.getName())) { anim.dispose(); dropped++; }
}
// resample drops keyframes that do not change the motion; this pack bakes a key on every frame
await doc.transform(resample(), dedup(), prune(), sparse(), quantize(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
// Accessors that nothing uses any more (the dropped clips' keyframes) would still be written out
let orphans = 0;
for (const accessor of root.listAccessors()) {
  if (accessor.listParents().every((p) => p.propertyType === 'Root' || p.propertyType === 'Buffer')) { accessor.dispose(); orphans++; }
}
console.log('unused accessors dropped:', orphans);
await io.write(dest, doc);
console.log(`${dest}: removed ${removed} nodes, kept clips [${[...keep].join(', ')}], dropped ${dropped}`);
