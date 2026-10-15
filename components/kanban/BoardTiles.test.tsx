import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import BoardTiles from './BoardTiles';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('BoardTiles', () => {
  it('invites you to create the first board', async () => {
    render(<BoardTiles onOpen={vi.fn()} />);
    expect(await screen.findByText('No boards yet. Create one to organise notes into columns.')).toBeInTheDocument();
  });

  it('shows each board with its columns and cards', async () => {
    const board = await createBoard('Website redesign', 'basic');
    const [todo] = await sortedColumns(board.id);
    await createNote({ kind: 'note', boardId: board.id, columnId: todo.id, boardPosition: 0 });
    render(<BoardTiles onOpen={vi.fn()} />);
    const link = await screen.findByRole('link', { name: /Website redesign/ });
    expect(link).toHaveAttribute('href', '/board?id=' + board.id);
    expect(within(link).getByText('3 columns · 1 card')).toBeInTheDocument();
  });

  it('creates a board from a template and opens it', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<BoardTiles onOpen={onOpen} />);
    await user.click(await screen.findByRole('button', { name: 'New board' }));
    const dialog = await screen.findByRole('dialog', { name: 'New board' });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a name.');
    await user.type(within(dialog).getByLabelText('Name'), 'Job hunt');
    await user.click(within(dialog).getByRole('radio', { name: 'Pipeline' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    const [board] = await db.boards.toArray();
    expect(board.name).toBe('Job hunt');
    expect(onOpen).toHaveBeenCalledWith(board.id);
    expect((await sortedColumns(board.id)).map((c) => c.name)).toEqual(['Ideas', 'Next', 'In progress', 'Review', 'Done']);
  });

  it('shows starred boards first, and stars from a tile', async () => {
    const user = userEvent.setup();
    await createBoard('Home', 'empty');
    const work = await createBoard('Work', 'empty');
    render(<BoardTiles onOpen={vi.fn()} />);
    await screen.findByRole('link', { name: /Home/ });
    expect(screen.queryByRole('heading', { name: 'Starred' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Star Work' }));
    await waitFor(async () => expect((await db.boards.get(work.id))?.starred).toBe(true));
    const starred = await screen.findByRole('list', { name: 'Starred' });
    expect(within(starred).getByRole('link', { name: /Work/ })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'All boards' })).getByRole('link', { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Star Work' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves a board earlier from its menu', async () => {
    const user = userEvent.setup();
    await createBoard('A', 'empty');
    await createBoard('B', 'empty');
    render(<BoardTiles onOpen={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Board actions for B' }));
    expect(screen.queryByRole('menuitem', { name: 'Move later' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Move earlier' }));
    await waitFor(async () =>
      expect((await db.boards.orderBy('position').toArray()).map((b) => b.name)).toEqual(['B', 'A']),
    );
  });

  it('creates one board even when Create is pressed twice', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<BoardTiles onOpen={onOpen} />);
    await user.click(await screen.findByRole('button', { name: 'New board' }));
    const dialog = await screen.findByRole('dialog', { name: 'New board' });
    await user.type(within(dialog).getByLabelText('Name'), 'Twice');
    const form = within(dialog).getByRole('button', { name: 'Create' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await db.boards.count()).toBe(1);
  });
});
