import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import NoteCard from './NoteCard';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const groceries = () =>
  createNote({
    id: 'c1',
    kind: 'list',
    title: 'Groceries',
    items: [
      { id: 'i1', text: 'Milk', done: false },
      { id: 'i2', text: 'Bread', done: true },
    ],
  });

describe('NoteCard', () => {
  it('opens the note from the card', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={['Home']} mode='board' onOpen={onOpen} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('+1 completed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open note: Groceries' }));
    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('ticks a list item without opening the note', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={onOpen} />);
    await user.click(screen.getByRole('checkbox', { name: 'Mark “Milk” done' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.items[0].done).toBe(true));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('deletes from the menu without opening the note', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.trashedAt).not.toBeNull());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('offers restore in trash and no editing controls', async () => {
    const note = { ...(await groceries()), trashedAt: 1 };
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='trash' onOpen={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Mark “Milk” done' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    await db.notes.update('c1', { trashedAt: 1 });
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.trashedAt).toBeNull());
  });
});
