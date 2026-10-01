import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { beatsBest, recordBest } from '../../js/scorebest.js';

describe('only a player\'s best run is sent', () => {
  it('sends the first run in a mode, then only higher ones', () => {
    let bests = {};
    expect(beatsBest(bests, 'endless', '2026-W40', 500)).toBe(true);
    bests = recordBest(bests, 'endless', '2026-W40', 500);
    expect(beatsBest(bests, 'endless', '2026-W40', 400)).toBe(false);
    expect(beatsBest(bests, 'endless', '2026-W40', 500)).toBe(false);
    expect(beatsBest(bests, 'endless', '2026-W40', 501)).toBe(true);
  });
  it('tracks each mode and season on its own', () => {
    const bests = recordBest({}, 'endless', '2026-W40', 900);
    expect(beatsBest(bests, 'weakness', '2026-W40', 10)).toBe(true);
    expect(beatsBest(bests, 'endless', '2026-W41', 10)).toBe(true);
  });
  it('never lowers a recorded best, and forgets old seasons', () => {
    let bests = recordBest({}, 'endless', '2026-W40', 900);
    bests = recordBest(bests, 'endless', '2026-W40', 100);
    expect(bests['endless|2026-W40']).toBe(900);
    bests = recordBest(bests, 'endless', '2026-W41', 50);
    expect(Object.keys(bests)).toEqual(['endless|2026-W41']);
  });
});

describe('the database keeps one row per player, mode and season', () => {
  const sql = readFileSync('database/schema.sql', 'utf8');
  it('has the keep-best trigger and a one-time tidy-up', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION scores_keep_best\(\)/);
    expect(sql).toMatch(/CREATE TRIGGER scores_zkeep_best_trg BEFORE INSERT ON scores/);
    expect(sql).toMatch(/DELETE FROM scores s\s+USING scores better/);
  });
});
