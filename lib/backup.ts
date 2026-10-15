import { v4 as uuid } from 'uuid';
import { deleteAttachmentsOf, getAllImages } from './attachments';
import { fromBase64, toBase64 } from './base64';
import { BOARD_NAME_MAX, COLUMN_NAME_MAX, cleanName } from './boards';
import { isDateString, isTimeString } from './calendar';
import { alertTime, formatDueLong, isDone, lowerFirst } from './due';
import { REPEAT_UNITS, repeatText } from './repeat';
import { DISPLAYABLE_TYPES } from './images';
import { db } from './db';
import { downloadFile } from './download';
import { selectBoardNotes } from './filters';
import { getAllData, refreshHasNotesMarker } from './notes';
import { byBoardPosition, byPosition } from './places';
import { isQuotaError } from './storage';
import {
  NOTE_COLORS,
  type Attachment,
  type Board,
  type ChecklistItem,
  type Column,
  type Due,
  type ImageFile,
  type Label,
  type Note,
  type NoteColor,
  type Repeat,
  type RepeatEnd,
  type RepeatUnit,
} from './types';

export const BACKUP_FORMAT = 'noteboard-backup';
export const BACKUP_VERSION = 4;
export const NOT_A_BACKUP = 'That file isn’t a Noteboard backup.';
export const NEWER_VERSION = 'This backup is from a newer version of Noteboard.';

// An image in a backup: its details, plus the full image and thumbnail as base64.
export type BackupAttachment = Omit<Attachment, 'thumb'> & { data: string; thumb: string };

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  notes: Note[];
  labels: Label[];
  attachments: BackupAttachment[];
  boards: Board[];
  columns: Column[];
};

// Position is filled in during the merge when the backup has none.
export type ImportedNote = Omit<Note, 'position'> & { position: number | null };
export type ImportedImage = { attachment: Attachment; file: ImageFile };
export type ImportedBackup = {
  notes: ImportedNote[];
  labels: Label[];
  attachments: ImportedImage[];
  boards: Board[];
  columns: Column[];
};

export type MergeCounts = { added: number; updated: number; unchanged: number; labels: number; boards?: number };

export class BackupError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toItem = (value: unknown): ChecklistItem | null =>
  isRecord(value)
    ? { id: typeof value.id === 'string' && value.id ? value.id : uuid(), text: text(value.text), done: value.done === true }
    : null;

const whole = (value: unknown, min: number, max: number): number | null =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : null;

const toRepeatEnd = (value: unknown): RepeatEnd | null => {
  if (!isRecord(value)) return null;
  if (value.type === 'never') return { type: 'never' };
  if (value.type === 'on') return isDateString(value.date) ? { type: 'on', date: value.date } : null;
  if (value.type !== 'after') return null;
  const count = whole(value.count, 1, 999);
  const done = count === null ? null : whole(value.done, 0, count);
  return count !== null && done !== null ? { type: 'after', count, done } : null;
};

const toRepeat = (value: unknown): Repeat | null => {
  if (!isRecord(value)) return null;
  const every = whole(value.every, 1, 99);
  const unit = REPEAT_UNITS.find((u) => u === value.unit);
  const weekdays = value.weekdays;
  const ends = toRepeatEnd(value.ends);
  if (every === null || !unit || !isDateString(value.anchor) || !ends) return null;
  if (!Array.isArray(weekdays) || !weekdays.every((day) => whole(day, 0, 6) !== null)) return null;
  return { every, unit: unit as RepeatUnit, weekdays: unit === 'week' ? [...new Set(weekdays as number[])] : [], anchor: value.anchor, ends };
};

// A date that doesn't check out is dropped; the note is kept.
const toDue = (value: unknown): Due | null => {
  if (!isRecord(value) || !isDateString(value.date)) return null;
  if (value.time != null && !isTimeString(value.time)) return null;
  const repeat = value.repeat == null ? null : toRepeat(value.repeat);
  if (value.repeat != null && repeat === null) return null;
  return {
    date: value.date,
    time: isTimeString(value.time) ? value.time : null,
    repeat,
    doneAt: finite(value.doneAt),
    alertedAt: finite(value.alertedAt),
    snoozedUntil: finite(value.snoozedUntil),
  };
};

