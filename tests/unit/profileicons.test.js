import { describe, it, expect } from 'vitest';
import { ICON_GROUPS, allIcons, iconFor, iconId } from '../../js/profileicons.js';
import { cornerInitial } from '../../js/profilecorner.js';

describe('profile symbols', () => {
  it('offers lots of choices with no duplicates', () => {
    const all = allIcons();
    expect(all.length).toBeGreaterThanOrEqual(80);
    expect(new Set(all).size).toBe(all.length);
    expect(ICON_GROUPS.length).toBeGreaterThanOrEqual(5);
  });
  it('round-trips a choice, and old character ids keep their symbol', () => {
    expect(iconFor(iconId('🦊'))).toBe('🦊');
    expect(iconFor('avatar_intern')).toBe('🩺');
    expect(iconFor('avatar_nobody_knows')).toBe('👤');
    expect(iconFor(undefined)).toBe('👤');
    expect(iconFor('icon:' + 'x'.repeat(40))).toBe('👤');
  });
  it('stays within the 64 characters the server allows', () => {
    allIcons().forEach((i) => expect(iconId(i).length).toBeLessThanOrEqual(64));
  });
  it('the corner button shows the chosen symbol', () => {
    expect(cornerInitial(null, '', iconId('🦊'))).toBe('🦊');
    expect(cornerInitial({ email: 'a@b.co', anonymous: false }, 'Zed', iconId('🦊'))).toBe('🦊');
    expect(cornerInitial({ email: 'a@b.co', anonymous: false }, 'Zed')).toBe('Z');
  });
});
