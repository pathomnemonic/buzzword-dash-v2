import { describe, it, expect } from 'vitest';
import {
  LEAGUES, getLeague, leagueIndex, divisionOf, tierStep, tierName, tierProgress, stepStart,
  rulesForStep, leagueRules, trophyDelta, describeLeagueRules
} from '../../js/leagues.js';
import { POWERUP_OPTIONS } from '../../js/rules.js';

describe('leagues and divisions', () => {
  it('places trophies in the right league', () => {
    expect(getLeague(0).id).toBe('intern');
    expect(getLeague(299).id).toBe('intern');
    expect(getLeague(300).id).toBe('resident');
    expect(getLeague(5000).id).toBe('legend');
    expect(leagueIndex(-50)).toBe(0);
  });

  it('splits every league into three divisions, III up to I', () => {
    expect(divisionOf(0)).toBe(3);
    expect(divisionOf(99)).toBe(3);
    expect(divisionOf(100)).toBe(2);
    expect(divisionOf(200)).toBe(1);
    expect(divisionOf(299)).toBe(1);
    expect(divisionOf(300)).toBe(3); // a new league starts at its lowest division
    expect(tierName(0)).toBe('Intern III');
    expect(tierName(250)).toBe('Intern I');
    expect(tierName(1250)).toBe('Attending III');
    expect(tierName(3600)).toBe('Legend III');
    expect(tierName(4500)).toBe('Legend I');
  });

  it('has 21 steps from the bottom to the top', () => {
    expect(tierStep(0)).toBe(0);
    expect(tierStep(300)).toBe(3);
    expect(tierStep(4500)).toBe(20);
    expect(tierStep(99999)).toBe(20);
    for (let step = 0; step <= 20; step++) expect(tierStep(stepStart(step))).toBe(step);
    expect(stepStart(1)).toBe(100);
  });

  it('reports progress to the next division, and the next league from division I', () => {
    expect(tierProgress(50)).toMatchObject({ needed: 50, fraction: 0.5 });
    expect(tierProgress(50).next).toMatchObject({ name: 'Intern II', promotion: false });
    expect(tierProgress(250).next).toMatchObject({ name: 'Resident III', promotion: true, min: 300 });
    expect(tierProgress(99999).next).toBeNull();
  });
});

describe('the ladder gets harder', () => {
  it('removes helpers one at a time, and they are all gone by the top of Fellow', () => {
    const counts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => rulesForStep(s).disabledPowerups.length);
    expect(counts).toEqual([0, 1, 1, 2, 3, 3, 4, 4, 5, 5]);
    expect(rulesForStep(8).disabledPowerups).toHaveLength(5);
    expect(tierName(stepStart(8))).toBe('Fellow I');
    for (let s = 1; s <= 20; s++) {
      const before = rulesForStep(s - 1).disabledPowerups;
      rulesForStep(s).disabledPowerups.length >= before.length || expect.fail('power-ups came back at step ' + s);
      before.forEach((id) => expect(rulesForStep(s).disabledPowerups).toContain(id));
    }
    const known = POWERUP_OPTIONS.map((p) => p.id);
    rulesForStep(20).disabledPowerups.forEach((id) => expect(known).toContain(id));
  });

  it('makes hearts rarer, and takes them away about halfway up', () => {
    expect(rulesForStep(0).heartEvery).toBe(3);
    expect(rulesForStep(3).heartEvery).toBe(3);
    expect(rulesForStep(4).heartEvery).toBe(5);
    expect(rulesForStep(7).heartEvery).toBe(8);
    expect(rulesForStep(9).heartEvery).toBe(0);
    expect(leagueRules(stepStart(9)).league.id).toBe('attending'); // the middle league
    for (let s = 9; s <= 20; s++) expect(rulesForStep(s).heartEvery).toBe(0);
  });

  it('speeds the track up each step, and a good bit more once the helpers are gone', () => {
    const speeds = Array.from({ length: 21 }, (_, s) => rulesForStep(s).speedMultiplier);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    expect(speeds[0]).toBe(1);
    expect(speeds[8]).toBe(1.12);
    expect(speeds[20]).toBe(1.6);
    expect(speeds[9] - speeds[8]).toBeGreaterThan(speeds[8] - speeds[7]); // steeper after the helpers go
  });

  it('gives both players the rules of their average trophies', () => {
    const r = leagueRules(2800);
    expect(r.disabledPowerups).toHaveLength(5);
    expect(r.heartEvery).toBe(0);
    expect(r.name).toBe('Dean III');
    expect(describeLeagueRules(0)).toBe('All power-ups');
    expect(describeLeagueRules(250)).toBe('No Auto-pilot · track +3% faster');
    expect(describeLeagueRules(stepStart(6))).toBe('No Auto-pilot, Shield, Magnet, 2× Score · rarer hearts · track +9% faster');
    expect(describeLeagueRules(stepStart(14))).toBe('No power-ups · no hearts · track +36% faster');
    expect(LEAGUES.length * 3).toBe(21);
  });
});

describe('trophies', () => {
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
