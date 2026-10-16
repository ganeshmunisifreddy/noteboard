import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from './boards';
import { localDate, localMoment } from './calendar';
import { putBackPlace } from './cards';
import { db } from './db';
import { newDue } from './due';
import { createNote, duplicateNote, markDone, putBackDue, removeDue, reopenDue, setDue, snooze } from './notes';
import { sortedColumns } from './places';
import { presetRepeat } from './repeat';

const TODAY = localDate(Date.now());

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const clock = (ms: number) => vi.spyOn(Date, 'now').mockReturnValue(ms);

describe('dates on notes', () => {
  it('creates notes without a date', async () => {
    const note = await createNote({ kind: 'note' });
    expect(note.due).toBeNull();
  });

  it('sets a date as an edit, starting the repeat from it', async () => {
    clock(1000);
    const note = await createNote({ kind: 'note' });
    clock(2000);
    await setDue(note.id, '2026-10-20', '18:00', presetRepeat('weekly', '2000-01-01'));
    expect(await db.notes.get(note.id)).toMatchObject({
      updatedAt: 2000,
      due: newDue('2026-10-20', '18:00', presetRepeat('weekly', '2026-10-20')),
    });
  });

  it('removes a date and puts it back', async () => {
    const note = await createNote({ kind: 'note' });
    await setDue(note.id, '2026-10-20', null, null);
    const before = (await db.notes.get(note.id))?.due ?? null;
    await removeDue(note.id);
    expect((await db.notes.get(note.id))?.due).toBeNull();
    await putBackDue(note.id, before);
    expect((await db.notes.get(note.id))?.due).toEqual(before);
  });

  it('marks a date done and returns the note as it was', async () => {
    const note = await createNote({ kind: 'note' });
    await setDue(note.id, TODAY, null, null);
    clock(5000);
    const before = await markDone(note.id);
    expect(before?.due?.doneAt).toBeNull();
    expect(await db.notes.get(note.id)).toMatchObject({ updatedAt: 5000, due: { doneAt: 5000 } });
    expect(await markDone(note.id)).toBeUndefined();
  });

  it('moves a repeating list on and unticks its items; Undo puts them back', async () => {
    const items = [
      { id: 'a', text: 'Milk', done: true },
      { id: 'b', text: 'Eggs', done: false },
    ];
    const note = await createNote({ kind: 'list', items });
    await setDue(note.id, '2026-10-15', null, presetRepeat('daily', '2026-10-15'));
    const before = await markDone(note.id, localMoment('2026-10-15', '12:00'));
    const after = await db.notes.get(note.id);
    expect(after?.due).toMatchObject({ date: '2026-10-16', doneAt: null });
    expect(after?.items.map((i) => i.done)).toEqual([false, false]);

    await putBackDue(note.id, before?.due ?? null, before?.items);
    const undone = await db.notes.get(note.id);
    expect(undone?.due?.date).toBe('2026-10-15');
    expect(undone?.items).toEqual(items);
  });

  it('reopens a done date without alerting again', async () => {
    const note = await createNote({ kind: 'note' });
    await setDue(note.id, '2026-10-01', null, null);
    await markDone(note.id);
    const later = localMoment('2026-10-20', '12:00');
    await reopenDue(note.id, later);
    // Already past its time, so it counts as alerted.
    expect((await db.notes.get(note.id))?.due).toMatchObject({ doneAt: null, alertedAt: later });
  });

  it('snoozes: a new alert time, not yet alerted', async () => {
    const note = await createNote({ kind: 'note' });
    await setDue(note.id, '2026-10-01', null, null);
    await db.notes.update(note.id, { due: { ...newDue('2026-10-01', null, null), alertedAt: 1 } });
    await snooze(note.id, 7777);
    expect((await db.notes.get(note.id))?.due).toMatchObject({ snoozedUntil: 7777, alertedAt: null });
  });

  it('copies the date, but not whether it was done, alerted or snoozed', async () => {
    const note = await createNote({ kind: 'note' });
    await setDue(note.id, '2999-10-20', '18:00', null);
    await db.notes.update(note.id, {
      due: { ...newDue('2999-10-20', '18:00', null), doneAt: 1, alertedAt: 2, snoozedUntil: 3 },
    });
    const copy = await duplicateNote(note.id);
    expect(copy?.due).toEqual(newDue('2999-10-20', '18:00', null));
  });

  it('counts a date set in the past as already alerted', async () => {
    const note = await createNote({ kind: 'note' });
    const noon = localMoment('2026-10-15', '12:00');
    clock(noon);
    // No time: alerts at 09:00, which has passed.
    await setDue(note.id, '2026-10-15', null, null);
    expect((await db.notes.get(note.id))?.due?.alertedAt).toBe(noon);
    await setDue(note.id, '2026-10-15', '18:00', null);
    expect((await db.notes.get(note.id))?.due?.alertedAt).toBeNull();
  });

  it('doesn’t alert for a copy of an overdue note', async () => {
    const note = await createNote({ kind: 'note' });
    await setDue(note.id, '2020-01-01', null, null);
    const copy = await duplicateNote(note.id);
    expect(copy?.due?.alertedAt).not.toBeNull();
  });

  it('keeps a repeat’s progress when only the date or time changes', async () => {
    const note = await createNote({ kind: 'note' });
    const repeat = { ...presetRepeat('daily', '2026-10-15'), ends: { type: 'after' as const, count: 5, done: 0 } };
    await setDue(note.id, '2026-10-15', '08:00', repeat);
    await markDone(note.id, localMoment('2026-10-15', '12:00'));
    // The popover sends the rule back with done: 0.
    await setDue(note.id, '2026-10-16', '07:00', repeat);
    expect((await db.notes.get(note.id))?.due).toMatchObject({
      date: '2026-10-16',
      time: '07:00',
      repeat: { anchor: '2026-10-15', ends: { done: 1 } },
    });
    await setDue(note.id, '2026-10-20', '07:00', repeat);
    expect((await db.notes.get(note.id))?.due?.repeat).toMatchObject({ anchor: '2026-10-20', ends: { done: 1 } });
    await setDue(note.id, '2026-10-20', '07:00', { ...repeat, ends: { type: 'after', count: 6, done: 0 } });
    expect((await db.notes.get(note.id))?.due?.repeat?.ends).toEqual({ type: 'after', count: 6, done: 0 });
  });

  it('moves a finished card into its board’s Done column', async () => {
    const board = await createBoard('B', 'basic');
    const [todo, , done] = await sortedColumns(board.id);
    const note = await createNote({ kind: 'note', boardId: board.id, columnId: todo.id, boardPosition: 0 });
    await setDue(note.id, '2999-01-01', null, null);
    const before = await markDone(note.id);
    expect(await db.notes.get(note.id)).toMatchObject({ columnId: done.id, due: { doneAt: expect.any(Number) } });
    await putBackPlace(before!);
    expect((await db.notes.get(note.id))?.columnId).toBe(todo.id);
  });

  it('leaves a repeating card where it is when Mark done moves its date on', async () => {
    const board = await createBoard('B', 'basic');
    const [todo] = await sortedColumns(board.id);
    const note = await createNote({ kind: 'note', boardId: board.id, columnId: todo.id, boardPosition: 0 });
    await setDue(note.id, '2026-10-15', null, presetRepeat('daily', '2026-10-15'));
    await markDone(note.id, localMoment('2026-10-15', '12:00'));
    expect((await db.notes.get(note.id))?.columnId).toBe(todo.id);
  });

  it('places a copy of a card just below the original', async () => {
    const board = await createBoard('B', 'basic');
    const [todo] = await sortedColumns(board.id);
    await createNote({ id: 'a', kind: 'note', boardId: board.id, columnId: todo.id, boardPosition: 0 });
    await createNote({ id: 'b', kind: 'note', boardId: board.id, columnId: todo.id, boardPosition: 1 });
    const copy = await duplicateNote('a');
    expect(copy).toMatchObject({ boardId: board.id, columnId: todo.id, boardPosition: 0.5 });
  });

  it('makes room for a copy between crowded cards', async () => {
    const board = await createBoard('B', 'basic');
    const [todo] = await sortedColumns(board.id);
    // One float step apart: their average lands on one of them.
    await createNote({ id: 'a', kind: 'note', boardId: board.id, columnId: todo.id, boardPosition: 1 });
    await createNote({ id: 'b', kind: 'note', boardId: board.id, columnId: todo.id, boardPosition: 1 + Number.EPSILON });
    const copy = await duplicateNote('a');
    const ids = (await db.notes.toArray())
      .filter((n) => n.columnId === todo.id)
      .sort((x, y) => x.boardPosition - y.boardPosition)
      .map((n) => n.id);
    expect(ids).toEqual(['a', copy!.id, 'b']);
    const positions = (await db.notes.bulkGet(['a', copy!.id, 'b'])).map((n) => n!.boardPosition);
    expect(new Set(positions).size).toBe(3);
  });
});
