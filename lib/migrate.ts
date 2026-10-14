import { v4 as uuid } from 'uuid';
import { db } from './db';
import type { Note } from './types';

export const LEGACY_KEY = 'notes';
export const BACKUP_KEY = 'notes-backup-v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const toNote = (entry: Record<string, unknown>, timestamp: number): Note => ({
  id: typeof entry.id === 'string' && entry.id ? entry.id : uuid(),
  kind: 'note',
  title: text(entry.title),
  content: text(entry.content),
  items: [],
  color: 'default',
  labelIds: [],
  pinned: entry.pinned === true,
  archived: false,
  trashedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

// Moves notes saved by the localStorage version into IndexedDB, once.
// The old value is renamed, never deleted. If the insert fails, nothing in
// localStorage changes and the next load tries again.
export const migrateFromLocalStorage = async (now = Date.now()): Promise<number> => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (raw === null) return 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  if ((await db.notes.count()) > 0) return 0;

  // The old store kept newest first, so earlier entries get later timestamps.
  const notes = parsed.filter(isRecord).map((entry, index) => toNote(entry, now - index));
  await db.notes.bulkPut(notes);

  try {
    localStorage.setItem(BACKUP_KEY, raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // The notes table is no longer empty, so this won't run again.
  }
  return notes.length;
};
