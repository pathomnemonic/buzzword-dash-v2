// Draw a reproducible random sample of cards that pass check.mjs, for the independent review.
//   node tools/opendecks/sample.mjs <deck.json> --source <dir> [--n 60] [--seed 1] [--from 0 --to 20]
// Prints each card with the passage text around its evidence sentence (review it against the passage, not against the card's own claims).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDeck, norm } from './check.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const deck = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const source = arg('source');
const n = Number(arg('n', 60)), seed = Number(arg('seed', 1)), from = Number(arg('from', 0)), to = Number(arg('to', n));
const res = checkDeck(deck, { sourceDir: source });
let st = seed >>> 0 || 1;
const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
const pool = res.passed.slice();
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
pool.slice(0, n).slice(from, to).forEach((c, k) => {
  const passage = readFileSync(join(source, c.source_ref + '.txt'), 'utf8').split('\n');
  const at = passage.findIndex((l) => norm(l).includes(norm(c.evidence)));
  const win = passage.slice(Math.max(1, at - 1), at + 2).join('\n');
  console.log('=== S' + (from + k + 1) + '  [' + c.source_ref + ']  ' + (c.round ? '(round 2)' : ''));
  console.log('HINT: ' + c.bw.join(' | '));
  console.log('A: ' + c.ans + '   WRONG: ' + c.d.join(' ; '));
  console.log('TP: ' + c.tp);
  console.log('WW: ' + JSON.stringify(c.ww));
  console.log('PASSAGE WINDOW:\n' + win + '\n');
});