// A restored date whose time has passed counts as alerted, so restoring an
// old backup doesn't set off a burst of alerts.
const quietDue = (due: Due | null, now: number): Due | null =>
  due && due.alertedAt === null && due.doneAt === null && alertTime(due) <= now ? { ...due, alertedAt: now } : due;

const id = (value: unknown) => (typeof value === 'string' && value ? value : null);

const toBoard = (entry: Record<string, unknown>): Board | null => {
  const boardId = id(entry.id);
  const name = cleanName(text(entry.name), BOARD_NAME_MAX);
  if (!boardId || !name) return null;
  return {
    id: boardId,
    name,
    position: finite(entry.position) ?? 0,
    createdAt: finite(entry.createdAt) ?? 0,
    updatedAt: finite(entry.updatedAt) ?? 0,
  };
};

const toColumn = (entry: Record<string, unknown>): Column | null => {
  const columnId = id(entry.id);
  const boardId = id(entry.boardId);
  const name = cleanName(text(entry.name), COLUMN_NAME_MAX);
  if (!columnId || !boardId || !name) return null;
  return {
    id: columnId,
    boardId,
    name,
    position: finite(entry.position) ?? 0,
    done: entry.done === true,
    updatedAt: finite(entry.updatedAt) ?? 0,
  };
};

const toNote = (entry: Record<string, unknown>): ImportedNote => {
  const updatedAt = finite(entry.updatedAt) ?? 0;
  const archived = entry.archived === true;
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : uuid(),
    kind: entry.kind === 'list' ? 'list' : 'note',
    title: text(entry.title),
    content: text(entry.content),
    items: Array.isArray(entry.items) ? entry.items.map(toItem).filter((i): i is ChecklistItem => i !== null) : [],
    color: NOTE_COLORS.includes(entry.color as NoteColor) ? (entry.color as NoteColor) : 'default',
    labelIds: Array.isArray(entry.labelIds) ? entry.labelIds.filter((id): id is string => typeof id === 'string') : [],
    // Archived notes can't be pinned (see lib/notes.ts).
    pinned: entry.pinned === true && !archived,
    archived,
    trashedAt: finite(entry.trashedAt),
    createdAt: finite(entry.createdAt) ?? updatedAt,
    updatedAt,
    position: finite(entry.position),
    due: toDue(entry.due),
    // Checked against the boards and columns during the merge.
    boardId: id(entry.boardId),
    columnId: id(entry.columnId),
    boardPosition: finite(entry.boardPosition) ?? 0,
  };
};

const toLabel = (entry: Record<string, unknown>): Label | null => {
  const name = text(entry.name).trim();
  if (!name) return null;
  return { id: typeof entry.id === 'string' && entry.id ? entry.id : uuid(), name };
};

const toImage = (entry: Record<string, unknown>): ImportedImage | null => {
  const id = text(entry.id);
  const noteId = text(entry.noteId);
  const type = text(entry.type);
  const bytes = fromBase64(text(entry.data));
  const thumb = fromBase64(text(entry.thumb));
  const thumbType = text(entry.thumbType) || type;
  if (!id || !noteId || !DISPLAYABLE_TYPES.has(type) || !DISPLAYABLE_TYPES.has(thumbType) || !bytes || !thumb) return null;
  return {
    attachment: {
      id,
      noteId,
      position: finite(entry.position) ?? 0,
      type,
      width: finite(entry.width) ?? 0,
      height: finite(entry.height) ?? 0,
      size: bytes.byteLength,
      alt: text(entry.alt).trim(),
      createdAt: finite(entry.createdAt) ?? 0,
      thumb,
      thumbType,
    },
    file: { id, bytes },
  };
};

const toBackupAttachment = ({ thumb, ...details }: Attachment, bytes: ArrayBuffer): BackupAttachment => ({
  ...details,
  data: toBase64(bytes),
  thumb: toBase64(thumb),
});

export const buildBackup = (
  notes: Note[],
  labels: Label[],
  now = new Date(),
  attachments: BackupAttachment[] = [],
  boards: Board[] = [],
  columns: Column[] = [],
): Backup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  notes,
  labels,
  attachments,
  boards,
  columns,
});

