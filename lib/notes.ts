import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { copyAttachments, deleteAttachmentsOf } from './attachments';
import { toggleItemIn } from './checklist';
import { db } from './db';
import { alertTime, keepProgress, markDoneChanges, newDue } from './due';
import { selectBoardNotes, type BoardNotes } from './filters';
import { needsRenumber, positionBetween } from './order';
import { requestPersistentStorage, setHasNotesMarker } from './storage';
import type { BoardFilter, ChecklistItem, Due, Label, Note, NoteChanges, NoteKind, Repeat } from './types';

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
    position: input.position ?? 0,
    due: input.due ?? null,
  };
  // Reading the top position and writing in one transaction keeps two quick
  // writes from landing on the same place.
  await db.transaction('rw', db.notes, async () => {
    if (input.position === undefined) note.position = await nextTopPosition();
    await db.notes.add(note);
  });
  await afterWrite();
  return note;
};

export const updateNote = async (id: string, changes: NoteChanges) => {
  const next = normalize(changes);
  await db.transaction('rw', db.notes, async () => {
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
  });
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

// Moving to and from Trash counts as an edit, so it wins in a backup merge.
export const trashNote = async (id: string) => {
  const now = Date.now();
  await db.notes.update(id, { trashedAt: now, updatedAt: now });
  await afterWrite();
};

export const restoreNote = async (id: string) => {
  await db.transaction('rw', db.notes, async () => {
    await db.notes.update(id, { trashedAt: null, updatedAt: Date.now(), position: await nextTopPosition() });
  });
  await afterWrite();
};

// Undo for "Move to trash": back where it was, unlike Restore from Trash.
export const undoTrash = async (id: string) => {
  await db.notes.update(id, { trashedAt: null, updatedAt: Date.now() });
  await afterWrite();
};

// A note's images go with it, in the same transaction.
export const deleteForever = async (id: string) => {
  await db.transaction('rw', db.notes, db.attachments, db.imageFiles, async () => {
    await db.notes.delete(id);
    await deleteAttachmentsOf([id]);
  });
  await afterWrite();
};

export const emptyTrash = async () => {
  await db.transaction('rw', db.notes, db.attachments, db.imageFiles, async () => {
    const ids = await db.notes.where('trashedAt').aboveOrEqual(0).primaryKeys();
    await db.notes.bulkDelete(ids);
    await deleteAttachmentsOf(ids);
  });
  await afterWrite();
};

export const purgeOldTrash = async (now = Date.now()) => {
  const removed = await db.transaction('rw', db.notes, db.attachments, db.imageFiles, async () => {
    const ids = await db.notes.where('trashedAt').below(now - TRASH_RETENTION_MS).primaryKeys();
    await db.notes.bulkDelete(ids);
    await deleteAttachmentsOf(ids);
    return ids.length;
  });
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
      await db.notes.bulkPut(all.map((note, index) => ({ ...note, position: index })));
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

// The copy and its images are saved together or not at all.
export const duplicateNote = async (id: string): Promise<Note | undefined> => {
  const copy = await db.transaction('rw', db.notes, db.attachments, db.imageFiles, async () => {
    const note = await db.notes.get(id);
    if (!note) return undefined;
    const now = Date.now();
    const created: Note = {
      id: uuid(),
      kind: note.kind,
      title: note.title,
      content: note.content,
      items: note.items.map((item) => ({ ...item, id: uuid() })),
      color: note.color,
      labelIds: note.labelIds,
      pinned: false,
      archived: false,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
      position: await nextTopPosition(),
      // The date comes along; whether it was done, alerted or snoozed doesn’t.
      due: note.due && seenIfPast({ ...note.due, doneAt: null, alertedAt: null, snoozedUntil: null }, now),
    };
    await db.notes.add(created);
    await copyAttachments(id, created.id);
    return created;
  });
  if (copy) await afterWrite();
  return copy;
};

// Dates change here, not through the editor's draft (the draft doesn't hold
// `due`, so a draft save never overwrites them). Each change is an edit.
// A date whose alert time has already passed counts as alerted: the user is
// looking at it right now, so it shouldn't set off a reminder.
const seenIfPast = (due: Due, now: number): Due => (alertTime(due) <= now ? { ...due, alertedAt: now } : due);

const changeDue = async (id: string, change: (note: Note) => Partial<Note> | null) => {
  await db.transaction('rw', db.notes, async () => {
    const note = await db.notes.get(id);
    const patch = note ? change(note) : null;
    if (patch) await db.notes.update(id, { ...patch, updatedAt: Date.now() });
  });
};

export const setDue = (id: string, date: string, time: string | null, repeat: Repeat | null) =>
  changeDue(id, (note) => ({ due: seenIfPast(keepProgress(newDue(date, time, repeat), note.due), Date.now()) }));

export const removeDue = (id: string) => changeDue(id, () => ({ due: null }));

// Undo for removing a date or Mark done: the date (and a list's items) as they were.
export const putBackDue = (id: string, due: Due | null, items?: ChecklistItem[]) =>
  changeDue(id, () => (items ? { due, items } : { due }));

// Resolves to the note as it was, for Undo; undefined when there was nothing to mark.
export const markDone = async (id: string, now = Date.now()): Promise<Note | undefined> => {
  let before: Note | undefined;
  await changeDue(id, (note) => {
    if (!note.due || note.due.doneAt !== null) return null;
    before = note;
    return markDoneChanges({ ...note, due: note.due }, now);
  });
  return before;
};

// "Undo" on a done date. A time already past counts as alerted, so it doesn't alert again.
export const reopenDue = (id: string, now = Date.now()) =>
  changeDue(id, (note) => {
    if (!note.due || note.due.doneAt === null) return null;
    return { due: seenIfPast({ ...note.due, doneAt: null, alertedAt: null }, now) };
  });

export const snooze = (id: string, until: number) =>
  changeDue(id, (note) =>
    note.due && note.due.doneAt === null ? { due: { ...note.due, snoozedUntil: until, alertedAt: null } } : null,
  );

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
