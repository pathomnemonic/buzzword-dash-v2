import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Every button in index.html must have something listening to it. This catches the
// "button looks fine but does nothing" kind of bug before it ships.

const html = readFileSync('index.html', 'utf8');

function jsFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'cards') out.push(...jsFiles(dir + '/' + e.name)); } else if (e.name.endsWith('.js')) out.push(dir + '/' + e.name);
  }
  return out;
}
const sources = jsFiles('js').map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

/** Buttons in the page that carry an id. */
const buttonIds = [...html.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);

function isWired(id) {
  for (const { text } of sources) {
    const re = new RegExp("getElementById\\('" + id + "'\\)|querySelector\\('#" + id + "'\\)", 'g');
    let m;
    while ((m = re.exec(text))) {
      const tail = text.slice(m.index, m.index + 160);
      // getElementById('x').addEventListener(...) / .onclick = ...
      if (/^[^;]*?\)\s*\.(addEventListener|onclick)\b/.test(tail)) return true;
      // var name = document.getElementById('x'); ... name.addEventListener / name.onclick
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const line = text.slice(lineStart, m.index);
      const v = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:document\.)?$/.exec(line);
      if (v) {
        const use = new RegExp('\\b' + v[1].replace('$', '\\$') + '\\s*\\.(addEventListener|onclick)\\b|\\b' + v[1].replace('$', '\\$') + '\\.onclick');
        if (use.test(text.slice(m.index))) return true;
      }
    }
    // replaced by a fresh copy (cloneNode) that gets the listener, so old handlers never pile up
    if (text.includes("getElementById('" + id + "')") && text.includes('.cloneNode(true)') && text.includes('replaceChild(')) return true;
    // delegated: a list of ids looped over, or the id used as a data attribute elsewhere
    if (new RegExp("\\['" + id + "'").test(text) && /addEventListener/.test(text)) return true;
  }
  return false;
}

describe('every button in the page is wired up', () => {
  it('finds the buttons', () => {
    expect(buttonIds.length).toBeGreaterThan(20);
  });

  it('has a listener for each button with an id', () => {
    const unwired = buttonIds.filter((id) => !isWired(id));
    expect(unwired).toEqual([]);
  });

  it('has a listener for each nav tab', () => {
    const tabs = [...html.matchAll(/class="nav-item[^"]*" data-screen="([^"]+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual(['screenHome', 'screenStats', 'screenShop', 'screenLeaderboard', 'screenSettings']);
    const ui = sources.find((s) => s.file.endsWith('js/ui.js')).text;
    expect(ui).toMatch(/querySelectorAll\('\.nav-item'\)\.forEach\(function \(item\) \{\s*item\.addEventListener\('click'/);
  });
});
