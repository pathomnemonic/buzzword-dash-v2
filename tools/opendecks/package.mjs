// Check a deck file, drop the cards that fail, and publish it as static JSON for the app:
//   node tools/opendecks/package.mjs tools/opendecks/out/<deckId>.json --source <dir of <source_ref>.txt>
// Writes public/decks/<deckId>.json (passing cards only, each with a stable `key`) and refreshes public/decks/index.json.
// The deck file format is frozen: see docs/OPEN-DECKS.md section 1.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDeck } from './check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', '..', 'public', 'decks');

export function cardKey(deckId, card) {
  return deckId + ':' + createHash('sha1').update([card.source_ref, card.ans, card.evidence].join('|')).digest('hex').slice(0, 12);
}

/** @returns {{deck: object, index: object, checked: object}} */
export function packageDeck(deck, sourceDir) {
  const checked = checkDeck(deck, { sourceDir });
  if (checked.header.length) throw new Error('deck header: ' + checked.header.join('; '));
  const seen = new Set();
  const cards = checked.passed.map((c) => {
    const key = cardKey(deck.id, c);
    if (seen.has(key)) throw new Error('duplicate card key ' + key);
    seen.add(key);
    const tags = (c.tags || []).slice(0, LIMIT_TAGS - 1).concat(['deck:' + deck.id]);
    const out = { subj: c.subj, bw: c.bw, ans: c.ans, d: c.d, tp: c.tp, ww: c.ww, tags: tags, source_ref: c.source_ref, evidence: c.evidence, key: key };
    ['exams', 'questionType', 'baseDifficulty', 'pearls'].forEach((f) => { if (c[f] !== undefined) out[f] = c[f]; });
    return out;
  });
  const out = {
    format: 1, id: deck.id, title: deck.title, source: deck.source, licence: deck.licence, attribution: deck.attribution,
    url: deck.url, author: deck.author || '', version: deck.version, count: cards.length, cards: cards
  };
  if (deck.discipline) out.discipline = deck.discipline;
  const json = JSON.stringify(out);
  const tagSet = new Set();
  cards.forEach((c) => (c.tags || []).forEach((t) => { if (!/^deck:/.test(t)) tagSet.add(t.split('::').slice(0, 2).join('::')); }));
  const index = {
    id: out.id, title: out.title, source: out.source, licence: out.licence, attribution: out.attribution, url: out.url, author: out.author,
    version: out.version, count: cards.length, size: Buffer.byteLength(json), file: out.id + '.json'
  };
  return { deck: out, json, index, checked };
}
const LIMIT_TAGS = 6;

const file = process.argv[2];
const si = process.argv.indexOf('--source');
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  if (!file || si < 0) { console.error('usage: node tools/opendecks/package.mjs <deck.json> --source <dir>'); process.exit(2); }
  const deck = JSON.parse(readFileSync(file, 'utf8'));
  const r = packageDeck(deck, process.argv[si + 1]);
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, r.deck.id + '.json'), r.json + '\n');
  const ip = join(pub, 'index.json');
  const idx = existsSync(ip) ? JSON.parse(readFileSync(ip, 'utf8')) : { format: 1, decks: [] };
  idx.decks = idx.decks.filter((d) => d.id !== r.index.id).concat([r.index]).sort((a, b) => a.id < b.id ? -1 : 1);
  writeFileSync(ip, JSON.stringify(idx, null, 1) + '\n');
  console.log('packaged ' + r.index.id + ': ' + r.index.count + ' of ' + r.checked.total + ' cards (' + r.checked.failed.length + ' dropped), ' + (r.index.size / 1024).toFixed(0) + ' KB -> public/decks/');
}
