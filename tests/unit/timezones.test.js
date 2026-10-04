/**
 * Time-zone, daylight-saving and clock tests (section 48 of the QA plan).
 *
 * Streaks, the daily reward, quests, the weekly goal, the calendar and the exam countdown all depend on "what day is it
 * here". Each scenario runs in many real time zones (half-hour zones, +14, -11, zones whose clocks change at midnight,
 * zones that change by two hours) around each of their clock changes, with a fake clock.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { keyOfDay, dayNumber, daysBetween } from '../../js/studystreak.js';
import { loginStep, toDayKey } from '../../js/progress.js';
import { buildCalendarModel } from '../../js/streakcalendar.js';
import { daysUntil } from '../../js/readiness.js';
import { nextReminderTime } from '../../js/reminders.js';
import { localDateKey } from '../../js/uihelpers.js';
import { questIdsForDate } from '../../js/game/shopdata.js';
import { makeRng } from '../../tools/soak.mjs';

const ORIGINAL_TZ = process.env.TZ;
const ZONES = [
  'UTC', 'America/Los_Angeles', 'America/New_York', 'America/St_Johns', 'America/Sao_Paulo', 'America/Santiago',
  'America/Havana', 'America/Asuncion', 'Europe/London', 'Europe/Dublin', 'Europe/Moscow', 'Africa/Casablanca',
  'Africa/Cairo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Tokyo', 'Australia/Lord_Howe', 'Australia/Sydney',
  'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Apia', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Antarctica/Troll'
];

let storage;

beforeEach(async () => {
  vi.useRealTimers();
  localStorage.clear();
  storage = (await import('../../js/storage.js')).storage;
  storage.load();
});

afterAll(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ;
});

function setZone(tz) { process.env.TZ = tz; }
function setNow(date) { vi.setSystemTime(date); }

/** Every instant (hourly, 2026-01 to 2027-06) at which this zone's UTC offset changes. */
function transitionsOf(tz) {
  setZone(tz);
  const out = [];
  let prev = new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset();
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 6, 1); t += 3600000) {
    const off = new Date(t).getTimezoneOffset();
    if (off !== prev) { out.push(t); prev = off; }
  }
  return out;
}

/** The local date a clock reads at an instant, worked out from the offset and not from the code under test. */
function expectedLocalKey(ms) {
  const off = new Date(ms).getTimezoneOffset();
  return new Date(ms - off * 60000).toISOString().slice(0, 10);
}

const TIMES_OF_DAY = [[0, 0, 0, 0], [0, 5, 0, 0], [1, 30, 0, 0], [2, 30, 0, 0], [3, 30, 0, 0], [12, 0, 0, 0], [23, 30, 0, 0], [23, 59, 59, 999]];

