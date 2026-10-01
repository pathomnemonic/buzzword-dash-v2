import { describe, it, expect } from 'vitest';
import { daypartOf, seasonOf, pickTheme, applyTheme, managedVariables } from '../../js/theme.js';

describe('theme by time and season', () => {
  it('knows the time of day', () => {
    expect(daypartOf(4)).toBe('night');
    expect(daypartOf(5)).toBe('dawn');
    expect(daypartOf(8)).toBe('dawn');
    expect(daypartOf(9)).toBe('day');
    expect(daypartOf(16)).toBe('day');
    expect(daypartOf(17)).toBe('dusk');
    expect(daypartOf(19)).toBe('dusk');
    expect(daypartOf(20)).toBe('night');
    expect(daypartOf(23)).toBe('night');
    expect(daypartOf(0)).toBe('night');
  });

  it('knows the season', () => {
    expect([12, 1, 2].map(seasonOf)).toEqual(['winter', 'winter', 'winter']);
    expect([3, 4, 5].map(seasonOf)).toEqual(['spring', 'spring', 'spring']);
    expect([6, 7, 8].map(seasonOf)).toEqual(['summer', 'summer', 'summer']);
    expect([9, 10, 11].map(seasonOf)).toEqual(['autumn', 'autumn', 'autumn']);
  });

  it('looks different at different hours and in different seasons', () => {
    const a = pickTheme(new Date(2026, 6, 10, 12), 'auto');   // July noon
    const b = pickTheme(new Date(2026, 6, 10, 22), 'auto');   // July night
    const c = pickTheme(new Date(2026, 0, 10, 12), 'auto');   // January noon
    expect(a.daypart).toBe('day');
    expect(a.vars['--screen-top']).toBeDefined();
    expect(b.vars['--screen-top']).toBeUndefined();           // night is the classic look
    expect(a.vars['--accent-pink']).not.toBe(c.vars['--accent-pink']); // summer vs winter highlights
    expect(a.emoji).toBe('☀️');
    expect(c.emoji).toBe('❄️');
  });

  it('has short holiday looks that win over the season', () => {
    const h = pickTheme(new Date(2026, 9, 31, 21), 'auto');
    expect(h.holiday).toBe('halloween');
    expect(h.emoji).toBe('🎃');
    const x = pickTheme(new Date(2026, 11, 20, 12), 'auto');
    expect(x.holiday).toBe('winter-holidays');
    expect(pickTheme(new Date(2026, 9, 10, 12), 'auto').holiday).toBeNull();
    expect(pickTheme(new Date(2026, 9, 23, 12), 'auto').holiday).toBeNull();
  });

  it('classic mode changes nothing', () => {
    const t = pickTheme(new Date(2026, 6, 10, 12), 'classic');
    expect(t.vars).toEqual({});
    expect(t.emoji).toBe('');
  });

  it('only sets variables the page expects, and applying twice leaves no leftovers', () => {
    const root = document.documentElement;
    applyTheme(root, pickTheme(new Date(2026, 6, 10, 12), 'auto'));
    expect(root.style.getPropertyValue('--screen-top')).toBe('#2a5fd0');
    expect(root.getAttribute('data-daypart')).toBe('day');
    expect(root.getAttribute('data-season')).toBe('summer');
    applyTheme(root, pickTheme(new Date(2026, 6, 10, 22), 'auto')); // night: the day colors must go
    expect(root.style.getPropertyValue('--screen-top')).toBe('');
    expect(root.style.getPropertyValue('--accent-pink')).not.toBe('');
    applyTheme(root, pickTheme(new Date(2026, 6, 10, 22), 'classic'));
    managedVariables().forEach((k) => expect(root.style.getPropertyValue(k)).toBe(''));
    expect(root.getAttribute('data-holiday')).toBeNull();
  });
});
