import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addColumn,
  boardCards,
  createBoard,
  deleteBoard,
  deleteColumn,
  moveBoardTo,
  orderInGroup,
  moveColumn,
  moveColumnTo,
  placeNames,
  renameBoard,
  renameColumn,
  restoreBoard,
  restoreColumn,
  setDoneColumn,
  starBoard,
  summarizeBoards,
} from './boards';
import { db } from './db';
import { createNote } from './notes';
import { sortedColumns } from './places';
import { makeNote } from './testUtils';

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.restoreAllMocks();
});

const names = async (boardId: string) => (await sortedColumns(boardId)).map((c) => (c.done ? `${c.name}*` : c.name));

// Puts a note in a column directly (placing rules are tested in cards.test.ts).
const card = (id: string, columnId: string, boardId: string, boardPosition: number, extra = {}) =>
  db.notes.add(makeNote({ id, columnId, boardId, boardPosition, ...extra }));

describe('boards', () => {
  it('creates boards from templates, in order', async () => {
    const basic = await createBoard('  Website  ', 'basic');
    const pipeline = await createBoard('Hiring', 'pipeline');
    const nnl = await createBoard('Plans', 'now-next-later');
    const empty = await createBoard('Scratch', 'empty');
    expect(basic.name).toBe('Website');
    expect([basic, pipeline, nnl, empty].map((b) => b.position)).toEqual([0, 1, 2, 3]);
    expect(await names(basic.id)).toEqual(['To do', 'Doing', 'Done*']);
    expect(await names(pipeline.id)).toEqual(['Ideas', 'Next', 'In progress', 'Review', 'Done*']);
    expect(await names(nnl.id)).toEqual(['Now', 'Next', 'Later']);
    expect(await names(empty.id)).toEqual([]);
  });

  it('needs a name and cuts long ones', async () => {
    await expect(createBoard('   ', 'basic')).rejects.toThrow('Enter a name.');
    expect((await createBoard('x'.repeat(80), 'empty')).name).toHaveLength(60);
  });

  it('renames a board as an edit', async () => {
    const board = await createBoard('Old', 'empty');
    vi.spyOn(Date, 'now').mockReturnValue(9999);
    await renameBoard(board.id, ' New ');
    expect(await db.boards.get(board.id)).toMatchObject({ name: 'New', updatedAt: 9999 });
    await expect(renameBoard(board.id, '')).rejects.toThrow('Enter a name.');
  });
});