// Everything in the database, images included.
export const collectBackup = async (now = new Date()): Promise<Backup> => {
  const { notes, labels } = await getAllData();
  const { attachments, files } = await getAllImages();
  const bytes = new Map(files.map((file) => [file.id, file.bytes]));
  const packed = attachments.flatMap((attachment) => {
    const data = bytes.get(attachment.id);
    return data ? [toBackupAttachment(attachment, data)] : [];
  });
  const [boards, columns] = await Promise.all([db.boards.toArray(), db.columns.toArray()]);
  return buildBackup(notes, labels, now, packed, boards, columns);
};

export const parseBackup = (contents: string): ImportedBackup => {
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    throw new BackupError(NOT_A_BACKUP);
  }
  if (
    !isRecord(data) ||
    data.format !== BACKUP_FORMAT ||
    typeof data.version !== 'number' ||
    !Array.isArray(data.notes) ||
    !Array.isArray(data.labels)
  ) {
    throw new BackupError(NOT_A_BACKUP);
  }
  if (data.version > BACKUP_VERSION) throw new BackupError(NEWER_VERSION);

  const notes = new Map<string, ImportedNote>();
  for (const note of data.notes.filter(isRecord).map(toNote)) {
    const seen = notes.get(note.id);
    if (!seen || note.updatedAt > seen.updatedAt) notes.set(note.id, note);
  }
  const labels = data.labels
    .filter(isRecord)
    .map(toLabel)
    .filter((l): l is Label => l !== null);
  const attachments =
    data.version >= 2 && Array.isArray(data.attachments)
      ? data.attachments
          .filter(isRecord)
          .map(toImage)
          .filter((image): image is ImportedImage => image !== null)
      : [];
  const boards =
    data.version >= 4 && Array.isArray(data.boards)
      ? data.boards.filter(isRecord).map(toBoard).filter((b): b is Board => b !== null)
      : [];
  const boardIds = new Set(boards.map((b) => b.id));
  const columns =
    data.version >= 4 && Array.isArray(data.columns)
      ? data.columns
          .filter(isRecord)
          .map(toColumn)
          .filter((c): c is Column => c !== null && boardIds.has(c.boardId))
      : [];
  return { notes: [...notes.values()], labels, attachments, boards, columns };
};

const labelKey = (name: string) => name.trim().toLowerCase();

// Works out what a restore writes. Nothing local is ever deleted.
export const planMerge = (
  localNotes: Note[],
  localLabels: Label[],
  imported: ImportedBackup,
  now = Date.now(),
  localBoards: Board[] = [],
  localColumns: Column[] = [],
) => {
  const byName = new Map(localLabels.map((l) => [labelKey(l.name), l]));
  const takenIds = new Set(localLabels.map((l) => l.id));
  const labelIdMap = new Map<string, string>();
  const labels: Label[] = [];
  for (const label of imported.labels) {
    const match = byName.get(labelKey(label.name));
    if (match) {
      labelIdMap.set(label.id, match.id);
      continue;
    }
    const added = { id: takenIds.has(label.id) ? uuid() : label.id, name: label.name };
    labels.push(added);
    byName.set(labelKey(added.name), added);
    takenIds.add(added.id);
    labelIdMap.set(label.id, added.id);
  }

  // Boards and columns merge by id; the newer copy wins; nothing local is deleted.
  const newer = <T extends { id: string; updatedAt: number }>(local: T[], incoming: T[]) => {
    const mine = new Map(local.map((x) => [x.id, x]));
    return incoming.filter((x) => {
      const current = mine.get(x.id);
      return !current || x.updatedAt > current.updatedAt;
    });
  };
  const boards = newer(localBoards, imported.boards);
  const columns = newer(localColumns, imported.columns);
  // At most one Done column per board: when a merge brings a second, the
  // more recently changed one stays.
  const merged = new Map([...localColumns, ...columns].map((c) => [c.id, c]));
  for (const boardId of new Set([...merged.values()].map((c) => c.boardId))) {
    const done = [...merged.values()]
      .filter((c) => c.boardId === boardId && c.done)
      .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
    for (const extra of done.slice(1)) {
      const fixed = { ...extra, done: false, updatedAt: now };
      const index = columns.findIndex((c) => c.id === extra.id);
      if (index >= 0) columns[index] = fixed;
      else columns.push(fixed);
    }
  }
  const allColumns = new Map([...localColumns, ...columns].map((c) => [c.id, c]));
  const allBoards = new Set([...localBoards, ...boards].map((b) => b.id));
  const placeOf = (note: ImportedNote) => {
    const column = note.columnId ? allColumns.get(note.columnId) : undefined;
    return column && column.boardId === note.boardId && allBoards.has(column.boardId)
      ? { boardId: note.boardId, columnId: note.columnId, boardPosition: note.boardPosition }
      : { boardId: null, columnId: null, boardPosition: 0 };
  };
  const local = new Map(localNotes.map((n) => [n.id, n]));
  let lastPosition = localNotes.reduce((max, n) => Math.max(max, n.position), -1);
  const notes: Note[] = [];
  const counts: MergeCounts = { added: 0, updated: 0, unchanged: 0, labels: labels.length };
  for (const note of imported.notes) {
    const current = local.get(note.id);
    if (current && current.updatedAt >= note.updatedAt) {
      counts.unchanged += 1;
      continue;
    }
    const labelIds = [
      ...new Set(note.labelIds.map((id) => labelIdMap.get(id)).filter((id): id is string => !!id)),
    ];
    const position = note.position ?? (lastPosition += 1);
    notes.push({ ...note, labelIds, position, due: quietDue(note.due, now), ...placeOf(note) });
    if (current) counts.updated += 1;
    else counts.added += 1;
  }
  // Images follow their note: a note taken from the backup brings its images.
  const replaceImagesOf = notes.map((note) => note.id);
  const changed = new Set(replaceImagesOf);
  const attachments = imported.attachments.filter((image) => changed.has(image.attachment.noteId));
  const addedBoards = boards.filter((b) => !localBoards.some((l) => l.id === b.id)).length;
  if (addedBoards > 0) counts.boards = addedBoards;
  return { labels, notes, counts, attachments, replaceImagesOf, boards, columns };
};

