// Fetch the openly licensed source passages listed in sections.json (OpenStax archive JSON, CC BY 4.0) and
// turn each into plain text under source/<deck>/<ref>.txt, plus manifest.json (URL, licence, retrieval date, sections).
// Usage: node tools/opendecks/fetch-source.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

var here = dirname(fileURLToPath(import.meta.url));
var cfg = JSON.parse(readFileSync(join(here, 'sections.json'), 'utf8'));
var out = join(here, 'source', cfg.deck);
mkdirSync(out, { recursive: true });

function get(url) {
  return execFileSync('curl', ['-sS', '-m', '60', '--fail', url], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
}

/** Plain text of a section: headings and paragraphs, one block per line. Figures, captions, footnotes are dropped. */
export function htmlToText(html) {
  var dom = new JSDOM('<body>' + html + '</body>');
  var doc = dom.window.document;
  doc.querySelectorAll('figure, img, script, style, math, [data-type="media"], .os-figure, .os-caption-container, [data-type="footnote-refs"], sup[data-type="footnote-number"]').forEach(function (e) { e.remove(); });
  var blocks = [];
  doc.querySelectorAll('h1, h2, h3, h4, p, li, td, th, caption').forEach(function (e) {
    if (e.querySelector('p, li')) return; // (the inner blocks are taken on their own)
    var t = e.textContent.replace(/\s+/g, ' ').trim();
    if (t) blocks.push(t);
  });
  return blocks.join('\n');
}

var b = cfg.book;
var tree = JSON.parse(get(b.archive + '/contents/' + b.uuid + '@' + b.version + '.json'));
var manifest = {
  deck: cfg.deck,
  retrieved: new Date().toISOString().slice(0, 10),
  book: Object.assign({}, b, { bookLicenceFromArchive: tree.license, revised: tree.revised }),
  sections: []
};
cfg.sections.forEach(function (s) {
  var url = b.archive + '/contents/' + b.uuid + '@' + b.version + ':' + s.id + '.json';
  var page = JSON.parse(get(url));
  var text = page.title + '\n' + htmlToText(page.content);
  writeFileSync(join(out, s.ref + '.txt'), text + '\n');
  manifest.sections.push({ ref: s.ref, id: s.id, title: page.title, subject: s.subject, url: url, readerUrl: b.page.replace('1-introduction', page.slug), chars: text.length });
  console.log(s.ref, page.title, text.length);
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