describe('columns', () => {
  it('adds a column at the end', async () => {
    const board = await createBoard('B', 'basic');
    await addColumn(board.id, 'Blocked');
    expect(await names(board.id)).toEqual(['To do', 'Doing', 'Done*', 'Blocked']);
    await expect(addColumn(board.id, ' ')).rejects.toThrow('Enter a name.');
    expect((await addColumn(board.id, 'y'.repeat(50))).name).toHaveLength(40);
  });

  it('renames and moves columns', async () => {
    const board = await createBoard('B', 'basic');
    const [todo, doing] = await sortedColumns(board.id);
    await renameColumn(todo.id, 'Backlog');
    await moveColumn(doing.id, -1);
    expect(await names(board.id)).toEqual(['Doing', 'Backlog', 'Done*']);
    await moveColumn(doing.id, -1); // already first: no change
    expect(await names(board.id)).toEqual(['Doing', 'Backlog', 'Done*']);
  });

  it('keeps one Done column per board', async () => {
    const board = await createBoard('B', 'basic');
    const [todo, , done] = await sortedColumns(board.id);
    await setDoneColumn(todo.id, true);
    expect(await names(board.id)).toEqual(['To do*', 'Doing', 'Done']);
    await setDoneColumn(todo.id, false);
    expect(await names(board.id)).toEqual(['To do', 'Doing', 'Done']);
    expect((await db.columns.get(done.id))?.done).toBe(false);
  });

  it('moves a deleted column’s notes to the column on its left, and Undo puts them back', async () => {
    const board = await createBoard('B', 'basic');
    const [todo, doing] = await sortedColumns(board.id);
    await card('a', todo.id, board.id, 0);
    await card('b', doing.id, board.id, 0);
    await card('c', doing.id, board.id, 1);
    const snapshot = await deleteColumn(doing.id);
    expect(await names(board.id)).toEqual(['To do', 'Done*']);
    const moved = (await db.notes.bulkGet(['a', 'b', 'c'])).map((n) => [n?.id, n?.columnId, n?.boardPosition]);
    expect(moved).toEqual([
      ['a', todo.id, 0],
      ['b', todo.id, 1],
      ['c', todo.id, 2],
    ]);
    await restoreColumn(snapshot!);
    expect(await names(board.id)).toEqual(['To do', 'Doing', 'Done*']);
    expect((await db.notes.get('c'))?.columnId).toBe(doing.id);
  });

  it('moves notes right when the first column goes, and to the main board when the only one goes', async () => {
    const board = await createBoard('B', 'now-next-later');
    const [now, next] = await sortedColumns(board.id);
    await card('a', now.id, board.id, 0);
    await deleteColumn(now.id);
    expect((await db.notes.get('a'))?.columnId).toBe(next.id);
    const solo = await createBoard('Solo', 'empty');
    const only = await addColumn(solo.id, 'Only');
    await card('s', only.id, solo.id, 0);
    await deleteColumn(only.id);
    expect(await db.notes.get('s')).toMatchObject({ boardId: null, columnId: null, boardPosition: 0 });
  });

  it('moves archived and trashed notes too', async () => {
    const board = await createBoard('B', 'basic');
    const [todo, doing] = await sortedColumns(board.id);
    await card('arch', doing.id, board.id, 0, { archived: true });
    await card('bin', doing.id, board.id, 1, { trashedAt: 5 });
    await deleteColumn(doing.id);
    expect((await db.notes.bulkGet(['arch', 'bin'])).map((n) => n?.columnId)).toEqual([todo.id, todo.id]);
    await deleteBoard(board.id, 'keep');
    expect((await db.notes.bulkGet(['arch', 'bin'])).map((n) => n?.columnId)).toEqual([null, null]);
  });
});

describe('deleting a board', () => {
  it('keeps the notes on the main board, in board order on top', async () => {
    await createNote({ id: 'main', kind: 'note' });
    const board = await createBoard('B', 'basic');
    const [todo, doing] = await sortedColumns(board.id);
    await card('first', todo.id, board.id, 0);
    await card('second', doing.id, board.id, 0);
    const snapshot = await deleteBoard(board.id, 'keep');
    expect(await db.boards.count()).toBe(0);
    expect(await db.columns.count()).toBe(0);
    const ordered = (await db.notes.orderBy('position').toArray()).map((n) => [n.id, n.boardId, n.trashedAt]);
    expect(ordered).toEqual([
      ['first', null, null],
      ['second', null, null],
      ['main', null, null],
    ]);
    await restoreBoard(snapshot!);
    expect(await db.notes.get('first')).toMatchObject({ boardId: board.id, columnId: todo.id });
    expect(await db.columns.count()).toBe(3);
  });

  it('moves the notes to Trash', async () => {
    const board = await createBoard('B', 'basic');
    const [todo] = await sortedColumns(board.id);
    await card('a', todo.id, board.id, 0);
    await card('old', todo.id, board.id, 1, { trashedAt: 5 });
    await deleteBoard(board.id, 'trash');
    expect((await db.notes.get('a'))?.trashedAt).not.toBeNull();
    expect((await db.notes.get('old'))?.trashedAt).toBe(5);
    expect((await db.notes.get('a'))?.boardId).toBeNull();
  });
});

describe('board views', () => {
  it('summarises boards for their tiles', async () => {
    const board = await createBoard('B', 'basic');
    const [todo, doing] = await sortedColumns(board.id);
    await card('a', todo.id, board.id, 0);
    await card('b', todo.id, board.id, 1);
    await card('c', doing.id, board.id, 0, { archived: true });
    const [summary] = summarizeBoards(await db.boards.toArray(), await db.columns.toArray(), await db.notes.toArray());
    expect(summary.total).toBe(2);
    expect(summary.columns.map((c) => [c.name, c.count])).toEqual([
      ['To do', 2],
      ['Doing', 0],
      ['Done', 0],
    ]);
  });

  it('lists each column’s cards in order, without archived or trashed ones', async () => {
    const board = await createBoard('B', 'basic');
    const columns = await sortedColumns(board.id);
    const [todo] = columns;
    await card('later', todo.id, board.id, 2);
    await card('first', todo.id, board.id, 1);
    await card('gone', todo.id, board.id, 0, { trashedAt: 1 });
    const cards = boardCards(columns, await db.notes.toArray());
    expect(cards.get(todo.id)?.map((n) => n.id)).toEqual(['first', 'later']);
    expect(cards.get(columns[1].id)).toEqual([]);
  });

  it('names places as “Board · Column”', async () => {
    const board = await createBoard('Website', 'basic');
    const [todo] = await sortedColumns(board.id);
    const map = placeNames(await db.boards.toArray(), await db.columns.toArray());
    expect(map.get(todo.id)).toBe('Website · To do');
  });
});

