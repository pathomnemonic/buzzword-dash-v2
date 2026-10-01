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

  it('picks the season from the date, and there are no holiday looks', () => {
    expect(pickTheme(new Date(2026, 6, 10, 12), 'auto').world).toBe('summer');
    expect(pickTheme(new Date(2026, 0, 10, 12), 'auto').world).toBe('winter');
    expect(pickTheme(new Date(2026, 9, 31, 21), 'auto').world).toBe('autumn');
    expect(pickTheme(new Date(2026, 9, 23, 12), 'auto').world).toBe('autumn');
    expect(pickTheme(new Date(2026, 11, 20, 12), 'auto').world).toBe('winter');
    expect(pickTheme(new Date(2026, 6, 10, 12), 'auto').name).toBe('Summer day');
    expect(worldIds()).toEqual(['winter', 'spring', 'summer', 'autumn']);
    // a stored choice from the removed holiday looks just means Auto
    expect(pickTheme(new Date(2026, 9, 31, 21), 'halloween').mode).toBe('auto');
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

describe('the palettes are tints of one playful look, and stay readable', () => {
  it('differs between seasons and between times of day', () => {
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

  it('every season and time of day stays in the fun grape-purple family, with the season showing in the accents', () => {
    const hue = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (!d) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    worldIds().forEach((w) => DAYPARTS.forEach((d) => {
      const p = paletteFor(w, d);
      ['--panel', '--screen-top', '--screen-bottom', '--nav-top'].forEach((k) => {
        const h = hue(p[k]);
        expect(h, w + ' ' + d + ' ' + k + ' hue ' + Math.round(h)).toBeGreaterThanOrEqual(235);
        expect(h, w + ' ' + d + ' ' + k + ' hue ' + Math.round(h)).toBeLessThanOrEqual(330);
      });
    }));
    // the seasons show in the accents: they are not the same color from one season to the next
    const pinks = new Set(worldIds().map((w) => paletteFor(w, 'day')['--accent-pink']));
    expect(pinks.size).toBe(worldIds().length);
  });

  it('applying a theme sets variables and attributes, and leaves the flying objects alone', () => {
    document.body.innerHTML = '<div id="bgDecor"><div id="bgFlyers"><span class="flyer">💊</span></div></div>';
    const root = document.documentElement;
    applyTheme(root, pickTheme(new Date(2026, 0, 10, 12), 'auto'));
    expect(root.style.getPropertyValue('--screen-top')).toMatch(/^#[0-9a-f]{6}$/);
    expect(root.getAttribute('data-world')).toBe('winter');
    expect(root.getAttribute('data-daypart')).toBe('day');
    const flyers = document.getElementById('bgFlyers');
    expect(flyers.children.length).toBe(1);
    applyTheme(root, pickTheme(new Date(2026, 6, 10, 12), 'auto'));
    expect(flyers.children.length).toBe(1);
    applyTheme(root, pickTheme(new Date(2026, 6, 10, 12), 'classic'));
    managedVariables().forEach((k) => expect(root.style.getPropertyValue(k)).toBe(''));
    expect(flyers.children.length).toBe(1);
  });
});
