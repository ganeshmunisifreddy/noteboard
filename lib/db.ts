import Dexie, { type EntityTable } from 'dexie';
import type { Attachment, ImageFile, Label, Note } from './types';

export type NoteboardDB = Dexie & {
  notes: EntityTable<Note, 'id'>;
  labels: EntityTable<Label, 'id'>;
  attachments: EntityTable<Attachment, 'id'>;
  imageFiles: EntityTable<ImageFile, 'id'>;
};

export const db = new Dexie('noteboard') as NoteboardDB;

// IndexedDB can't index booleans or null, so `pinned` and `archived` are
// filtered in memory, and only notes in Trash appear in the trashedAt index.
db.version(1).stores({
  notes: 'id, updatedAt, trashedAt, *labelIds',
  labels: 'id, &name',
});

// v2: manual board order. Existing notes keep today's newest-first order.
db.version(2)
  .stores({
    notes: 'id, updatedAt, trashedAt, position, *labelIds',
    labels: 'id, &name',
  })
  .upgrade(async (tx) => {
    const notes = await tx.table('notes').orderBy('updatedAt').reverse().toArray();
    await Promise.all(notes.map((note, index) => tx.table('notes').update(note.id, { position: index })));
  });

// v3: images. Details and thumbnails in `attachments`; full images in
// `imageFiles`, read only when shown.
db.version(3).stores({
  notes: 'id, updatedAt, trashedAt, position, *labelIds',
  labels: 'id, &name',
  attachments: 'id, noteId',
  imageFiles: 'id',
});

// v4: dates. Every note gets `due: null`; nothing new is indexed (dates are
// filtered in memory, like the board).
db.version(4)
  .stores({
    notes: 'id, updatedAt, trashedAt, position, *labelIds',
    labels: 'id, &name',
    attachments: 'id, noteId',
    imageFiles: 'id',
  })
  .upgrade((tx) =>
    tx
      .table('notes')
      .toCollection()
      .modify((note: { due?: unknown }) => {
        if (note.due === undefined) note.due = null;
      }),
  );
