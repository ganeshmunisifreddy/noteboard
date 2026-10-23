import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { BACKUP_KEY, LEGACY_KEY, migrateFromLocalStorage } from './migrate';
import { createNote } from './notes';

const legacy = (value: unknown) => localStorage.setItem(LEGACY_KEY, JSON.stringify(value));

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('migrateFromLocalStorage', () => {
  it('copies legacy notes, keeping their order, and keeps a backup', async () => {
    legacy([
      { id: 'a', title: 'First', content: 'one', pinned: true },
      { id: 'b', title: 'Second', content: 'two', pinned: false },
    ]);
    expect(await migrateFromLocalStorage(1000)).toBe(2);
    expect(await db.notes.get('a')).toMatchObject({
      kind: 'note',
      title: 'First',
      content: 'one',
      items: [],
      color: 'default',
      labelIds: [],
      pinned: true,
      archived: false,
      trashedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
      position: 0,
    });
    expect((await db.notes.get('b'))?.updatedAt).toBe(999);
    expect((await db.notes.get('b'))?.position).toBe(1);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toContain('First');
  });

  it('skips entries that are not objects and fills missing fields', async () => {
    legacy([null, 3, 'text', { title: 'No id', pinned: 'yes' }]);
    expect(await migrateFromLocalStorage()).toBe(1);
    const [note] = await db.notes.toArray();
    expect(note.id).toEqual(expect.any(String));
    expect(note).toMatchObject({ title: 'No id', content: '', pinned: false });
  });

  it('leaves unreadable data alone', async () => {
    localStorage.setItem(LEGACY_KEY, '{oops');
    expect(await migrateFromLocalStorage()).toBe(0);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{oops');
    expect(await db.notes.count()).toBe(0);
  });

  it('does not duplicate when run twice', async () => {
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    await migrateFromLocalStorage();
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    expect(await migrateFromLocalStorage()).toBe(0);
    expect(await db.notes.count()).toBe(1);
  });

  it('does nothing when the database already has notes', async () => {
    await createNote({ kind: 'note', title: 'Existing' });
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    expect(await migrateFromLocalStorage()).toBe(0);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('keeps localStorage intact when the insert fails', async () => {
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    vi.spyOn(db.notes, 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    await expect(migrateFromLocalStorage()).rejects.toThrow('boom');
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
  });
});
