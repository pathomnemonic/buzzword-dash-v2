/**
 * opendecksui.js — the "Open decks" list in the importer: a short "why these decks / add your own" blurb, one row per
 * deck (title, cards, size, source, licence) with Add / Update / Remove, an optional "pick topics" step that reuses the
 * tag-filter panel, and the credits that CC BY asks us to show. Everything shown comes from our own static files, but it
 * is still only put on the page with textContent.
 */

import { loadIndex, addDeck, getDeck, deckRecords, removeDeck, installed, credits, fmtSize, OPEN_DECKS_INTRO } from './opendecks.js';
import { renderFilterPanel } from './ankifilterui.js';

var C = {
  muted: 'var(--text-secondary, #aaa)',
  gold: 'var(--accent-gold, #ffd54f)',
  green: 'var(--accent-green, #44ff88)',
  red: 'var(--accent-red, #ff4466)',
  line: 'rgba(187,102,255,.25)'
};
var INTRO_KEY = 'dx_opendecks_intro_closed';

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

function introClosed() { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return false; } }
function rememberIntro(closed) { try { localStorage.setItem(INTRO_KEY, closed ? '1' : '0'); } catch (e) { /* not remembered: it simply opens again */ } }

/**
 * @param {HTMLElement} host emptied and filled
 * @param {{customCards: object, fetchFn?: function, toast?: function(string), openExternal?: function(string), storeInfo?: function(): object, scrollToImporter?: function(): void}} o
 * @returns {{destroy: function(): void, refresh: function(): Promise<void>}}
 */
