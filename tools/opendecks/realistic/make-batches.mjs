// Builds the exact messages a player would paste into an AI chat: the app's own prompt (buildAiPrompt) followed by
// 25 cards pasted the way an Anki "Notes in Plain Text" export looks (front TAB back TAB tags, HTML left in).
// usage: node tools/opendecks/realistic/make-batches.mjs <cards.json> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildAiPrompt } from '../../../js/importguide.js';
const [src, out] = [process.argv[2] || '/tmp/realistic_cards.json', process.argv[3] || '/tmp/realistic/prompts'];
const sets = JSON.parse(readFileSync(src, 'utf8'));
mkdirSync(out, { recursive: true });
const BATCH = 25;
const manifest = [];
Object.keys(sets).forEach((set) => {
  const rows = sets[set];
  for (let k = 0; k * BATCH < rows.length && k < 4; k++) {
    const chunk = rows.slice(k * BATCH, (k + 1) * BATCH);
    if (chunk.length < 10) continue;
    const name = set + k;
    writeFileSync(out + '/' + name + '.txt', buildAiPrompt() + '\n' + chunk.join('\n') + '\n');
    manifest.push({ name, set, count: chunk.length });
  }
});
writeFileSync(out + '/manifest.json', JSON.stringify(manifest, null, 1));
console.log(manifest);