// All or nothing: a failure leaves the database unchanged.
export const restoreBackup = async (contents: string): Promise<MergeCounts> => {
  const imported = parseBackup(contents);
  const tables = [db.notes, db.labels, db.attachments, db.imageFiles, db.boards, db.columns];
  const counts = await db.transaction('rw', tables, async () => {
    const [notes, labels, localBoards, localColumns] = await Promise.all([
      db.notes.toArray(),
      db.labels.toArray(),
      db.boards.toArray(),
      db.columns.toArray(),
    ]);
    const plan = planMerge(notes, labels, imported, Date.now(), localBoards, localColumns);
    await db.labels.bulkAdd(plan.labels);
    await db.boards.bulkPut(plan.boards);
    await db.columns.bulkPut(plan.columns);
    await db.notes.bulkPut(plan.notes);
    await deleteAttachmentsOf(plan.replaceImagesOf);
    // An image id already used by another note's image gets a new id, so the
    // restore never takes over that image.
    const owners = new Map(
      (await db.attachments.bulkGet(plan.attachments.map((image) => image.attachment.id))).flatMap((existing) =>
        existing ? [[existing.id, existing.noteId] as const] : [],
      ),
    );
    const images = plan.attachments.map(({ attachment, file }) => {
      const owner = owners.get(attachment.id);
      if (!owner || owner === attachment.noteId) return { attachment, file };
      const id = uuid();
      return { attachment: { ...attachment, id }, file: { ...file, id } };
    });
    await db.attachments.bulkPut(images.map((image) => image.attachment));
    await db.imageFiles.bulkPut(images.map((image) => image.file));
    return plan.counts;
  });
  await refreshHasNotesMarker();
  return counts;
};

const dueLine = (due: Due) =>
  isDone(due)
    ? `⏰ Done (was due ${formatDueLong(due)})`
    : `⏰ Due ${formatDueLong(due)}${due.repeat ? ` · repeats ${lowerFirst(repeatText(due.repeat))}` : ''}`;

const SEPARATOR = '\n\n---\n\n';

