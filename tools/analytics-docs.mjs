/**
 * analytics-docs.mjs — writes docs/ANALYTICS.md from the event catalog (js/analytics/catalog.js), so the written
 * dictionary can never drift from what the app sends. `npm run analytics:docs` rewrites it; a test fails when it is stale.
 */
import { writeFileSync } from 'node:fs';
import { EVENTS, REPORTABLE_SETTINGS } from '../js/analytics/catalog.js';

var TYPE_WORDS = { n: 'number', i: 'whole number', b: 'true/false', m: 'map of name → number', sa: 'list of short text', rows: 'packed rows' };

function describeType(t) {
  var req = /!$/.test(t);
  var base = t.replace(/!$/, '');
  var word;
  if (base.indexOf('e:') === 0) word = 'one of: ' + base.slice(2).split('|').join(', ');
  else if (/^s\d*$/.test(base)) word = 'text (≤' + (base.slice(1) || 40) + ')';
  else word = TYPE_WORDS[base] || base;
  return word + (req ? ' — required' : '');
}

export function renderDictionary() {
  var groups = {};
  Object.keys(EVENTS).forEach(function (name) {
    var e = EVENTS[name];
    (groups[e[0]] = groups[e[0]] || []).push(name);
  });
  var out = [];
  out.push('# Analytics event dictionary');
  out.push('');
  out.push('_Generated from `js/analytics/catalog.js` by `npm run analytics:docs`. Do not edit by hand._');
  out.push('');
  out.push('Every event also carries (outside its properties): a unique id, the time, a sequence number, the install id and the session id, plus any experiment variants the install is in. Device, version and first/last-touch attribution are stored once per session. See [ANALYTICS-GUIDE.md](ANALYTICS-GUIDE.md) for how to use the data.');
  out.push('');
  out.push('Total events: **' + Object.keys(EVENTS).length + '**.');
  out.push('');
  Object.keys(groups).forEach(function (g) {
    out.push('## ' + g.charAt(0).toUpperCase() + g.slice(1));
    out.push('');
    groups[g].forEach(function (name) {
      var e = EVENTS[name];
      out.push('### `' + name + '`');
      out.push('');
      out.push(e[1]);
      out.push('');
      var keys = Object.keys(e[2]);
      if (!keys.length) { out.push('_No properties._'); out.push(''); return; }
      out.push('| Property | Type |');
      out.push('|---|---|');
      keys.forEach(function (k) { out.push('| `' + k + '` | ' + describeType(e[2][k]).replace(/\|/g, '\\|') + ' |'); });
      out.push('');
    });
  });
  out.push('## Settings reported by `setting_changed`');
  out.push('');
  out.push(Object.keys(REPORTABLE_SETTINGS).map(function (k) { return '`' + k + '`'; }).join(', '));
  out.push('');
  return out.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('analytics-docs.mjs')) {
  writeFileSync(new URL('../docs/ANALYTICS.md', import.meta.url), renderDictionary());
  console.log('wrote docs/ANALYTICS.md');
}
