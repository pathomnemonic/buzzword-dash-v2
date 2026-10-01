import { describe, it, expect } from 'vitest';
import { newlyAffordable, markSeen } from '../../js/lockerdots.js';

const items = [
  { id: 'free', price: 0 },
  { id: 'cheap', price: 100 },
  { id: 'mid', price: 500 },
  { id: 'dear', price: 5000 },
  { id: 'secret', price: 50, hidden: true }
];

describe('locker dots', () => {
  it('marks only what you can afford and do not own', () => {
    expect(newlyAffordable(items, 600, [], [])).toEqual(['cheap', 'mid']);
    expect(newlyAffordable(items, 600, ['cheap'], [])).toEqual(['mid']);
    expect(newlyAffordable(items, 50, [], [])).toEqual([]);
  });

  it('never marks free or hidden items', () => {
    expect(newlyAffordable(items, 999999, [], [])).toEqual(['cheap', 'mid', 'dear']);
  });

  it('asks for attention once per item', () => {
    let seen = [];
    const first = newlyAffordable(items, 600, [], seen);
    seen = markSeen(seen, first);
    expect(newlyAffordable(items, 600, [], seen)).toEqual([]);
    // later, when more becomes affordable, only the new item gets a dot
    expect(newlyAffordable(items, 6000, [], seen)).toEqual(['dear']);
  });

  it('markSeen keeps old entries and adds new ones once', () => {
    expect(markSeen(['a'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(markSeen(undefined, ['x'])).toEqual(['x']);
  });
});
