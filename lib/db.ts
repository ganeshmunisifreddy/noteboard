import Dexie, { type EntityTable } from 'dexie';
import type { Label, Note } from './types';

export type NoteboardDB = Dexie & {
  notes: EntityTable<Note, 'id'>;
  labels: EntityTable<Label, 'id'>;
};

export const db = new Dexie('noteboard') as NoteboardDB;

// IndexedDB can't index booleans or null, so `pinned` and `archived` are
// filtered in memory, and only notes in Trash appear in the trashedAt index.
db.version(1).stores({
  notes: 'id, updatedAt, trashedAt, *labelIds',
  labels: 'id, &name',
});
