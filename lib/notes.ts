import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { toggleItemIn } from './checklist';
import { db } from './db';
import { selectBoardNotes, type BoardNotes } from './filters';
import { needsRenumber, positionBetween } from './order';
import { requestPersistentStorage, setHasNotesMarker } from './storage';
import type { BoardFilter, Label, Note, NoteChanges, NoteKind } from './types';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type NewNote = Partial<Omit<Note, 'createdAt' | 'updatedAt' | 'trashedAt'>> & { kind: NoteKind };

export const refreshHasNotesMarker = async () => {
  const active = await db.notes.filter((n) => n.trashedAt === null && !n.archived).count();
  setHasNotesMarker(active > 0);
};

const afterWrite = async () => {
  requestPersistentStorage();
  await refreshHasNotesMarker();
};

// A position above every note, so it lands at the top of its section.
const nextTopPosition = async () => {
  const first = await db.notes.orderBy('position').first();
  return first ? first.position - 1 : 0;
};

// Pinning and archiving exclude each other, as in Google Keep.
const normalize = (changes: NoteChanges): NoteChanges => {
  if (changes.archived) return { ...changes, pinned: false };
  if (changes.pinned) return { ...changes, archived: false };
  return changes;
};

export const createNote = async (input: NewNote): Promise<Note> => {
  const now = Date.now();
  const fields = normalize({ pinned: input.pinned ?? false, archived: input.archived ?? false });
  const position = input.position ?? (await nextTopPosition());
  const note: Note = {
    id: input.id ?? uuid(),
    kind: input.kind,
    title: input.title ?? '',
    content: input.content ?? '',
    items: input.items ?? [],
    color: input.color ?? 'default',
    labelIds: input.labelIds ?? [],
    pinned: fields.pinned ?? false,
    archived: fields.archived ?? false,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    position,
  };
  await db.notes.add(note);
  await afterWrite();
  return note;
};

export const updateNote = async (id: string, changes: NoteChanges) => {
  const next = normalize(changes);
  const current = await db.notes.get(id);
  const patch: NoteChanges & { updatedAt: number } = { ...next, updatedAt: Date.now() };
  // Pinning, unpinning and unarchiving bring the note to the top of the
  // section it lands in; ordinary edits leave it where the user put it.
  const pinChanged = next.pinned !== undefined && next.pinned !== current?.pinned;
  const unarchived = next.archived === false && current?.archived === true;
  if (current && next.position === undefined && (pinChanged || unarchived)) {
    patch.position = await nextTopPosition();
  }
  await db.notes.update(id, patch);
  await afterWrite();
};

export const togglePin = async (id: string) => {
  const note = await db.notes.get(id);
  if (note) await updateNote(id, { pinned: !note.pinned });
};

export const setArchived = (id: string, archived: boolean) => updateNote(id, { archived });

export const toggleItem = async (noteId: string, itemId: string) => {
  const note = await db.notes.get(noteId);
  if (note) await updateNote(noteId, { items: toggleItemIn(note.items, itemId) });
};

export const trashNote = async (id: string) => {
  await db.notes.update(id, { trashedAt: Date.now() });
  await afterWrite();
};

export const restoreNote = async (id: string) => {
  await db.notes.update(id, { trashedAt: null, position: await nextTopPosition() });
  await afterWrite();
};

// Undo for "Move to trash": back where it was, unlike Restore from Trash.
export const undoTrash = async (id: string) => {
  await db.notes.update(id, { trashedAt: null });
  await afterWrite();
};

export const deleteForever = async (id: string) => {
  await db.notes.delete(id);
  await afterWrite();
};

export const emptyTrash = async () => {
  await db.notes.where('trashedAt').aboveOrEqual(0).delete();
  await afterWrite();
};

export const purgeOldTrash = async (now = Date.now()) => {
  const removed = await db.notes.where('trashedAt').below(now - TRASH_RETENTION_MS).delete();
  if (removed > 0) await afterWrite();
  return removed;
};

export const getNote = (id: string) => db.notes.get(id);

// Puts a note back exactly as it was; used by Undo.
export const restoreSnapshot = async (note: Note) => {
  await db.notes.put(note);
  await afterWrite();
};

// Places a note between two neighbours (null = start or end of the list).
// Not an edit, so `updatedAt` is unchanged.
export const moveNote = async (id: string, beforeId: string | null, afterId: string | null) => {
  await db.transaction('rw', db.notes, async () => {
    const find = async (noteId: string | null) => (noteId ? ((await db.notes.get(noteId))?.position ?? null) : null);
    let before = await find(beforeId);
    let after = await find(afterId);
    if (needsRenumber(before, after)) {
      const all = await db.notes.orderBy('position').toArray();
      await Promise.all(all.map((note, index) => db.notes.update(note.id, { position: index })));
      before = await find(beforeId);
      after = await find(afterId);
    }
    await db.notes.update(id, { position: positionBetween(before, after) });
  });
};

export const getAllData = async () => {
  const [notes, labels] = await Promise.all([db.notes.toArray(), db.labels.toArray()]);
  return { notes, labels };
};

export const duplicateNote = async (id: string): Promise<Note | undefined> => {
  const note = await db.notes.get(id);
  if (!note) return undefined;
  return createNote({
    kind: note.kind,
    title: note.title,
    content: note.content,
    items: note.items.map((item) => ({ ...item, id: uuid() })),
    color: note.color,
    labelIds: note.labelIds,
  });
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const createLabel = async (name: string): Promise<Label> => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Label name is required');
  const existing = (await db.labels.toArray()).find((l) => sameName(l.name, trimmed));
  if (existing) return existing;
  const label = { id: uuid(), name: trimmed };
  await db.labels.add(label);
  return label;
};

export const renameLabel = async (id: string, name: string) => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Label name is required');
  const clash = (await db.labels.toArray()).find((l) => l.id !== id && sameName(l.name, trimmed));
  if (clash) throw new Error('A label with that name already exists');
  await db.labels.update(id, { name: trimmed });
};

export const deleteLabel = async (id: string) => {
  await db.transaction('rw', db.notes, db.labels, async () => {
    await db.labels.delete(id);
    await db.notes
      .where('labelIds')
      .equals(id)
      .modify((note) => {
        note.labelIds = note.labelIds.filter((labelId) => labelId !== id);
      });
  });
};

// Queries swallow errors so a blocked database shows the storage banner
// (see lib/startup.ts) instead of crashing the page.
export const useLabels = (): Label[] | undefined =>
  useLiveQuery(
    () =>
      db.labels
        .toArray()
        .then((labels) => labels.sort((a, b) => a.name.localeCompare(b.name)))
        .catch((): Label[] => []),
    [],
  );

export const useBoardNotes = (filter: BoardFilter): BoardNotes | undefined => {
  const notes = useLiveQuery(() => db.notes.toArray().catch((): Note[] => []), []);
  const labels = useLabels();
  const { view, labelId, query } = filter;
  return useMemo(
    () => (notes && labels ? selectBoardNotes(notes, labels, { view, labelId, query }) : undefined),
    [notes, labels, view, labelId, query],
  );
};

// undefined while loading, null when the note doesn't exist.
export const useNote = (id: string): Note | null | undefined =>
  useLiveQuery(
    () =>
      db.notes
        .get(id)
        .then((note) => note ?? null)
        .catch(() => null),
    [id],
  );
