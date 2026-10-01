// tools/make-medical-characters.mjs — turns Quaternius's CC0 animated people into medical staff by repainting
// their clothes (scrubs, a white coat, a paramedic's uniform). The animation and rig are untouched.
//
//   node tools/make-medical-characters.mjs <folder with the original .glb files>
//
// Sources (all Quaternius, CC0, from Poly Pizza): Casual Character (kZ3DmIoGip), Animated Woman (qJ2gsTUBHL),
// Worker (Yg2bQZO6Hj). Only characters in long trousers are used. Writes public/models/characters/*.glb;
// run `node tools/optimize-models.mjs` afterwards to drop unused clips and compress.

import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/make-medical-characters.mjs <folder>'); process.exit(1); }

const srgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

const OUTFITS = {
  doctor: { from: 'kZ3DmIoGip.glb', paint: { White: 0xf6fafc, LightBlue: 0x1fa3b5, Red_Dark: 0xeef3f5, LightBrown: 0x8899a0 } },
  nurse: { from: 'qJ2gsTUBHL.glb', paint: { White: 0x5bc4dc, Orange: 0x3fa7c4, Grey: 0xf2f6f8 } },
  surgeon: { from: 'kZ3DmIoGip.glb', paint: { White: 0x2e9e7c, LightBlue: 0x287f68, Red_Dark: 0xeef3f5, LightBrown: 0x8899a0 } },
  paramedic: { from: 'Yg2bQZO6Hj.glb', paint: { Worker_Yellow: 0xf5f5f5, Worker_Vest: 0xd93030, Brown: 0x1d2a5c, Brown2: 0x15204a, LightBrown: 0xdfe9f2 } },
  resident: { from: 'kZ3DmIoGip.glb', paint: { White: 0x2b4a8c, LightBlue: 0x23407a, Red_Dark: 0xeef3f5, LightBrown: 0x8899a0 } }
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [name, def] of Object.entries(OUTFITS)) {
  const doc = await io.read(join(dir, def.from));
  const painted = [];
  for (const m of doc.getRoot().listMaterials()) {
    const hex = def.paint[m.getName()];
    if (hex === undefined) continue;
    const [r, g, b] = srgb(hex);
    m.setBaseColorFactor([r, g, b, 1]);
    painted.push(m.getName());
  }
  // the Man pack names its clips "Man_Run"; the game looks for plain "Run"
  for (const a of doc.getRoot().listAnimations()) a.setName(a.getName().replace('Man_', ''));
  const missing = Object.keys(def.paint).filter((k) => !painted.includes(k));
  if (missing.length) console.warn(name + ': no material called ' + missing.join(', '));
  await io.write(join('public', 'models', 'characters', name + '.glb'), doc);
  console.log(name + ': repainted ' + painted.join(', '));
}
