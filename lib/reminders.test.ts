import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { newDue } from './due';
import {
  claimDueReminders,
  isWatched,
  nextAlertAt,
  notificationFor,
  showSystemNotification,
  useReminderClock,
  type DueNote,
} from './reminders';
import { makeNote } from './testUtils';
import type { Due } from './types';

const HOUR = 60 * 60 * 1000;

// A date whose alert time is `at` (via snoozedUntil, which wins over the date).
const dueAt = (at: number, overrides: Partial<Due> = {}): Due => ({
  ...newDue('2026-10-15', '09:00', null),
  snoozedUntil: at,
  ...overrides,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('which notes the clock watches', () => {
  it('skips notes without a date, done, alerted, archived or in Trash', () => {
    const now = Date.now();
    expect(isWatched(makeNote({ due: dueAt(now) }))).toBe(true);
    expect(isWatched(makeNote())).toBe(false);
    expect(isWatched(makeNote({ due: dueAt(now, { doneAt: 1 }) }))).toBe(false);
    expect(isWatched(makeNote({ due: dueAt(now, { alertedAt: 1 }) }))).toBe(false);
    expect(isWatched(makeNote({ archived: true, due: dueAt(now) }))).toBe(false);
    expect(isWatched(makeNote({ trashedAt: 1, due: dueAt(now) }))).toBe(false);
  });

  it('finds the earliest alert time', () => {
    expect(nextAlertAt([makeNote({ due: dueAt(500) }), makeNote({ due: dueAt(200) }), makeNote()])).toBe(200);
    expect(nextAlertAt([makeNote()])).toBeNull();
  });
});

describe('claimDueReminders', () => {
  it('claims each reminder once', async () => {
    const now = Date.now();
    await db.notes.bulkAdd([
      makeNote({ id: 'due', due: dueAt(now - 1000) }),
      makeNote({ id: 'later', due: dueAt(now + HOUR) }),
    ]);
    const [first, second] = await Promise.all([claimDueReminders(now), claimDueReminders(now)]);
    expect([...first, ...second].map((n) => n.id)).toEqual(['due']);
    expect((await db.notes.get('due'))?.due?.alertedAt).toBe(now);
    expect(await claimDueReminders(now)).toEqual([]);
  });
});

describe('notificationFor', () => {
  const note = (id: string, title: string) => makeNote({ id, title, due: newDue('2026-10-15', null, null) }) as DueNote;

  it('names one note and opens it', () => {
    expect(notificationFor([note('n1', 'Groceries')], Date.now())).toMatchObject({
      title: 'Groceries',
      options: { tag: 'reminder-n1', data: { url: '/note?id=n1' } },
    });
    expect(notificationFor([note('n2', '  ')], Date.now()).title).toBe('Untitled note');
  });

  it('groups several and opens Upcoming', () => {
    const many = Array.from({ length: 12 }, (_, i) => note(`n${i}`, `A long reminder title ${i}`));
    const { title, options } = notificationFor(many, Date.now());
    expect(title).toBe('12 reminders');
    expect(options.tag).toBe('reminders');
    expect(options.data.url).toBe('/?view=upcoming');
    expect(options.body?.length).toBe(120);
    expect(options.body?.endsWith('…')).toBe(true);
  });
});

describe('showSystemNotification', () => {
  const shown = vi.fn();
  class FakeNotification {
    static permission = 'granted';
    onclick: (() => void) | null = null;
    constructor(title: string, options: NotificationOptions) {
      shown(title, options);
    }
    close() {}
  }
  const one = [makeNote({ id: 'n1', title: 'Bill', due: newDue('2026-10-15', null, null) }) as DueNote];

  beforeEach(() => {
    shown.mockClear();
    FakeNotification.permission = 'granted';
    vi.stubGlobal('Notification', FakeNotification);
  });

  it('shows one while the page is hidden', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await showSystemNotification(one, Date.now(), vi.fn());
    expect(shown).toHaveBeenCalledWith('Bill', expect.objectContaining({ tag: 'reminder-n1' }));
  });

  it('stays quiet while the page is visible or without permission', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await showSystemNotification(one, Date.now(), vi.fn());
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    FakeNotification.permission = 'denied';
    await showSystemNotification(one, Date.now(), vi.fn());
    expect(shown).not.toHaveBeenCalled();
  });
});

