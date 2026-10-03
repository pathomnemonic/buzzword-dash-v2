import { describe, it, expect, vi } from 'vitest';
import { game } from '../../js/game/engine.js';
const Game = { prototype: Object.getPrototypeOf(game) };
import { GAME_STATES } from '../../js/game/enginedefs.js';

/** Time spent paused is not play time: it must not earn the "30 minutes played" badge or make an answer look slow. */
describe('pausing', () => {
  function fake() {
    const g = {
      _state: GAME_STATES.PLAYING, encounterStartTime: 1000, _pausedAt: 0, _pausedTotalMs: 0,
      _transition(s) { this._state = s; }, _showPauseOverlay() {}, _sfx() {}
    };
    return g;
  }

  it('does not count the time away towards the time to answer', () => {
    const g = fake();
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(5000);
    Game.prototype.pause.call(g, 'user');
    now.mockReturnValue(65000); // a minute later
    Game.prototype.resume.call(g, 'user');
    expect(g._pausedTotalMs).toBe(60000);
    expect(g.encounterStartTime).toBe(61000); // the question's clock stood still while paused
    now.mockRestore();
  });

  it('adds up several pauses', () => {
    const g = fake();
    const now = vi.spyOn(performance, 'now');
    for (const [a, b] of [[1000, 4000], [10000, 12000]]) {
      now.mockReturnValue(a); Game.prototype.pause.call(g, 'user');
      now.mockReturnValue(b); Game.prototype.resume.call(g, 'user');
    }
    expect(g._pausedTotalMs).toBe(5000);
    now.mockRestore();
  });
});
