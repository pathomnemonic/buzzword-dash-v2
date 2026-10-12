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

/**
 * @param {{tags: string[]}[]} records
 * @returns {{root: object, untagged: number[], nodeCount: number}}
 *   node: { name, path, depth, ids: number[] (every record at or below, each once), kids: object[] }
 */
export function buildTagTree(records) {
  var root = { name: '', path: '', depth: 0, ids: [], kids: [], _map: Object.create(null), _last: -1 };
  var untagged = [];
  var nodeCount = 0;
  for (var i = 0; i < records.length; i++) {
    var tags = records[i].tags || [];
    if (!tags.length) { untagged.push(i); continue; }
    for (var t = 0; t < tags.length; t++) {
      var parts = String(tags[t]).split('::').filter(function (p) { return p !== ''; });
      var node = root;
      var path = '';
      for (var d = 0; d < parts.length; d++) {
        path = path ? path + '::' + parts[d] : parts[d];
        var child = node._map[parts[d]];
        if (!child) {
          child = { name: parts[d], path: path, depth: d + 1, ids: [], kids: [], _map: Object.create(null), _last: -1 };
          node._map[parts[d]] = child;
          node.kids.push(child);
          nodeCount++;
        }
        // a record with two tags under the same node still counts once there
        if (child._last !== i) { child._last = i; child.ids.push(i); }
        node = child;
      }
    }
  }
  sortKids(root);
  return { root: root, untagged: untagged, nodeCount: nodeCount };
}

function sortKids(node) {
  node.kids.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }); });
  node.kids.forEach(sortKids);
}

/** Every node (depth first) whose name or full path contains the text, with the nodes above it kept. */
export function searchTree(tree, text) {
  var q = String(text || '').trim().toLowerCase();
  var keep = Object.create(null);
  var matched = [];
  if (!q) return { keep: null, matched: matched };
  (function walk(node, ancestors) {
    node.kids.forEach(function (k) {
      var hit = k.name.toLowerCase().indexOf(q) >= 0;
      if (hit) {
        matched.push(k);
        keep[k.path] = true;
        ancestors.forEach(function (a) { keep[a.path] = true; });
      }
      walk(k, ancestors.concat(k));
    });
  })(tree.root, []);
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
 * @returns {{id: string, label: string, group: string, count: number, test: function(object): boolean}[]}
 */
export function presetsFor(records) {
  var list = [];
  function add(group, id, label, test) {
    var n = 0;
    for (var i = 0; i < records.length; i++) if (test(records[i])) n++;
    if (n > 0) list.push({ id: id, label: label, group: group, count: n, test: test });
  }
  EXAM_PRESETS.forEach(function (p) { add('exam', p.id, p.label, function (r) { return anyTag(r, p.re); }); });
  SUBJECT_PATTERNS.forEach(function (p) { add('subject', 'subj_' + p[0], p[0], function (r) { return anyTag(r, p[1]); }); });
  RESOURCE_PRESETS.forEach(function (p) { add('resource', p.id, p.label, function (r) { return anyTag(r, p.re); }); });
  return list;
}

/** The records that satisfy the active chips (OR inside a group, AND across groups). null chips = everything. */
export function applyPresets(records, presets, activeIds) {
  var active = presets.filter(function (p) { return activeIds.indexOf(p.id) >= 0; });
  var sel = createSelection(records.length, false);
  var groups = {};
  active.forEach(function (p) { (groups[p.group] = groups[p.group] || []).push(p); });
  var names = Object.keys(groups);
  for (var i = 0; i < records.length; i++) {
    var ok = true;
    for (var g = 0; g < names.length && ok; g++) {
      ok = groups[names[g]].some(function (p) { return p.test(records[i]); });
    }
    if (ok) sel[i] = 1;
  }
  return sel;
}

// ----- size estimate -----

/** Rough bytes one imported card takes in browser storage (JSON in localStorage). */
export function estimateBytes(r) {
  var n = 230; // ids, keys, empty arrays, field names
  n += (r.front || '').length + (r.back || '').length + (r.teach || '').length * 1;
  var tags = r.tags || [];
  for (var i = 0; i < tags.length && i < 12; i++) n += String(tags[i]).length + 3;
  return n;
}
