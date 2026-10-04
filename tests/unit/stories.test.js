import { describe, it, expect } from 'vitest';
import { STORIES, storyFor } from '../../js/stories.js';
import { CHARACTER_MODELS as AVATARS, MONSTER_MODELS as MONSTERS } from '../../js/game/modelcatalog.js';

describe('hero and monster stories', () => {
  it('every hero and monster in the Locker has a short and a long story', () => {
    const ids = AVATARS.map((a) => a.id).concat(MONSTERS.map((m) => m.id)).filter((id) => /^(avatar_(intern|m_)|monster_m_)/.test(id));
    expect(ids.length).toBeGreaterThanOrEqual(22);
    ids.forEach((id) => {
      const s = storyFor(id);
      expect(s, id).toBeTruthy();
      expect(s.short.length, id).toBeGreaterThan(10);
      expect(s.long.length, id).toBeGreaterThan(s.short.length);
    });
  });
  it('no story belongs to an item that does not exist', () => {
    const all = new Set(AVATARS.map((a) => a.id).concat(MONSTERS.map((m) => m.id)));
    Object.keys(STORIES).forEach((id) => expect(all.has(id), id).toBe(true));
  });
});
