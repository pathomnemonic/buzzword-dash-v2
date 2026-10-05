import { describe, it, expect } from 'vitest';
import { intensityFor, buildCalendarModel, describeDay } from '../../js/streakcalendar.js';

describe('streak calendar', () => {
  it('shades a day darker the more cards were answered against the goal', () => {
    expect([0, 3, 10, 20, 40, 90].map((n) => intensityFor(n, 20))).toEqual([0, 1, 2, 3, 4, 4]);
  });
  const today = new Date(2026, 9, 14, 9, 0); // a Wednesday
  it('draws at most twelve weeks ending with this one, and nothing after today', () => {
    const m = buildCalendarModel({ counts: {}, correct: {}, goal: 20, today, first: '2025-01-01' });
    expect(m.cells.length).toBe(81); // 84 minus the three days still to come
    expect(m.cells[0].date.getDay()).toBe(0);
    expect(m.cells.filter((c) => c.today).length).toBe(1);
    expect(m.cells.some((c) => c.future)).toBe(false);
    expect(m.pages).toBeGreaterThan(1);
  });
  it('a new player sees only the days they have been here: five squares on day five', () => {
    const counts = { '2026-10-10': 4, '2026-10-11': 4, '2026-10-12': 4, '2026-10-13': 4, '2026-10-14': 4 };
    const m = buildCalendarModel({ counts, goal: 20, today });
    const real = m.cells.filter((c) => !c.before);
    expect(real.length).toBe(5);
    expect(real.map((c) => c.key)).toEqual(Object.keys(counts));
    expect(m.pages).toBe(1);
    // the squares before the first day in that first week are blanks, not empty squares
    expect(m.cells.length).toBe(m.cells.filter((c) => c.before).length + 5);
  });
  it('a player who has not started yet sees one square, today', () => {
    const m = buildCalendarModel({ counts: {}, goal: 20, today });
    expect(m.cells.filter((c) => !c.before).map((c) => c.key)).toEqual(['2026-10-14']);
  });
  it('grows a week at a time to twelve rows, then pages back through older weeks', () => {
    const rowsFor = (weeksAgo) => {
      const d = new Date(today.getTime() - weeksAgo * 7 * 86400000);
      const first = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return buildCalendarModel({ counts: { [first]: 1 }, goal: 20, today, first });
    };
    expect(Math.ceil(rowsFor(3).cells.length / 7)).toBe(4);
    expect(Math.ceil(rowsFor(11).cells.length / 7)).toBe(12);
    const long = rowsFor(60);
    expect(Math.ceil(long.cells.length / 7)).toBe(12);
    expect(long.pages).toBe(6);
    const oldest = buildCalendarModel({ counts: { '2025-01-01': 1 }, goal: 20, today, first: '2025-01-01', page: 99 });
    expect(oldest.page).toBe(oldest.pages - 1);
    expect(oldest.cells.filter((c) => !c.before)[0].key).toBe('2025-01-01');
  });
  it('counts the current and best runs, goal days and totals', () => {
    const counts = { '2026-10-14': 5, '2026-10-13': 25, '2026-10-12': 20, '2026-10-10': 8, '2026-10-09': 8, '2026-10-08': 8, '2026-10-07': 8 };
    const m = buildCalendarModel({ counts, correct: { '2026-10-13': 20 }, goal: 20, today });
    expect(m.current).toBe(3);
    expect(m.best).toBe(4);
    expect(m.goalDays).toBe(2);
    expect(m.total).toBe(82);
  });
  it('keeps the run alive while today is still empty', () => {
    const m = buildCalendarModel({ counts: { '2026-10-13': 3, '2026-10-12': 3 }, goal: 20, today });
    expect(m.current).toBe(2);
  });
  it('describes a day with its count, accuracy and goal', () => {
    const m = buildCalendarModel({ counts: { '2026-10-13': 25 }, correct: { '2026-10-13': 20 }, goal: 20, today });
    const cell = m.cells.find((c) => c.key === '2026-10-13');
    expect(describeDay(cell, 20)).toMatch(/25 cards, 80% right · goal met/);
  });
});
