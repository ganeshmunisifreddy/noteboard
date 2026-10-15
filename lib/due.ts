import { addDays, localDate, localMoment, MONTH_SHORT, parseDate, WEEKDAY_SHORT, weekdayOf } from './calendar';
import { nextDate, repeatText } from './repeat';
import type { Due, Repeat } from './types';

export const DEFAULT_TIME = '09:00';
export const DONE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// A new or changed date starts fresh: not done, not alerted, not snoozed,
// and its repeat counts from this date.
export const newDue = (date: string, time: string | null, repeat: Repeat | null): Due => ({
  date,
  time,
  repeat: repeat && {
    ...repeat,
    anchor: date,
    ends: repeat.ends.type === 'after' ? { ...repeat.ends, done: 0 } : repeat.ends,
  },
  doneAt: null,
  alertedAt: null,
  snoozedUntil: null,
});

export const dueMoment = (due: Pick<Due, 'date' | 'time'>) => localMoment(due.date, due.time ?? DEFAULT_TIME);

export const alertTime = (due: Due) => due.snoozedUntil ?? dueMoment(due);

export const isDone = (due: Due) => due.doneAt !== null;

// With a time: once it has passed. Without: from the next day.
export const isOverdue = (due: Due, now: number) =>
  !isDone(due) && (due.time ? now > dueMoment(due) : localDate(now) > due.date);

const withDone = (repeat: Repeat, done: number): Repeat =>
  repeat.ends.type === 'after' ? { ...repeat, ends: { ...repeat.ends, done } } : repeat;

// Mark done. A date that doesn't repeat is done. A repeat moves to its next
// date, skipping missed ones to today or later; dates moved past count
// toward "after N times". Once the series ends the note is done on its last date.
export const completeDue = (due: Due, now: number): Due => {
  const cleared: Due = { ...due, alertedAt: null, snoozedUntil: null };
  const { repeat } = due;
  if (!repeat) return { ...cleared, doneAt: now };
  const today = localDate(now);
  if (repeat.ends.type === 'never') {
    let next = nextDate(repeat, due.date);
    if (next !== null && next < today) next = nextDate(repeat, addDays(today, -1));
    return next === null ? { ...cleared, doneAt: now } : { ...cleared, date: next, doneAt: null };
  }
  let date = due.date;
  let done = repeat.ends.type === 'after' ? repeat.ends.done : 0;
  for (;;) {
    const ended = repeat.ends.type === 'after' && done + 1 >= repeat.ends.count;
    const next = ended ? null : nextDate(repeat, date);
    if (next === null) return { ...cleared, date, repeat: withDone(repeat, done), doneAt: now };
    date = next;
    done += 1;
    if (date >= today) return { ...cleared, date, repeat: withDone(repeat, done), doneAt: null };
  }
};

// The browser's own 12- or 24-hour style; any odd spaces Intl uses become plain spaces.
export const formatTime = (time: string, locale?: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2000, 0, 1, hours, minutes))
    .replace(/\s/g, ' ');
};

const dayAndMonth = (date: string) => {
  const { month, day } = parseDate(date);
  return `${WEEKDAY_SHORT[weekdayOf(date)]} ${day} ${MONTH_SHORT[month - 1]}`;
};

export const formatDay = (date: string, today: string) => {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  const text = dayAndMonth(date);
  return parseDate(date).year === parseDate(today).year ? text : `${text} ${parseDate(date).year}`;
};

export const formatDue = (due: Pick<Due, 'date' | 'time'>, now: number, locale?: string) => {
  const day = formatDay(due.date, localDate(now));
  return due.time ? `${day}, ${formatTime(due.time, locale)}` : day;
};

// Always with the year, for the Markdown export.
export const formatDueLong = (due: Pick<Due, 'date' | 'time'>, locale?: string) => {
  const day = `${dayAndMonth(due.date)} ${parseDate(due.date).year}`;
  return due.time ? `${day}, ${formatTime(due.time, locale)}` : day;
};

export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// e.g. "Due today, 6:00 PM, overdue, repeats weekly"
export const dueDescription = (due: Due, now: number, locale?: string) => {
  const when = formatDue(due, now, locale).replace(/^(Today|Tomorrow|Yesterday)/, (word) => word.toLowerCase());
  const parts = [isDone(due) ? `Done, was due ${when}` : `Due ${when}`];
  if (isOverdue(due, now)) parts.push('overdue');
  if (due.repeat) parts.push(`repeats ${lowerFirst(repeatText(due.repeat))}`);
  return parts.join(', ');
};

export type UpcomingKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'done';
export type UpcomingSection<T> = { key: UpcomingKey; title: string; notes: T[] };

const UPCOMING_ORDER: UpcomingKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'done'];
const UPCOMING_TITLES: Record<UpcomingKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'Next 7 days',
  later: 'Later',
  done: 'Done',
};

// Placed by date (a snooze doesn't move it); done ones only for 30 days.
export const upcomingKey = (due: Due, now: number): UpcomingKey | null => {
  if (due.doneAt !== null) return due.doneAt >= now - DONE_DAYS * DAY_MS ? 'done' : null;
  if (isOverdue(due, now)) return 'overdue';
  const today = localDate(now);
  if (due.date === today) return 'today';
  if (due.date === addDays(today, 1)) return 'tomorrow';
  return due.date <= addDays(today, 6) ? 'week' : 'later';
};

// No time sorts before a time on the same day ('' < '00:00').
const sortKey = (due: Due) => `${due.date} ${due.time ?? ''}`;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const upcomingSections = <T extends { id: string; due: Due | null }>(
  notes: T[],
  now: number,
): UpcomingSection<T>[] => {
  const groups = new Map<UpcomingKey, { note: T; due: Due }[]>();
  for (const note of notes) {
    if (!note.due) continue;
    const key = upcomingKey(note.due, now);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), { note, due: note.due }]);
  }
  return UPCOMING_ORDER.flatMap((key) => {
    const list = groups.get(key);
    if (!list) return [];
    list.sort((a, b) =>
      key === 'done'
        ? (b.due.doneAt ?? 0) - (a.due.doneAt ?? 0)
        : compare(sortKey(a.due), sortKey(b.due)) || compare(a.note.id, b.note.id),
    );
    return [{ key, title: UPCOMING_TITLES[key], notes: list.map((entry) => entry.note) }];
  });
};
