import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import BoardPage from '../../pages/board';
import { ToastProvider } from '../ui/Toast';

const router = vi.hoisted(() => ({
  pathname: '/board',
  asPath: '/board',
  query: {} as Record<string, string>,
  isReady: true,
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/head', () => ({ default: () => null }));

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.clearAllMocks();
  sessionStorage.clear();
});

const open = (id: string) => {
  router.query = { id };
  router.asPath = `/board?id=${id}`;
  return render(
    <ToastProvider>
      <BoardPage />
    </ToastProvider>,
  );
};

const setup = async () => {
  const board = await createBoard('Website redesign', 'basic');
  const columns = await sortedColumns(board.id);
  await createNote({
    id: 'n1',
    kind: 'list',
    title: 'Wireframes',
    items: [
      { id: 'i1', text: 'Home', done: true },
      { id: 'i2', text: 'Pricing', done: false },
    ],
    boardId: board.id,
    columnId: columns[1].id,
    boardPosition: 0,
  });
  return { board, columns };
};

describe('board page', () => {
  it('says when the board doesn’t exist', async () => {
    open('missing');
    expect(await screen.findByText('Board not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to boards' })).toHaveAttribute('href', '/?view=boards');
  });

  it('shows columns with counts and compact cards', async () => {
    const { board } = await setup();
    open(board.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Website redesign' })).toBeInTheDocument();
    const doing = screen.getByRole('region', { name: /Doing/ });
    expect(within(doing).getByText('1')).toBeInTheDocument();
    expect(within(doing).getByText('Wireframes')).toBeInTheDocument();
    expect(within(doing).getByText('1/2')).toBeInTheDocument();
    expect(within(doing).getByRole('button', { name: 'Open note: Wireframes' })).toHaveAccessibleDescription(/1 of 2 done/);
    expect(within(screen.getByRole('region', { name: /To do/ })).getByText('No cards')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Done/ })).toHaveAccessibleName(/Done column/);
  });

  it('opens a card and adds cards in a column', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Open note: Wireframes' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/note', query: { id: 'n1' } });
    await user.click(screen.getByRole('button', { name: 'Add card to To do' }));
    expect(router.push.mock.lastCall?.[0]).toMatchObject({ query: { new: 'note', column: columns[0].id, at: 'bottom' } });
    await user.click(screen.getByRole('button', { name: 'Add a list to To do' }));
    expect(router.push.mock.lastCall?.[0]).toMatchObject({ query: { new: 'list', column: columns[0].id } });
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(router.push.mock.lastCall?.[0]).toMatchObject({ query: { new: 'note', column: columns[0].id, at: 'top' } });
  });

  it('renames, moves, marks Done and deletes columns', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    const todo = await screen.findByRole('region', { name: /To do/ });
    await user.click(within(todo).getByRole('button', { name: 'Column actions for To do' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Column name' });
    await user.clear(input);
    await user.type(input, 'Backlog{Enter}');
    await waitFor(async () => expect((await db.columns.get(columns[0].id))?.name).toBe('Backlog'));

    const doing = screen.getByRole('region', { name: /Doing/ });
    await user.click(within(doing).getByRole('button', { name: 'Column actions for Doing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move left' }));
    await waitFor(async () => expect((await sortedColumns(board.id)).map((c) => c.name)).toEqual(['Doing', 'Backlog', 'Done']));

    await user.click(within(screen.getByRole('region', { name: /Doing/ })).getByRole('button', { name: 'Column actions for Doing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Set as Done column' }));
    await waitFor(async () => expect((await db.columns.get(columns[1].id))?.done).toBe(true));

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(within(screen.getByRole('region', { name: /Doing/ })).getByRole('button', { name: 'Column actions for Doing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete column' }));
    await waitFor(async () => expect(await db.columns.get(columns[1].id)).toBeUndefined());
    expect((await db.notes.get('n1'))?.columnId).toBe(columns[0].id);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.columnId).toBe(columns[1].id));
  });

  it('adds a column', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Add column' }));
    await user.type(screen.getByRole('textbox', { name: 'Column name' }), 'Blocked{Enter}');
    expect(await screen.findByRole('region', { name: /Blocked/ })).toBeInTheDocument();
  });

  it('renames the board', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Board actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename board' }));
    const input = screen.getByRole('textbox', { name: 'Board name' });
    await user.clear(input);
    await user.type(input, 'Site{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Site' })).toBeInTheDocument();
  });

  it('deletes the board, keeping or trashing its notes', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Board actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete board…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Website redesign”?' });
    expect(within(dialog).getByText('It has 1 note.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Move notes to Trash' }));
    await waitFor(async () => expect(await db.boards.count()).toBe(0));
    expect((await db.notes.get('n1'))?.trashedAt).not.toBeNull();
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/', query: { view: 'boards' } });
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: 'Undo' }));
    });
    await waitFor(async () => expect(await db.boards.count()).toBe(1));
  });

  it('goes back to the Boards view', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Back to boards' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/', query: { view: 'boards' } });
  });
});