export function renderOpenDecks(host, o) {
  var fetchFn = o.fetchFn || function (u, init) { return fetch(u, init); };
  var open = o.openExternal || function (u) { window.open(u, '_blank', 'noopener,noreferrer'); };
  var destroyed = false;
  var decks = [];
  var busy = null; // {id, cancel: bool}
  var panel = null;
  while (host.firstChild) host.removeChild(host.firstChild);

  var root = h('div', { className: 'open-decks', style: { margin: '10px 0 16px' } });
  root.appendChild(h('h5', { text: '🎁 Open decks', style: { margin: '4px 0' } }));

  // ----- why these decks / add your own (a native <details>, open the first time) -----
  var intro = document.createElement('details');
  intro.className = 'open-decks-intro import-howto';
  intro.style.cssText = 'border:1px solid ' + C.line + ';border-radius:10px;padding:6px 10px;margin:6px 0';
  if (!introClosed()) intro.open = true;
  intro.addEventListener('toggle', function () { rememberIntro(!intro.open); });
  intro.appendChild(h('summary', { text: OPEN_DECKS_INTRO.whyTitle + ' / ' + OPEN_DECKS_INTRO.ownTitle, style: { cursor: 'pointer', fontWeight: '600', fontSize: '13px' } }));
  var why = h('div', { style: { fontSize: '11px', lineHeight: '1.5', color: C.muted, margin: '6px 0' } });
  why.appendChild(h('strong', { text: OPEN_DECKS_INTRO.whyTitle, style: { color: 'var(--text-primary, #fff)' } }));
  var whyList = h('ul', { style: { margin: '3px 0 6px', paddingLeft: '16px' } });
  OPEN_DECKS_INTRO.why.forEach(function (t) { whyList.appendChild(h('li', { text: t })); });
  why.appendChild(whyList);
  why.appendChild(h('strong', { text: OPEN_DECKS_INTRO.ownTitle, style: { color: 'var(--text-primary, #fff)' } }));
  var own = h('ol', { style: { margin: '3px 0 4px', paddingLeft: '18px' } });
  OPEN_DECKS_INTRO.ownSteps.forEach(function (t) { own.appendChild(h('li', { text: t })); });
  why.appendChild(own);
  var jump = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Go to the importer', attrs: { 'data-role': 'od-jump' } });
  jump.addEventListener('click', function () { if (o.scrollToImporter) o.scrollToImporter(); });
  why.appendChild(jump);
  intro.appendChild(why);
  root.appendChild(intro);

  var listEl = h('div', { attrs: { 'data-role': 'od-list' }, style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0' } });
  var statusEl = h('div', { attrs: { role: 'status', 'aria-live': 'polite', 'data-role': 'od-status' }, style: { fontSize: '12px', lineHeight: '1.5', minHeight: '16px', color: C.muted } });
  var panelHost = h('div', { attrs: { 'data-role': 'od-panel' } });
  var creditsEl = document.createElement('details');
  creditsEl.className = 'open-decks-credits import-howto';
  creditsEl.style.cssText = 'margin:8px 0';
  root.appendChild(listEl);
  root.appendChild(statusEl);
  root.appendChild(panelHost);
  root.appendChild(creditsEl);
  host.appendChild(root);

  function say(text, color) { statusEl.textContent = text || ''; statusEl.style.color = color || C.muted; }

  function renderCredits() {
    while (creditsEl.firstChild) creditsEl.removeChild(creditsEl.firstChild);
    creditsEl.appendChild(h('summary', { text: 'Open decks credits', style: { cursor: 'pointer', fontSize: '12px', fontWeight: '600' }, attrs: { 'data-role': 'od-credits-summary' } }));
    var body = h('div', { style: { fontSize: '11px', lineHeight: '1.5', color: C.muted, margin: '6px 0' } });
    body.appendChild(h('p', { text: 'Each deck below is used under the licence shown, which asks us to credit the authors. Dx Dash adds quiz questions written by an AI from the text; the originals are not changed. The decks are not reviewed by a clinician.', style: { margin: '0 0 6px' } }));
    var cs = credits(decks);
    if (!cs.length) body.appendChild(h('p', { text: 'The credits appear here once the list of decks has loaded.' }));
    cs.forEach(function (c) {
      var item = h('div', { style: { margin: '6px 0', paddingTop: '6px', borderTop: '1px solid ' + C.line } });
      item.appendChild(h('div', { text: c.title, style: { fontWeight: '700', color: 'var(--text-primary, #fff)' } }));
      item.appendChild(h('div', { text: c.attribution }));
      var links = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '3px' } });
      [['Licence: ' + c.licence.name, c.licence.url], ['Original source', c.url]].forEach(function (l) {
        var a = h('a', { text: l[0], style: { color: C.gold } });
        a.href = l[1]; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.addEventListener('click', function (ev) { ev.preventDefault(); open(l[1]); });
        links.appendChild(a);
      });
      item.appendChild(links);
      body.appendChild(item);
    });
    creditsEl.appendChild(body);
  }

  function renderList(err) {
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    if (err) {
      listEl.appendChild(h('div', { text: err, style: { color: C.red, fontSize: '12px' }, attrs: { 'data-role': 'od-error' } }));
      var retry = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Try again', attrs: { 'data-role': 'od-retry' } });
      retry.addEventListener('click', function () { refresh(); });
      listEl.appendChild(retry);
      return;
    }
    var have = installed(o.customCards);
    decks.forEach(function (d) {
      var mine = have[d.id];
      var row = h('div', { className: 'open-deck', attrs: { 'data-deck': d.id }, style: { border: '1px solid ' + C.line, borderRadius: '10px', padding: '8px 10px' } });
      row.appendChild(h('div', { text: d.title, style: { fontWeight: '700', fontSize: '13px' } }));
      row.appendChild(h('div', { text: d.count + (d.count === 1 ? ' card' : ' cards') + ' · ' + fmtSize(d.size) + ' · ' + d.source, style: { fontSize: '11px', color: C.muted, lineHeight: '1.4' }, attrs: { 'data-role': 'od-meta' } }));
      var lic = h('div', { style: { fontSize: '11px', color: C.muted, lineHeight: '1.4' } });
      lic.appendChild(document.createTextNode('Licence: '));
      var la = h('a', { text: d.licence.name, style: { color: C.gold } });
      la.href = d.licence.url; la.target = '_blank'; la.rel = 'noopener noreferrer';
      la.addEventListener('click', function (ev) { ev.preventDefault(); open(d.licence.url); });
      lic.appendChild(la);
      row.appendChild(lic);
      if (mine) row.appendChild(h('div', { text: 'In My Cards: ' + mine.count + ' cards' + (mine.version && mine.version !== d.version ? ' (an update is available)' : ''), style: { fontSize: '11px', color: C.green, marginTop: '2px' }, attrs: { 'data-role': 'od-have' } }));
      var bar = h('progress', { attrs: { max: '100', value: '0', 'aria-label': 'Adding ' + d.title }, style: { width: '100%', marginTop: '6px', display: 'none' } });
      var label = h('div', { attrs: { 'aria-live': 'polite' }, style: { fontSize: '11px', color: C.muted, display: 'none' } });
      var btns = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } });
      var stale = mine && mine.version && mine.version !== d.version;
      var add = h('button', { type: 'button', className: 'btn btn-primary btn-sm', text: mine ? (stale ? 'Update' : 'Add again / refresh') : 'Add to my cards', attrs: { 'data-role': 'od-add' } });
      var pick = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Pick topics…', attrs: { 'data-role': 'od-pick' } });
      var cancel = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Cancel', style: { display: 'none' }, attrs: { 'data-role': 'od-cancel' } });
      var rm = h('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Remove deck', style: { display: mine ? '' : 'none' }, attrs: { 'data-role': 'od-remove' } });
      btns.appendChild(add); btns.appendChild(pick); btns.appendChild(cancel); btns.appendChild(rm);
      row.appendChild(bar); row.appendChild(label); row.appendChild(btns);
      listEl.appendChild(row);

      function setBusy(on) {
        busy = on ? { id: d.id, cancel: false } : null;
        add.disabled = pick.disabled = on; rm.disabled = on;
        cancel.style.display = on ? '' : 'none';
        bar.style.display = label.style.display = on ? '' : 'none';
        if (on) { bar.value = 0; label.textContent = 'Downloading…'; }
      }
      function progress(phase, done, total) {
        if (destroyed) return;
        var frac = total ? done / total : 1;
        bar.value = Math.round(phase === 'download' ? frac * 40 : phase === 'prepare' ? 40 + frac * 30 : 70 + frac * 30);
        label.textContent = phase === 'download' ? 'Downloading…' : phase === 'prepare' ? 'Checking cards…' : 'Saving…';
      }
      function summary(r) {
        var parts = [];
        if (r.imported) parts.push(r.imported + ' added');
        if (r.updated) parts.push(r.updated + ' updated');
        if (r.unchanged) parts.push(r.unchanged + ' already up to date');
        if (r.removed) parts.push(r.removed + ' retired');
        return parts.join(', ') + '. Find them in Flashcard mode and on the runner gates.';
      }
      cancel.addEventListener('click', function () { if (busy) { busy.cancel = true; label.textContent = 'Stopping…'; } });
      add.addEventListener('click', async function () {
        if (busy) return;
        setBusy(true); say('');
        var r = await addDeck(d, { customCards: o.customCards, fetchFn: fetchFn, onProgress: progress, isCancelled: function () { return destroyed || (busy && busy.cancel); } });
        if (destroyed) return;
        setBusy(false);
        if (r.ok) { say(d.title + ': ' + summary(r), C.green); if (o.toast) o.toast('Added ' + d.title); renderList(); }
        else say(r.error, r.cancelled ? C.gold : C.red);
      });
      rm.addEventListener('click', function () {
        if (busy) return;
        var n = removeDeck(d.id, o.customCards);
        say('Removed ' + n + ' cards from ' + d.title + '. Your own cards were not touched.', C.green);
        renderList();
      });
      pick.addEventListener('click', async function () {
        if (busy) return;
        if (panel) { panel.destroy(); panel = null; }
        setBusy(true); say('');
        var got = await getDeck(d, { fetchFn: fetchFn, onProgress: progress, isCancelled: function () { return destroyed || (busy && busy.cancel); } });
        var deck = got.deck;
        if (!deck) { setBusy(false); say(got.error, got.cancelled ? C.gold : C.red); return; }
        setBusy(false);
        if (destroyed) return;
        panel = renderFilterPanel(panelHost, {
          records: deckRecords(deck), title: d.title, store: o.storeInfo ? o.storeInfo() : undefined,
          onImport: async function (picked, io) {
            var only = new Set(picked.map(function (p) { return p.key; }));
            var r = await addDeck(d, { deck: deck, only: only, customCards: o.customCards, fetchFn: fetchFn, onProgress: function (ph, dn, tt) { io.onProgress(dn, tt, ph); }, isCancelled: io.isCancelled });
            return { imported: r.imported, updated: r.updated, unchanged: r.unchanged, rejected: r.rejected, saved: r.ok, cancelled: r.cancelled, warnings: r.ok ? [] : [r.error] };
          },
          onClose: function () { if (panel) { panel.destroy(); panel = null; } renderList(); }
        });
      });
    });
    renderCredits();
  }

  async function refresh() {
    say('Loading the list of decks…');
    var r = await loadIndex(fetchFn);
    if (destroyed) return;
    say('');
    decks = r.decks;
    renderList(r.ok ? '' : r.error);
    renderCredits();
  }
  renderCredits();
  refresh();
  return {
    refresh: refresh,
    destroy: function () { destroyed = true; if (panel) panel.destroy(); while (host.firstChild) host.removeChild(host.firstChild); }
  };
}
