/**
 * analytics-report.mjs — prints the analytics views as markdown tables, for the project owner.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=<service_role key> npm run analytics:report
 *   npm run analytics:report -- --list                  every view with its one-line description
 *   npm run analytics:report -- --view analytics_v_retention
 *   npm run analytics:report -- --section 3             one numbered section (3 = where installs come from)
 *   npm run analytics:report -- --limit 20              rows per view (default 30)
 *
 * The service key bypasses every rule and must never go into the app, the repository or a build. Keep it in your shell.
 * (No key? Paste `select * from analytics_v_daily_overview;` into the Supabase SQL editor instead.)
 */
import { readFileSync } from 'node:fs';

/** Read the views, their section and the comment line above each, from database/analytics_views.sql. */
export function parseViews(sql) {
  var out = [];
  var section = { n: 0, title: 'Building blocks' };
  var comment = '';
  String(sql).split('\n').forEach(function (line) {
    var sec = /^-- =+ (\d+)\. (.+?) =+\s*$/.exec(line);
    if (sec) { section = { n: Number(sec[1]), title: sec[2] }; comment = ''; return; }
    if (/^-- =+ BUILDING/.test(line)) { section = { n: 0, title: 'Building blocks' }; return; }
    var c = /^-- (?!=)(.+)$/.exec(line);
    if (c) { comment = c[1]; return; }
    var v = /^CREATE OR REPLACE VIEW (analytics_v_[a-z0-9_]+)/i.exec(line);
    if (v) { out.push({ name: v[1], section: section.n, sectionTitle: section.title, about: comment }); comment = ''; }
  });
  return out;
}

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Rows (objects) as a markdown table. */
export function toMarkdownTable(rows) {
  if (!rows || !rows.length) return '_no rows yet_\n';
  var cols = Object.keys(rows[0]);
  var lines = ['| ' + cols.join(' | ') + ' |', '|' + cols.map(function () { return '---'; }).join('|') + '|'];
  rows.forEach(function (r) { lines.push('| ' + cols.map(function (c) { return cell(r[c]); }).join(' | ') + ' |'); });
  return lines.join('\n') + '\n';
}

function arg(name, def) {
  var i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  var v = process.argv[i + 1];
  return v === undefined || v.indexOf('--') === 0 ? true : v;
}

async function main() {
  var views = parseViews(readFileSync(new URL('../database/analytics_views.sql', import.meta.url), 'utf8'));
  if (arg('list', false)) {
    var last = -1;
    views.forEach(function (v) {
      if (v.section !== last) { console.log('\n## ' + (v.section || '') + ' ' + v.sectionTitle); last = v.section; }
      console.log('- ' + v.name + (v.about ? ': ' + v.about : ''));
    });
    return;
  }
  var url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  var key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (the service_role key; never commit it). See --help in the file header.'); process.exit(2); }
  var only = arg('view', '');
  var section = Number(arg('section', 0)) || 0;
  var limit = Number(arg('limit', 30)) || 30;
  var picked = views.filter(function (v) { return v.section > 0 && (!only || v.name === only) && (!section || v.section === section); });
  if (only) picked = views.filter(function (v) { return v.name === only; });
  console.log('# Dx Dash analytics report\n\n_' + new Date().toISOString() + '_\n');
  var lastSection = -1;
  for (var i = 0; i < picked.length; i++) {
    var v = picked[i];
    if (v.section !== lastSection) { console.log('## ' + v.sectionTitle + '\n'); lastSection = v.section; }
    console.log('### ' + v.name.replace(/^analytics_v_/, '') + (v.about ? '\n\n' + v.about : '') + '\n');
    try {
      var res = await fetch(url + '/rest/v1/' + v.name + '?limit=' + limit, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
      if (!res.ok) { console.log('_error ' + res.status + ': ' + (await res.text()).slice(0, 200) + '_\n'); continue; }
      console.log(toMarkdownTable(await res.json()));
    } catch (e) { console.log('_could not fetch: ' + e.message + '_\n'); }
  }
}

if (process.argv[1] && process.argv[1].endsWith('analytics-report.mjs')) main();
