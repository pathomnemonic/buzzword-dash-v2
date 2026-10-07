import { STORAGE_DEFAULTS } from '../../js/storage.js';
import { describe, it, expect } from 'vitest';
import { QUESTS, LOCKER_ITEMS, QUEST_CATEGORIES, questIdsForDate, CONTINUE_COST } from '../../js/game/shopdata.js';
import { dailyReward } from '../../js/progress.js';

/**
 * Do the prices and the earnings make sense together?
 *
 * Earning in play: 2 coins per right answer plus 1 per 3 in the streak (about 3 each, six or seven answers a minute)
 * and the coin pick-ups on the track (a continuous stream, taken only where the runner actually is: about 130 a minute whatever the skill,
 * measured by stepping the game headlessly), which is about 150 coins for each minute. A casual player is on it for
 * 10 to 20 minutes a day. Quests are a bonus on top of that, not the main income: when they paid 300 to 1,100 each
 * a day's quests were worth over an hour of play. This test keeps the pieces in proportion.
 */
const COINS_PER_MINUTE = 150;
const CASUAL_MINUTES_PER_DAY = 15;
const dayOfPlay = COINS_PER_MINUTE * CASUAL_MINUTES_PER_DAY; // about 2,250

const dayKeys = Array.from({ length: 90 }, (_, i) => { const d = new Date(2026, 9, 1 + i, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
// (an item sold for real money keeps its old coin value here, so the coin economy is judged on the whole range)
const paid = LOCKER_ITEMS.filter((i) => i.price > 0 || i.premium).map((i) => (i.premium ? { ...i, price: i.coinValue } : i));

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
      expect(total, k).toBeGreaterThanOrEqual(dayOfPlay * 0.05);
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
      expect(i.price, i.id).toBeGreaterThanOrEqual(100);
      expect(i.price, i.id).toBeLessThanOrEqual(20000);
    });
  });

  it('a first purchase takes about a day of play, the dearest items about a week', () => {
    const cheapest = Math.min(...paid.map((i) => i.price));
    const dearest = Math.max(...paid.map((i) => i.price));
    expect(cheapest / (dayOfPlay + 150)).toBeLessThanOrEqual(1);
    expect(dearest / (dayOfPlay + 150)).toBeLessThanOrEqual(10);
  });

  it('a new player always has something within reach: plenty of things cost a run or two, a day of play opens up many more', () => {
    // what is on sale in the Locker (the archived classic heroes, hats and gear, and the shelved study buddies, are not)
    const shown = paid.filter((i) => ['trail', 'monster', 'map'].includes(i.type) || (i.type === 'skin' && i.id.startsWith('avatar_m_')));
    const within = (coins) => shown.filter((i) => i.price <= coins).length;
    const run = COINS_PER_MINUTE * 3; // a three-minute run
    expect(within(run)).toBeGreaterThanOrEqual(2);              // after the first run
    expect(within(run * 2)).toBeGreaterThanOrEqual(5);          // after a couple of runs
    expect(within(dayOfPlay)).toBeGreaterThanOrEqual(18);       // the first day
    expect(shown.some((i) => i.type === 'skin' && i.price <= run * 2)).toBe(true);   // a hero is within reach early
    expect(shown.some((i) => i.type === 'monster' && i.price <= run * 4)).toBe(true);
    expect(shown.some((i) => i.type === 'map' && i.price <= run * 2)).toBe(true);
  });

  it('prices climb steadily: nothing leaps by more than the step before it in a way that strands a player', () => {
    ['trail', 'monster', 'skin'].forEach((type) => {
      const list = shown(type).map((i) => i.price).sort((a, b) => a - b);
      for (let k = 1; k < list.length; k++) expect(list[k] / list[k - 1], type + ' ' + list[k - 1] + ' to ' + list[k]).toBeLessThanOrEqual(2.1);
    });
    function shown(type) { return paid.filter((i) => i.type === type && (type !== 'skin' || i.id.startsWith('avatar_m_'))); }
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

  it('a new player starts with exactly enough coins for the one thing the tutorial has them buy (the cheapest trail, and the cheapest thing in the Locker), and no more', () => {
    const cheapest = Math.min(...paid.map((i) => i.price));
    const cheapestTrail = paid.filter((i) => i.type === 'trail').sort((a, b) => a.price - b.price)[0];
    expect(cheapestTrail.price).toBe(cheapest);
    expect(STORAGE_DEFAULTS.progression.coins).toBe(cheapestTrail.price);
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
