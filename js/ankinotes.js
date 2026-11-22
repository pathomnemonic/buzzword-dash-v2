/**
 * ankinotes.js — turns one Anki note (its fields, tags and card states) into importable records.
 *
 * Pure functions with no DOM and no app imports, so the same code runs on the page and inside the Web Worker that
 * reads big .apkg files (see apkgworker.js). Everything here treats the deck as untrusted text.
 */

// ===== HTML STRIPPING =====

var HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  rarr: '\u2192', larr: '\u2190', uarr: '\u2191', darr: '\u2193', harr: '\u2194', times: '\u00D7',
  plusmn: '\u00B1', deg: '\u00B0', micro: '\u00B5', middot: '\u00B7', bull: '\u2022', ge: '\u2265', le: '\u2264',
  ne: '\u2260', asymp: '\u2248', alpha: '\u03B1', beta: '\u03B2', gamma: '\u03B3', delta: '\u03B4', mu: '\u03BC',
  copy: '\u00A9', reg: '\u00AE', trade: '\u2122', sup2: '\u00B2', sup3: '\u00B3', frac12: '\u00BD'
};

/**
 * Strip HTML tags from a string and decode common entities.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return '';
  // Only real tags go: "<" must be followed by a letter, "/" or "!" ("BP <90 and HR >100" is text, not a tag)
  var text = String(html).replace(/\[sound:[^\]]*\]/gi, ' ').replace(/<(?:\/?[a-z!][^>]*)>/gi, ' ');
  // One pass, so "&amp;lt;" becomes the text "&lt;" and not "<"
  text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, function (all, ent) {
    if (ent.charAt(0) === '#') {
      var cp = ent.charAt(1).toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (cp > 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) return String.fromCodePoint(cp);
      return all;
    }
    var named = HTML_ENTITIES[ent.toLowerCase()];
    return named === undefined ? all : named;
  });
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

/** A side that is only a picture or sound placeholder ("[image]", empty after tags are removed) cannot be studied as text. */
export function isMediaOnly(text) {
  var t = String(text || '').trim();
  return t === '' || /^\[?\s*(image|img|picture|photo|audio|sound|video)[^\]a-z]*\]?$/i.test(t);
}

// ===== CLOZE NOTES ({{c1::text::hint}}) =====

/**
 * Read cloze markup into a tree. Handles several clozes, clozes inside clozes ({{c1::a {{c2::b}} c}}) and a hint
 * after the last "::" of a cloze. Anything that is not a well-formed opener is plain text.
 * @param {string} text
 * @returns {Array<{t: 'text', v: string}|{t: 'cloze', n: number, hint: string, kids: Array}>}
 */
