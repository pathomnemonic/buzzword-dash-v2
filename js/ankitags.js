/**
 * ankitags.js — the tag tree and filters behind "import only the part of a big Anki deck I want".
 *
 * Pure functions, no DOM. A "record" is one importable card as the Anki importer reads it:
 *   { front, back, teach, tags: string[], guid, key, suspended, buried, hasExtra }
 * Anki tags are hierarchical ("#AK_Step1_v12::#B&B::Cardiology::Heart_failure"): the tree splits them on "::".
 *
 * Selection model: a Uint8Array with one flag per record. A node is "checked" when every (eligible) card under it
 * is selected, "partial" when only some are. A card is imported when it is selected AND passes the toggles
 * (skip suspended, skip buried, only notes with extra fields).
 */

import { SUBJECTS } from './cardschema.js';

export var UNTAGGED = '(untagged)';

// ----- tree -----

/** A tree under construction: records are added in slices (so a 30,000-note deck can be built without freezing the page). */
function treeBuilder() {
  var root = { name: '', path: '', depth: 0, ids: [], kids: [], _map: Object.create(null), _last: -1 };
  var untagged = [];
  var nodeCount = 0;
  var paths = new Map(); // a tag string -> the nodes along it, worked out once (a deck repeats the same few thousand tags 400,000 times)
  function nodesFor(tag) {
    var hit = paths.get(tag);
    if (hit) return hit;
    var parts = String(tag).split('::').filter(function (p) { return p !== ''; });
    var node = root;
    var path = '';
    var list = [];
    for (var d = 0; d < parts.length; d++) {
      path = path ? path + '::' + parts[d] : parts[d];
      var child = node._map[parts[d]];
      if (!child) {
        child = { name: parts[d], path: path, depth: d + 1, ids: [], kids: [], _map: Object.create(null), _last: -1 };
        node._map[parts[d]] = child;
        node.kids.push(child);
        nodeCount++;
      }
      list.push(child);
      node = child;
    }
    paths.set(tag, list);
    return list;
  }
  return {
    add: function (records, from, to) {
      for (var i = from; i < to; i++) {
        var tags = records[i].tags || [];
        if (!tags.length) { untagged.push(i); continue; }
        for (var t = 0; t < tags.length; t++) {
          var list = nodesFor(tags[t]);
          for (var d = 0; d < list.length; d++) {
            var n = list[d];
            // a record with two tags under the same node still counts once there
            if (n._last !== i) { n._last = i; n.ids.push(i); }
          }
        }
      }
    },
    finish: function () {
      sortKids(root);
      paths = null;
      return { root: root, untagged: untagged, nodeCount: nodeCount };
    }
  };
}

/**
 * @param {{tags: string[]}[]} records
 * @returns {{root: object, untagged: number[], nodeCount: number}}
 *   node: { name, path, depth, ids: number[] (every record at or below, each once), kids: object[] }
 */
export function buildTagTree(records) {
  var b = treeBuilder();
  b.add(records, 0, records.length);
  return b.finish();
}

/**
 * The same tree, built in slices with the page free to paint between them (a real AnKing deck: 30,000 notes, about
 * 20,000 distinct tag levels).
 * @param {{tags: string[]}[]} records
 * @param {{slice?: number, onProgress?: function(number, number): void, isCancelled?: function(): boolean}} [o]
 * @returns {Promise<{root: object, untagged: number[], nodeCount: number}|null>} null when cancelled
 */
export async function buildTagTreeAsync(records, o) {
  o = o || {};
  var step = o.slice || 2000;
  var b = treeBuilder();
  for (var i = 0; i < records.length; i += step) {
    b.add(records, i, Math.min(records.length, i + step));
    if (o.onProgress) o.onProgress(Math.min(records.length, i + step), records.length);
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    if (o.isCancelled && o.isCancelled()) return null;
  }
  return b.finish();
}

var COLLATOR = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;

function sortKids(node) {
  if (COLLATOR) node.kids.sort(function (a, b) { return COLLATOR.compare(a.name, b.name); });
  else node.kids.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }); });
  node.kids.forEach(sortKids);
  delete node._map;
  delete node._last;
}

/** Every node (depth first) whose name contains the text, with the nodes above it kept. */
export function searchTree(tree, text) {
  var q = String(text || '').trim().toLowerCase();
  var keep = Object.create(null);
  var matched = [];
  if (!q) return { keep: null, matched: matched };
  var stack = [];
  (function walk(node) {
    for (var i = 0; i < node.kids.length; i++) {
      var k = node.kids[i];
      if (k._lname === undefined) k._lname = k.name.toLowerCase();
      var hit = k._lname.indexOf(q) >= 0;
      if (hit) {
        matched.push(k);
        keep[k.path] = true;
        for (var a = 0; a < stack.length; a++) keep[stack[a].path] = true;
      }
      stack.push(k);
      walk(k);
      stack.pop();
    }
  })(tree.root);
  return { keep: keep, matched: matched };
}

