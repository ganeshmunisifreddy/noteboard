import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { db } from './db';

describe('schema v2 upgrade', () => {
  it('gives existing notes positions in newest-first order', async () => {
    db.close();
    await Dexie.delete('noteboard');
    const v1 = new Dexie('noteboard');
    v1.version(1).stores({ notes: 'id, updatedAt, trashedAt, *labelIds', labels: 'id, &name' });
    await v1.table('notes').bulkAdd([
      { id: 'old', updatedAt: 1 },
      { id: 'new', updatedAt: 5 },
      { id: 'mid', updatedAt: 3 },
    ]);
    v1.close();

    await db.open();
    const ordered = await db.notes.orderBy('position').toArray();
    expect(ordered.map((n) => [n.id, n.position])).toEqual([
      ['new', 0],
      ['mid', 1],
      ['old', 2],
    ]);
  });

  it('adds image tables and keeps notes', async () => {
    db.close();
    await Dexie.delete('noteboard');
    const v2 = new Dexie('noteboard');
    v2.version(2).stores({ notes: 'id, updatedAt, trashedAt, position, *labelIds', labels: 'id, &name' });
    await v2.table('notes').add({ id: 'kept', updatedAt: 1, position: 0 });
    v2.close();

    await db.open();
    expect((await db.notes.get('kept'))?.position).toBe(0);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.imageFiles.count()).toBe(0);
  });

  it('gives every note an empty date in v4', async () => {
    db.close();
    await Dexie.delete('noteboard');
    const v3 = new Dexie('noteboard');
    v3.version(3).stores({
      notes: 'id, updatedAt, trashedAt, position, *labelIds',
      labels: 'id, &name',
      attachments: 'id, noteId',
      imageFiles: 'id',
    });
    await v3.table('notes').add({ id: 'kept', title: 'Old', updatedAt: 1, position: 0 });
    v3.close();

    await db.open();
    expect(await db.notes.get('kept')).toMatchObject({ title: 'Old', due: null });
  });

  it('adds boards and columns and puts every note on the main board in v5', async () => {
    db.close();
    await Dexie.delete('noteboard');
    const v4 = new Dexie('noteboard');
    v4.version(4).stores({
      notes: 'id, updatedAt, trashedAt, position, *labelIds',
      labels: 'id, &name',
      attachments: 'id, noteId',
      imageFiles: 'id',
    });
    await v4.table('notes').add({ id: 'kept', title: 'Old', updatedAt: 1, position: 0, due: null });
    v4.close();

    await db.open();
    expect(await db.notes.get('kept')).toMatchObject({ title: 'Old', boardId: null, columnId: null, boardPosition: 0 });
    expect(await db.boards.count()).toBe(0);
    expect(await db.columns.count()).toBe(0);
  });
});
