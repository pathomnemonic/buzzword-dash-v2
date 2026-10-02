import { describe, it, expect } from 'vitest';
import { shareSetting, isShareableRun, runPayload, crossedCardMilestone, crossedDayMilestone, describeActivity, weeklyRecap, newKudosCount, formatDuration } from '../../js/sharing.js';

describe('sharing: what goes in the feed', () => {
  it('shares with friends unless the player chose private', () => {
    expect(shareSetting(undefined)).toBe('friends');
    expect(shareSetting('private')).toBe('private');
    expect(shareSetting('everyone')).toBe('friends');
  });

  it('only real runs are posted', () => {
    expect(isShareableRun({ mode: 'endless', correct: 3, wrong: 1 })).toBe(false);
    expect(isShareableRun({ mode: 'endless', correct: 6, wrong: 1 })).toBe(true);
    expect(isShareableRun({ mode: 'tutorial', correct: 20, wrong: 0 })).toBe(false);
    expect(isShareableRun(null)).toBe(false);
  });

  it('a run becomes a small structured record with no free text', () => {
    const p = runPayload({ mode: 'daily', score: 1234.7, correct: 12, wrong: 3, bestStreak: 9, durationMs: 200000, secret: 'x' }, 'Alice');
    expect(p).toEqual({ name: 'Alice', mode: 'daily', score: 1234, correct: 12, total: 15, streak: 9, secs: 200 });
    expect(JSON.stringify(p).length).toBeLessThan(200);
  });

  it('knows which milestone a count just crossed', () => {
    expect(crossedCardMilestone(90, 101)).toBe(100);
    expect(crossedCardMilestone(101, 140)).toBeNull();
    expect(crossedCardMilestone(0, 600)).toBe(500);
    expect(crossedDayMilestone(6, 7)).toBe(7);
    expect(crossedDayMilestone(7, 8)).toBeNull();
  });

  it('reads each kind of post, as "You" for the player\'s own', () => {
    const run = { kind: 'run', payload: { name: 'Bo', mode: 'endless', score: 1500, correct: 12, total: 15, streak: 8, secs: 185 } };
    const d = describeActivity(run, false);
    expect(d.title).toBe('Bo ran Endless: 1,500 points');
    expect(d.facts).toEqual(['12/15 right (80%)', 'best streak 8', '3m 5s']);
    expect(describeActivity(run, true).title.startsWith('You ran')).toBe(true);
    expect(describeActivity({ kind: 'milestone', payload: { name: 'Bo', cards: 500 } }, false).title).toBe('Bo has now met 500 cards');
    expect(describeActivity({ kind: 'streak_days', payload: { name: 'Bo', days: 30 } }, true).title).toBe('You are on a 30-day study streak');
    expect(describeActivity({ kind: 'what', payload: {} }, false).title).toContain('did something great');
    expect(formatDuration(45)).toBe('45s');
  });

  it('adds up the week from the player\'s own posts only', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    const day = 86400000;
    const ev = (id, user, kind, p, ago, kudos) => ({ id, user_id: user, kind, payload: p, created_at: new Date(now - ago * day).toISOString(), kudos_count: kudos || 0 });
    const events = [
      ev(1, 'me', 'run', { correct: 8, total: 10, score: 700 }, 1, 2),
      ev(2, 'me', 'run', { correct: 18, total: 20, score: 1600 }, 3, 1),
      ev(3, 'me', 'run', { correct: 5, total: 5, score: 9000 }, 9), // too old
      ev(4, 'friend', 'run', { correct: 9, total: 9, score: 5000 }, 1) // not mine
    ];
    expect(weeklyRecap(events, 'me', now)).toEqual({ runs: 2, answered: 30, accuracy: 87, bestScore: 1600, kudos: 3, posts: 2 });
    expect(weeklyRecap([], 'me', now).accuracy).toBeNull();
  });

  it('counts kudos newer than the last look', () => {
    const k = [{ created_at: '2026-10-01T10:00:00Z' }, { created_at: '2026-10-02T10:00:00Z' }];
    expect(newKudosCount(k, Date.parse('2026-10-01T12:00:00Z'))).toBe(1);
    expect(newKudosCount(k, 0)).toBe(2);
    expect(newKudosCount(null, 0)).toBe(0);
  });
});
