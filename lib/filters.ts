import { toPlainText } from './markdown';
import type { BoardFilter, BoardView, Label, Note } from './types';

const VIEWS: BoardView[] = ['all', 'notes', 'lists', 'upcoming', 'boards', 'archive', 'trash'];

type Query = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

export const parseFilter = (query: Query): BoardFilter => {
  const view = single(query.view);
  const parsedView = VIEWS.includes(view as BoardView) ? (view as BoardView) : 'all';
  const hasLabels = !['archive', 'trash', 'upcoming', 'boards'].includes(parsedView);
  return {
    view: parsedView,
    labelId: hasLabels ? single(query.label) || null : null,
    query: single(query.q) ?? '',
  };
};

export const filterToQuery = (filter: BoardFilter): Record<string, string> => {
  const query: Record<string, string> = {};
  if (filter.view !== 'all') query.view = filter.view;
  if (filter.labelId) query.label = filter.labelId;
  if (filter.query) query.q = filter.query;
  return query;
};

// The sidebar item a filter belongs to.
export const sectionOf = (filter: BoardFilter): string => {
  if (['upcoming', 'boards', 'archive', 'trash'].includes(filter.view)) return filter.view;
  return filter.labelId ? `label:${filter.labelId}` : 'notes';
};

// The page heading for a view.
export const viewTitle = (filter: BoardFilter, labelName?: string): string => {
  switch (filter.view) {
    case 'upcoming':
      return 'Upcoming';
    case 'boards':
      return 'Boards';
    case 'archive':
      return 'Archive';
    case 'trash':
      return 'Trash';
    default:
      return filter.labelId ? (labelName ?? 'Label') : 'Notes';
  }
};

export const matchesView = (note: Note, filter: BoardFilter): boolean => {
  if (filter.view === 'boards') return false; // the Boards view shows boards, not notes
  if (filter.view === 'trash') return note.trashedAt !== null;
  if (note.trashedAt !== null) return false;
  if (filter.view === 'archive') return note.archived;
  if (note.archived) return false;
  if (filter.view === 'upcoming') return note.due !== null;
  if (filter.view === 'notes' && note.kind !== 'note') return false;
  if (filter.view === 'lists' && note.kind !== 'list') return false;
  return filter.labelId === null || note.labelIds.includes(filter.labelId);
};

export const matchesQuery = (note: Note, query: string, labelNames: Map<string, string>): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const body = note.kind === 'note' ? [toPlainText(note.content)] : note.items.map((i) => i.text);
  const labels = note.labelIds.map((id) => labelNames.get(id) ?? '');
  return [note.title, ...body, ...labels].some((text) => text.toLowerCase().includes(needle));
};

export type BoardNotes = { pinned: Note[]; others: Note[] };

// On a board only when its column exists; a note whose column is gone counts as the main board.
export const isOnBoard = (note: Note, columnIds: Set<string>) => note.columnId !== null && columnIds.has(note.columnId);

const MAIN_VIEWS: BoardView[] = ['all', 'notes', 'lists'];

export const selectBoardNotes = (
  notes: Note[],
  labels: Label[],
  filter: BoardFilter,
  columnIds: Set<string> = new Set(),
): BoardNotes => {
  const labelNames = new Map(labels.map((l) => [l.id, l.name]));
  // Board notes stay on their boards, but a search finds them.
  const hideBoardNotes = MAIN_VIEWS.includes(filter.view) && filter.query.trim() === '';
  const visible = notes.filter(
    (n) =>
      matchesView(n, filter) &&
      matchesQuery(n, filter.query, labelNames) &&
      !(hideBoardNotes && isOnBoard(n, columnIds)),
  );
  if (filter.view === 'trash') {
    return { pinned: [], others: visible.sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)) };
  }
  if (filter.view === 'archive') {
    return { pinned: [], others: visible.sort((a, b) => b.updatedAt - a.updatedAt) };
  }
  // Sorted into date sections by the Upcoming view.
  if (filter.view === 'upcoming') return { pinned: [], others: visible };
  // Ties (e.g. positions from a restored backup) are broken by id, the order
  // IndexedDB keeps them in, so an edit or a renumber never moves a note.
  const byPosition = visible.sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { pinned: byPosition.filter((n) => n.pinned), others: byPosition.filter((n) => !n.pinned) };
};

export const isReorderable = (filter: BoardFilter) =>
  (filter.view === 'all' || filter.view === 'notes' || filter.view === 'lists') && filter.query.trim() === '';

export const emptyMessage = (filter: BoardFilter): string => {
  const query = filter.query.trim();
  if (query) return `No results for “${query}”`;
  switch (filter.view) {
    case 'trash':
      return 'Trash is empty';
    case 'archive':
      return 'Archive is empty';
    case 'lists':
      return 'No lists yet';
    case 'upcoming':
      return 'No upcoming dates. Add one from a note’s ⏰ button.';
    case 'notes':
      return 'No notes yet';
    default:
      return filter.labelId ? 'No notes with this label' : 'Notes you add appear here';
  }
};