// ----- selection and filters -----

/**
 * @param {number} n how many records
 * @param {boolean} [all] start with everything selected
 */
export function createSelection(n, all) {
  var sel = new Uint8Array(n);
  if (all) sel.fill(1);
  return sel;
}

export function setIds(sel, ids, on) {
  var v = on ? 1 : 0;
  for (var i = 0; i < ids.length; i++) sel[ids[i]] = v;
}

export function selectAll(sel, on) { sel.fill(on ? 1 : 0); }

/**
 * Which records pass the toggles.
 * @param {object[]} records
 * @param {{skipSuspended?: boolean, skipBuried?: boolean, onlyExtra?: boolean}} f
 * @returns {Uint8Array}
 */
export function eligibleMask(records, f) {
  f = f || {};
  var m = new Uint8Array(records.length);
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (f.skipSuspended && r.suspended) continue;
    if (f.skipBuried && r.buried) continue;
    if (f.onlyExtra && !r.hasExtra) continue;
    m[i] = 1;
  }
  return m;
}

/** 'all' | 'some' | 'none' for the eligible records under these ids. */
export function stateOf(ids, sel, mask) {
  var total = 0;
  var on = 0;
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (!mask[id]) continue;
    total++;
    if (sel[id]) on++;
  }
  if (total === 0 || on === 0) return { state: 'none', total: total, on: on };
  return { state: on === total ? 'all' : 'some', total: total, on: on };
}

/** The records that will be imported, in order. */
export function chosenIds(sel, mask) {
  var out = [];
  for (var i = 0; i < sel.length; i++) if (sel[i] && mask[i]) out.push(i);
  return out;
}

// ----- quick presets -----

var EXAM_PRESETS = [
  { id: 'step1', label: 'Step 1 only', re: /(?:^|[^a-z0-9])step[ _-]?1(?![0-9])/i },
  { id: 'step2', label: 'Step 2 only', re: /(?:^|[^a-z0-9])step[ _-]?2(?![0-9])/i },
  { id: 'step3', label: 'Step 3 only', re: /(?:^|[^a-z0-9])step[ _-]?3(?![0-9])/i }
];

var RESOURCE_PRESETS = [
  { id: 'res_uworld', label: 'UWorld', re: /uworld|u_world/i },
  { id: 'res_bnb', label: 'Boards & Beyond', re: /b&b|boards[ _-]?(and|&)[ _-]?beyond/i },
  { id: 'res_sketchy', label: 'Sketchy', re: /sketchy/i },
  { id: 'res_pathoma', label: 'Pathoma', re: /pathoma/i },
  { id: 'res_fa', label: 'First Aid', re: /first[ _-]?aid|(?:^|[^a-z])fa[ _-]?\d|firstaid/i }
];

/** Which words in a tag point at which Dx Dash subject. Order matters when a card matches several equally. */
var SUBJECT_PATTERNS = [
  ['Cardiology', /cardio|cardiac|heart|vascular|hypertens|arrhythm|\becg\b|\bekg\b/i],
  ['Neurology', /neuro|brain|stroke|seizure|spinal|\bcns\b/i],
  ['Nephrology', /renal|nephro|kidney|urinary|acid[ _-]?base|electrolyte/i],
  ['Psychiatry', /psych|behavio/i],
  ['Gastroenterology', /gastro|(?:^|[^a-z])gi(?:[^a-z]|$)|hepat|liver|pancrea|digestive|biliary/i],
  ['Pulmonology', /pulm|respir|lung|airway/i],
  ['Infectious Disease', /microbio|infect|bacteri|virolog|mycolog|parasit|antibiotic/i],
  ['Endocrinology', /endocr|diabet|thyroid|adrenal|pituitar/i],
  ['Hematology/Oncology', /hemat|oncolog|(?:^|[^a-z])heme(?:[^a-z]|$)|cancer|neoplas/i],
  ['Rheumatology', /rheum|musculo|(?:^|[^a-z])msk(?:[^a-z]|$)|autoimmun|connective/i],
  ['Obstetrics/Gynecology', /obstet|gynec|ob[ _-]?gyn|reproduct|pregnan/i],
  ['Pediatrics', /pediatr|paediatr|neonat|congenital/i],
  ['Surgery', /surg|trauma|ortho/i],
  ['Emergency Medicine', /emergenc|toxicol|critical[ _-]?care/i]
].filter(function (p) { return SUBJECTS.indexOf(p[0]) >= 0; });