describe('time zones and clock changes', () => {
  it('finds clock changes in the zones that have them (so the cases below are real ones)', () => {
    expect(transitionsOf('America/New_York').length).toBeGreaterThanOrEqual(3);
    expect(transitionsOf('Europe/London').length).toBeGreaterThanOrEqual(3);
    expect(transitionsOf('Australia/Lord_Howe').length).toBeGreaterThanOrEqual(3);
    expect(transitionsOf('Asia/Kolkata').length).toBe(0);
    expect(transitionsOf('Pacific/Kiritimati').length).toBe(0);
  });

  ZONES.forEach((tz) => {
    it(tz + ': studying once every day for three weeks around each clock change gives a streak of 21 and 21 calendar days', () => {
      const changes = transitionsOf(tz);
      const centres = changes.length ? changes : [Date.UTC(2026, 9, 4)];
      vi.useFakeTimers({ toFake: ['Date'] });
      centres.forEach((centre) => {
        localStorage.clear();
        storage.load();
        setZone(tz);
        const first = new Date(centre - 10 * 86400000);
        const startNumber = dayNumber(expectedLocalKey(first.getTime()));
        for (let i = 0; i < 21; i++) {
          const [h, mi, s, ms] = TIMES_OF_DAY[i % TIMES_OF_DAY.length];
          // the i-th local day at a varying time of day (some of these times do not exist on a clock-change day)
          const base = new Date(first.getTime());
          const stamp = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, h, mi, s, ms);
          setNow(stamp);
          expect(storage.getTodayKey(), tz + ' day ' + i).toBe(keyOfDay(startNumber + i));
          storage.addStudiedToday(1, 1);
        }
        expect(storage.getStreakStatus().streak, tz + ' around ' + new Date(centre).toISOString()).toBe(21);
        const counts = storage.data.history.dailyCounts;
        expect(Object.keys(counts).length).toBe(21);
        for (let i = 0; i < 21; i++) expect(counts[keyOfDay(startNumber + i)], keyOfDay(startNumber + i)).toBe(1);
      });
    });

    it(tz + ': the date changes at local midnight and nowhere else', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const changes = transitionsOf(tz);
      const dates = [[2026, 9, 3], [2026, 11, 31], [2027, 1, 28]];
      changes.forEach((t) => { const d = new Date(t); dates.push([d.getFullYear(), d.getMonth(), d.getDate() - 1], [d.getFullYear(), d.getMonth(), d.getDate()]); });
      dates.forEach(([y, m, d]) => {
        const lastMoment = new Date(y, m, d, 23, 59, 59, 999);
        const firstMoment = new Date(y, m, d + 1, 0, 0, 0, 0);
        setNow(lastMoment);
        const a = storage.getTodayKey();
        setNow(firstMoment);
        const b = storage.getTodayKey();
        expect(daysBetween(a, b), tz + ' ' + a).toBe(1);
        expect(a).toBe(expectedLocalKey(lastMoment.getTime()));
      });
    });

    it(tz + ': the calendar, the exam countdown, the reminder time and the login step stay in step on clock-change days', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const changes = transitionsOf(tz);
      const instants = [Date.UTC(2026, 9, 4, 12)];
      changes.forEach((t) => { [-30, -2, 0, 2, 30].forEach((h) => instants.push(t + h * 3600000)); });
      instants.forEach((ms) => {
        const now = new Date(ms);
        const key = expectedLocalKey(ms);
        // calendar: 84 distinct, consecutive days, starting on a Sunday and ending with today (the rest is the future)
        const model = buildCalendarModel({ counts: {}, correct: {}, goal: 20, today: now });
        expect(model.cells).toHaveLength(84);
        expect(model.cells[0].date.getDay()).toBe(0);
        for (let i = 1; i < 84; i++) expect(daysBetween(model.cells[i - 1].key, model.cells[i].key), tz + ' cell ' + i).toBe(1);
        const todayCells = model.cells.filter((c) => c.today);
        expect(todayCells).toHaveLength(1);
        expect(todayCells[0].key).toBe(key);
        expect(model.cells.filter((c) => !c.future).pop().key).toBe(key);
        // exam countdown: N calendar days away reads N, at any hour of the day
        for (const n of [0, 1, 2, 7, 40]) expect(daysUntil(keyOfDay(dayNumber(key) + n), ms), tz + ' +' + n).toBe(n);
        expect(daysUntil(keyOfDay(dayNumber(key) - 1), ms)).toBe(-1);
        // reminder: always in the future, at most a day and a clock change away, on the asked hour when that hour exists
        [7, 19, 23].forEach((hour) => {
          const at = nextReminderTime(ms, hour, false);
          expect(at.getTime()).toBeGreaterThan(ms);
          expect(at.getTime() - ms).toBeLessThanOrEqual(26 * 3600000);
        });
        const skipped = nextReminderTime(ms, 7, true);
        expect(skipped.getTime() - ms).toBeGreaterThan(0);
        expect(skipped.getTime() - ms).toBeLessThanOrEqual(50 * 3600000);
        // the daily reward: paid once per local day, and a long-format saved date from an old version reads as the same day
        setNow(now);
        expect(localDateKey(now)).toBe(key);
        const old = now.toDateString();
        expect(toDayKey(old)).toBe(key);
        expect(loginStep(old, 3, key)).toEqual({ claim: false, streak: 3, last: key });
        const yesterday = keyOfDay(dayNumber(key) - 1);
        expect(loginStep(new Date(ms - 24 * 3600000).toDateString(), 3, key).claim).toBe(daysBetween(toDayKey(new Date(ms - 24 * 3600000).toDateString()), key) >= 1);
        expect(loginStep(yesterday, 3, key)).toEqual({ claim: true, streak: 4, last: key });
      });
    });
  });

  it('quests and the subject of the day depend only on the date written, never on the zone', async () => {
    const { bonusSubjectFor } = await import('../../js/progress.js');
    const subjects = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    setZone('UTC');
    const reference = ['2026-03-08', '2026-10-04', '2026-11-01', '2027-01-01'].map((d) => [questIdsForDate(d).join(), bonusSubjectFor(d, subjects)]);
    ZONES.forEach((tz) => {
      setZone(tz);
      ['2026-03-08', '2026-10-04', '2026-11-01', '2027-01-01'].forEach((d, i) => {
        expect(questIdsForDate(d).join(), tz + ' ' + d).toBe(reference[i][0]);
        expect(bonusSubjectFor(d, subjects)).toBe(reference[i][1]);
      });
    });
  });

  it('the week of the weekly goal turns over at local midnight on Monday, in every zone', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    ZONES.forEach((tz) => {
      setZone(tz);
      localStorage.clear();
      storage.load();
      const goal = storage.get('dailyGoal');
      // Sunday 2026-10-04 23:59:59.999 -> Monday 2026-10-05 00:00 (local)
      setNow(new Date(2026, 9, 4, 23, 59, 59, 999));
      const sunday = storage.getWeeklyProgress();
      setNow(new Date(2026, 9, 5, 0, 0, 0, 0));
      const monday = storage.getWeeklyProgress();
      expect(sunday.weekKey, tz).toBe('2026-09-28');
      expect(monday.weekKey, tz).toBe('2026-10-05');
      // five goal days Mon..Fri of the week of 5 Oct pays once
      for (let i = 0; i < 5; i++) storage.data.history.dailyCounts[keyOfDay(dayNumber('2026-10-05') + i)] = goal;
      setNow(new Date(2026, 9, 9, 12, 0, 0));
      expect(storage.getWeeklyProgress().daysMet, tz).toBe(5);
      const before = storage.get('coins');
      expect(storage.claimWeeklyGoal().success).toBe(true);
      expect(storage.claimWeeklyGoal().success).toBe(false);
      expect(storage.get('coins')).toBe(before + 250);
    });
  });

  it('survives random travel and a clock that jumps around: the streak never shrinks except by a real missed day, and nothing goes bad', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const rng = makeRng(4242);
    for (let walk = 0; walk < 120; walk++) {
      localStorage.clear();
      storage.load();
      let t = Date.UTC(2026, 2, 1) + Math.floor(rng() * 200) * 86400000;
      let lastSeen = '';
      let bestSeen = 0;
      let firstDay = null;
      for (let step = 0; step < 60; step++) {
        const roll = rng();
        if (roll < 0.15) t -= Math.floor(rng() * 30) * 3600000; // the clock goes back
        else if (roll < 0.25) t += Math.floor(rng() * 6) * 86400000; // a long gap
        else t += Math.floor(rng() * 40) * 3600000;
        if (rng() < 0.25) setZone(ZONES[Math.floor(rng() * ZONES.length)]); // the player travels
        setNow(new Date(t));
        const today = storage.getTodayKey();
        if (firstDay === null) firstDay = today;
        const p = storage.data.progression;
        const beforeStreak = p.studyStreak;
        if (rng() < 0.6) storage.addStudiedToday(1 + Math.floor(rng() * 5), 1);
        // the saved "last study day" only ever moves forward
        if (p.lastStudyDate) {
          expect(p.lastStudyDate >= lastSeen, 'last study day moved back: ' + lastSeen + ' -> ' + p.lastStudyDate).toBe(true);
          lastSeen = p.lastStudyDate;
        }
        // the streak only falls by starting again at 1, and only after a real gap
        if (p.studyStreak < beforeStreak) expect(p.studyStreak).toBe(1);
        expect(Number.isInteger(p.studyStreak)).toBe(true);
        expect(p.studyStreak).toBeGreaterThanOrEqual(0);
        expect(p.streakShields).toBeGreaterThanOrEqual(0);
        expect(p.streakShields).toBeLessThanOrEqual(3);
        expect(p.bestStudyStreak).toBeGreaterThanOrEqual(bestSeen);
        expect(p.bestStudyStreak).toBeGreaterThanOrEqual(p.studyStreak);
        bestSeen = p.bestStudyStreak;
        const st = storage.getStreakStatus();
        expect(Number.isInteger(st.streak)).toBe(true);
        expect(st.streak).toBeLessThanOrEqual(p.studyStreak);
        expect(storage.getWeeklyProgress().daysMet).toBeLessThanOrEqual(7);
      }
      expect(JSON.stringify(storage.data)).not.toMatch(/NaN|null.*undefined/);
    }
  });

  it('a trip west never costs the streak, and a trip east that skips a day costs it only when there is no shield', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const study = (tz, y, m, d, h) => { setZone(tz); setNow(new Date(y, m, d, h, 0, 0)); storage.addStudiedToday(3, 2); };
    // west: Auckland 5 Oct morning, then the same evening in Los Angeles it is still the 4th
    study('Pacific/Auckland', 2026, 9, 3, 9);
    study('Pacific/Auckland', 2026, 9, 4, 9);
    expect(storage.getStreakStatus().streak).toBe(2);
    setZone('America/Los_Angeles');
    setNow(new Date(Date.UTC(2026, 9, 4, 20))); // still 4 Oct in Los Angeles; Auckland's last day was the 4th too
    storage.addStudiedToday(2, 2);
    expect(storage.getStreakStatus().streak).toBe(2);
    study('America/Los_Angeles', 2026, 9, 5, 9);
    expect(storage.getStreakStatus().streak).toBe(3);

    // east: Los Angeles 6 Oct, a flight, Auckland on the 8th (the 7th never happened on this clock)
    localStorage.clear();
    storage.load();
    study('America/Los_Angeles', 2026, 9, 5, 20);
    study('America/Los_Angeles', 2026, 9, 6, 20);
    setZone('Pacific/Auckland');
    setNow(new Date(2026, 9, 8, 9, 0, 0));
    expect(storage.getStreakStatus().streak).toBe(0); // two clock days later and no shield
    storage.addStudiedToday(1, 1);
    expect(storage.getStreakStatus().streak).toBe(1);
    // with a shield the same trip keeps it
    localStorage.clear();
    storage.load();
    study('America/Los_Angeles', 2026, 9, 5, 20);
    study('America/Los_Angeles', 2026, 9, 6, 20);
    storage.data.progression.streakShields = 1;
    setZone('Pacific/Auckland');
    setNow(new Date(2026, 9, 8, 9, 0, 0));
    expect(storage.getStreakStatus().streak).toBe(2);
    storage.addStudiedToday(1, 1);
    expect(storage.getStreakStatus().streak).toBe(3);
    expect(storage.data.progression.streakShields).toBe(0);
  });

  it('the daily login reward cannot be collected twice by moving the clock back and forth', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setZone('America/New_York');
    let last = null;
    let streak = 0;
    let coinsPaid = 0;
    const visit = (key) => {
      const step = loginStep(last, streak, key);
      last = step.last;
      streak = step.streak;
      if (step.claim) coinsPaid++;
      return step;
    };
    expect(visit('2026-10-04').claim).toBe(true);
    expect(visit('2026-10-04').claim).toBe(false);
    expect(visit('2026-10-05').claim).toBe(true);
    expect(streak).toBe(2);
    // the clock goes back to the 3rd and the 4th, then forward again
    expect(visit('2026-10-03').claim).toBe(false);
    expect(visit('2026-10-04').claim).toBe(false);
    expect(visit('2026-10-05').claim).toBe(false);
    expect(streak).toBe(2); // nothing lost
    expect(visit('2026-10-06').claim).toBe(true);
    expect(streak).toBe(3);
    expect(coinsPaid).toBe(3);
    // a long absence starts again at 1
    expect(visit('2026-11-20')).toMatchObject({ claim: true, streak: 1 });
  });
});
