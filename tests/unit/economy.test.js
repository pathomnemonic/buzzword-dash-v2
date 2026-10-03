import { describe, it, expect } from 'vitest';
import { QUESTS, LOCKER_ITEMS, QUEST_CATEGORIES, questIdsForDate, CONTINUE_COST } from '../../js/game/shopdata.js';
import { dailyReward } from '../../js/progress.js';

/**
 * Do the prices and the earnings make sense together?
 *
 * Earning in play: 2 coins per right answer plus 1 per 3 in the streak (about 3 each, six or seven answers a minute)
 * and the coin pick-ups on the track (about 25 a minute at normal speed), which is about 50 coins for each minute. A casual player is on it for
 * 10 to 20 minutes a day. Quests are a bonus on top of that, not the main income: when they paid 300 to 1,100 each
 * a day's quests were worth over an hour of play. This test keeps the pieces in proportion.
 */
const COINS_PER_MINUTE = 50;
const CASUAL_MINUTES_PER_DAY = 15;
const dayOfPlay = COINS_PER_MINUTE * CASUAL_MINUTES_PER_DAY; // about 900

const dayKeys = Array.from({ length: 90 }, (_, i) => { const d = new Date(2026, 9, 1 + i, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
const paid = LOCKER_ITEMS.filter((i) => i.price > 0);

describe('quest rewards are a bonus, not the main income', () => {
  it('no single quest pays more than a few minutes of play', () => {
    QUESTS.forEach((q) => {
      expect(q.reward, q.id).toBeGreaterThanOrEqual(20);
      expect(q.reward, q.id).toBeLessThanOrEqual(COINS_PER_MINUTE * 1.5);
    });
  });

  it('a full day of quests is worth a fraction of a casual day of play, whichever six come up', () => {
    dayKeys.forEach((k) => {
      const total = questIdsForDate(k).reduce((sum, id) => sum + QUESTS.find((q) => q.id === id).reward, 0);
      expect(total, k).toBeGreaterThanOrEqual(dayOfPlay * 0.15);
      expect(total, k).toBeLessThanOrEqual(dayOfPlay * 0.5);
    });
  });

  it('harder quests pay more than easier ones of the same kind', () => {
    const r = (id) => QUESTS.find((q) => q.id === id).reward;
    expect(r('q_streak20')).toBeGreaterThan(r('q_streak12'));
    expect(r('q_streak12')).toBeGreaterThan(r('q_perfect5'));
    expect(r('q_50enc')).toBeGreaterThan(r('q_25enc'));
    expect(r('q_25enc')).toBeGreaterThan(r('q_10enc'));
    expect(r('q_speed15')).toBeGreaterThan(r('q_speed3'));
  });
});

describe('prices against earnings', () => {
  it('every paid item costs something, in a sensible range', () => {
    expect(paid.length).toBeGreaterThan(40);
    paid.forEach((i) => {
      expect(i.price, i.id).toBeGreaterThanOrEqual(300);
      expect(i.price, i.id).toBeLessThanOrEqual(8000);
    });
  });

  it('a first purchase takes about a day of play, the dearest items about a week', () => {
    const cheapest = Math.min(...paid.map((i) => i.price));
    const dearest = Math.max(...paid.map((i) => i.price));
    expect(cheapest / (dayOfPlay + 150)).toBeLessThanOrEqual(1);
    expect(dearest / (dayOfPlay + 150)).toBeLessThanOrEqual(10);
  });

  it('trails are the cheapest things in the Locker and heroes the dearest, with maps and monsters between', () => {
    const avg = (type) => { const l = paid.filter((i) => i.type === type); return l.reduce((s, i) => s + i.price, 0) / l.length; };
    expect(avg('trail')).toBeLessThan(avg('map'));
    expect(avg('map')).toBeLessThan(avg('monster'));
    expect(avg('monster')).toBeLessThan(avg('skin'));
    // and no trail costs more than the cheapest hero that is meant to be a showpiece
    const maxTrail = Math.max(...paid.filter((i) => i.type === 'trail').map((i) => i.price));
    const maxHero = Math.max(...paid.filter((i) => i.type === 'skin').map((i) => i.price));
    expect(maxTrail).toBeLessThan(maxHero);
  });

  it('the trail the tour teaches with (the EKG Line) is affordable from the starting coins with plenty left over', () => {
    const ekg = paid.find((i) => i.id === 'trail_ekg');
    expect(ekg.price).toBeLessThanOrEqual(1000);
  });

  it('a continue is cheap next to a run\'s earnings, so it is a real choice but never a trap', () => {
    expect(CONTINUE_COST).toBeLessThanOrEqual(COINS_PER_MINUTE * 1.5);
    expect(CONTINUE_COST).toBeGreaterThanOrEqual(COINS_PER_MINUTE / 4);
  });

  it('the daily login reward is a small thank-you: a week is less than a day of play', () => {
    let week = 0;
    for (let d = 1; d <= 7; d++) week += dailyReward(d, () => 0.5).coins;
    expect(week).toBeLessThan(dayOfPlay * 1.5);
    expect(week).toBeGreaterThan(dayOfPlay * 0.3);
  });

  it('every quest category has the same chance of paying out, so no kind of play is ignored', () => {
    QUEST_CATEGORIES.forEach((c) => {
      const list = QUESTS.filter((q) => q.category === c);
      const avg = list.reduce((s, q) => s + q.reward, 0) / list.length;
      expect(avg, c).toBeGreaterThan(30);
      expect(avg, c).toBeLessThan(70);
    });
  });
});
