import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDate, localMoment } from './calendar';
import { db } from './db';
import { newDue } from './due';
import { createNote, duplicateNote, markDone, putBackDue, removeDue, reopenDue, setDue, snooze } from './notes';
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
    await setDue(note.id, '2026-10-20', '18:00', null);
    await db.notes.update(note.id, {
      due: { ...newDue('2026-10-20', '18:00', null), doneAt: 1, alertedAt: 2, snoozedUntil: 3 },
    });
    const copy = await duplicateNote(note.id);
    expect(copy?.due).toEqual(newDue('2026-10-20', '18:00', null));
  });
});
