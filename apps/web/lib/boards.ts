import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from './db';
import { nextTopPosition } from './notes';
import { moveToIndex } from './order';
import { byBoardPosition, byPosition, columnNotes, endOf, sortedColumns } from './places';
import type { Board, Column, Note } from './types';

export type BoardTemplate = 'basic' | 'pipeline' | 'now-next-later' | 'empty';

const col = (name: string, done = false) => ({ name, done });

export const BOARD_TEMPLATES: { id: BoardTemplate; label: string; columns: { name: string; done: boolean }[] }[] = [
  { id: 'basic', label: 'Basic', columns: [col('To do'), col('Doing'), col('Done', true)] },
  {
    id: 'pipeline',
    label: 'Pipeline',
    columns: [col('Ideas'), col('Next'), col('In progress'), col('Review'), col('Done', true)],
  },
  { id: 'now-next-later', label: 'Now / Next / Later', columns: [col('Now'), col('Next'), col('Later')] },
  { id: 'empty', label: 'Empty', columns: [] },
];

export const BOARD_NAME_MAX = 60;
export const COLUMN_NAME_MAX = 40;
const NAME_REQUIRED = 'Enter a name.';

// Trimmed and cut to length; null when nothing is left.
export const cleanName = (name: string, max: number): string | null => name.trim().slice(0, max).trim() || null;

const required = (name: string, max: number) => {
  const clean = cleanName(name, max);
  if (!clean) throw new Error(NAME_REQUIRED);
  return clean;
};

