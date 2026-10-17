import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { localDate } from '../../lib/calendar';
import { newDue } from '../../lib/due';
import { createNote } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import { presetRepeat } from '../../lib/repeat';
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
  vi.restoreAllMocks();
});

const open = (id: string) => {
  router.query = { id };
  return render(
    <ToastProvider>
      <BoardPage />
    </ToastProvider>,
  );
};

const setup = async () => {
  const board = await createBoard('B', 'basic');
  const columns = await sortedColumns(board.id);
  for (const [index, title] of ['Alpha', 'Beta', 'Gamma'].entries()) {
    await createNote({ id: title, kind: 'note', title, boardId: board.id, columnId: columns[0].id, boardPosition: index });
  }
  return { board, columns };
};

const order = async (columnId: string) =>
  (await db.notes.toArray())
    .filter((n) => n.columnId === columnId)
    .sort((a, b) => a.boardPosition - b.boardPosition)
    .map((n) => n.id);

const moveMenu = (title: string) => screen.getByRole('button', { name: `Card actions for ${title}` });

// Radix submenus open, and their items are chosen, by keyboard in jsdom.
const openMove = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.click(moveMenu(title));
  (await screen.findByRole('menuitem', { name: 'Move' })).focus();
  await user.keyboard('{ArrowRight}');
};

const choose = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  (await screen.findByRole('menuitem', { name })).focus();
  await user.keyboard('{Enter}');
};

describe('moving cards from the Move menu', () => {
  it('moves a card down and announces it', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await screen.findByText('Alpha');
    await openMove(user, 'Alpha');
    await choose(user, 'Move down');
    await waitFor(async () => expect(await order(columns[0].id)).toEqual(['Beta', 'Alpha', 'Gamma']));
    // dnd-kit has its own live region; the board's names the move.
    expect(screen.getByText('Moved Alpha to To do, position 2 of 3')).toHaveAttribute('role', 'status');
  });

  it('offers only the moves that apply', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Alpha');
    await openMove(user, 'Alpha');
    const menu = (await screen.findAllByRole('menu')).at(-1) as HTMLElement;
    expect(within(menu).queryByRole('menuitem', { name: 'Move up' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Move to top' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Move to Doing' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Move to To do' })).not.toBeInTheDocument();
  });

  it('moves twice in a row from the menu', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await screen.findByText('Alpha');
    await openMove(user, 'Alpha');
    await choose(user, 'Move to bottom');
    await openMove(user, 'Alpha');
    await choose(user, 'Move up');
    await waitFor(async () => expect(await order(columns[0].id)).toEqual(['Beta', 'Alpha', 'Gamma']));
  });

  it('moves to another column and keeps focus on the card’s Move button', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await screen.findByText('Alpha');
    await openMove(user, 'Beta');
    await choose(user, 'Move to Doing');
    await waitFor(async () => expect(await order(columns[1].id)).toEqual(['Beta']));
    await waitFor(() => expect(moveMenu('Beta')).toHaveFocus());
    expect(within(screen.getByRole('region', { name: /Doing/ })).getByText('Beta')).toBeInTheDocument();
  });

  it('marks a date done in the Done column, with Undo', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    await db.notes.update('Gamma', { due: newDue('2999-01-01', null, null) });
    open(board.id);
    await screen.findByText('Gamma');
    await openMove(user, 'Gamma');
    await choose(user, 'Move to Done');
    await waitFor(async () => expect((await db.notes.get('Gamma'))?.due?.doneAt).not.toBeNull());
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.notes.get('Gamma'))?.columnId).toBe(columns[0].id));
    expect((await db.notes.get('Gamma'))?.due?.doneAt).toBeNull();
  });

  it('keeps focus on the Move button after moving within a column', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await screen.findByText('Alpha');
    await openMove(user, 'Alpha');
    await choose(user, 'Move down');
    await waitFor(async () => expect(await order(columns[0].id)).toEqual(['Beta', 'Alpha', 'Gamma']));
    await waitFor(() => expect(moveMenu('Alpha')).toHaveFocus());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(moveMenu('Alpha')).toHaveFocus();
  });

  it('returns focus to the Move button when the menu closes with Escape', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Beta');
    await user.click(moveMenu('Beta'));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(moveMenu('Beta')).toHaveFocus());
  });

  it('keeps the card in place when a move can’t be saved', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Alpha');
    vi.spyOn(db.notes, 'update').mockRejectedValue(new Error('disk full'));
    await openMove(user, 'Alpha');
    await choose(user, 'Move to Doing');
    expect(await screen.findByText('Couldn’t move the card.')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('region', { name: /To do/ })).getByText('Alpha')).toBeInTheDocument());
  });

  it('says where a repeating card goes after the Done column', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const today = localDate(Date.now());
    await db.notes.update('Gamma', { due: newDue(today, null, presetRepeat('daily', today)) });
    open(board.id);
    await screen.findByText('Gamma');
    await openMove(user, 'Gamma');
    await choose(user, 'Move to Done');
    expect(await screen.findByText('Marked Gamma done; its next date moved it to To do')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(moveMenu('Gamma')).toHaveFocus());
  });
});