export const toMarkdown = (
  notes: Note[],
  labels: Label[],
  imageCounts: Map<string, number> = new Map(),
  boards: Board[] = [],
  columns: Column[] = [],
): string => {
  const names = new Map(labels.map((l) => [l.id, l.name]));
  const block = (note: Note, level = '##') => {
    const head = [`${level} ${note.title.trim() || 'Untitled'}`];
    const noteLabels = note.labelIds.map((id) => names.get(id)).filter((n): n is string => !!n);
    if (noteLabels.length > 0) head.push(`Labels: ${noteLabels.join(', ')}`);
    if (note.due) head.push(dueLine(note.due));
    const images = imageCounts.get(note.id) ?? 0;
    if (images > 0) head.push(`_${images} ${images === 1 ? 'image' : 'images'} (not included in the Markdown export)_`);
    const body =
      note.kind === 'note'
        ? note.content.trimEnd()
        : [...note.items.filter((i) => !i.done), ...note.items.filter((i) => i.done)]
            .map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`)
            .join('\n');
    return body.trim() ? `${head.join('\n')}\n\n${body}` : head.join('\n');
  };

  const board = selectBoardNotes(notes, labels, { view: 'all', labelId: null, query: '' }, new Set(columns.map((c) => c.id)));
  const archived = selectBoardNotes(notes, labels, { view: 'archive', labelId: null, query: '' }).others;
  const sections = [[...board.pinned, ...board.others].map((note) => block(note)).join(SEPARATOR)];
  const active = (n: Note) => !n.archived && n.trashedAt === null;
  for (const board of [...boards].sort(byPosition)) {
    const parts = [`# Board: ${board.name}`];
    for (const column of columns.filter((c) => c.boardId === board.id).sort(byPosition)) {
      const cards = notes.filter((n) => n.columnId === column.id && active(n)).sort(byBoardPosition);
      parts.push(`## ${column.name}`, cards.length > 0 ? cards.map((n) => block(n, '###')).join('\n\n') : '_No cards_');
    }
    sections.push(parts.join('\n\n'));
  }
  if (archived.length > 0) sections.push(`# Archived\n\n${archived.map((note) => block(note)).join(SEPARATOR)}`);
  const output = sections.filter(Boolean).join(SEPARATOR);
  return output ? `${output}\n` : '';
};

export const restoredMessage = ({ added, updated, unchanged, labels, boards = 0 }: MergeCounts) => {
  const total = added + updated + unchanged;
  const extra = boards > 0 ? ` Added ${boards} ${boards === 1 ? 'board' : 'boards'}.` : '';
  if (total === 0 && labels > 0) return `That backup has no notes. Added ${labels} ${labels === 1 ? 'label' : 'labels'}.${extra}`;
  if (total === 0) return `That backup has no notes.${extra}`;
  const summary = `Restored ${total} ${total === 1 ? 'note' : 'notes'}: ${added} added, ${updated} updated, ${unchanged} already up to date`;
  return extra ? `${summary}.${extra}` : summary;
};

export const restoreErrorMessage = (error: unknown) => {
  if (error instanceof BackupError) return error.message;
  if (isQuotaError(error)) return 'Couldn’t restore: storage is full.';
  return 'Couldn’t restore that backup.';
};

const dateStamp = (date: Date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

export const backupFileName = (date: Date) => `noteboard-backup-${dateStamp(date)}.json`;
export const markdownFileName = (date: Date) => `noteboard-notes-${dateStamp(date)}.md`;

// The backup file as JSON in parts, one per image: all images in one string
// could pass the browser's maximum string length.
export const backupParts = ({ attachments, ...rest }: Backup): string[] => {
  const head = JSON.stringify(rest);
  return [
    `${head.slice(0, -1)},"attachments":[`,
    ...attachments.map((attachment, index) => (index > 0 ? ',' : '') + JSON.stringify(attachment)),
    ']}',
  ];
};

export const downloadBackup = async (now = new Date()) => {
  downloadFile(backupFileName(now), backupParts(await collectBackup(now)), 'application/json');
};

export const downloadMarkdown = async (now = new Date()) => {
  const { notes, labels } = await getAllData();
  const { attachments } = await getAllImages();
  const counts = new Map<string, number>();
  for (const attachment of attachments) counts.set(attachment.noteId, (counts.get(attachment.noteId) ?? 0) + 1);
  const [boards, columns] = await Promise.all([db.boards.toArray(), db.columns.toArray()]);
  downloadFile(markdownFileName(now), toMarkdown(notes, labels, counts, boards, columns), 'text/markdown');
};
