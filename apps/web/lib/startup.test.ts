import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { LEGACY_KEY } from './migrate';
import { TRASH_RETENTION_MS, createNote } from './notes';
import { runStartup } from './startup';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runStartup', () => {
  it('migrates and purges old trash', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'a', title: 'A', content: '', pinned: false }]));
    expect(await runStartup()).toBe('ready');
    expect(await db.notes.get('a')).toBeDefined();

    const old = await createNote({ kind: 'note' });
    await db.notes.update(old.id, { trashedAt: Date.now() - TRASH_RETENTION_MS - 1 });
    await runStartup();
    expect(await db.notes.get(old.id)).toBeUndefined();
  });

  it('reports unavailable when the database cannot open', async () => {
    vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('blocked'));
    expect(await runStartup()).toBe('unavailable');
  });

  it('still reports ready when migration fails', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'a', title: 'A' }]));
    vi.spyOn(db.notes, 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    expect(await runStartup()).toBe('ready');
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });
});
