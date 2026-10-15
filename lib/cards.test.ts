import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from './boards';
import { localDate, localMoment } from './calendar';
import {
  moveIndex,
  moveInColumns,
  moveShown,
  newCardPlace,
  placeAtEnd,
  placeNote,
  putBackPlace,
  removeFromBoard,
} from './cards';
import { db } from './db';
import { newDue } from './due';
import { createNote } from './notes';
import { sortedColumns } from './places';
import { presetRepeat } from './repeat';
import { makeNote } from './testUtils';

const NOON = localMoment('2026-10-15', '12:00');

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.restoreAllMocks();
});

const setup = async (template: 'basic' | 'empty' = 'basic') => {
  const board = await createBoard('B', template);
  return { board, columns: await sortedColumns(board.id) };
};

const card = (id: string, columnId: string, boardId: string, boardPosition: number, extra = {}) =>
  db.notes.add(makeNote({ id, columnId, boardId, boardPosition, updatedAt: 1, ...extra }));

describe('placeNote', () => {
  it('reorders within a column without counting as an edit', async () => {
    const { board, columns } = await setup();
    const [todo] = columns;
    await card('a', todo.id, board.id, 0);
    await card('b', todo.id, board.id, 1);
    await placeNote('b', todo.id, null, 'a');
    expect(await db.notes.get('b')).toMatchObject({ boardPosition: -1, updatedAt: 1 });
  });

  it('moves to another column as an edit', async () => {
    const { board, columns } = await setup();
    const [todo, doing] = columns;
    await card('a', todo.id, board.id, 0);
    vi.spyOn(Date, 'now').mockReturnValue(500);
    await placeNote('a', doing.id, null, null);
    expect(await db.notes.get('a')).toMatchObject({ columnId: doing.id, boardPosition: 0, updatedAt: 500 });
  });

  it('puts a main-board note on a board', async () => {
    const { board, columns } = await setup();
    const note = await createNote({ kind: 'note', title: 'Loose' });
    await placeNote(note.id, columns[0].id, null, null);
    expect(await db.notes.get(note.id)).toMatchObject({ boardId: board.id, columnId: columns[0].id });
  });

  it('renumbers a crowded column', async () => {
    const { board, columns } = await setup();
    const [todo] = columns;
    await card('a', todo.id, board.id, 0);
    await card('b', todo.id, board.id, 1e-7);
    await card('c', todo.id, board.id, 5);
    await placeNote('c', todo.id, 'a', 'b');
    const order = (await db.notes.toArray()).sort((x, y) => x.boardPosition - y.boardPosition).map((n) => n.id);
    expect(order).toEqual(['a', 'c', 'b']);
  });

  it('marks a date done when a card enters the Done column', async () => {
    const { board, columns } = await setup();
    const [todo, , done] = columns;
    await card('a', todo.id, board.id, 0, { due: newDue('2026-10-15', null, null) });
    const result = await placeNote('a', done.id, null, null, NOON);
    expect(result?.dateChanged).toBe(true);
    expect((await db.notes.get('a'))?.due?.doneAt).toBe(NOON);
  });

  it('sends a repeat back to the top of the first column with its next date', async () => {
    const { board, columns } = await setup();
    const [todo, doing, done] = columns;
    await card('top', todo.id, board.id, 0);
    await card('r', doing.id, board.id, 0, {
      kind: 'list',
      items: [{ id: 'i', text: 'Sweep', done: true }],
      due: newDue('2026-10-15', null, presetRepeat('daily', '2026-10-15')),
    });
    await placeNote('r', done.id, null, null, NOON);
    expect(await db.notes.get('r')).toMatchObject({
      columnId: todo.id,
      boardPosition: -1,
      due: { date: '2026-10-16', doneAt: null },
      items: [{ id: 'i', text: 'Sweep', done: false }],
    });
  });

  it('keeps a repeat in place when the Done column is first', async () => {
    const board = await createBoard('B', 'empty');
    const { addColumn, setDoneColumn } = await import('./boards');
    const done = await addColumn(board.id, 'Done');
    const todo = await addColumn(board.id, 'To do');
    await setDoneColumn(done.id, true);
    await card('r', todo.id, board.id, 0, { due: newDue('2026-10-15', null, presetRepeat('daily', '2026-10-15')) });
    await placeNote('r', done.id, null, null, NOON);
    expect(await db.notes.get('r')).toMatchObject({ columnId: done.id, due: { date: '2026-10-16', doneAt: null } });
  });

  it('reopens a done date when a card leaves the Done column', async () => {
    const { board, columns } = await setup();
    const [todo, , done] = columns;
    await card('a', done.id, board.id, 0, { due: { ...newDue('2026-10-20', null, null), doneAt: 5 } });
    const result = await placeNote('a', todo.id, null, null, NOON);
    expect(result?.dateChanged).toBe(true);
    expect((await db.notes.get('a'))?.due?.doneAt).toBeNull();
  });

  it('only moves cards without a date', async () => {
    const { board, columns } = await setup();
    await card('a', columns[0].id, board.id, 0);
    const result = await placeNote('a', columns[2].id, null, null, NOON);
    expect(result?.dateChanged).toBe(false);
  });

  it('puts everything back with putBackPlace', async () => {
    const { board, columns } = await setup();
    const [todo, , done] = columns;
    await card('a', todo.id, board.id, 3, { due: newDue('2026-10-15', null, null) });
    const result = await placeNote('a', done.id, null, null, NOON);
    await putBackPlace(result!.before);
    expect(await db.notes.get('a')).toMatchObject({ columnId: todo.id, boardPosition: 3, due: { doneAt: null } });
  });
});

