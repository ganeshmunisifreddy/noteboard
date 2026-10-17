import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { selectBoardNotes } from './filters';
import {
  TRASH_RETENTION_MS,
  createLabel,
  createNote,
  deleteForever,
  deleteLabel,
  duplicateNote,
  emptyTrash,
  moveNote,
  purgeOldTrash,
  renameLabel,
  restoreNote,
  restoreSnapshot,
  setArchived,
  toggleItem,
  togglePin,
  trashNote,
  undoTrash,
  updateNote,
} from './notes';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createNote', () => {
  it('fills defaults', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const note = await createNote({ kind: 'list', title: 'Groceries' });
    expect(note).toMatchObject({
      kind: 'list',
      title: 'Groceries',
      content: '',
      items: [],
      color: 'default',
      labelIds: [],
      pinned: false,
      archived: false,
      trashedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(await db.notes.get(note.id)).toEqual(note);
  });

  it('keeps a given id', async () => {
    const note = await createNote({ id: 'fixed', kind: 'note' });
    expect(note.id).toBe('fixed');
  });
});

describe('updateNote', () => {
  it('saves changes and bumps updatedAt', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const note = await createNote({ kind: 'note' });
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await updateNote(note.id, { title: 'New', color: 'blue' });
    expect(await db.notes.get(note.id)).toMatchObject({ title: 'New', color: 'blue', updatedAt: 5000 });
  });

  it('unpins when archiving and unarchives when pinning', async () => {
    const note = await createNote({ kind: 'note', pinned: true });
    await setArchived(note.id, true);
    expect(await db.notes.get(note.id)).toMatchObject({ archived: true, pinned: false });
    await togglePin(note.id);
    expect(await db.notes.get(note.id)).toMatchObject({ archived: false, pinned: true });
  });
});

describe('toggleItem', () => {
  it('ticks a checklist item', async () => {
    const note = await createNote({ kind: 'list', items: [{ id: 'i1', text: 'Milk', done: false }] });
    await toggleItem(note.id, 'i1');
    expect((await db.notes.get(note.id))?.items[0].done).toBe(true);
  });
});

describe('trash', () => {
  it('trashes and restores', async () => {
    const note = await createNote({ kind: 'note', title: 'A' });
    await trashNote(note.id);
    expect((await db.notes.get(note.id))?.trashedAt).not.toBeNull();
    await restoreNote(note.id);
    expect((await db.notes.get(note.id))?.trashedAt).toBeNull();
  });

  it('empties only trashed notes', async () => {
    const kept = await createNote({ kind: 'note', title: 'Keep' });
    const gone = await createNote({ kind: 'note', title: 'Gone' });
    await trashNote(gone.id);
    await emptyTrash();
    expect((await db.notes.toArray()).map((n) => n.id)).toEqual([kept.id]);
  });

  it('deletes forever', async () => {
    const note = await createNote({ kind: 'note' });
    await deleteForever(note.id);
    expect(await db.notes.get(note.id)).toBeUndefined();
  });

  it('purges notes trashed more than 30 days ago', async () => {
    const now = 100 * TRASH_RETENTION_MS;
    const old = await createNote({ kind: 'note' });
    const recent = await createNote({ kind: 'note' });
    await db.notes.update(old.id, { trashedAt: now - TRASH_RETENTION_MS - 1 });
    await db.notes.update(recent.id, { trashedAt: now - 1000 });
    expect(await purgeOldTrash(now)).toBe(1);
    expect((await db.notes.toArray()).map((n) => n.id)).toEqual([recent.id]);
  });
});

describe('restoreSnapshot', () => {
  it('puts a note back exactly as it was', async () => {
    const note = await createNote({ kind: 'note', title: 'Before', pinned: true });
    await setArchived(note.id, true);
    await restoreSnapshot(note);
    expect(await db.notes.get(note.id)).toEqual(note);
  });
});

describe('duplicateNote', () => {
  it('copies content with new ids and no pin', async () => {
    const note = await createNote({
      kind: 'list',
      title: 'Trip',
      pinned: true,
      color: 'green',
      labelIds: ['l1'],
      items: [{ id: 'i1', text: 'Passport', done: true }],
    });
    const copy = await duplicateNote(note.id);
    expect(copy).toMatchObject({ kind: 'list', title: 'Trip', color: 'green', labelIds: ['l1'], pinned: false });
    expect(copy?.id).not.toBe(note.id);
    expect(copy?.items[0]).toMatchObject({ text: 'Passport', done: true });
    expect(copy?.items[0].id).not.toBe('i1');
  });

  it('returns undefined for a missing note', async () => {
    expect(await duplicateNote('missing')).toBeUndefined();
  });
});

describe('labels', () => {
  it('creates once, ignoring case and spaces', async () => {
    const work = await createLabel(' Work ');
    expect(work.name).toBe('Work');
    expect(await createLabel('work')).toEqual(work);
    await expect(createLabel('  ')).rejects.toThrow('Label name is required');
  });

  it('refuses to rename onto another label', async () => {
    const work = await createLabel('Work');
    await createLabel('Home');
    await expect(renameLabel(work.id, 'home')).rejects.toThrow('A label with that name already exists');
    await renameLabel(work.id, 'Office');
    expect((await db.labels.get(work.id))?.name).toBe('Office');
  });

  it('removes a deleted label from notes but keeps the notes', async () => {
    const work = await createLabel('Work');
    const home = await createLabel('Home');
    const note = await createNote({ kind: 'note', labelIds: [work.id, home.id] });
    await deleteLabel(work.id);
    expect(await db.labels.get(work.id)).toBeUndefined();
    expect((await db.notes.get(note.id))?.labelIds).toEqual([home.id]);
  });
});

