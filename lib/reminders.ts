import { liveQuery } from 'dexie';
import { useEffect, useEffectEvent } from 'react';
import { db } from './db';
import { alertTime, formatDue } from './due';
import type { Due, Note } from './types';

export const REMINDER_LOCK = 'noteboard-reminders';
// The clock looks again at least this often, so a laptop waking from sleep
// or a paused phone tab catches up soon after.
export const MAX_WAIT_MS = 60_000;
const MAX_BODY = 120;

export type DueNote = Note & { due: Due };

export const isWatched = (note: Note): note is DueNote =>
  note.due !== null &&
  note.trashedAt === null &&
  !note.archived &&
  note.due.doneAt === null &&
  note.due.alertedAt === null;

export const nextAlertAt = (notes: Note[]): number | null =>
  notes.filter(isWatched).reduce<number | null>((earliest, note) => {
    const at = alertTime(note.due);
    return earliest === null || at < earliest ? at : earliest;
  }, null);

// Marks every reminder whose time has passed as alerted, and returns them.
// One transaction: two tabs can't both take the same reminder.
export const claimDueReminders = (now: number): Promise<DueNote[]> =>
  db.transaction('rw', db.notes, async () => {
    const due = (await db.notes.toArray()).filter(
      (note): note is DueNote => isWatched(note) && alertTime(note.due) <= now,
    );
    const claimed = due.map((note) => ({ ...note, due: { ...note.due, alertedAt: now } }));
    await Promise.all(claimed.map((note) => db.notes.update(note.id, { due: note.due })));
    return claimed;
  });

// Runs the reminder clock while this tab holds the reminders lock (one tab
// at a time; without Web Locks every tab runs it, and claiming still alerts
// each reminder once). The clock tells the other tabs, so the tab the user
// is looking at shows the reminder too. `onAlert` gets each batch that came
// due; `fromClock` is true in the tab that claimed it.
export const useReminderClock = (onAlert: (notes: DueNote[], fromClock: boolean) => void) => {
  const alert = useEffectEvent(onAlert);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let again = false;

    const check = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          clearTimeout(timer);
          let due: DueNote[];
          try {
            due = await claimDueReminders(Date.now());
          } catch {
            // Storage full or blocked: try again later rather than at once.
            if (!stopped) timer = setTimeout(() => void check(), MAX_WAIT_MS);
            return;
          }
          if (stopped) return;
          if (due.length > 0) {
            alert(due, true);
            channel?.postMessage({ ids: due.map((note) => note.id) });
          }
          const next = nextAlertAt(await db.notes.toArray().catch((): Note[] => []));
          if (stopped) return;
          const wait = next === null ? MAX_WAIT_MS : Math.min(Math.max(next - Date.now(), 0), MAX_WAIT_MS);
          timer = setTimeout(() => void check(), wait);
        } while (again && !stopped);
      } finally {
        running = false;
      }
    };

    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(REMINDER_LOCK) : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<{ ids?: unknown }>) => {
        const ids = event.data?.ids;
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return;
        void db.notes
          .bulkGet(ids)
          .then((notes) => {
            const due = notes.filter((note): note is DueNote => !!note && note.due !== null);
            if (!stopped && due.length > 0) alert(due, false);
          })
          .catch(() => {});
      };
    }

    const wake = () => {
      if (document.visibilityState === 'visible') void check();
    };
    let subscription: { unsubscribe: () => void } | undefined;
    const start = () => {
      if (stopped) return;
      // Any change to notes (a date set, snoozed, restored) gets a fresh look.
      subscription = liveQuery(() => db.notes.count()).subscribe({ next: () => void check(), error: () => {} });
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('focus', wake);
    };

    const controller = new AbortController();
    let release: (() => void) | undefined;
    if (typeof navigator !== 'undefined' && navigator.locks) {
      navigator.locks
        .request(REMINDER_LOCK, { signal: controller.signal }, () =>
          new Promise<void>((resolve) => {
            release = resolve;
            start();
          }),
        )
        .catch(() => {});
    } else {
      start();
    }

    return () => {
      stopped = true;
      channel?.close();
      controller.abort();
      release?.();
      subscription?.unsubscribe();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, []);
};

const titleOf = (note: Note) => note.title.trim() || 'Untitled note';

export const notificationFor = (notes: DueNote[], now: number) => {
  if (notes.length === 1) {
    const [note] = notes;
    return {
      title: titleOf(note),
      options: {
        body: formatDue(note.due, now),
        tag: `reminder-${note.id}`,
        data: { url: `/note?id=${encodeURIComponent(note.id)}` },
      },
    };
  }
  const titles = notes.map(titleOf).join(', ');
  return {
    title: `${notes.length} reminders`,
    options: {
      body: titles.length > MAX_BODY ? `${titles.slice(0, MAX_BODY - 1)}…` : titles,
      tag: 'reminders',
      data: { url: '/?view=upcoming' },
    },
  };
};

// Only while the page is out of view: the reminder panel covers a visible
// page. Through the service worker when there is one (Android requires it);
// otherwise (development) a plain Notification whose click calls `onClick`.
export const showSystemNotification = async (notes: DueNote[], now: number, onClick: (url: string) => void) => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  const { title, options } = notificationFor(notes, now);
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.active) {
      await registration.showNotification(title, options);
      return;
    }
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      onClick(options.data.url);
      notification.close();
    };
  } catch {
    // The reminder panel still shows it.
  }
};

export const notificationsBlocked = () => typeof Notification === 'undefined' || Notification.permission === 'denied';

// Must be called straight from a click: browsers only prompt then.
export const requestNotificationPermission = () => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  Promise.resolve(Notification.requestPermission()).catch(() => {});
};
