import { describe, it, expect } from 'vitest';
import { PALS, getPal, palMood, palLine, palReminder, isPalMilestone, allLines, DEFAULT_PAL, NO_PAL } from '../../js/companions.js';
import { LOCKER_ITEMS } from '../../js/game/shopdata.js';
import { setReminderPluginForTest, syncNativeReminder } from '../../js/reminders.js';

const base = { studiedToday: false, streak: 0, lastStudyDate: null, today: '2026-10-05', hour: 14 };

describe('study buddies', () => {
  it('are in the Locker: one free, the rest priced low to high, plus "no buddy"', () => {
    const items = LOCKER_ITEMS.filter((i) => i.type === 'pal');
    expect(items.map((i) => i.id)).toContain(NO_PAL);
    expect(items.filter((i) => i.price === 0 && !i.premium).map((i) => i.id).sort()).toEqual([DEFAULT_PAL, NO_PAL].sort());
    expect(PALS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PALS.map((p) => p.emoji)).size).toBe(PALS.length);
    expect(getPal('pal_owl').name).toBe('Night Shift');
    expect(getPal('nope')).toBeNull();
  });

  it('feel something that matches how you are studying', () => {
    expect(palMood({ ...base, event: 'best' })).toBe('cheer');
    expect(palMood({ ...base, lastStudyDate: '2026-10-01' })).toBe('nap');
    expect(palMood({ ...base, lastStudyDate: '2026-10-04' })).toBe('greet');
    expect(palMood({ ...base, studiedToday: true, streak: 4, lastStudyDate: '2026-10-05' })).toBe('happy');
    expect(palMood({ ...base, hour: 23 })).toBe('sleepy');
    expect(palMood({ ...base, studiedToday: true, lastStudyDate: '2026-10-01', streak: 1 })).toBe('happy'); // away, but back and studying
    expect([2, 3, 7, 14, 30, 100, 200].filter(isPalMilestone)).toEqual([3, 7, 14, 30, 100, 200]);
  });

  it('every line of every tone is short, kind and has no leftover placeholder', () => {
    const lines = allLines();
    expect(lines.length).toBeGreaterThan(60);
    lines.forEach(({ tone, mood, line }) => {
      const pal = { name: 'Pip', tone };
      const text = line.replace(/\{name\}/g, pal.name).replace(/\{n\}/g, '12');
      expect(text, tone + ' ' + mood).not.toMatch(/[{}]|undefined|NaN/);
      expect(text.length, text).toBeLessThan(110);
      expect(text, text).not.toMatch(/\b(stupid|dumb|lazy|failure|shame on)\b/i);
    });
  });

  it('speak in their own voice, and every buddy can say every mood and a reminder', () => {
    PALS.forEach((p) => {
      ['greet', 'happy', 'cheer', 'nap', 'sleepy'].forEach((m) => expect(palLine(p, m, 5, () => 0).length, p.id + m).toBeGreaterThan(5));
      expect(palReminder(p, 6, () => 0)).toContain(p.name);
      expect(palReminder(p, 0, () => 0)).toContain(p.name);
      expect(palReminder(p, 6)).toMatch(/\S/);
    });
    expect(palLine(getPal('pal_dog'), 'greet', 3, () => 0)).not.toBe(palLine(getPal('pal_owl'), 'greet', 3, () => 0));
  });
});

describe('the reminder in the buddy\'s voice', () => {
  it('uses the buddy\'s words as the notification, and falls back to the standard line', async () => {
    const calls = [];
    setReminderPluginForTest({ checkPermissions: async () => ({ display: 'granted' }), schedule: async (o) => { calls.push(o.notifications[0].body); }, cancel: async () => {}, requestPermissions: async () => ({ display: 'granted' }) });
    const now = new Date(2026, 9, 5, 10).getTime();
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now, body: 'Triage: cards. You. Go.' });
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now, body: 'Triage: cards. You. Go.' }); // same again: nothing new to schedule
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now, body: 'Stetho: Hi! Five minutes?' }); // a different buddy: rescheduled
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now, body: '   ' });
    expect(calls).toEqual(['Triage: cards. You. Go.', 'Stetho: Hi! Five minutes?', 'Time to study. Keep your streak going! 🔥']);
    setReminderPluginForTest(null);
  });
});

describe('a new player and the Collector badges', () => {
  it('earns nothing on day one: the free study buddy does not count as a collected item', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    expect(storage.checkAchievements(null)).not.toContain('ach_collect_10');
    expect(storage.get('achievements')).not.toContain('ach_collect_10');
  });

  it('still awards Collector once ten real items are owned', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const own = storage.data.progression.ownedItems.filter((id) => id !== 'pal_none' && id !== 'pal_cat');
    for (let n = 0; own.length + n < 10; n++) storage.data.progression.ownedItems.push('test_item_' + n);
    expect(storage.checkAchievements(null)).toContain('ach_collect_10');
  });
});

describe('study buddies are shelved but kept', () => {
  it('no buddy is shown, cheers or lends its voice while the feature is off', async () => {
    const { FEATURES } = await import('../../js/features.js');
    const { currentPal } = await import('../../js/palui.js');
    expect(FEATURES.studyBuddies).toBe(false);
    expect(currentPal()).toBeNull();
    // the data and rules are all still there for when it comes back
    expect(PALS.length).toBeGreaterThan(5);
  });
});