describe('useReminderClock', () => {
  it('alerts for a reminder that is due, once', async () => {
    await db.notes.add(makeNote({ id: 'due', title: 'Bill', due: dueAt(Date.now() - 1000) }));
    const onAlert = vi.fn();
    const { unmount } = renderHook(() => useReminderClock(onAlert));
    await waitFor(() => expect(onAlert).toHaveBeenCalledTimes(1));
    expect(onAlert.mock.calls[0][0].map((n: DueNote) => n.id)).toEqual(['due']);
    unmount();

    // A reload doesn't alert again.
    const again = vi.fn();
    renderHook(() => useReminderClock(again));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(again).not.toHaveBeenCalled();
  });

  it('alerts when the time comes', async () => {
    const onAlert = vi.fn();
    renderHook(() => useReminderClock(onAlert));
    await db.notes.add(makeNote({ id: 'soon', due: dueAt(Date.now() + 150) }));
    await waitFor(() => expect(onAlert).toHaveBeenCalledTimes(1));
  });

  it('alerts for a date set on a note that already exists', async () => {
    await db.notes.add(makeNote({ id: 'existing' }));
    const onAlert = vi.fn();
    renderHook(() => useReminderClock(onAlert));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await db.notes.update('existing', { due: dueAt(Date.now() + 150) });
    await waitFor(() => expect(onAlert).toHaveBeenCalledTimes(1));
  });

  it('alerts on wake', async () => {
    const start = Date.now();
    await db.notes.add(makeNote({ id: 'asleep', due: dueAt(start + HOUR) }));
    const onAlert = vi.fn();
    renderHook(() => useReminderClock(onAlert));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onAlert).not.toHaveBeenCalled();
    // The laptop slept through the reminder; the tab becomes visible again.
    vi.spyOn(Date, 'now').mockReturnValue(start + 2 * HOUR);
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(onAlert).toHaveBeenCalledTimes(1));
  });

  it('shows a reminder in every tab, from the one clock', async () => {
    let granted = false;
    const request = vi.fn((_name: string, _options: unknown, callback: () => Promise<void>) => {
      if (granted) return new Promise(() => {});
      granted = true;
      return callback();
    });
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const holder = vi.fn();
    const other = vi.fn();
    renderHook(() => useReminderClock(holder));
    renderHook(() => useReminderClock(other));
    await db.notes.add(makeNote({ id: 'due', due: dueAt(Date.now() - 1000) }));
    await waitFor(() => expect(other).toHaveBeenCalledTimes(1));
    expect(holder).toHaveBeenCalledTimes(1);
    expect(holder.mock.calls[0][1]).toBe(true);
    expect(other.mock.calls[0][0].map((n: DueNote) => n.id)).toEqual(['due']);
    expect(other.mock.calls[0][1]).toBe(false);
  });

  it('waits before trying again when claiming fails', async () => {
    await db.notes.add(makeNote({ id: 'due', due: dueAt(Date.now() - 1000) }));
    const transaction = vi.spyOn(db, 'transaction').mockRejectedValue(new Error('QuotaExceededError'));
    const onAlert = vi.fn();
    renderHook(() => useReminderClock(onAlert));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(transaction.mock.calls.length).toBeLessThanOrEqual(2);
    expect(onAlert).not.toHaveBeenCalled();
  });

  it('only runs in the tab that holds the lock', async () => {
    const request = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await db.notes.add(makeNote({ id: 'due', due: dueAt(Date.now() - 1000) }));
    const onAlert = vi.fn();
    renderHook(() => useReminderClock(onAlert));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(request).toHaveBeenCalledWith('noteboard-reminders', expect.anything(), expect.any(Function));
    expect(onAlert).not.toHaveBeenCalled();
  });
});
