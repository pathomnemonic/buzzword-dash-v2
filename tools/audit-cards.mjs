// tools/audit-cards.mjs — what the card validator did to the deck, and which cards need better content.
//   node tools/audit-cards.mjs            summary
//   node tools/audit-cards.mjs --weak     also list every card whose clues repeat its title
//   node tools/audit-cards.mjs --cut      also list every clue the validator removed
const argv = process.argv.slice(2);
const log = console.log;
console.log = () => {}; console.warn = () => {}; console.groupCollapsed = () => {}; console.groupEnd = () => {};
const base = new URL('../js/', import.meta.url);
const { CARDS, getLoadReport } = await import(new URL('cards.js', base));
console.log = log;

const files = ['neurology', 'cardiology', 'nephrology', 'psychiatry', 'gastroenterology', 'pulmonology', 'infectious', 'endocrinology', 'hemeonc', 'rheumatology', 'obgyn', 'pediatrics', 'surgery', 'emergency', 'multisystem'];
let raw = [];
for (const f of files) raw = raw.concat(Object.values(await import(new URL(`cards/${f}.js`, base)))[0]);
const byId = new Map(CARDS.map((c) => [c.id, c]));
const report = getLoadReport();

const cut = [];
for (const r of raw) {
  const c = byId.get(r.id);
  if (!c) continue;
  for (const b of r.bw) if (!c.bw.includes(b) && !c.bw.some((x) => b.includes(x))) cut.push({ id: r.id, ans: r.ans, clue: b });
}
const norm = (s) => s.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const seen = new Map();
const dups = [];
for (const c of CARDS) {
  const key = c.bw.map(norm).sort().join('|');
  if (seen.has(key)) dups.push([seen.get(key), c.id]); else seen.set(key, c.id);
}
const hist = CARDS.reduce((h, c) => ((h[c.bw.length] = (h[c.bw.length] || 0) + 1), h), {});

log(`cards in source files : ${raw.length}`);
log(`cards loaded          : ${report.loaded}`);
log(`cards dropped         : ${report.dropped.length}${report.dropped.length ? '  ' + report.dropped.map((d) => d.id + ' (' + d.reason + ')').join('; ') : ''}`);
log(`clues removed as leaks: ${cut.length} (from ${new Set(cut.map((x) => x.id)).size} cards)`);
log(`weak-clue cards       : ${report.weakClueIds.length} (clues repeat the title; only the whole answer was removed)`);
log(`same clues in 2 cards : ${dups.length} pairs (selection spaces repeats of an answer apart)`);
log(`clues per card        : ${JSON.stringify(hist)}`);

if (argv.includes('--weak')) {
  log('\nWeak-clue cards (give them clues that do not restate the title):');
  for (const id of report.weakClueIds) { const c = byId.get(id); log(`  ${id} | ${c.ans} | ${JSON.stringify(c.bw)}`); }
}
if (argv.includes('--cut')) {
  log('\nRemoved clues:');
  cut.forEach((x) => log(`  ${x.id} | ${x.ans} | ${x.clue}`));
}
if (argv.includes('--dups')) {
  log('\nDuplicate pairs:');
  dups.forEach(([a, b]) => log(`  ${a} ~ ${b}  (${byId.get(a).ans})`));
}
