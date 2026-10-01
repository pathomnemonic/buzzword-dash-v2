import { describe, it, expect } from 'vitest';
import { nextTab, isTabSwipe } from '../../js/tabswipe.js';

const ORDER = ['screenStats', 'screenShop', 'screenHome', 'screenQuests', 'screenProfile'];

describe('swiping between tabs', () => {
  it('a swipe left goes to the next tab and a swipe right to the previous one', () => {
    expect(nextTab(ORDER, 'screenHome', -100)).toBe('screenQuests');
    expect(nextTab(ORDER, 'screenHome', 100)).toBe('screenShop');
  });
  it('stops at the ends and ignores screens that are not tabs', () => {
    expect(nextTab(ORDER, 'screenProfile', -100)).toBeNull();
    expect(nextTab(ORDER, 'screenStats', 100)).toBeNull();
    expect(nextTab(ORDER, 'screenSettings', -100)).toBeNull();
  });
  it('only a long, mostly sideways, quick drag counts', () => {
    expect(isTabSwipe(-120, 10, 200)).toBe(true);
    expect(isTabSwipe(-30, 0, 100)).toBe(false);      // too short
    expect(isTabSwipe(-120, 100, 200)).toBe(false);   // a scroll
    expect(isTabSwipe(-120, 10, 2000)).toBe(false);   // a slow drag
  });
});
