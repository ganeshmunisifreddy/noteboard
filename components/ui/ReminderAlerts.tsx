import { useLiveQuery } from 'dexie-react-hooks';
import { AlarmClock, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useId, useRef, useState } from 'react';
import { addDays, localDate, localMoment } from '../../lib/calendar';
import { putBackPlace } from '../../lib/cards';
import { db } from '../../lib/db';
import { formatDue, formatTime, lowerNearDay } from '../../lib/due';
import { markDone, snooze } from '../../lib/notes';
import { showSystemNotification, titleOf, useReminderClock, type DueNote } from '../../lib/reminders';
import { noteHref, openEditor } from '../../lib/routes';
import { useNow } from '../../lib/time';
import type { Note } from '../../lib/types';
import IconButton from './IconButton';
import Menu from './Menu';
import styles from './ReminderAlerts.module.css';
import { useToast } from './Toast';

const MAX_ROWS = 3;
const MINUTE = 60 * 1000;

// Still alerting: snoozing, Mark done, a new date, Archive or Trash end it.
const isAlerting = (note: Note | undefined): note is DueNote =>
  !!note &&
  note.due !== null &&
  note.due.alertedAt !== null &&
  note.due.doneAt === null &&
  note.trashedAt === null &&
  !note.archived;

// "Fri 16 Oct" when Mark done moved a repeat on; null when it's done.
const movedToText = (note: Note | undefined) =>
  note?.due && note.due.doneAt === null ? formatDue(note.due, Date.now()) : null;

type RowProps = {
  note: DueNote;
  now: number;
  onOpen: () => void;
  onSnooze: (until: number) => void;
  onDone: () => void;
  onDismiss: () => void;
};

const ReminderRow = ({ note, now, onOpen, onSnooze, onDone, onDismiss }: RowProps) => {
  const titleId = useId();
  const title = titleOf(note);
  const tomorrow = () => localMoment(addDays(localDate(Date.now()), 1), '09:00');
  return (
    <li className={styles.row} data-reminder={note.id}>
      <AlarmClock size={18} aria-hidden className={styles.icon} />
      <div className={styles.text}>
        <p id={titleId} className={styles.title}>
          {title}
        </p>
        <p className={styles.when}>{formatDue(note.due, now)}</p>
      </div>
      <div className={styles.actions}>
        <button type='button' className={styles.button} aria-describedby={titleId} onClick={onOpen}>
          Open
        </button>
        <Menu
          align='start'
          items={[
            { label: '10 minutes', onSelect: () => onSnooze(Date.now() + 10 * MINUTE) },
            { label: '1 hour', onSelect: () => onSnooze(Date.now() + 60 * MINUTE) },
            { label: `Tomorrow, ${formatTime('09:00')}`, onSelect: () => onSnooze(tomorrow()) },
          ]}
          trigger={
            <button type='button' className={styles.button} aria-describedby={titleId}>
              Snooze
            </button>
          }
        />
        <button type='button' className={styles.button} aria-describedby={titleId} onClick={onDone}>
          Mark done
        </button>
        <IconButton label={`Dismiss reminder for ${title}`} onClick={onDismiss}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
    </li>
  );
};

// Reminders that came due in this tab, newest first. Rows stay until acted
// on (WCAG 2.2.1); they aren't kept across reloads (the note stays overdue).
const ReminderAlerts = () => {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [rows, setRows] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');

  useReminderClock((due, fromClock) => {
    const at = Date.now();
    // One system notification, from the tab that claimed the reminders.
    if (fromClock) void showSystemNotification(due, at, (url) => void router.push(url));
    const ids = due.map((note) => note.id);
    setRows((current) => [...ids, ...current.filter((id) => !ids.includes(id))]);
    const text =
      due.length === 1 ? `Reminder: ${titleOf(due[0])}, ${lowerNearDay(formatDue(due[0].due, at))}` : `${due.length} reminders`;
    // The same words again (after a snooze) are only read out if the text changes.
    setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text));
  });

  // A click on a system notification, relayed by the service worker.
  useEffect(() => {
    const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!container) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type === 'open-reminder' && typeof data.url === 'string' && data.url.startsWith('/')) {
        void router.push(data.url);
      }
    };
    container.addEventListener('message', onMessage);
    return () => container.removeEventListener('message', onMessage);
  }, [router]);

  const key = rows.join('\n');
  const notes = useLiveQuery(
    (): Promise<(Note | undefined)[]> =>
      (key ? db.notes.bulkGet(key.split('\n')) : Promise.resolve([])).catch(() => []),
    [key],
  );
  const byId = new Map((notes ?? []).flatMap((note) => (note ? [[note.id, note] as const] : [])));
  const active = rows.map((id) => byId.get(id)).filter(isAlerting);
  const shown = active.slice(0, MAX_ROWS);
  const more = active.length - shown.length;

  // When a row goes (snoozed, done, dismissed), focus moves to its neighbour
  // rather than being lost.
  const focusMove = useRef<{ from: string; to: string } | null>(null);
  const shownKey = shown.map((note) => note.id).join('\n');
  useEffect(() => {
    const move = focusMove.current;
    if (!move) return;
    const ids = shownKey.split('\n');
    if (ids.includes(move.from)) return;
    focusMove.current = null;
    if (ids.includes(move.to)) {
      document.querySelector<HTMLElement>(`[data-reminder="${CSS.escape(move.to)}"] button`)?.focus();
    }
  }, [shownKey]);

  const leaving = (id: string) => {
    const ids = shown.map((note) => note.id);
    const index = ids.indexOf(id);
    const to = ids[index + 1] ?? ids[index - 1];
    focusMove.current = to ? { from: id, to } : null;
  };

  const dismiss = (id: string) => setRows((current) => current.filter((row) => row !== id));

  const open = (id: string) => {
    dismiss(id);
    openEditor(router, noteHref(id));
  };

  const done = async (id: string) => {
    const before = await markDone(id);
    if (!before) return;
    const after = await db.notes.get(id);
    const movedTo = movedToText(after);
    toast({
      message: movedTo ? `Moved to ${movedTo}` : 'Marked done',
      actionLabel: 'Undo',
      onAction: () => void putBackPlace(before),
    });
  };

  return (
    <>
      <div role='status' aria-live='polite' className={styles.srOnly}>
        {announcement}
      </div>
      {shown.length > 0 && (
        <section className={styles.panel} aria-label='Reminders'>
          <ul className={styles.list}>
            {shown.map((note) => (
              <ReminderRow
                key={note.id}
                note={note}
                now={now}
                onOpen={() => open(note.id)}
                onSnooze={(until) => {
                  leaving(note.id);
                  void snooze(note.id, until);
                }}
                onDone={() => {
                  leaving(note.id);
                  void done(note.id);
                }}
                onDismiss={() => {
                  leaving(note.id);
                  dismiss(note.id);
                }}
              />
            ))}
          </ul>
          {more > 0 && (
            <Link href='/?view=upcoming' className={styles.more}>
              {`+${more} more · View in Upcoming`}
            </Link>
          )}
        </section>
      )}
    </>
  );
};

export default ReminderAlerts;