describe('positions', () => {
  const order = async () => (await db.notes.orderBy('position').toArray()).map((n) => n.id);

  it('puts new notes and copies at the top', async () => {
    const a = await createNote({ id: 'a', kind: 'note', title: 'A' });
    const b = await createNote({ id: 'b', kind: 'note', title: 'B' });
    expect(b.position).toBeLessThan(a.position);
    await duplicateNote('a');
    expect((await order())[0]).not.toBe('b');
  });

  it('keeps its place when edited', async () => {
    const a = await createNote({ id: 'a', kind: 'note', position: 5 });
    await updateNote('a', { title: 'Changed', color: 'blue', content: 'x' });
    expect((await db.notes.get('a'))?.position).toBe(a.position);
  });

  it('moves a note to the top when pinned or unpinned', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await togglePin('b');
    expect(await order()).toEqual(['b', 'a']);
    await togglePin('a');
    expect(await order()).toEqual(['a', 'b']);
  });

  it('moves restored and unarchived notes to the top', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await createNote({ id: 'c', kind: 'note', position: 2 });
    await trashNote('b');
    await restoreNote('b');
    expect((await order())[0]).toBe('b');
    await setArchived('c', true);
    await setArchived('c', false);
    expect((await order())[0]).toBe('c');
  });

  it('moves a note between two others', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await createNote({ id: 'c', kind: 'note', position: 2 });
    await moveNote('c', 'a', 'b');
    expect(await order()).toEqual(['a', 'c', 'b']);
    await moveNote('a', 'b', null);
    expect(await order()).toEqual(['c', 'b', 'a']);
    await moveNote('a', null, 'c');
    expect(await order()).toEqual(['a', 'c', 'b']);
  });

  it('does not count a move as an edit', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await db.notes.update('a', { updatedAt: 1000 });
    await moveNote('a', 'b', null);
    expect((await db.notes.get('a'))?.updatedAt).toBe(1000);
  });

  it('renumbers without changing the order of other notes', async () => {
    await createNote({ id: 'a', kind: 'note', position: 1 });
    await createNote({ id: 'hidden', kind: 'note', position: 1 + 1e-7 });
    await createNote({ id: 'b', kind: 'note', position: 1 + 2e-7 });
    await createNote({ id: 'z', kind: 'note', position: 9 });
    // In a filtered view showing a, b and z, drop z between a and b.
    await moveNote('z', 'a', 'b');
    const ids = await order();
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('hidden'));
    expect(ids.indexOf('hidden')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('z'));
    expect(ids.indexOf('z')).toBeLessThan(ids.indexOf('b'));
  });

  it('renumbers tied notes in the order the board shows them', async () => {
    await createNote({ id: 'n1', kind: 'note', position: 1 });
    await createNote({ id: 'n2', kind: 'note', position: 1 + 1e-7 });
    await createNote({ id: 'z1', kind: 'list', position: 3 });
    await createNote({ id: 'a1', kind: 'list', position: 3 });
    await createNote({ id: 'x', kind: 'note', position: 9 });
    // z1 was edited last; IndexedDB keeps ties in id order (a1 first).
    await db.notes.update('a1', { updatedAt: 1 });
    await db.notes.update('z1', { updatedAt: 2 });
    const board = async () =>
      selectBoardNotes(await db.notes.toArray(), [], { view: 'all', labelId: null, query: '' }).others.map((n) => n.id);
    const shown = (await board()).filter((id) => id === 'a1' || id === 'z1');
    // In Notes, drop x between n1 and n2: their gap is too small, so all renumber.
    await moveNote('x', 'n1', 'n2');
    expect((await board()).filter((id) => id === 'a1' || id === 'z1')).toEqual(shown);
  });

  it('gives notes pinned at the same moment different places', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await Promise.all([togglePin('a'), togglePin('b')]);
    const [a, b] = await Promise.all([db.notes.get('a'), db.notes.get('b')]);
    expect(a?.position).not.toBe(b?.position);
  });
});

describe('trash and edits', () => {
  // Trashing carries over in a backup restore only if it counts as an edit.
  it('counts moving to and from Trash as an edit', async () => {
    await createNote({ id: 'a', kind: 'note' });
    await db.notes.update('a', { updatedAt: 1 });
    await trashNote('a');
    const trashed = (await db.notes.get('a'))?.updatedAt ?? 0;
    expect(trashed).toBeGreaterThan(1);
    await db.notes.update('a', { updatedAt: 1 });
    await restoreNote('a');
    expect((await db.notes.get('a'))?.updatedAt).toBeGreaterThan(1);
    await trashNote('a');
    await db.notes.update('a', { updatedAt: 1 });
    await undoTrash('a');
    expect((await db.notes.get('a'))?.updatedAt).toBeGreaterThan(1);
  });
});