export const createBoard = async (name: string, template: BoardTemplate): Promise<Board> => {
  const clean = required(name, BOARD_NAME_MAX);
  const columns = BOARD_TEMPLATES.find((t) => t.id === template)?.columns ?? [];
  const now = Date.now();
  return db.transaction('rw', db.boards, db.columns, async () => {
    const last = await db.boards.orderBy('position').last();
    const board: Board = {
      id: uuid(),
      name: clean,
      position: last ? last.position + 1 : 0,
      starred: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.boards.add(board);
    await db.columns.bulkAdd(
      columns.map((c, index) => ({ id: uuid(), boardId: board.id, name: c.name, position: index, done: c.done, updatedAt: now })),
    );
    return board;
  });
};

export const renameBoard = async (id: string, name: string) => {
  const clean = required(name, BOARD_NAME_MAX);
  await db.boards.update(id, { name: clean, updatedAt: Date.now() });
};

export const starBoard = async (id: string, starred: boolean) => {
  await db.boards.update(id, { starred, updatedAt: Date.now() });
};

// Positions 0, 1, 2, … in the given order, writing only the records that change.
const renumber = <T extends { id: string; position: number; updatedAt: number }>(records: T[], ids: string[]) => {
  const byId = new Map(records.map((r) => [r.id, r]));
  const now = Date.now();
  return ids.flatMap((id, position) => {
    const record = byId.get(id);
    return !record || record.position === position ? [] : [{ ...record, position, updatedAt: now }];
  });
};

// The order after moving a board to `index` among the boards in its group
// (starred or not); the other group's boards keep their slots.
export const orderInGroup = (boards: Pick<Board, 'id' | 'starred'>[], id: string, index: number): string[] => {
  const board = boards.find((b) => b.id === id);
  if (!board) return boards.map((b) => b.id);
  const group = boards.filter((b) => b.starred === board.starred).map((b) => b.id);
  const moved = moveToIndex(group, id, Math.max(0, Math.min(index, group.length - 1)));
  let next = 0;
  return boards.map((b) => (b.starred === board.starred ? moved[next++] : b.id));
};

// Moves a board to `index` among the boards in its group.
export const moveBoardTo = async (id: string, index: number) => {
  await db.transaction('rw', db.boards, async () => {
    const boards = (await db.boards.toArray()).sort(byPosition);
    if (!boards.some((b) => b.id === id)) return;
    await db.boards.bulkPut(renumber(boards, orderInGroup(boards, id, index)));
  });
};

// Notes leaving a board go to the top of the main board, keeping the board's order.
const toMainBoard = async (notes: Note[], now: number) => {
  let top = await nextTopPosition();
  const placed: Note[] = [];
  for (const note of [...notes].reverse()) {
    placed.unshift({ ...note, boardId: null, columnId: null, boardPosition: 0, position: top, updatedAt: now });
    top -= 1;
  }
  return placed;
};

// Undo puts back where the notes were (and whether they were in Trash),
// keeping any edits made to them since.
const putBackPlaces = async (notes: Note[]) => {
  const now = Date.now();
  await Promise.all(
    notes.map(({ id, boardId, columnId, boardPosition, position, trashedAt }) =>
      db.notes.update(id, { boardId, columnId, boardPosition, position, trashedAt, updatedAt: now }),
    ),
  );
};

export type BoardSnapshot = { board: Board; columns: Column[]; notes: Note[] };

// The board, its columns and its cards' places go together; the notes either
// return to the main board or go to Trash (archived and trashed ones too).
export const deleteBoard = async (id: string, notesTo: 'keep' | 'trash'): Promise<BoardSnapshot | undefined> => {
  const snapshot = await db.transaction('rw', db.boards, db.columns, db.notes, async () => {
    const board = await db.boards.get(id);
    if (!board) return undefined;
    const columns = await sortedColumns(id);
    const order = new Map(columns.map((c, index) => [c.id, index]));
    const notes = (await db.notes.where('boardId').equals(id).toArray()).sort(
      (a, b) => (order.get(a.columnId ?? '') ?? 0) - (order.get(b.columnId ?? '') ?? 0) || byBoardPosition(a, b),
    );
    const now = Date.now();
    const moved = (await toMainBoard(notes, now)).map((note) =>
      notesTo === 'trash' && note.trashedAt === null ? { ...note, trashedAt: now } : note,
    );
    await db.notes.bulkPut(moved);
    await db.columns.bulkDelete(columns.map((c) => c.id));
    await db.boards.delete(id);
    return { board, columns, notes };
  });
  return snapshot;
};

// Undo for deleteBoard.
export const restoreBoard = async ({ board, columns, notes }: BoardSnapshot) => {
  await db.transaction('rw', db.boards, db.columns, db.notes, async () => {
    await db.boards.put(board);
    await db.columns.bulkPut(columns);
    await putBackPlaces(notes);
  });
};

export const addColumn = async (boardId: string, name: string): Promise<Column> => {
  const clean = required(name, COLUMN_NAME_MAX);
  return db.transaction('rw', db.columns, async () => {
    const columns = await sortedColumns(boardId);
    const last = columns[columns.length - 1];
    const column: Column = {
      id: uuid(),
      boardId,
      name: clean,
      position: last ? last.position + 1 : 0,
      done: false,
      updatedAt: Date.now(),
    };
    await db.columns.add(column);
    return column;
  });
};

export const renameColumn = async (id: string, name: string) => {
  const clean = required(name, COLUMN_NAME_MAX);
  await db.columns.update(id, { name: clean, updatedAt: Date.now() });
};

export const moveColumnTo = async (id: string, index: number) => {
  await db.transaction('rw', db.columns, async () => {
    const column = await db.columns.get(id);
    if (!column) return;
    const columns = await sortedColumns(column.boardId);
    const ids = moveToIndex(
      columns.map((c) => c.id),
      id,
      Math.max(0, Math.min(index, columns.length - 1)),
    );
    await db.columns.bulkPut(renumber(columns, ids));
  });
};

// Swaps a column with its neighbour.
export const moveColumn = async (id: string, direction: -1 | 1) => {
  await db.transaction('rw', db.columns, async () => {
    const column = await db.columns.get(id);
    if (!column) return;
    const index = (await sortedColumns(column.boardId)).findIndex((c) => c.id === id);
    if (index + direction >= 0) await moveColumnTo(id, index + direction);
  });
};

// At most one Done column per board.
export const setDoneColumn = async (id: string, done: boolean) => {
  await db.transaction('rw', db.columns, async () => {
    const column = await db.columns.get(id);
    if (!column) return;
    const now = Date.now();
    const changed = (await sortedColumns(column.boardId)).flatMap((c) => {
      const next = c.id === id ? done : done ? false : c.done;
      return next === c.done ? [] : [{ ...c, done: next, updatedAt: now }];
    });
    await db.columns.bulkPut(changed);
  });
};

export type ColumnSnapshot = { column: Column; notes: Note[] };

// Its notes (archived and trashed too) move to the end of the column on its
// left, or on its right if it was first, or back to the main board if it was the only one.
export const deleteColumn = async (id: string): Promise<ColumnSnapshot | undefined> =>
  db.transaction('rw', db.columns, db.notes, async () => {
    const column = await db.columns.get(id);
    if (!column) return undefined;
    const columns = await sortedColumns(column.boardId);
    const index = columns.findIndex((c) => c.id === id);
    const target = columns[index - 1] ?? columns[index + 1] ?? null;
    const notes = await columnNotes(column);
    const now = Date.now();
    let moved: Note[];
    if (target) {
      const start = await endOf(target);
      moved = notes.map((note, i) => ({ ...note, columnId: target.id, boardPosition: start + i, updatedAt: now }));
    } else {
      moved = await toMainBoard(notes, now);
    }
    await db.notes.bulkPut(moved);
    await db.columns.delete(id);
    return { column, notes };
  });

// Undo for deleteColumn.
export const restoreColumn = async ({ column, notes }: ColumnSnapshot) => {
  await db.transaction('rw', db.columns, db.notes, async () => {
    await db.columns.put(column);
    await putBackPlaces(notes);
  });
};

const isActive = (note: Note) => !note.archived && note.trashedAt === null;

export type BoardSummary = { board: Board; columns: { id: string; name: string; count: number }[]; total: number };

export const summarizeBoards = (boards: Board[], columns: Column[], notes: Note[]): BoardSummary[] => {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (note.columnId && isActive(note)) counts.set(note.columnId, (counts.get(note.columnId) ?? 0) + 1);
  }
  return [...boards].sort(byPosition).map((board) => {
    const own = columns
      .filter((c) => c.boardId === board.id)
      .sort(byPosition)
      .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }));
    return { board, columns: own, total: own.reduce((sum, c) => sum + c.count, 0) };
  });
};

