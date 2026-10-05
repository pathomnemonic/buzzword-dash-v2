// tools/pack-kaykit.mjs
// Builds public/models/kaykit/kaykit.glb: every KayKit model the bright maps use, in ONE file that shares ONE material.
//
//   node tools/pack-kaykit.mjs [--src <folder with the KayKit packs>]
//
// The KayKit "Bits" packs are CC0 (public domain) by Kay Lousberg: https://kaylousberg.com/game-assets
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0.git   (and Halloween, City-Builder, Furniture)
// Each pack paints all its models with one 1024x1024 colour-swatch texture. Here the four swatch sheets are shrunk to
// 256x256 (they are only flat swatches and gradients) and placed side by side in a single 512x512 atlas, and every
// model's UVs are moved onto its quarter, so a map that mixes burgers, sofas, pumpkins and buildings is still ONE draw call.
//
// Which models go in is not listed anywhere: the map files are searched for names written like 'rest/food_burger'
// (pack, slash, model), so a model nobody uses is never shipped and a typo fails here instead of in a player's game.
//
//   rest = Restaurant Bits   hall = Halloween Bits   city = City Builder Bits   furn = Furniture Bits

import { readdirSync, readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const srcArg = args.indexOf('--src');
const SRC = srcArg >= 0 ? args[srcArg + 1] : (process.env.KAYKIT_DIR || '/home/user/kaykit-game-assets');
const OUT = join(root, 'public', 'models', 'kaykit', 'kaykit.glb');

/** pack id -> folder name and the quarter of the atlas (column, row) its swatches are placed in */
export const PACKS = {
  rest: { folder: 'kaykit-restaurant-bits-1.0', qx: 0, qy: 0 },
  hall: { folder: 'kaykit-halloween-bits-1.0', qx: 1, qy: 0 },
  city: { folder: 'kaykit-city-builder-bits-1.0', qx: 0, qy: 1 },
  furn: { folder: 'kaykit-furniture-bits-1.0', qx: 1, qy: 1 }
};
const MODEL_RE = /['"`](rest|hall|city|furn)\/([A-Za-z0-9_]+)['"`]/g;
const CELL = 256;

/** The model names ('rest/food_burger') written in the map source files. */
export function usedModels(files) {
  const found = new Set();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(MODEL_RE)) found.add(m[1] + '/' + m[2]);
  }
  return [...found].sort();
}

function sourceFiles() {
  const dir = join(root, 'js', 'game', 'maps');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => join(dir, f)) : [];
}

function gltfFolder(pack) {
  const base = join(SRC, PACKS[pack].folder, 'addons');
  const addon = readdirSync(base)[0];
  return join(base, addon, 'Assets', 'gltf');
}

async function main() {
  const wanted = usedModels(sourceFiles());
  if (!wanted.length) { console.log('No kit models are used by any map yet; nothing to pack.'); return; }
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

  // the combined swatch sheet
  const atlas = sharp({ create: { width: CELL * 2, height: CELL * 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } });
  const tiles = [];
  for (const [pack, def] of Object.entries(PACKS)) {
    const dir = gltfFolder(pack);
    const png = readdirSync(dir).find((f) => f.endsWith('.png'));
    const tile = await sharp(join(dir, png)).resize(CELL, CELL, { kernel: 'lanczos3' }).png().toBuffer();
    tiles.push({ input: tile, left: def.qx * CELL, top: def.qy * CELL });
  }
  // lossless WebP: a quarter the size of the PNG, with the swatch edges still crisp
  const atlasImage = await atlas.composite(tiles).webp({ lossless: true }).toBuffer();

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('kaykit');
  doc.getRoot().setDefaultScene(scene);
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const texture = doc.createTexture('swatches').setImage(new Uint8Array(atlasImage)).setMimeType('image/webp');
  const material = doc.createMaterial('kaykit').setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(0.5);

  let tris = 0;
  const tmp = [0, 0, 0, 0];
  for (const full of wanted) {
    const [pack, name] = full.split('/');
    const file = join(gltfFolder(pack), name + '.gltf');
    if (!existsSync(file)) throw new Error(`Unknown kit model '${full}' (no ${file})`);
    const src = await io.read(file);
    const { qx, qy } = PACKS[pack];
    const mesh = doc.createMesh(name);
    // a model can be several parts (a fridge and its handles), each placed by its node: bake the placement into the vertices
    const parts = src.getRoot().listNodes().filter((n) => n.getMesh());
    if (!parts.length) throw new Error(`${full}: has no mesh`);
    for (const part of parts) {
      const m = part.getWorldMatrix();
      for (const prim of part.getMesh().listPrimitives()) {
        const out = doc.createPrimitive().setMaterial(material);
        for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
          const a = prim.getAttribute(semantic);
          if (!a) continue;
          const n = a.getCount();
          const comps = a.getElementSize();
          const arr = new Float32Array(n * comps);
          for (let i = 0; i < n; i++) {
            a.getElement(i, tmp);
            const x = tmp[0], y = tmp[1], z = tmp[2];
            if (semantic === 'POSITION') {
              arr[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
              arr[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
              arr[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            } else if (semantic === 'NORMAL') {
              const nx = m[0] * x + m[4] * y + m[8] * z, ny = m[1] * x + m[5] * y + m[9] * z, nz = m[2] * x + m[6] * y + m[10] * z;
              const len = Math.hypot(nx, ny, nz) || 1;
              arr[i * 3] = nx / len; arr[i * 3 + 1] = ny / len; arr[i * 3 + 2] = nz / len;
            } else {
              arr[i * 2] = (x + qx) / 2; arr[i * 2 + 1] = (y + qy) / 2;
            }
          }
          out.setAttribute(semantic, doc.createAccessor().setType(a.getType()).setArray(arr).setBuffer(buffer));
        }
        const idx = prim.getIndices();
        if (idx) out.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx.getArray().slice()).setBuffer(buffer));
        tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
        mesh.addPrimitive(out);
      }
    }
    // three.js strips '/' from node names, so the pack and the model are joined with a double underscore here
    scene.addChild(doc.createNode(pack + '__' + name).setMesh(mesh));
  }

  // no quantize(): the game merges these models at run time, which needs plain 32-bit positions
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  mkdirSync(dirname(OUT), { recursive: true });
  await io.write(OUT, doc);
  writeFileSync(join(dirname(OUT), 'models.json'), JSON.stringify(wanted, null, 1) + '\n');
  console.log(`${OUT}: ${wanted.length} models, ${Math.round(tris)} triangles, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
