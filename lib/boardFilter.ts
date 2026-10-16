import { addDays, localDate } from './calendar';
import { isDone, isOverdue } from './due';
import { matchesQuery } from './filters';
import type { Note } from './types';

export type DateFilter = 'overdue' | 'week' | 'none';

// The board page's filter: every part that is set must match.
export type CardFilter = { query: string; labelId: string | null; date: DateFilter | null };

export const EMPTY_FILTER: CardFilter = { query: '', labelId: null, date: null };

export const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'none', label: 'No date' },
];

export const isFiltering = (filter: CardFilter) =>
  filter.query.trim() !== '' || filter.labelId !== null || filter.date !== null;

const matchesDate = (note: Note, date: DateFilter, now: number) => {
  const { due } = note;
  if (date === 'none') return due === null;
  if (!due || isDone(due)) return false;
  if (date === 'overdue') return isOverdue(due, now);
  const today = localDate(now);
  return !isOverdue(due, now) && due.date >= today && due.date <= addDays(today, 7);
};

export const matchesCard = (note: Note, filter: CardFilter, labelNames: Map<string, string>, now: number) =>
  matchesQuery(note, filter.query, labelNames) &&
  (filter.labelId === null || note.labelIds.includes(filter.labelId)) &&
  (filter.date === null || matchesDate(note, filter.date, now));
