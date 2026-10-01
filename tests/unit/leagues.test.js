import { describe, it, expect } from 'vitest';
import { LEAGUES, getLeague, leagueIndex, leagueProgress, leagueRules, trophyDelta, describeLeagueRules } from '../../js/leagues.js';
import { POWERUP_OPTIONS } from '../../js/rules.js';

describe('leagues', () => {
  it('places trophies in the right league', () => {
    expect(getLeague(0).id).toBe('intern');
    expect(getLeague(299).id).toBe('intern');
    expect(getLeague(300).id).toBe('resident');
    expect(getLeague(5000).id).toBe('legend');
    expect(leagueIndex(-50)).toBe(0);
  });

  it('removes helpers as you climb, then speeds the track up', () => {
    const counts = LEAGUES.map((l) => l.disabled.length);
    expect(counts).toEqual([0, 1, 2, 3, 4, 5, 5]);
    // each league only adds restrictions
    LEAGUES.slice(1).forEach((l, i) => LEAGUES[i].disabled.forEach((id) => expect(l.disabled).toContain(id)));
    // the speed-up only starts once nothing is left to remove
    LEAGUES.forEach((l) => { if (l.speed > 1) expect(l.disabled).toHaveLength(5); });
    expect(LEAGUES.map((l) => l.speed)).toEqual([1, 1, 1, 1, 1, 1.05, 1.1]);
    // every name used is a real power-up
    const known = POWERUP_OPTIONS.map((p) => p.id);
    LEAGUES.forEach((l) => l.disabled.forEach((id) => expect(known).toContain(id)));
  });

  it('gives both players the rules of their average trophies', () => {
    const r = leagueRules(2800);
    expect(r.disabledPowerups).toHaveLength(5);
    expect(r.speedMultiplier).toBe(1.05);
    expect(describeLeagueRules(0)).toBe('All power-ups');
    expect(describeLeagueRules(750)).toBe('No Auto-pilot, Shield');
    expect(describeLeagueRules(3700)).toBe('No power-ups · track +10% faster');
  });

  it('reports progress to the next league', () => {
    expect(leagueProgress(150)).toMatchObject({ needed: 150, fraction: 0.5 });
    expect(leagueProgress(4000).next).toBeNull();
  });

  it('awards more for upsets and costs more for losing to weaker players', () => {
    expect(trophyDelta(1000, 1000, 'win')).toBe(20);
    expect(trophyDelta(1000, 1000, 'loss')).toBe(-20);
    expect(trophyDelta(1000, 1400, 'win')).toBeGreaterThan(trophyDelta(1000, 1000, 'win'));
    expect(trophyDelta(1000, 600, 'loss')).toBeLessThan(trophyDelta(1000, 1000, 'loss'));
    expect(trophyDelta(1000, 1000, 'draw')).toBe(0);
    expect(trophyDelta(1000, 100, 'win')).toBe(10); // never less than 10
  });

  it('never drops you out of your league', () => {
    expect(trophyDelta(305, 305, 'loss')).toBe(-5); // would be -20, floor is 300
    expect(trophyDelta(300, 300, 'loss')).toBe(0);
    expect(trophyDelta(0, 0, 'loss')).toBe(0);
  });
});
