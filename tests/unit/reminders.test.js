import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextReminderTime, syncNativeReminder, requestReminderPermission, canRemind, setReminderPluginForTest, REMINDER_BODY } from '../../js/reminders.js';

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('reminder times', () => {
  it('is today at the chosen hour while that is still ahead, otherwise tomorrow', () => {
    expect(nextReminderTime(at(2026, 10, 3, 9), 19, false)).toEqual(new Date(2026, 9, 3, 19));
    expect(nextReminderTime(at(2026, 10, 3, 20), 19, false)).toEqual(new Date(2026, 9, 4, 19));
    expect(nextReminderTime(at(2026, 10, 3, 19, 0), 19, false)).toEqual(new Date(2026, 9, 4, 19)); // exactly on the hour: already due
  });

  it('skips today when the goal is already met, and copes with month ends and odd hours', () => {
    expect(nextReminderTime(at(2026, 10, 3, 9), 19, true)).toEqual(new Date(2026, 9, 4, 19));
    expect(nextReminderTime(at(2026, 10, 31, 20), 19, false)).toEqual(new Date(2026, 10, 1, 19));
    expect(nextReminderTime(at(2026, 10, 3, 1), 99, false).getHours()).toBe(23);
  });
});

describe('the phone app reminder', () => {
  let plugin;
  beforeEach(() => {
    plugin = {
      checkPermissions: vi.fn(async () => ({ display: 'granted' })),
      requestPermissions: vi.fn(async () => ({ display: 'granted' })),
      schedule: vi.fn(async () => ({})),
      cancel: vi.fn(async () => {})
    };
    setReminderPluginForTest(plugin);
  });

  it('can remind, and asks the phone for permission', async () => {
    expect(canRemind()).toBe(true);
    expect(await requestReminderPermission()).toEqual({ ok: true });
    plugin.requestPermissions.mockResolvedValueOnce({ display: 'denied' });
    expect(await requestReminderPermission()).toEqual({ ok: false, reason: 'blocked' });
  });

  it('schedules the next reminder as an inexact, idle-safe notification, only when the time changes', async () => {
    const now = at(2026, 10, 3, 9);
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now });
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
    const n = plugin.schedule.mock.calls[0][0].notifications[0];
    expect(n.body).toBe(REMINDER_BODY);
    expect(n.schedule.at).toEqual(new Date(2026, 9, 3, 19));
    expect(n.schedule.allowWhileIdle).toBe(true);
    expect(n.isExactNotification).toBe(false); // never sends the player to a system "alarms" screen
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now: now + 60000 });
    expect(plugin.schedule).toHaveBeenCalledTimes(1); // same time: nothing to do
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: true, now: now + 120000 }); // goal reached: move to tomorrow
    expect(plugin.schedule).toHaveBeenCalledTimes(2);
    expect(plugin.schedule.mock.calls[1][0].notifications[0].schedule.at).toEqual(new Date(2026, 9, 4, 19));
  });

  it('cancels when reminders are turned off, and does nothing without permission', async () => {
    await syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now: at(2026, 10, 3, 9) });
    await syncNativeReminder({ enabled: false, hour: 19, goalMetToday: false });
    expect(plugin.cancel).toHaveBeenCalledTimes(1);
    setReminderPluginForTest({ ...plugin, checkPermissions: vi.fn(async () => ({ display: 'denied' })), schedule: vi.fn() });
    const p2 = (await import('../../js/reminders.js'));
    await p2.syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now: at(2026, 10, 3, 9) });
  });

  it('a failing phone never throws into the app', async () => {
    plugin.checkPermissions.mockRejectedValue(new Error('boom'));
    await expect(syncNativeReminder({ enabled: true, hour: 19, goalMetToday: false, now: at(2026, 10, 3, 9) })).resolves.toBeUndefined();
  });
});
