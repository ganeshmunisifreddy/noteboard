import type { BoardFilter, BoardView, Label, Note } from './types';

const VIEWS: BoardView[] = ['all', 'notes', 'lists', 'archive', 'trash'];

type Query = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

export const parseFilter = (query: Query): BoardFilter => {
  const view = single(query.view);
  const parsedView = VIEWS.includes(view as BoardView) ? (view as BoardView) : 'all';
  const hasLabels = parsedView !== 'archive' && parsedView !== 'trash';
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

export const matchesView = (note: Note, filter: BoardFilter): boolean => {
  if (filter.view === 'trash') return note.trashedAt !== null;
  if (note.trashedAt !== null) return false;
  if (filter.view === 'archive') return note.archived;
  if (note.archived) return false;
  if (filter.view === 'notes' && note.kind !== 'note') return false;
  if (filter.view === 'lists' && note.kind !== 'list') return false;
  return filter.labelId === null || note.labelIds.includes(filter.labelId);
};

export const matchesQuery = (note: Note, query: string, labelNames: Map<string, string>): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const body = note.kind === 'note' ? [note.content] : note.items.map((i) => i.text);
  const labels = note.labelIds.map((id) => labelNames.get(id) ?? '');
  return [note.title, ...body, ...labels].some((text) => text.toLowerCase().includes(needle));
};

export type BoardNotes = { pinned: Note[]; others: Note[] };

export const selectBoardNotes = (notes: Note[], labels: Label[], filter: BoardFilter): BoardNotes => {
  const labelNames = new Map(labels.map((l) => [l.id, l.name]));
  const visible = notes.filter((n) => matchesView(n, filter) && matchesQuery(n, filter.query, labelNames));
  if (filter.view === 'trash') {
    return { pinned: [], others: visible.sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)) };
  }
  if (filter.view === 'archive') {
    return { pinned: [], others: visible.sort((a, b) => b.updatedAt - a.updatedAt) };
  }
  const byPosition = visible.sort((a, b) => a.position - b.position || b.updatedAt - a.updatedAt);
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
    case 'notes':
      return 'No notes yet';
    default:
      return filter.labelId ? 'No notes with this label' : 'Notes you add appear here';
  }
};
