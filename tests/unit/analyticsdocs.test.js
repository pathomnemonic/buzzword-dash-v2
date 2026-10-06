import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderDictionary } from '../../tools/analytics-docs.mjs';
import { parseViews, toMarkdownTable } from '../../tools/analytics-report.mjs';
import { eventNames } from '../../js/analytics/catalog.js';

describe('analytics docs and tools', function () {
  it('docs/ANALYTICS.md matches the catalog (run npm run analytics:docs)', function () {
    expect(readFileSync('docs/ANALYTICS.md', 'utf8')).toBe(renderDictionary());
  });
  it('documents every event', function () {
    var doc = readFileSync('docs/ANALYTICS.md', 'utf8');
    eventNames().forEach(function (n) { expect(doc).toContain('### `' + n + '`'); });
  });
  it('the report tool finds every view and its section', function () {
    var sql = readFileSync('database/analytics_views.sql', 'utf8');
    var views = parseViews(sql);
    var declared = (sql.match(/CREATE OR REPLACE VIEW analytics_v_[a-z0-9_]+/gi) || []).length;
    expect(views.length).toBe(declared);
    expect(views.some(function (v) { return v.name === 'analytics_v_retention' && v.section === 2; })).toBe(true);
    expect(views.filter(function (v) { return v.section > 0; }).length).toBeGreaterThan(80);
  });
  it('prints rows as a markdown table', function () {
    expect(toMarkdownTable([{ a: 1, b: 'x|y' }])).toBe('| a | b |\n|---|---|\n| 1 | x\\|y |\n');
    expect(toMarkdownTable([])).toMatch(/no rows/);
  });
  it('the guide names only views that exist', function () {
    var guide = readFileSync('docs/ANALYTICS-GUIDE.md', 'utf8');
    var names = parseViews(readFileSync('database/analytics_views.sql', 'utf8')).map(function (v) { return v.name.replace(/^analytics_v_/, ''); });
    var mentioned = (guide.match(/`([a-z_]+)`/g) || []).map(function (m) { return m.replace(/`/g, ''); });
    // names written in the question table (backticked, snake_case) that look like views must exist
    var tableLines = guide.split('\n').filter(function (l) { return /^\| /.test(l) && l.indexOf('`') >= 0; }).join(' ');
    var bad = (tableLines.match(/`([a-z_0-9]+)`/g) || []).map(function (m) { return m.replace(/`/g, ''); }).filter(function (n) { return n !== 'settings' && names.indexOf(n) < 0; });
    expect(bad).toEqual([]);
    expect(mentioned.length).toBeGreaterThan(20);
  });
});