export function parseCloze(text) {
  var pos = 0;
  function run(inside) {
    var nodes = [];
    var buf = '';
    function flush() { if (buf) { nodes.push({ t: 'text', v: buf }); buf = ''; } }
    while (pos < text.length) {
      var ch = text.charAt(pos);
      if (ch === '{' && text.charAt(pos + 1) === '{') {
        var m = /^\{\{c(\d{1,3})::/i.exec(text.substr(pos, 12));
        if (m) {
          flush();
          pos += m[0].length;
          var kids = run(true);
          nodes.push({ t: 'cloze', n: parseInt(m[1], 10), hint: '', kids: kids });
          continue;
        }
      }
      if (inside && ch === '}' && text.charAt(pos + 1) === '}') { pos += 2; flush(); return finishCloze(nodes); }
      buf += ch;
      pos++;
    }
    flush();
    return nodes;
  }
  return run(false);
}

/** Split the hint off the end of a cloze's contents ("answer::hint"). */
export function finishCloze(kids) {
  for (var i = kids.length - 1; i >= 0; i--) {
    if (kids[i].t !== 'text') break; // a hint is plain text after the last nested cloze
    var at = kids[i].v.lastIndexOf('::');
    if (at >= 0) {
      var hint = kids[i].v.slice(at + 2);
      for (var j = i + 1; j < kids.length; j++) hint += kids[j].v;
      var head = kids.slice(0, i);
      if (kids[i].v.slice(0, at)) head.push({ t: 'text', v: kids[i].v.slice(0, at) });
      return Object.assign(head, { _hint: hint });
    }
  }
  return kids;
}

export function clozeNumbers(nodes, set) {
  nodes.forEach(function (nd) { if (nd.t === 'cloze') { set[nd.n] = true; clozeNumbers(nd.kids, set); } });
  return set;
}

/** All clozes shown: the text as it reads on the back. */
export function clozeRevealed(nodes) {
  return nodes.map(function (nd) { return nd.t === 'text' ? nd.v : clozeRevealed(nd.kids); }).join('');
}

/** Cloze number n hidden as [...] (or [hint]); the other clozes shown. Answers of n are collected in `answers`. */
export function clozeHidden(nodes, n, answers) {
  return nodes.map(function (nd) {
    if (nd.t === 'text') return nd.v;
    if (nd.n === n) { answers.push(clozeRevealed(nd.kids)); return '[' + ((nd.kids._hint || '').trim() ? nd.kids._hint.trim() : '...') + ']'; }
    return clozeHidden(nd.kids, n, answers);
  }).join('');
}

/**
 * Turn a cloze note into one card per cloze number: the front hides that number's answer as [...] (or [hint]) while
 * the other clozes are shown; the back is the answer and the full sentence; the note's other fields are the extra.
 * @param {string[]} fields the note's fields
 * @returns {Array<{front: string, back: string, full: string, extra: string, n: number}>|null} null when the note has no cloze
 */
export function clozeCards(fields) {
  var text = fields[0] || '';
  if (!/\{\{c\d{1,3}::/i.test(text)) return null;
  var tree = parseCloze(text);
  var nums = Object.keys(clozeNumbers(tree, {})).map(Number).sort(function (a, b) { return a - b; });
  if (!nums.length) return null;
  var full = stripHtml(clozeRevealed(tree));
  var extra = joinExtra(fields.slice(1));
  var out = [];
  nums.forEach(function (n) {
    var answers = [];
    var front = stripHtml(clozeHidden(tree, n, answers));
    var back = answers.map(stripHtml).filter(Boolean).join(', ');
    if (front && back && !isMediaOnly(front) && !isMediaOnly(back)) out.push({ front: front, back: back, full: full, extra: extra, n: n });
  });
  return out;
}

/** The note's other fields as one line of teaching text (empty fields dropped, capped so storage stays sane). */
export function joinExtra(fields) {
  var parts = [];
  fields.forEach(function (f) { var t = stripHtml(f); if (t) parts.push(t); });
  var s = parts.join(' · ');
  return s.length > 700 ? s.slice(0, 699) + '…' : s;
}

/** The text a card teaches with: the main text, then the extras. */
export function teachFor(base, extra) {
  var s = [base, extra].filter(Boolean).join(' — ');
  return s.length > 900 ? s.slice(0, 899) + '…' : s;
}

/** A short stable key for cards that have no Anki guid (same text = same card on re-import). */
export function hashKey(text) {
  var h1 = 0x811c9dc5;
  var h2 = 0x01000193;
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return 'h' + h1.toString(36) + h2.toString(36);
}

/** Split Anki's space-separated tag string into a list. */
export function splitTags(str) {
  return String(str || '').split(/\s+/).filter(function (t) { return t; });
}

/**
 * Turn one Anki note into importable records (one per cloze number, or one for a basic note).
 * @param {string[]} fields
 * @param {{guid?: string, tags?: string[], queues?: number[]|null}} meta queues: card queue per ord (-1 suspended, -2/-3 buried)
 * @returns {{records: object[], media: number}}
 */
export function noteRecords(fields, meta) {
  meta = meta || {};
  var tags = meta.tags || [];
  var queues = meta.queues || null;
  var known = queues ? queues.filter(function (q) { return q !== undefined; }) : [];
  var allSusp = known.length > 0 && known.every(function (q) { return q === -1; });
  var allBur = known.length > 0 && known.every(function (q) { return q === -2 || q === -3; });
  if (/image-occlusion:/i.test(fields[0] || '')) return { records: [], media: 1 };
  var cloze = clozeCards(fields);
  var recs = [];
  if (cloze) {
    var anyExtra = fields.slice(1).some(function (f) { return stripHtml(f) !== ''; });
    cloze.forEach(function (c) {
      var q = queues ? queues[c.n - 1] : undefined;
      recs.push({
        front: c.front, back: c.back, teach: teachFor(c.full, c.extra), tags: tags,
        guid: meta.guid || '', key: (meta.guid || hashKey(fields[0])) + '#c' + c.n,
        suspended: q === undefined ? allSusp : q === -1,
        buried: q === undefined ? allBur : (q === -2 || q === -3),
        hasExtra: anyExtra
      });
    });
    return { records: recs, media: cloze.length ? 0 : 1 };
  }
  if (fields.length < 2) return { records: [], media: 0 };
  var front = stripHtml(fields[0]);
  var back = stripHtml(fields[1]);
  if (!front || !back || isMediaOnly(front) || isMediaOnly(back)) return { records: [], media: 1 };
  var extra = joinExtra(fields.slice(2));
  return {
    records: [{
      front: front, back: back, teach: extra ? teachFor(back, extra) : '', tags: tags,
      guid: meta.guid || '', key: meta.guid || hashKey(front + '\u0001' + back),
      suspended: allSusp, buried: allBur, hasExtra: !!extra
    }],
    media: 0
  };
}

