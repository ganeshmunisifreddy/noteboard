import { db } from './db';
import type { Column, Note } from './types';

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Ties (e.g. from a restored backup) are broken by id, so the order never jumps.
export const byPosition = <T extends { id: string; position: number }>(a: T, b: T) =>
  a.position - b.position || byId(a, b);

export const byBoardPosition = (a: Note, b: Note) => a.boardPosition - b.boardPosition || byId(a, b);

export const sortedColumns = async (boardId: string) =>
  (await db.columns.where('boardId').equals(boardId).toArray()).sort(byPosition);

// Every note in a column, archived and trashed ones included (they keep their places).
export const columnNotes = async (column: Column) =>
  (await db.notes.where('boardId').equals(column.boardId).toArray())
    .filter((note) => note.columnId === column.id)
    .sort(byBoardPosition);

export const topOf = async (column: Column) => {
  const [first] = await columnNotes(column);
  return first ? first.boardPosition - 1 : 0;
};

export const endOf = async (column: Column) => {
  const notes = await columnNotes(column);
  return notes.length > 0 ? notes[notes.length - 1].boardPosition + 1 : 0;
};
