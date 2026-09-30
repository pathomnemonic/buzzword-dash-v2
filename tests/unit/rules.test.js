import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { POWERUP_OPTIONS, getRunRules, isRankedRun, isCustomizableMode, describeRules } from '../../js/rules.js';
import { spawnPowerup } from '../../js/game/obstacles.js';

describe('personal rules and ranking', () => {
  it('standard rules by default: ranked, nothing disabled', () => {
    const rules = getRunRules('endless', { disabledPowerups: [], hazardsOff: false, monsterOff: false });
    expect(rules.custom).toBe(false);
    expect(isRankedRun({ custom: rules.custom })).toBe(true);
    expect(describeRules(rules)).toBe('');
  });

  it('any changed rule makes a single-player run custom, and unranked', () => {
    expect(getRunRules('endless', { disabledPowerups: ['shield'] }).custom).toBe(true);
    expect(getRunRules('weakness', { hazardsOff: true }).custom).toBe(true);
    expect(getRunRules('study', { monsterOff: true }).custom).toBe(true);
    expect(isRankedRun({ custom: true })).toBe(false);
  });

  it('competitive and seeded modes ignore the player\'s rules entirely', () => {
    ['daily', 'challenge', 'tournament', 'versus', 'mp_highscore', 'mp_suddendeath', 'mp_race'].forEach((mode) => {
      expect(isCustomizableMode(mode), mode).toBe(false);
      const rules = getRunRules(mode, { disabledPowerups: ['shield', 'magnet'], hazardsOff: true, monsterOff: true });
      expect(rules, mode).toEqual({ disabledPowerups: [], hazardsOff: false, monsterOff: false, custom: false });
    });
  });

  it('ignores unknown power-up names and bad input', () => {
    expect(getRunRules('endless', { disabledPowerups: ['bogus'] }).custom).toBe(false);
    expect(getRunRules('endless', { disabledPowerups: 'shield' }).custom).toBe(false);
    expect(getRunRules('endless', null).custom).toBe(false);
  });

  it('describes what was turned off', () => {
    const rules = getRunRules('endless', { disabledPowerups: ['shield', 'double'], hazardsOff: true });
    expect(describeRules(rules)).toBe('no Shield, 2× Score · no map hazards');
  });

  it('offers every power-up the game can spawn', () => {
    expect(POWERUP_OPTIONS.map((p) => p.id).sort()).toEqual(['autoPilot', 'double', 'magnet', 'scoreFrenzy', 'shield']);
  });
});

describe('power-up spawning honours disabled power-ups', () => {
  it('never spawns a disabled type, and spawns nothing when all are off', () => {
    const scene = new THREE.Scene();
    const found = new Set();
    for (let i = 0; i < 200; i++) {
      const list = [];
      spawnPowerup(scene, list, undefined, ['shield', 'magnet']);
      list.forEach((m) => found.add(m.userData.powerupType));
    }
    expect(found.has('shield')).toBe(false);
    expect(found.has('magnet')).toBe(false);
    expect(found.size).toBeGreaterThan(0);

    const none = [];
    spawnPowerup(scene, none, undefined, POWERUP_OPTIONS.map((p) => p.id));
    expect(none).toHaveLength(0);
  });

  it('seeded plans still spawn their planned type (fair for everyone)', () => {
    const scene = new THREE.Scene();
    const list = [];
    spawnPowerup(scene, list, { type: 'shield', lane: 1, offset: -50 }, ['shield']);
    expect(list).toHaveLength(1);
    expect(list[0].userData.powerupType).toBe('shield');
  });
});
