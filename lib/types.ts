export const NOTE_COLORS = ['default', 'yellow', 'green', 'blue', 'pink', 'purple', 'grey'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const COLOR_NAMES: Record<NoteColor, string> = {
  default: 'Default',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
  purple: 'Purple',
  grey: 'Grey',
};

export type NoteKind = 'note' | 'list';

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Note = {
  id: string;
  kind: NoteKind;
  title: string;
  content: string; // used when kind = 'note'
  items: ChecklistItem[]; // used when kind = 'list'
  color: NoteColor;
  labelIds: string[];
  pinned: boolean;
  archived: boolean;
  trashedAt: number | null; // in Trash when set (ms since epoch)
  createdAt: number;
  updatedAt: number;
};

export type Label = { id: string; name: string };

// Fields the board and editor change directly.
export type NoteChanges = Partial<
  Pick<Note, 'kind' | 'title' | 'content' | 'items' | 'color' | 'labelIds' | 'pinned' | 'archived'>
>;

export type BoardView = 'all' | 'notes' | 'lists' | 'archive' | 'trash';

export type BoardFilter = { view: BoardView; labelId: string | null; query: string };
