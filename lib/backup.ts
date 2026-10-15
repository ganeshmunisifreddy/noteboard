import { v4 as uuid } from 'uuid';
import { deleteAttachmentsOf, getAllImages } from './attachments';
import { fromBase64, toBase64 } from './base64';
import { DISPLAYABLE_TYPES } from './images';
import { db } from './db';
import { downloadFile } from './download';
import { selectBoardNotes } from './filters';
import { getAllData, refreshHasNotesMarker } from './notes';
import { isQuotaError } from './storage';
import { NOTE_COLORS, type Attachment, type ChecklistItem, type ImageFile, type Label, type Note, type NoteColor } from './types';

export const BACKUP_FORMAT = 'noteboard-backup';
export const BACKUP_VERSION = 2;
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
};

// Position is filled in during the merge when the backup has none.
export type ImportedNote = Omit<Note, 'position'> & { position: number | null };
export type ImportedImage = { attachment: Attachment; file: ImageFile };
export type ImportedBackup = { notes: ImportedNote[]; labels: Label[]; attachments: ImportedImage[] };

export type MergeCounts = { added: number; updated: number; unchanged: number; labels: number };

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
    due: null, // read from the backup in v3 (lib/backup.ts toDue)
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
): Backup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  notes,
  labels,
  attachments,
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
  return buildBackup(notes, labels, now, packed);
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
  return { notes: [...notes.values()], labels, attachments };
};

const labelKey = (name: string) => name.trim().toLowerCase();

// Works out what a restore writes. Nothing local is ever deleted.
export const planMerge = (localNotes: Note[], localLabels: Label[], imported: ImportedBackup) => {
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
    notes.push({ ...note, labelIds, position });
    if (current) counts.updated += 1;
    else counts.added += 1;
  }
  // Images follow their note: a note taken from the backup brings its images.
  const replaceImagesOf = notes.map((note) => note.id);
  const changed = new Set(replaceImagesOf);
  const attachments = imported.attachments.filter((image) => changed.has(image.attachment.noteId));
  return { labels, notes, counts, attachments, replaceImagesOf };
};

// All or nothing: a failure leaves the database unchanged.
export const restoreBackup = async (contents: string): Promise<MergeCounts> => {
  const imported = parseBackup(contents);
  const counts = await db.transaction('rw', [db.notes, db.labels, db.attachments, db.imageFiles], async () => {
    const [notes, labels] = await Promise.all([db.notes.toArray(), db.labels.toArray()]);
    const plan = planMerge(notes, labels, imported);
    await db.labels.bulkAdd(plan.labels);
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

const SEPARATOR = '\n\n---\n\n';

export const toMarkdown = (notes: Note[], labels: Label[], imageCounts: Map<string, number> = new Map()): string => {
  const names = new Map(labels.map((l) => [l.id, l.name]));
  const block = (note: Note) => {
    const head = [`## ${note.title.trim() || 'Untitled'}`];
    const noteLabels = note.labelIds.map((id) => names.get(id)).filter((n): n is string => !!n);
    if (noteLabels.length > 0) head.push(`Labels: ${noteLabels.join(', ')}`);
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

  const board = selectBoardNotes(notes, labels, { view: 'all', labelId: null, query: '' });
  const archived = selectBoardNotes(notes, labels, { view: 'archive', labelId: null, query: '' }).others;
  const sections = [[...board.pinned, ...board.others].map(block).join(SEPARATOR)];
  if (archived.length > 0) sections.push(`# Archived\n\n${archived.map(block).join(SEPARATOR)}`);
  const output = sections.filter(Boolean).join(SEPARATOR);
  return output ? `${output}\n` : '';
};

export const restoredMessage = ({ added, updated, unchanged, labels }: MergeCounts) => {
  const total = added + updated + unchanged;
  if (total === 0 && labels > 0) return `That backup has no notes. Added ${labels} ${labels === 1 ? 'label' : 'labels'}.`;
  if (total === 0) return 'That backup has no notes.';
  return `Restored ${total} ${total === 1 ? 'note' : 'notes'}: ${added} added, ${updated} updated, ${unchanged} already up to date`;
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
  downloadFile(markdownFileName(now), toMarkdown(notes, labels, counts), 'text/markdown');
};