// Each column's visible cards, in order.
export const boardCards = (columns: Column[], notes: Note[]): Map<string, Note[]> => {
  const cards = new Map<string, Note[]>(columns.map((c) => [c.id, []]));
  for (const note of notes) {
    if (note.columnId && isActive(note)) cards.get(note.columnId)?.push(note);
  }
  for (const list of cards.values()) list.sort(byBoardPosition);
  return cards;
};

export type BoardData = { board: Board; columns: Column[]; cards: Map<string, Note[]> };

// Board notes are found by the boardId index, which skips main-board notes.
const boardNotes = () => db.notes.where('boardId').above('').toArray();

export const useBoardSummaries = (): BoardSummary[] | undefined =>
  useLiveQuery(
    () =>
      Promise.all([db.boards.toArray(), db.columns.toArray(), boardNotes()])
        .then(([boards, columns, notes]) => summarizeBoards(boards, columns, notes))
        .catch((): BoardSummary[] => []),
    [],
  );

// undefined while loading, null when the board doesn't exist.
export const useBoard = (id: string): BoardData | null | undefined =>
  useLiveQuery(async () => {
    try {
      const board = await db.boards.get(id);
      if (!board) return null;
      const columns = await sortedColumns(id);
      const notes = await db.notes.where('boardId').equals(id).toArray();
      return { board, columns, cards: boardCards(columns, notes) };
    } catch {
      return null;
    }
  }, [id]);

export const useBoardColumns = (): { board: Board; columns: Column[] }[] | undefined =>
  useLiveQuery(
    () =>
      Promise.all([db.boards.toArray(), db.columns.toArray()])
        .then(([boards, columns]) =>
          [...boards].sort(byPosition).map((board) => ({
            board,
            columns: columns.filter((c) => c.boardId === board.id).sort(byPosition),
          })),
        )
        .catch(() => []),
    [],
  );

// columnId → "Board · Column", for tags on cards outside the board.
export const placeNames = (boards: Board[], columns: Column[]): Map<string, string> => {
  const boardName = new Map(boards.map((b) => [b.id, b.name]));
  return new Map(
    columns.flatMap((c) => {
      const name = boardName.get(c.boardId);
      return name ? [[c.id, `${name} · ${c.name}`] as const] : [];
    }),
  );
};

export const usePlaceNames = (): Map<string, string> | undefined =>
  useLiveQuery(
    () =>
      Promise.all([db.boards.toArray(), db.columns.toArray()])
        .then(([boards, columns]) => placeNames(boards, columns))
        .catch(() => new Map<string, string>()),
    [],
  );
