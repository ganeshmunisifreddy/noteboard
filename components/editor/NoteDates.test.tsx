import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, localDate } from '../../lib/calendar';
import { db } from '../../lib/db';
import { createNote, markDone, setDue, trashNote } from '../../lib/notes';
import { presetRepeat } from '../../lib/repeat';
import NotePage from '../../pages/note';
import { ToastProvider } from '../ui/Toast';

const router = vi.hoisted(() => ({
  pathname: '/note',
  query: {} as Record<string, string>,
  isReady: true,
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('./RichEditor', async () => {
  const { default: NoteBody } = await import('./NoteBody');
  return {
    default: ({ value, onChange, readOnly, autoFocus }: import('./RichEditor').RichEditorProps) => (
      <NoteBody value={value} onChange={onChange} readOnly={readOnly} autoFocus={autoFocus} />
    ),
  };
});

const TODAY = localDate(Date.now());
const TOMORROW = addDays(TODAY, 1);

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const open = (query: Record<string, string>) => {
  router.query = query;
  return render(
    <ToastProvider>
      <NotePage />
    </ToastProvider>,
  );
};

const dateDialog = () => screen.findByRole('dialog', { name: 'Date' });

describe('dates in the editor', () => {
  it('sets tomorrow 9:00 from a quick pick', async () => {
    const user = userEvent.setup();
    await createNote({ id: 'n1', kind: 'note', title: 'Dentist' });
    open({ id: 'n1' });
    await user.click(await screen.findByRole('button', { name: 'Add date' }));
    await user.click(within(await dateDialog()).getByRole('button', { name: /^Tomorrow/ }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.due).toMatchObject({ date: TOMORROW, time: '09:00' }));
    expect(await screen.findByRole('button', { name: /Change date: Tomorrow, 9:00/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change date' })).toBeInTheDocument();
  });

  it('saves a custom repeat', async () => {
    const user = userEvent.setup();
    await createNote({ id: 'n1', kind: 'note', title: 'Gym' });
    open({ id: 'n1' });
    await user.click(await screen.findByRole('button', { name: 'Add date' }));
    const dialog = await dateDialog();
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-10-15' } });
    fireEvent.change(within(dialog).getByLabelText('Time'), { target: { value: '07:00' } });
    await user.selectOptions(within(dialog).getByLabelText('Repeat'), 'custom');
    await user.clear(within(dialog).getByLabelText('Every'));
    await user.type(within(dialog).getByLabelText('Every'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Monday' }));
    await user.click(within(dialog).getByRole('radio', { name: 'After' }));
    await user.clear(within(dialog).getByLabelText('Number of times'));
    await user.type(within(dialog).getByLabelText('Number of times'), '6');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect((await db.notes.get('n1'))?.due).toMatchObject({
        date: '2026-10-15',
        time: '07:00',
        repeat: { every: 2, unit: 'week', weekdays: [1, 4], anchor: '2026-10-15', ends: { type: 'after', count: 6, done: 0 } },
      }),
    );
  });

  it('explains a missing date', async () => {
    const user = userEvent.setup();
    await createNote({ id: 'n1', kind: 'note', title: 'Gym' });
    open({ id: 'n1' });
    await user.click(await screen.findByRole('button', { name: 'Add date' }));
    const dialog = await dateDialog();
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a date.');
    expect((await db.notes.get('n1'))?.due).toBeNull();
  });

  it('asks for notification permission on save, and says when it is blocked', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const user = userEvent.setup();
    await createNote({ id: 'n1', kind: 'note', title: 'Gym' });
    open({ id: 'n1' });
    await user.click(await screen.findByRole('button', { name: 'Add date' }));
    await user.click(within(await dateDialog()).getByRole('button', { name: 'Save' }));
    expect(requestPermission).toHaveBeenCalled();

    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    await user.click(await screen.findByRole('button', { name: 'Change date' }));
    expect(within(await dateDialog()).getByText(/Notifications are blocked/)).toBeInTheDocument();
  });

  it('removes a date with Undo', async () => {
    const user = userEvent.setup();
    await createNote({ id: 'n1', kind: 'note', title: 'Bill' });
    await setDue('n1', TOMORROW, null, null);
    open({ id: 'n1' });
    await user.click(await screen.findByRole('button', { name: 'Remove date' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.due).toBeNull());
    // The chip is gone; focus goes to the Add date button.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add date' })).toHaveFocus());
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.due?.date).toBe(TOMORROW));
  });

  it('marks a repeating list done, unticking it; Undo ticks it again', async () => {
    const user = userEvent.setup();
    await createNote({
      id: 'l1',
      kind: 'list',
      title: 'Chores',
      items: [{ id: 'i1', text: 'Sweep', done: true }],
    });
    await setDue('l1', TODAY, null, presetRepeat('daily', TODAY));
    open({ id: 'l1' });
    await user.click(await screen.findByRole('button', { name: 'Mark done' }));
    await waitFor(async () => expect((await db.notes.get('l1'))?.due?.date).toBe(TOMORROW));
    expect(await screen.findByText('Moved to Tomorrow')).toBeInTheDocument();
    expect((await db.notes.get('l1'))?.items[0].done).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.notes.get('l1'))?.items[0].done).toBe(true));
    expect((await db.notes.get('l1'))?.due?.date).toBe(TODAY);
  });

  it('takes items changed elsewhere', async () => {
    await createNote({
      id: 'l1',
      kind: 'list',
      title: 'Chores',
      items: [{ id: 'i1', text: 'Sweep', done: true }],
    });
    await setDue('l1', TODAY, null, presetRepeat('daily', TODAY));
    open({ id: 'l1' });
    await screen.findByRole('button', { name: 'Mark done' });
    // Mark done from the reminder panel while the list is open.
    await markDone('l1');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Sweep/ })).not.toBeChecked());
  });

  it('keeps Mark done from elsewhere while an edit is waiting to save', async () => {
    const user = userEvent.setup();
    await createNote({
      id: 'l1',
      kind: 'list',
      title: 'Chores',
      items: [{ id: 'i1', text: 'Sweep', done: true }],
    });
    await setDue('l1', TODAY, null, presetRepeat('daily', TODAY));
    open({ id: 'l1' });
    await screen.findByRole('button', { name: 'Mark done' });
    await user.type(screen.getByRole('textbox', { name: 'Title' }), '!');
    // Mark done from the reminder panel before the title is saved.
    await markDone('l1');
    await waitFor(async () => expect((await db.notes.get('l1'))?.title).toBe('Chores!'));
    expect((await db.notes.get('l1'))?.items[0].done).toBe(false);
    expect(screen.getByRole('checkbox', { name: /Sweep/ })).not.toBeChecked();
  });

  it('shows done with an Undo', async () => {
    const user = userEvent.setup();
    await createNote({ id: 'n1', kind: 'note', title: 'Bill' });
    await setDue('n1', TODAY, null, null);
    open({ id: 'n1' });
    await user.click(await screen.findByRole('button', { name: 'Mark done' }));
    await user.click(await screen.findByRole('button', { name: 'Undo done' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.due?.doneAt).toBeNull());
  });

  it('creates a new note when its first date is set', async () => {
    const user = userEvent.setup();
    open({ new: 'note', id: 'fresh' });
    await user.click(await screen.findByRole('button', { name: 'Add date' }));
    await user.click(within(await dateDialog()).getByRole('button', { name: /^Tomorrow/ }));
    await waitFor(async () => expect((await db.notes.get('fresh'))?.due?.date).toBe(TOMORROW));
  });

  it('is read-only in Trash', async () => {
    await createNote({ id: 'n1', kind: 'note', title: 'Bill' });
    await setDue('n1', TOMORROW, null, null);
    await trashNote('n1');
    open({ id: 'n1' });
    expect(await screen.findByText(/Tomorrow/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /date/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  });

  it('returns focus to the chip after editing from it', async () => {
    const user = userEvent.setup();
    await createNote({ id: 'n1', kind: 'note', title: 'Bill' });
    await setDue('n1', TOMORROW, null, null);
    open({ id: 'n1' });
    const chip = await screen.findByRole('button', { name: /^Change date: Tomorrow/ });
    await user.click(chip);
    await user.click(within(await dateDialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Change date: Tomorrow/ })).toHaveFocus());
  });
});
