import { db } from './db';
import { markDoneChanges, seenIfPast } from './due';
import { nextTopPosition } from './notes';
import { needsRenumber, positionBetween } from './order';
import { columnNotes, endOf, renumberColumn, sortedColumns, topOf } from './places';
import type { Column, Note } from './types';

// `columnId` is where the card ended up (a repeat leaving the Done column goes back to the first one).
export type PlaceResult = { before: Note; dateChanged: boolean; columnId: string };

// Puts a note in a column between two of its cards (null = start or end).
// Moving to another column is an edit. Entering a Done column marks an open
// date done (a repeat that moves on goes back to the top of the first
// column); leaving one reopens a done date.
export const placeNote = async (
  noteId: string,
  columnId: string,
  beforeId: string | null,
  afterId: string | null,
  now = Date.now(),
): Promise<PlaceResult | undefined> =>
  db.transaction('rw', db.notes, db.columns, async () => {
    const [note, column] = await Promise.all([db.notes.get(noteId), db.columns.get(columnId)]);
    if (!note || !column) return undefined;
    const find = async (id: string | null) => (id ? ((await db.notes.get(id))?.boardPosition ?? null) : null);
    let before = await find(beforeId);
    let after = await find(afterId);
    if (needsRenumber(before, after)) {
      await renumberColumn(column);
      before = await find(beforeId);
      after = await find(afterId);
    }
    const patch: Partial<Note> = { boardId: column.boardId, columnId, boardPosition: positionBetween(before, after) };
    let dateChanged = false;
    if (note.columnId !== columnId) {
      patch.updatedAt = now;
      const from = note.columnId ? await db.columns.get(note.columnId) : undefined;
      if (column.done && note.due && note.due.doneAt === null) {
        const done = markDoneChanges({ ...note, due: note.due }, now);
        patch.due = done.due;
        patch.items = done.items;
        dateChanged = true;
        if (done.due.doneAt === null) {
          const [first] = await sortedColumns(column.boardId);
          if (first && first.id !== columnId) {
            patch.columnId = first.id;
            patch.boardPosition = await topOf(first);
          }
        }
      } else if (!column.done && from?.done && note.due && note.due.doneAt !== null) {
        patch.due = seenIfPast({ ...note.due, doneAt: null, alertedAt: null }, now);
        dateChanged = true;
      }
    }
    await db.notes.update(noteId, patch);
    return { before: note, dateChanged, columnId: patch.columnId ?? columnId };
  });

// At the end of a column: "Move to column" and the editor's Board menu.
export const placeAtEnd = async (noteId: string, columnId: string, now = Date.now()) => {
  const column = await db.columns.get(columnId);
  if (!column) return undefined;
  const others = (await columnNotes(column)).filter((note) => note.id !== noteId);
  return placeNote(noteId, columnId, others[others.length - 1]?.id ?? null, null, now);
};

// Back to the top of the main board.
export const removeFromBoard = async (noteId: string) => {
  await db.transaction('rw', db.notes, async () => {
    const note = await db.notes.get(noteId);
    if (!note || note.boardId === null) return;
    await db.notes.update(noteId, {
      boardId: null,
      columnId: null,
      boardPosition: 0,
      position: await nextTopPosition(),
      updatedAt: Date.now(),
    });
  });
};

// Undo for a Done-column move or Mark done: date, items and place as they were.
export const putBackPlace = async (before: Note) => {
  await db.notes.update(before.id, {
    due: before.due,
    items: before.items,
    boardId: before.boardId,
    columnId: before.columnId,
    boardPosition: before.boardPosition,
    updatedAt: Date.now(),
  });
};

export type CardPlace = Pick<Note, 'boardId' | 'columnId' | 'boardPosition'>;

// Where a new card goes. If its column was deleted while the card was being
// written, it goes to the board's first column; null when the board is gone too.
export const newCardPlace = async (columnId: string, at: 'top' | 'bottom', boardId?: string): Promise<CardPlace | null> => {
  const column = (await db.columns.get(columnId)) ?? (boardId ? (await sortedColumns(boardId))[0] : undefined);
  if (!column) return null;
  return {
    boardId: column.boardId,
    columnId: column.id,
    boardPosition: at === 'top' ? await topOf(column) : await endOf(column),
  };
};

export type CardMove = 'up' | 'down' | 'top' | 'bottom';

// The index a menu move lands on in the column's visible order; null when it can't move.
export const moveIndex = (ids: string[], id: string, move: CardMove): number | null => {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  const target = move === 'up' ? index - 1 : move === 'down' ? index + 1 : move === 'top' ? 0 : ids.length - 1;
  return target < 0 || target >= ids.length || target === index ? null : target;
};

export type DropTarget = { type: 'card'; id: string } | { type: 'column'; id: string };

// The board's order while a card is dragged: over a card it takes that
// card's place; over a column's empty space it goes to the end.
export const moveInColumns = (
  order: Record<string, string[]>,
  activeId: string,
  over: DropTarget,
): Record<string, string[]> => {
  const from = Object.keys(order).find((key) => order[key].includes(activeId));
  const to = over.type === 'column' ? over.id : Object.keys(order).find((key) => order[key].includes(over.id));
  if (!from || !to || (over.type === 'card' && over.id === activeId)) return order;
  if (over.type === 'column' && from === to) return order;
  const next = { ...order, [from]: order[from].filter((id) => id !== activeId) };
  const target = [...next[to]];
  const index = over.type === 'card' ? order[to].indexOf(over.id) : target.length;
  target.splice(index, 0, activeId);
  return { ...next, [to]: target };
};
