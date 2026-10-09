// Temporary diagnostic: prints where the Home play row sits in each browser.
import { test } from '@playwright/test';
import { openApp } from './helpers.js';

test('diag: Home play row geometry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openApp(page, '/?debug=1');
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), disp: cs.display, tr: cs.transform, anim: cs.animationName }; };
    const row = document.querySelector('.play-row');
    return {
      vw: window.innerWidth, scrollW: document.documentElement.scrollWidth,
      home: box(document.getElementById('screenHome')), layout: box(document.querySelector('.home-layout')), row: box(row),
      kids: row ? Array.from(row.children).map((c) => ({ cls: c.className, ...box(c) })) : null,
      play: box(document.querySelector('.btn-play')), speed: box(document.getElementById('speedBtn')),
      deep: Array.from(document.querySelectorAll('.play-section, .play-section *')).map((c) => { const cs = getComputedStyle(c); const r = c.getBoundingClientRect(); return { t: c.tagName + '.' + c.className, w: Math.round(r.width), sw: c.scrollWidth, pos: cs.position, wid: cs.width, minw: cs.minWidth, flex: cs.flex, ws: cs.whiteSpace, ff: cs.fontFamily.slice(0, 30), fs: cs.fontSize }; }),
      before: (() => { const cs = getComputedStyle(document.querySelector('.btn-play'), '::before'); return { w: cs.width, pos: cs.position, content: cs.content, inset: cs.inset }; })(),
      cssVars: { playSize: getComputedStyle(document.querySelector('.home-layout')).getPropertyValue('--play-size') }
    };
  });
  console.log('DIAG ' + JSON.stringify(info));
});
