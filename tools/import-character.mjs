// tools/import-character.mjs
// Prepares a third-party character model for the game: removes accessory meshes (weapons and the like),
// then drops clips the game never plays and compresses the meshes.
//
//   node tools/import-character.mjs <source.glb> <public/models/characters/name.glb> [NodeToRemove ...]
//
// Used for the Scout (KayKit "Adventurers" Rogue, CC0 by Kay Lousberg), whose file carries a knife,
// crossbows and a throwable as extra nodes.

import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt, resample, sparse } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { resolveClipName } from '../js/game/clipnames.js';

const argv = process.argv.slice(2);
const split = argv.includes('--split'); // give each body piece (hat, cape, arms, body, head, legs) its own material, so each can be recolored
const [src, dest, ...remove] = argv.filter((a) => a !== '--split');
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

if (split) {
  // KayKit characters are separate meshes sharing one swatch texture. A material per piece lets the game tint each piece.
  const GROUP = { Hat: 'Headwear', Helmet: 'Headwear', Cape: 'Cape', ArmLeft: 'Arms', ArmRight: 'Arms', Body: 'Body', Head: 'Head', LegLeft: 'Legs', LegRight: 'Legs' };
  const made = {};
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const piece = (node.getName().match(/_(Hat|Helmet|Cape|ArmLeft|ArmRight|Body|Head(?:_Hooded)?|LegLeft|LegRight)$/) || [])[1] || '';
    const key = piece.indexOf('Head') === 0 ? 'Head' : piece;
    if (!mesh || !GROUP[key]) continue;
    for (const prim of mesh.listPrimitives()) {
      const base = prim.getMaterial();
      const name = GROUP[key];
      if (!made[name]) { made[name] = base.clone().setName(name); }
      prim.setMaterial(made[name]);
      if (key === 'Head') {
        // the head is one mesh holding the face AND the hair or hood: the skin-colored triangles (and the small dark
        // ones inside the face: eyes and brows) become the "Face" piece, the rest stays "Head"
        const parts = await splitFace(prim, base);
        if (parts) {
          if (!made.Face) { made.Face = base.clone().setName('Face'); made.Eyes = base.clone().setName('Eyes'); }
          parts.eyes.setMaterial(made.Eyes);
          mesh.addPrimitive(parts.eyes);
          if (parts.face) { parts.face.setMaterial(made.Face); mesh.addPrimitive(parts.face); } else prim.setMaterial(made.Face);
        }
      }
    }
  }
}

/** Move the face's triangles of a head primitive into a new primitive (same vertices, own index list). */
async function splitFace(prim, base) {
  const tex = base.getBaseColorTexture();
  const idx = prim.getIndices();
  if (!tex || !idx) return null;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const uv = prim.getAttribute('TEXCOORD_0'), pos = prim.getAttribute('POSITION');
  const count = idx.getCount() / 3;
  const tris = [], t = [0, 0], p = [0, 0, 0];
  const key = (i) => { pos.getElement(i, p); return p.map((v) => Math.round(v * 1000)).join(','); };
  for (let f = 0; f < count; f++) {
    const ids = [0, 1, 2].map((k) => idx.getScalar(f * 3 + k));
    let su = 0, sv = 0;
    ids.forEach((i) => { uv.getElement(i, t); su += t[0] / 3; sv += t[1] / 3; });
    const x = Math.min(info.width - 1, Math.floor(su * info.width)), y = Math.min(info.height - 1, Math.floor(sv * info.height));
    const o = (y * info.width + x) * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    tris.push({ ids, skin: r > 190 && g > 140 && b > 90 && r > g && g >= b, keys: ids.map(key) });
  }
  // connected pieces of the non-skin triangles (triangles that share a point): small ones are eyes and brows, big ones hair or hood
  const owner = new Map();
  const comp = [];
  tris.forEach((tr, i) => { if (tr.skin) return; tr.keys.forEach((k) => { if (!owner.has(k)) owner.set(k, []); owner.get(k).push(i); }); comp[i] = -1; });
  const sizes = [];
  tris.forEach((tr, i) => {
    if (tr.skin || comp[i] !== -1) return;
    const id = sizes.length; let n = 0; const stack = [i]; comp[i] = id;
    while (stack.length) { const c = stack.pop(); n++; tris[c].keys.forEach((k) => owner.get(k).forEach((j) => { if (comp[j] === -1) { comp[j] = id; stack.push(j); } })); }
    sizes.push(n);
  });
    const faceIdx = [], eyeIdx = [], restIdx = [];
  tris.forEach((tr, i) => { (tr.skin ? faceIdx : sizes[comp[i]] <= 100 ? eyeIdx : restIdx).push(...tr.ids); });
  if (!faceIdx.length || !eyeIdx.length) return null;
  const mk = (arr) => doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(arr)).setBuffer(root.listBuffers()[0]);
  const face = prim.clone(), eyes = prim.clone();
  // (a head with no hair or hood, like the Knight's: the original primitive simply becomes the face)
  if (restIdx.length) { prim.setIndices(mk(restIdx)); face.setIndices(mk(faceIdx)); } else { prim.setIndices(mk(faceIdx)); face.dispose(); }
  eyes.setIndices(mk(eyeIdx));
  console.log('head split: face', faceIdx.length / 3, 'eyes and brows', eyeIdx.length / 3, 'rest', restIdx.length / 3);
  return { face: restIdx.length ? face : null, eyes, faceIsMain: !restIdx.length };
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
await doc.transform(resample(), dedup({ keepUniqueNames: true }), prune(), sparse(), quantize(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
// Accessors that nothing uses any more (the dropped clips' keyframes) would still be written out
let orphans = 0;
for (const accessor of root.listAccessors()) {
  if (accessor.listParents().every((p) => p.propertyType === 'Root' || p.propertyType === 'Buffer')) { accessor.dispose(); orphans++; }
}
console.log('unused accessors dropped:', orphans);
await io.write(dest, doc);
console.log(`${dest}: removed ${removed} nodes, kept clips [${[...keep].join(', ')}], dropped ${dropped}`);
