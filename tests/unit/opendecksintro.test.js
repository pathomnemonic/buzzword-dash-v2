import { describe, it, expect } from 'vitest';
import { OPEN_DECKS_INTRO } from '../../js/importguide.js';

describe('Open decks intro blurb', () => {
  var why = OPEN_DECKS_INTRO.why.join(' ');
  var own = OPEN_DECKS_INTRO.ownSteps.join(' ');
  it('explains the licence reasoning', () => {
    expect(why).toMatch(/open licence/);
    expect(why).toMatch(/no account/);
    expect(why).toMatch(/AnKing/);
    expect(why).toMatch(/personal use only/);
    expect(why).toMatch(/community datasets/);
    expect(why).toMatch(/source and licence/);
    expect(why).toMatch(/None of them is checked for exam accuracy/);
  });
  it('lists the add-your-own steps', () => {
    expect(OPEN_DECKS_INTRO.ownSteps.length).toBeGreaterThanOrEqual(3);
    expect(own).toMatch(/\.apkg/);
    expect(own).toMatch(/Choose file/);
    expect(own).toMatch(/Filter by tags/);
    expect(own).toMatch(/stay on your device/);
    expect(own).toMatch(/AI helper/);
  });
  it('stays short (about 8 lines)', () => {
    expect(OPEN_DECKS_INTRO.why.length + OPEN_DECKS_INTRO.ownSteps.length).toBeLessThanOrEqual(9);
  });
});
