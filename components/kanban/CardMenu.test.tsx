import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { createLabel, createNote } from '../../lib/notes';
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
  const board = await createBoard('Site', 'basic');
  const columns = await sortedColumns(board.id);
  for (const [index, title] of ['Alpha', 'Beta'].entries()) {
    await createNote({ id: title, kind: 'note', title, boardId: board.id, columnId: columns[0].id, boardPosition: index });
  }
  return { board, columns };
};

type User = ReturnType<typeof userEvent.setup>;

const menuFor = (title: string) => screen.getByRole('button', { name: `Card actions for ${title}` });

// Radix submenus open, and their items are chosen, by keyboard in jsdom.
const openSub = async (user: User, name: string) => {
  (await screen.findByRole('menuitem', { name })).focus();
  await user.keyboard('{ArrowRight}');
};

const choose = async (user: User, role: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox', name: string) => {
  (await screen.findByRole(role, { name })).focus();
  await user.keyboard('{Enter}');
};

describe('card menu', () => {
  it('changes the colour and labels without opening the card', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const label = await createLabel('Design');
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await openSub(user, 'Colour');
    await choose(user, 'menuitemradio', 'Yellow');
    await waitFor(async () => expect((await db.notes.get('Alpha'))?.color).toBe('yellow'));
    await user.click(menuFor('Alpha'));
    await openSub(user, 'Labels');
    await choose(user, 'menuitemcheckbox', 'Design');
    await waitFor(async () => expect((await db.notes.get('Alpha'))?.labelIds).toEqual([label.id]));
    // The labels submenu stays open for the next tick.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Design' })).toBeInTheDocument();
  });

  it('archives a card with Undo and focuses the next card', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    await waitFor(() => expect(menuFor('Beta')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect((await db.notes.get('Alpha'))?.archived).toBe(false);
  });

  it('moves a card to the trash with Undo', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Beta' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(async () => expect((await db.notes.get('Beta'))?.trashedAt).not.toBeNull());
    expect(await screen.findByText('Moved to trash')).toBeInTheDocument();
    await waitFor(() => expect(menuFor('Alpha')).toHaveFocus());
  });

  it('moves a card to another board', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const other = await createBoard('Home', 'basic');
    const [, doing] = await sortedColumns(other.id);
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await openSub(user, 'Move to board');
    await openSub(user, 'Home');
    await choose(user, 'menuitem', 'Doing');
    await waitFor(async () => expect(await db.notes.get('Alpha')).toMatchObject({ boardId: other.id, columnId: doing.id }));
    expect(await screen.findByText('Moved to Home · Doing')).toBeInTheDocument();
  });

  it('opens the date picker from the menu and saves a date', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Date…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Date' });
    await user.click(dialog.querySelector('button') as HTMLElement); // first quick pick
    await waitFor(async () => expect((await db.notes.get('Alpha'))?.due).not.toBeNull());
    await waitFor(() => expect(menuFor('Alpha')).toHaveFocus());
  });

  it('opens on right-click with a mouse, but not on a touch long-press', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    const card = (await screen.findByText('Alpha')).closest('li') as HTMLElement;
    fireEvent.pointerDown(card, { pointerType: 'touch' });
    fireEvent.contextMenu(card);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.pointer({ keys: '[MouseRight]', target: card });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});
