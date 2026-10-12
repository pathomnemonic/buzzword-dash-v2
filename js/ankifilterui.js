/**
 * ankifilterui.js — the "pick what to import" panel shown after an Anki file has been read.
 *
 * A searchable tag tree (split on "::") with counts and tri-state checkboxes, quick filter chips, toggles for
 * suspended / buried / extra-field notes, and a live count of how many cards will be imported.
 *
 * Everything shown comes from the deck file, which is untrusted: it is only ever put on the page with textContent
 * (never innerHTML).
 */

import {
  buildTagTree, searchTree, createSelection, setIds, selectAll, eligibleMask, stateOf, chosenIds,
  presetsFor, applyPresets, estimateBytes, UNTAGGED
} from './ankitags.js';

var MAX_ROWS_PER_LEVEL = 150;
var WARN_BYTES = 3.5 * 1024 * 1024; // localStorage is about 5 MB per site and holds the save data too

var C = {
  muted: 'var(--text-secondary, #aaa)',
  gold: 'var(--accent-gold, #ffd54f)',
  green: 'var(--accent-green, #44ff88)',
  red: 'var(--accent-red, #ff4466)',
  line: 'rgba(187,102,255,.25)'
};

function h(tag, o) {
  o = o || {};
  var e = document.createElement(tag);
  if (o.text !== undefined) e.textContent = o.text;
  if (o.className) e.className = o.className;
  if (o.type) e.type = o.type;
  if (o.style) Object.keys(o.style).forEach(function (k) { e.style[k] = o.style[k]; });
  if (o.attrs) Object.keys(o.attrs).forEach(function (k) { e.setAttribute(k, o.attrs[k]); });
  (o.kids || []).forEach(function (k) { if (k) e.appendChild(k); });
  return e;
}

