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
});