/**
 * The Dx Dash subject a card most plausibly belongs to, from its tags only (no guessing from the text).
 * @param {string[]} tags
 * @returns {string} one of SUBJECTS ('Multisystem / Mixed' when nothing matches)
 */
export function guessSubject(tags) {
  if (!tags || !tags.length) return 'Multisystem / Mixed';
  var best = null;
  var bestN = 0;
  SUBJECT_PATTERNS.forEach(function (p) {
    var n = 0;
    for (var i = 0; i < tags.length; i++) if (p[1].test(tags[i])) n++;
    if (n > bestN) { best = p[0]; bestN = n; }
  });
  return best || 'Multisystem / Mixed';
}

function anyTag(r, re) {
  var tags = r.tags || [];
  for (var i = 0; i < tags.length; i++) if (re.test(tags[i])) return true;
  return false;
}

/**
 * The quick-filter chips that make sense for this deck (a chip with no matching cards is not offered).
 * Chips in the same group are OR-ed, groups are AND-ed.
 *
 * Each pattern is tried once per DISTINCT tag (a 30,000-note deck has ~20,000 of them, against 400,000 tag uses), and
 * every record gets a bit mask of the chips it matches; counts and applyPresets just read those masks.
 * @returns {{id: string, label: string, group: string, count: number, bit: number, test: function(object): boolean}[]}
 *          (with a non-enumerable `masks`: Uint32Array, one per record)
 */
export function presetsFor(records) {
  var defs = [];
  EXAM_PRESETS.forEach(function (p) { defs.push({ group: 'exam', id: p.id, label: p.label, re: p.re }); });
  SUBJECT_PATTERNS.forEach(function (p) { defs.push({ group: 'subject', id: 'subj_' + p[0], label: p[0], re: p[1] }); });
  RESOURCE_PRESETS.forEach(function (p) { defs.push({ group: 'resource', id: p.id, label: p.label, re: p.re }); });
  // up to 31 chips fit in the mask; the app has 22
  defs = defs.slice(0, 31);
  var tagBits = new Map();
  function bitsOf(tag) {
    var b = tagBits.get(tag);
    if (b !== undefined) return b;
    b = 0;
    for (var d = 0; d < defs.length; d++) if (defs[d].re.test(tag)) b |= (1 << d);
    tagBits.set(tag, b);
    return b;
  }
  var masks = new Uint32Array(records.length);
  var counts = new Array(defs.length).fill(0);
  for (var i = 0; i < records.length; i++) {
    var tags = records[i].tags || [];
    var m = 0;
    for (var t = 0; t < tags.length; t++) m |= bitsOf(tags[t]);
    masks[i] = m;
    if (m) for (var d2 = 0; d2 < defs.length; d2++) if (m & (1 << d2)) counts[d2]++;
  }
  var list = [];
  defs.forEach(function (def, d) {
    if (counts[d] > 0) {
      list.push({ id: def.id, label: def.label, group: def.group, count: counts[d], bit: 1 << d, test: function (r) { return anyTag(r, def.re); } });
    }
  });
  Object.defineProperty(list, 'masks', { value: masks, enumerable: false });
  return list;
}

/** The records that satisfy the active chips (OR inside a group, AND across groups). null chips = everything. */
export function applyPresets(records, presets, activeIds) {
  var active = presets.filter(function (p) { return activeIds.indexOf(p.id) >= 0; });
  var sel = createSelection(records.length, false);
  var groups = {};
  active.forEach(function (p) { (groups[p.group] = groups[p.group] || []).push(p); });
  var names = Object.keys(groups);
  var masks = presets.masks && presets.masks.length === records.length ? presets.masks : null;
  var groupMasks = names.map(function (g) { return groups[g].reduce(function (m, p) { return m | (p.bit || 0); }, 0); });
  for (var i = 0; i < records.length; i++) {
    var ok = true;
    for (var g = 0; g < names.length && ok; g++) {
      if (masks && groupMasks[g]) ok = (masks[i] & groupMasks[g]) !== 0;
      else ok = groups[names[g]].some(function (p) { return p.test(records[i]); });
    }
    if (ok) sel[i] = 1;
  }
  return sel;
}

// ----- size estimate -----

/** Rough bytes one imported card takes in browser storage (the card as stored: JSON text in localStorage, a structured copy in IndexedDB). */
export function estimateBytes(r) {
  var n = 230; // ids, keys, empty arrays, field names
  n += (r.front || '').length + (r.back || '').length + (r.teach || '').length * 1;
  var tags = r.tags || [];
  for (var i = 0; i < tags.length && i < 12; i++) n += String(tags[i]).length + 3;
  return n;
}