describe('Undo after deleting', () => {
  it('keeps edits made after a column was deleted', async () => {
    const board = await createBoard('B', 'basic');
    const [todo, doing] = await sortedColumns(board.id);
    await card('a', doing.id, board.id, 0);
    const snapshot = await deleteColumn(doing.id);
    await db.notes.update('a', { title: 'Edited after' });
    await restoreColumn(snapshot!);
    expect(await db.notes.get('a')).toMatchObject({ title: 'Edited after', columnId: doing.id });
    expect(todo).toBeDefined();
  });

  it('keeps edits made after a board was deleted', async () => {
    const board = await createBoard('B', 'basic');
    const [todo] = await sortedColumns(board.id);
    await card('a', todo.id, board.id, 0);
    const snapshot = await deleteBoard(board.id, 'trash');
    await db.notes.update('a', { title: 'Edited after' });
    await restoreBoard(snapshot!);
    expect(await db.notes.get('a')).toMatchObject({ title: 'Edited after', columnId: todo.id, trashedAt: null });
  });
});

describe('ordering and stars', () => {
  const order = async () => (await db.boards.orderBy('position').toArray()).map((b) => b.name);

  it('starts boards unstarred and stars them as an edit', async () => {
    const board = await createBoard('A', 'empty');
    expect(board.starred).toBe(false);
    vi.spyOn(Date, 'now').mockReturnValue(board.updatedAt + 10);
    await starBoard(board.id, true);
    expect(await db.boards.get(board.id)).toMatchObject({ starred: true, updatedAt: board.updatedAt + 10 });
  });

  it('moves a board within its group, leaving the other group in place', async () => {
    const a = await createBoard('A', 'empty');
    await createBoard('B', 'empty');
    const c = await createBoard('C', 'empty');
    const d = await createBoard('D', 'empty');
    await starBoard(a.id, true);
    await starBoard(c.id, true);
    // Unstarred group is B, D: move D first.
    await moveBoardTo(d.id, 0);
    expect(await order()).toEqual(['A', 'D', 'C', 'B']);
    // Starred group is A, C: move A after C.
    await moveBoardTo(a.id, 1);
    expect(await order()).toEqual(['C', 'D', 'A', 'B']);
  });

  it('orders a group in place, keeping the other group’s slots', () => {
    const boards = [
      { id: 'S1', starred: true },
      { id: 'U1', starred: false },
      { id: 'S2', starred: true },
      { id: 'U2', starred: false },
    ];
    expect(orderInGroup(boards, 'U2', 0)).toEqual(['S1', 'U2', 'S2', 'U1']);
    expect(orderInGroup(boards, 'S1', 1)).toEqual(['S2', 'U1', 'S1', 'U2']);
  });

  it('clamps the index and ignores missing boards', async () => {
    await createBoard('A', 'empty');
    const b = await createBoard('B', 'empty');
    await moveBoardTo(b.id, -5);
    expect(await order()).toEqual(['B', 'A']);
    await moveBoardTo('missing', 0);
    expect(await order()).toEqual(['B', 'A']);
  });

  it('moves a column to any index', async () => {
    const board = await createBoard('P', 'pipeline');
    const [ideas] = await sortedColumns(board.id);
    await moveColumnTo(ideas.id, 3);
    expect(await names(board.id)).toEqual(['Next', 'In progress', 'Review', 'Ideas', 'Done*']);
    await moveColumnTo(ideas.id, 99);
    expect(await names(board.id)).toEqual(['Next', 'In progress', 'Review', 'Done*', 'Ideas']);
  });
});
