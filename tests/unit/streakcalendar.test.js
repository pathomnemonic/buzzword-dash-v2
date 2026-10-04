import { describe, it, expect } from 'vitest';
import { intensityFor, buildCalendarModel, describeDay } from '../../js/streakcalendar.js';

describe('streak calendar', () => {
  it('shades a day darker the more cards were answered against the goal', () => {
    expect([0, 3, 10, 20, 40, 90].map((n) => intensityFor(n, 20))).toEqual([0, 1, 2, 3, 4, 4]);
  });
  const today = new Date(2026, 9, 14, 9, 0); // a Wednesday
  it('draws twelve full weeks ending with this one, with nothing counted in the future', () => {
    const m = buildCalendarModel({ counts: {}, correct: {}, goal: 20, today });
    expect(m.cells.length).toBe(84);
    expect(m.cells[0].date.getDay()).toBe(0);
    expect(m.cells.filter((c) => c.today).length).toBe(1);
    expect(m.cells.filter((c) => c.future).length).toBe(3);
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