describe('other card moves', () => {
  it('places at the end of a column', async () => {
    const { board, columns } = await setup();
    await card('a', columns[1].id, board.id, 4);
    await card('b', columns[0].id, board.id, 0);
    await placeAtEnd('b', columns[1].id);
    expect((await db.notes.get('b'))?.boardPosition).toBe(5);
  });

  it('removes a note from its board to the top of the main board', async () => {
    const { board, columns } = await setup();
    await createNote({ id: 'main', kind: 'note' });
    await card('a', columns[0].id, board.id, 0);
    await removeFromBoard('a');
    expect(await db.notes.get('a')).toMatchObject({ boardId: null, columnId: null, boardPosition: 0 });
    expect((await db.notes.orderBy('position').first())?.id).toBe('a');
  });

  it('finds where a new card goes', async () => {
    const { board, columns } = await setup();
    await card('a', columns[0].id, board.id, 2);
    expect(await newCardPlace(columns[0].id, 'top')).toEqual({ boardId: board.id, columnId: columns[0].id, boardPosition: 1 });
    expect(await newCardPlace(columns[0].id, 'bottom')).toEqual({ boardId: board.id, columnId: columns[0].id, boardPosition: 3 });
    expect(await newCardPlace('missing', 'top')).toBeNull();
  });

  it('works out menu moves', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveIndex(ids, 'b', 'up')).toBe(0);
    expect(moveIndex(ids, 'b', 'down')).toBe(2);
    expect(moveIndex(ids, 'c', 'top')).toBe(0);
    expect(moveIndex(ids, 'a', 'bottom')).toBe(2);
    expect(moveIndex(ids, 'a', 'up')).toBeNull();
    expect(moveIndex(ids, 'c', 'bottom')).toBeNull();
  });

  it('previews drags across columns', () => {
    const order = { todo: ['a', 'b'], doing: ['c'] };
    expect(moveInColumns(order, 'a', { type: 'card', id: 'c' })).toEqual({ todo: ['b'], doing: ['a', 'c'] });
    expect(moveInColumns(order, 'a', { type: 'column', id: 'doing' })).toEqual({ todo: ['b'], doing: ['c', 'a'] });
    expect(moveInColumns(order, 'b', { type: 'card', id: 'a' })).toEqual({ todo: ['b', 'a'], doing: ['c'] });
    expect(moveInColumns(order, 'a', { type: 'column', id: 'todo' })).toEqual(order);
  });
});

describe('new cards whose column is gone', () => {
  it('go to the board’s first column', async () => {
    const { board, columns } = await setup();
    expect(await newCardPlace('gone', 'bottom', board.id)).toEqual({
      boardId: board.id,
      columnId: columns[0].id,
      boardPosition: 0,
    });
    expect(await newCardPlace('gone', 'bottom', 'no-board')).toBeNull();
  });
});

describe('moveShown', () => {
  it('moves like moveIndex when nothing is hidden', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveShown(ids, ids, 'a', 'down')).toEqual(['b', 'a', 'c']);
    expect(moveShown(ids, ids, 'c', 'top')).toEqual(['c', 'a', 'b']);
    expect(moveShown(ids, ids, 'a', 'up')).toBeNull();
  });

  it('passes the next shown card and keeps hidden cards in order', () => {
    const ids = ['a', 'h1', 'b', 'h2', 'c'];
    const shown = ['a', 'b', 'c'];
    expect(moveShown(ids, shown, 'a', 'down')).toEqual(['h1', 'b', 'a', 'h2', 'c']);
    expect(moveShown(ids, shown, 'c', 'up')).toEqual(['a', 'h1', 'c', 'b', 'h2']);
    expect(moveShown(ids, shown, 'b', 'bottom')).toEqual(['a', 'h1', 'h2', 'c', 'b']);
    expect(moveShown(ids, shown, 'b', 'top')).toEqual(['b', 'a', 'h1', 'h2', 'c']);
  });
});