function fmtN(n) { return Number(n).toLocaleString('en-US'); }
function fmtMB(bytes) { return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB'; }

/**
 * @param {HTMLElement} host emptied and filled
 * @param {object} o
 * @param {object[]} o.records parsed cards ({front, back, teach, tags, key, suspended, buried, hasExtra})
 * @param {string[]} [o.warnings]
 * @param {string} [o.title] the file name
 * @param {{count: number, bytes: number, keys: Object<string, boolean>, limit: number, hardLimit: number, setLimit: function(number): number}} o.store
 *        what My Cards holds now: how many cards, how many bytes, which Anki keys, the limit the player allows
 * @param {function(object[], {onProgress: function(number, number)}): Promise<object>} o.onImport
 * @param {function(): void} [o.onClose]
 * @returns {{destroy: function(): void, getState: function(): object}}
 */
export function renderFilterPanel(host, o) {
  var records = o.records;
  var store = o.store || { count: 0, bytes: 0, keys: {}, limit: 5000, hardLimit: 50000, setLimit: function (n) { return n; } };
  while (host.firstChild) host.removeChild(host.firstChild);

  var tree = buildTagTree(records);
  var presets = presetsFor(records);
  var activeChips = [];
  var sel = createSelection(records.length, true);
  var counts = { suspended: 0, buried: 0, extra: 0, tagged: records.length - tree.untagged.length };
  records.forEach(function (r) { if (r.suspended) counts.suspended++; if (r.buried) counts.buried++; if (r.hasExtra) counts.extra++; });
  var filters = { skipSuspended: counts.suspended > 0, skipBuried: false, onlyExtra: false };
  var mask = eligibleMask(records, filters);
  var expanded = Object.create(null);
  var query = '';
  var rowRefs = [];
  var busy = false;
  var destroyed = false;

  var box = h('div', { className: 'anki-filter', style: { border: '1px solid ' + C.line, borderRadius: '12px', padding: '12px', margin: '10px 0', background: 'rgba(20,10,50,.35)' } });
  box.appendChild(h('div', { text: 'Found ' + fmtN(records.length) + ' card' + (records.length === 1 ? '' : 's') + (o.title ? ' in ' + o.title : ''), style: { fontWeight: '700', fontSize: '14px' } }));
  box.appendChild(h('div', {
    text: fmtN(counts.tagged) + ' tagged' + (counts.suspended ? ' · ' + fmtN(counts.suspended) + ' suspended' : '') + (counts.buried ? ' · ' + fmtN(counts.buried) + ' buried' : '') + (counts.extra ? ' · ' + fmtN(counts.extra) + ' with extra fields' : '') + '. Pick what you want below; it is read on this device only.',
    style: { fontSize: '11px', color: C.muted, margin: '2px 0 8px', lineHeight: '1.5' }
  }));
  if (o.warnings && o.warnings.length) {
    box.appendChild(h('div', { text: o.warnings.slice(0, 2).join(' '), style: { fontSize: '11px', color: C.gold, marginBottom: '8px' } }));
  }

  // ----- quick filters -----
  var chipEls = {};
  if (presets.length) {
    var groups = [['exam', 'Exam'], ['subject', 'Subject / system'], ['resource', 'Resource']];
    groups.forEach(function (g) {
      var inGroup = presets.filter(function (p) { return p.group === g[0]; });
      if (!inGroup.length) return;
      var row = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', margin: '4px 0' } });
      row.appendChild(h('span', { text: g[1] + ':', style: { fontSize: '11px', color: C.muted, minWidth: '56px' } }));
      inGroup.forEach(function (p) {
        var b = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: p.label + ' (' + fmtN(p.count) + ')', attrs: { 'aria-pressed': 'false', 'data-preset': p.id }, style: { padding: '4px 8px', fontSize: '11px' } });
        b.addEventListener('click', function () {
          var at = activeChips.indexOf(p.id);
          if (at >= 0) activeChips.splice(at, 1); else activeChips.push(p.id);
          if (activeChips.length) sel = applyPresets(records, presets, activeChips); else selectAll(sel, true);
          refreshAll();
        });
        chipEls[p.id] = b;
        row.appendChild(b);
      });
      box.appendChild(row);
    });
  }

  // ----- toggles -----
  var toggles = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', margin: '8px 0', fontSize: '12px' } });
  function addToggle(key, text, n, on) {
    if (!n) return;
    var lab = h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' } });
    var cb = h('input', { type: 'checkbox', attrs: { 'data-filter': key } });
    cb.checked = on;
    cb.addEventListener('change', function () { filters[key] = cb.checked; mask = eligibleMask(records, filters); refreshAll(); });
    lab.appendChild(cb);
    lab.appendChild(h('span', { text: text + ' (' + fmtN(n) + ')' }));
    toggles.appendChild(lab);
  }
  addToggle('skipSuspended', 'Skip suspended notes', counts.suspended, filters.skipSuspended);
  addToggle('skipBuried', 'Skip buried notes', counts.buried, filters.skipBuried);
  addToggle('onlyExtra', 'Only notes with extra fields', counts.extra, filters.onlyExtra);
  if (toggles.childNodes.length) box.appendChild(toggles);

  // ----- tag tree -----
  var hasTree = tree.root.kids.length > 0;
  var searchEl = null;
  var treeEl = h('div', { attrs: { role: 'tree', 'aria-label': 'Tags' }, style: { maxHeight: '320px', overflowY: 'auto', border: '1px solid ' + C.line, borderRadius: '8px', padding: '6px', marginTop: '6px', fontSize: '12px' } });
  var bar = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' } });
  if (hasTree) {
    searchEl = h('input', { type: 'search', attrs: { placeholder: 'Search tags…', 'aria-label': 'Search tags' }, style: { flex: '1', minWidth: '120px', padding: '6px 8px', borderRadius: '8px', background: 'rgba(20,10,50,.6)', color: 'var(--text-primary, #fff)', border: '1px solid ' + C.line, fontSize: '12px' } });
    var tmr = null;
    searchEl.addEventListener('input', function () {
      clearTimeout(tmr);
      tmr = setTimeout(function () { query = searchEl.value; renderTree(); refreshSummary(); }, 200);
    });
    bar.appendChild(searchEl);
  }
  var allBtn = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Select all' });
  var noneBtn = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Select none' });
  var matchBtn = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Select matches', style: { display: 'none' } });
  allBtn.addEventListener('click', function () { selectAll(sel, true); activeChips = []; refreshAll(); });
  noneBtn.addEventListener('click', function () { selectAll(sel, false); activeChips = []; refreshAll(); });
  matchBtn.addEventListener('click', function () {
    var found = searchTree(tree, query).matched;
    selectAll(sel, false);
    found.forEach(function (n) { setIds(sel, n.ids, true); });
    activeChips = [];
    refreshAll();
  });
  bar.appendChild(allBtn); bar.appendChild(noneBtn); bar.appendChild(matchBtn);
  box.appendChild(bar);
  if (!hasTree) box.appendChild(h('div', { text: 'This file has no tags, so everything is imported together.', style: { fontSize: '11px', color: C.muted, marginTop: '6px' } }));
  else box.appendChild(treeEl);

  function checkRow(ids, label, count, depth, expandable, path, isOpen) {
    var st = stateOf(ids, sel, mask);
    var row = h('div', { attrs: { role: 'treeitem', 'aria-level': String(depth + 1) }, style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 2px 3px ' + (depth * 14) + 'px', opacity: st.total === 0 ? '0.45' : '1' } });
    if (expandable) row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    var tw = h('button', { type: 'button', text: expandable ? (isOpen ? '▾' : '▸') : '', attrs: { 'aria-label': expandable ? (isOpen ? 'Collapse ' : 'Expand ') + label : '', tabindex: expandable ? '0' : '-1' }, style: { width: '22px', height: '22px', background: 'none', border: 'none', color: 'inherit', cursor: expandable ? 'pointer' : 'default', padding: '0', flex: 'none' } });
    if (expandable) tw.addEventListener('click', function () { expanded[path] = !isOpen; renderTree(); });
    var cb = h('input', { type: 'checkbox', attrs: { 'aria-label': label } });
    cb.checked = st.state === 'all';
    cb.indeterminate = st.state === 'some';
    cb.addEventListener('change', function () {
      var now = stateOf(ids, sel, mask).state;
      setIds(sel, ids, now !== 'all');
      activeChips = [];
      refreshAll();
    });
    var name = h('span', { text: label, style: { flex: '1', overflowWrap: 'anywhere', cursor: 'pointer' } });
    name.addEventListener('click', function () { cb.click(); });
    var cnt = h('span', { text: fmtN(st.total), style: { color: C.muted, flex: 'none', fontVariantNumeric: 'tabular-nums' } });
    row.appendChild(tw); row.appendChild(cb); row.appendChild(name); row.appendChild(cnt);
    rowRefs.push({ ids: ids, cb: cb, cnt: cnt, row: row });
    return row;
  }

  function renderTree() {
    if (!hasTree) return;
    rowRefs = [];
    while (treeEl.firstChild) treeEl.removeChild(treeEl.firstChild);
    var found = searchTree(tree, query);
    matchBtn.style.display = query.trim() ? '' : 'none';
    var rendered = 0;
    if (tree.untagged.length && !query.trim()) treeEl.appendChild(checkRow(tree.untagged, UNTAGGED, tree.untagged.length, 0, false, '', false));
    function level(nodes, depth, parent) {
      var shown = 0;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (found.keep && !found.keep[n.path]) continue;
        if (shown >= MAX_ROWS_PER_LEVEL) {
          var more = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Show more (' + (nodes.length - i) + ' left)', style: { margin: '2px 0 2px ' + (depth * 14 + 28) + 'px' } });
          more.addEventListener('click', function () { MAX_ROWS_PER_LEVEL += 150; renderTree(); });
          parent.appendChild(more);
          break;
        }
        shown++; rendered++;
        var open = !!expanded[n.path] || (!!found.keep && n.kids.length > 0 && n.kids.some(function (k) { return found.keep[k.path]; }));
        parent.appendChild(checkRow(n.ids, n.name, n.ids.length, depth, n.kids.length > 0, n.path, open));
        if (open && n.kids.length) level(n.kids, depth + 1, parent);
      }
    }
    level(tree.root.kids, 0, treeEl);
    if (!rendered && query.trim()) treeEl.appendChild(h('div', { text: 'No tag matches "' + query.trim() + '".', style: { color: C.muted, padding: '6px' } }));
  }

  // ----- footer: live count, storage, import -----
  var summary = h('div', { attrs: { 'aria-live': 'polite' }, style: { marginTop: '10px', fontSize: '13px', fontWeight: '700' } });
  var detail = h('div', { style: { fontSize: '11px', color: C.muted, lineHeight: '1.5', marginTop: '2px' } });
  var limitRow = h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11px', color: C.muted } });
  var limitSel = h('select', { attrs: { 'aria-label': 'How many cards My Cards may hold' }, style: { padding: '3px 6px', borderRadius: '6px', background: 'rgba(20,10,50,.6)', color: 'var(--text-primary, #fff)', border: '1px solid ' + C.line, fontSize: '11px' } });
  [5000, 10000, 20000, 50000].filter(function (v) { return v <= store.hardLimit; }).forEach(function (v) {
    var opt = h('option', { text: fmtN(v) });
    opt.value = String(v);
    if (v === store.limit) opt.selected = true;
    limitSel.appendChild(opt);
  });
  if (!Array.prototype.some.call(limitSel.options, function (op) { return op.selected; })) {
    var cur = h('option', { text: fmtN(store.limit) }); cur.value = String(store.limit); cur.selected = true; limitSel.appendChild(cur);
  }
  limitSel.addEventListener('change', function () {
    store.limit = store.setLimit(Number(limitSel.value));
    refreshSummary();
  });
  limitRow.appendChild(h('span', { text: 'My Cards may hold up to' }));
  limitRow.appendChild(limitSel);
  limitRow.appendChild(h('span', { text: 'cards. Bigger limits use more of your browser’s storage (about 5 MB in total).' }));

  var progress = h('progress', { attrs: { max: '100', value: '0', 'aria-label': 'Import progress' }, style: { width: '100%', marginTop: '8px', display: 'none' } });
  var importBtn = h('button', { type: 'button', className: 'btn btn-primary btn-block', text: 'Import', style: { marginTop: '8px' }, attrs: { 'data-role': 'filter-import' } });
  var closeBtn = h('button', { type: 'button', className: 'btn btn-outline btn-block', text: 'Cancel', style: { marginTop: '6px' } });
  var resultEl = h('div', { attrs: { role: 'status' }, style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.5' } });
  box.appendChild(summary); box.appendChild(detail); box.appendChild(limitRow); box.appendChild(progress); box.appendChild(importBtn); box.appendChild(closeBtn); box.appendChild(resultEl);
  host.appendChild(box);

  function chosenRecords() { return chosenIds(sel, mask).map(function (i) { return records[i]; }); }

  function refreshSummary() {
    var picked = chosenRecords();
    var fresh = 0;
    var bytes = 0;
    for (var i = 0; i < picked.length; i++) {
      if (!store.keys[picked[i].key]) { fresh++; bytes += estimateBytes(picked[i]); }
    }
    var updates = picked.length - fresh;
    var free = Math.max(0, store.limit - store.count);
    summary.textContent = fmtN(picked.length) + ' card' + (picked.length === 1 ? '' : 's') + ' will be imported';
    var lines = [];
    if (updates) lines.push(fmtN(updates) + ' ' + (updates === 1 ? 'is' : 'are') + ' already in My Cards and will be refreshed, not duplicated.');
    lines.push('About ' + fmtMB(bytes) + ' of storage for the new ones.');
    var problem = '';
    if (fresh > free) problem = 'My Cards has room for ' + fmtN(free) + ' more at the current limit, so ' + fmtN(fresh - free) + ' would be left out. Narrow the filter or raise the limit below.';
    else if (store.bytes + bytes > WARN_BYTES) problem = 'This is close to the size your browser can store (about 5 MB). If saving fails nothing is changed; import a smaller part first.';
    detail.textContent = lines.join(' ');
    if (problem) { var p = h('div', { text: problem, style: { color: C.gold, marginTop: '2px' } }); detail.appendChild(p); }
    importBtn.textContent = picked.length ? 'Import ' + fmtN(Math.min(picked.length, fresh > free ? free + updates : picked.length)) + ' card' + (picked.length === 1 ? '' : 's') : 'Nothing selected';
    importBtn.disabled = busy || picked.length === 0;
    return picked;
  }

  function updateRows() {
    rowRefs.forEach(function (r) {
      var st = stateOf(r.ids, sel, mask);
      r.cb.checked = st.state === 'all';
      r.cb.indeterminate = st.state === 'some';
      r.cnt.textContent = fmtN(st.total);
      r.row.style.opacity = st.total === 0 ? '0.45' : '1';
    });
  }

  function refreshAll() {
    Object.keys(chipEls).forEach(function (id) { chipEls[id].setAttribute('aria-pressed', activeChips.indexOf(id) >= 0 ? 'true' : 'false'); chipEls[id].style.borderColor = activeChips.indexOf(id) >= 0 ? C.green : ''; });
    updateRows();
    refreshSummary();
  }

  importBtn.addEventListener('click', async function () {
    if (busy) return;
    var picked = chosenRecords();
    if (!picked.length) return;
    busy = true;
    importBtn.disabled = true;
    progress.style.display = '';
    progress.value = 0;
    resultEl.textContent = '';
    try {
      var res = await o.onImport(picked, {
        onProgress: function (done, total) { if (!destroyed) progress.value = total ? Math.round(done / total * 100) : 100; }
      });
      if (destroyed) return;
      progress.value = 100;
      var parts = [];
      if (res.imported) parts.push(fmtN(res.imported) + ' new');
      if (res.updated) parts.push(fmtN(res.updated) + ' refreshed');
      if (res.unchanged) parts.push(fmtN(res.unchanged) + ' already up to date');
      if (res.rejected) parts.push(fmtN(res.rejected) + ' skipped');
      resultEl.style.color = (res.imported || res.updated) && res.saved !== false ? C.green : C.red;
      resultEl.textContent = (parts.length ? parts.join(', ') + '. ' : '') + (res.warnings && res.warnings[0] ? res.warnings[0] : ((res.imported || res.updated) ? 'Find them in Flashcard mode; tags show on each card.' : ''));
    } catch (e) {
      resultEl.style.color = C.red;
      resultEl.textContent = 'Something went wrong: ' + (e && e.message ? e.message : String(e));
    } finally {
      busy = false;
      importBtn.disabled = false;
      refreshSummary();
    }
  });
  closeBtn.addEventListener('click', function () { if (o.onClose) o.onClose(); });

  // the selected deck's top level starts open so the tree is not a single closed line
  if (tree.root.kids.length === 1) expanded[tree.root.kids[0].path] = true;
  renderTree();
  refreshAll();

  return {
    destroy: function () { destroyed = true; while (host.firstChild) host.removeChild(host.firstChild); },
    getState: function () { return { selected: chosenIds(sel, mask).length, total: records.length, chips: activeChips.slice(), filters: Object.assign({}, filters) }; }
  };
}
