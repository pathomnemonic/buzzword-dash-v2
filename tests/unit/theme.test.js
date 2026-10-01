import { describe, it, expect } from 'vitest';
import {
  daypartOf, seasonOf, pickTheme, applyTheme, managedVariables, paletteFor, contrast, worldIds, THEME_CHOICES
} from '../../js/theme.js';

const DAYPARTS = ['dawn', 'day', 'dusk', 'night'];

describe('theme by time and season', () => {
  it('knows the time of day', () => {
    expect([4, 5, 8, 9, 16, 17, 19, 20, 23, 0].map(daypartOf)).toEqual(
      ['night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night', 'night']);
  });

  it('knows the season', () => {
    expect([12, 1, 2].map(seasonOf)).toEqual(['winter', 'winter', 'winter']);
    expect([3, 4, 5].map(seasonOf)).toEqual(['spring', 'spring', 'spring']);
    expect([6, 7, 8].map(seasonOf)).toEqual(['summer', 'summer', 'summer']);
    expect([9, 10, 11].map(seasonOf)).toEqual(['autumn', 'autumn', 'autumn']);
  });

  it('picks the world from the date, with holidays winning over the season', () => {
    expect(pickTheme(new Date(2026, 6, 10, 12), 'auto').world).toBe('summer');
    expect(pickTheme(new Date(2026, 0, 10, 12), 'auto').world).toBe('winter');
    expect(pickTheme(new Date(2026, 9, 31, 21), 'auto').world).toBe('halloween');
    expect(pickTheme(new Date(2026, 9, 23, 12), 'auto').world).toBe('autumn');
    expect(pickTheme(new Date(2026, 11, 20, 12), 'auto').world).toBe('holidays');
    expect(pickTheme(new Date(2026, 6, 10, 12), 'auto').name).toBe('Summer day');
  });

  it('lets the player pick a world by hand, and Classic changes nothing', () => {
    const t = pickTheme(new Date(2026, 6, 10, 22), 'autumn');
    expect(t.world).toBe('autumn');
    expect(t.daypart).toBe('night');
    expect(Object.keys(t.vars).length).toBeGreaterThan(20);
    const c = pickTheme(new Date(2026, 6, 10, 12), 'classic');
    expect(c.vars).toEqual({});
    expect(THEME_CHOICES.map((x) => x[0])).toEqual(['auto', 'classic', ...worldIds()]);
  });
});

describe('the palettes are different worlds, and stay readable', () => {
  it('looks radically different between worlds and between times of day', () => {
    const summerDay = paletteFor('summer', 'day');
    const winterDay = paletteFor('winter', 'day');
    const summerNight = paletteFor('summer', 'night');
    expect(summerDay['--screen-top']).not.toBe(winterDay['--screen-top']);
    expect(summerDay['--accent-pink']).not.toBe(winterDay['--accent-pink']);
    expect(summerDay['--screen-top']).not.toBe(summerNight['--screen-top']);
    // every world and time of day has its own backdrop
    const tops = new Set();
    worldIds().forEach((w) => DAYPARTS.forEach((d) => tops.add(paletteFor(w, d)['--screen-top'])));
    expect(tops.size).toBe(worldIds().length * DAYPARTS.length);
  });

  it('keeps white text readable on every panel and button color', () => {
    const failures = [];
    worldIds().forEach((w) => DAYPARTS.forEach((d) => {
      const p = paletteFor(w, d);
      ['--panel', '--panel-2', '--alt-a', '--alt-b', '--alt-hi', '--deep'].forEach((k) => {
        const ratio = contrast('#ffffff', p[k]);
        if (ratio < 4.5) failures.push(w + ' ' + d + ' ' + k + ' ' + ratio.toFixed(2));
      });
      // text sits on the backdrop with a dark outline: a lower bar is enough
      ['--screen-top', '--screen-bottom'].forEach((k) => {
        const ratio = contrast('#ffffff', p[k]);
        if (ratio < 3) failures.push(w + ' ' + d + ' ' + k + ' ' + ratio.toFixed(2));
      });
    }));
    expect(failures).toEqual([]);
  });

  it('keeps dark outline text readable on the bright tiles and answer lanes', () => {
    const failures = [];
    worldIds().forEach((w) => DAYPARTS.forEach((d) => {
      const p = paletteFor(w, d);
      ['--lane-1', '--lane-2', '--lane-3'].forEach((k) => {
        const ratio = contrast(p['--ink'], p[k]);
        if (ratio < 7) failures.push(w + ' ' + d + ' ' + k + ' ' + ratio.toFixed(2));
      });
    }));
    expect(failures).toEqual([]);
  });

  it('applying a theme sets variables and the decor layer, and leaves nothing behind', () => {
    document.body.innerHTML = '<div id="bgDecor"></div>';
    const root = document.documentElement;
    applyTheme(root, pickTheme(new Date(2026, 0, 10, 12), 'auto'));
    expect(root.style.getPropertyValue('--screen-top')).toMatch(/^#[0-9a-f]{6}$/);
    expect(root.getAttribute('data-world')).toBe('winter');
    const layer = document.getElementById('bgDecor');
    expect(layer.children.length).toBe(16);
    expect(layer.getAttribute('data-motion')).toBe('fall');
    expect(layer.textContent).toContain('❄');
    applyTheme(root, pickTheme(new Date(2026, 6, 10, 12), 'auto'));
    expect(layer.getAttribute('data-motion')).toBe('float');
    expect(layer.textContent).toContain('☀');
    applyTheme(root, pickTheme(new Date(2026, 6, 10, 12), 'classic'));
    managedVariables().forEach((k) => expect(root.style.getPropertyValue(k)).toBe(''));
    expect(layer.children.length).toBe(0);
  });
});
