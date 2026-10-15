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
  position: number; // board order; lower comes first
  due: Due | null; // see Due; null when the note has no date
};

export type Label = { id: string; name: string };

// An image in a note's gallery. Image data is kept as bytes plus a type:
// unlike Blobs, bytes survive IndexedDB everywhere (tests included).
export type Attachment = {
  id: string;
  noteId: string;
  position: number; // gallery order
  type: string; // of the full image
  width: number;
  height: number;
  size: number; // bytes of the full image
  alt: string; // description; '' when none
  createdAt: number;
  thumb: ArrayBuffer;
  thumbType: string;
};

// The full-size image, read only when it is shown.
export type ImageFile = { id: string; bytes: ArrayBuffer };

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export type RepeatEnd =
  | { type: 'never' }
  | { type: 'on'; date: string } // last allowed date, inclusive
  | { type: 'after'; count: number; done: number }; // done = dates already moved past

// Dates are local calendar dates ('YYYY-MM-DD') and times local 24-hour
// times ('HH:MM'), so 6 pm stays 6 pm across clock changes and time zones.
export type Repeat = {
  every: number; // 1–99
  unit: RepeatUnit;
  weekdays: number[]; // unit 'week' only; 0 = Sunday; [] = the anchor's weekday
  anchor: string; // the date the repeat started from
  ends: RepeatEnd;
};

export type Due = {
  date: string;
  time: string | null; // null: alerts at 09:00, overdue from the next day
  repeat: Repeat | null;
  doneAt: number | null; // set by Mark done
  alertedAt: number | null; // the alert for this date (or snooze) has been shown
  snoozedUntil: number | null;
};

// Fields the board and editor change directly.
export type NoteChanges = Partial<
  Pick<Note, 'kind' | 'title' | 'content' | 'items' | 'color' | 'labelIds' | 'pinned' | 'archived' | 'position'>
>;

export type BoardView = 'all' | 'notes' | 'lists' | 'upcoming' | 'archive' | 'trash';

export type BoardFilter = { view: BoardView; labelId: string | null; query: string };
