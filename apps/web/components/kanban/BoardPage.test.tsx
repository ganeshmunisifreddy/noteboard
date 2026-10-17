import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import { leaveEditor, noteHref, openEditor } from '../../lib/routes';
import type { Nav } from '../../lib/navigation';
import { renderAt } from '../../lib/testRouter';
import BoardPage from '../../routes/BoardPage';
import { ToastProvider } from '../ui/Toast';


beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.clearAllMocks();
  sessionStorage.clear();
});

const open = (id: string) => {
  return renderAt(
    <ToastProvider>
      <BoardPage />
    </ToastProvider>,
    `/board?id=${id}`,
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
    expect(within(screen.getByRole('region', { name: /To do/ })).queryByText('No cards')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Done/ })).toHaveAccessibleName(/Done column/);
  });

  it('opens a card and adds cards in a column', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    const view = open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Open note: Wireframes' }));
    expect(view.url()).toBe('/note?id=n1');
    // The page reads the URL, so it shows the board again after Back.
    view.back();
    await user.click(await screen.findByRole('button', { name: 'Add card to To do' }));
    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    expect(view.query()).toMatchObject({ new: 'note', column: columns[0].id, at: 'bottom' });
    view.back();
    await user.click(await screen.findByRole('button', { name: 'Add a list to To do' }));
    expect(view.query()).toMatchObject({ new: 'list', column: columns[0].id });
    view.back();
    await user.click(await screen.findByRole('button', { name: 'Add card' }));
    expect(view.query()).toMatchObject({ new: 'note', column: columns[0].id, at: 'top' });
  });

  it('adds cards quickly, one after another', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Add card to To do' }));
    const box = screen.getByRole('textbox', { name: 'Card title for To do' });
    expect(box).toHaveFocus();
    await user.type(box, 'Pick fonts{Enter}');
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    await user.type(box, '   {Enter}New logo{Enter}');
    await waitFor(async () =>
      expect(
        (await db.notes.toArray())
          .filter((n) => n.columnId === columns[0].id)
          .sort((a, b) => a.boardPosition - b.boardPosition)
          .map((n) => n.title),
      ).toEqual(['Pick fonts', 'New logo']),
    );
    expect(await screen.findByText('New logo')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Card title for To do' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add card to To do' })).toHaveFocus());
  });

  it('keeps quick add open, with the list button, when the window loses focus', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Add card to To do' }));
    expect(screen.getByRole('button', { name: 'Add a list to To do' })).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'Card title for To do' });
    await user.type(box, 'Half typed');
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    fireEvent.blur(box);
    expect(screen.getByRole('textbox', { name: 'Card title for To do' })).toHaveValue('Half typed');
  });

  it('opens a typed quick-add card in the editor', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const view = open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Add card to Doing' }));
    await user.type(screen.getByRole('textbox', { name: 'Card title for Doing' }), 'Copy');
    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(view.path()).toBe('/note'));
    const note = (await db.notes.toArray()).find((n) => n.title === 'Copy');
    expect(view.query()).toMatchObject({ id: note?.id });
  });

  it('archives all of a column’s cards with one Undo', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    await createNote({ id: 'n2', kind: 'note', title: 'Copy', boardId: board.id, columnId: columns[1].id, boardPosition: 1 });
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Column actions for Doing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive all cards' }));
    await waitFor(async () => expect((await db.notes.toArray()).every((n) => n.archived)).toBe(true));
    expect(await screen.findByText('Archived 2 cards')).toBeInTheDocument();
    // The column menu blocks pointer events on the page until it has fully closed.
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.notes.toArray()).some((n) => n.archived)).toBe(false));
  });

  it('moves all of a column’s cards to another column', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Column actions for Doing' }));
    (await screen.findByRole('menuitem', { name: 'Move all cards to' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitem', { name: 'To do' })).focus();
    await user.keyboard('{Enter}');
    await waitFor(async () => expect((await db.notes.get('n1'))?.columnId).toBe(columns[0].id));
    expect(await screen.findByText('Moved 1 card to To do')).toBeInTheDocument();
  });

  it('hides bulk actions for an empty column', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Column actions for To do' }));
    await screen.findByRole('menuitem', { name: 'Rename' });
    expect(screen.queryByRole('menuitem', { name: 'Archive all cards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Move all cards to' })).not.toBeInTheDocument();
  });

  it('stars the board from its menu', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Board actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Star board' }));
    await waitFor(async () => expect((await db.boards.get(board.id))?.starred).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Board actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Unstar board' })).toBeInTheDocument();
  });

  it('leaves empty columns quiet, and keeps header button names for phones', async () => {
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Wireframes');
    expect(screen.queryByText('No cards')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add card' })).toHaveAttribute('aria-label', 'Add card');
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
    // The closing menu blocks pointer events on the page until it's gone.
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
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
    const view = open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Board actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete board…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Website redesign”?' });
    expect(within(dialog).getByText('It has 1 note.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Move notes to Trash' }));
    await waitFor(async () => expect(await db.boards.count()).toBe(0));
    expect((await db.notes.get('n1'))?.trashedAt).not.toBeNull();
    expect(view.url()).toBe('/?view=boards');
    // The modal blocks pointer events on the page until it has fully closed.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: 'Undo' }));
    });
    await waitFor(async () => expect(await db.boards.count()).toBe(1));
  });

  it('goes back to the Boards view', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const view = open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Back to boards' }));
    expect(view.url()).toBe('/?view=boards');
  });

  it('puts focus in the name field when renaming or adding a column from a menu', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Board actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename board' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Board name' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Board actions' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Board actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add column' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Column name' })).toHaveFocus());
    await user.keyboard('{Escape}');

    await user.click(within(screen.getByRole('region', { name: /To do/ })).getByRole('button', { name: 'Column actions for To do' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Column name' })).toHaveFocus());
    await user.keyboard('!{Enter}');
    await waitFor(async () => expect((await db.columns.get(columns[0].id))?.name).toBe('To do!'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Column actions for To do!' })).toHaveFocus());
  });

  it('says where a deleted column’s notes go and keeps focus nearby', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    open(board.id);
    const doing = await screen.findByRole('region', { name: /Doing/ });
    await user.click(within(doing).getByRole('button', { name: 'Column actions for Doing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete column' }));
    expect(confirm).toHaveBeenCalledWith('Delete the column “Doing”? Its notes move to “To do”.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Column actions for To do' })).toHaveFocus());
  });

  it('restores the page scroll when coming back to the board', async () => {
    const { board } = await setup();
    sessionStorage.setItem('boardScroll', JSON.stringify({ url: `/board?id=${board.id}`, y: 320 }));
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    open(board.id);
    await screen.findByRole('heading', { level: 1, name: 'Website redesign' });
    expect(scrollTo).toHaveBeenCalledWith(0, 320);
  });

  it('forgets “opened from a board” once the board shows again', async () => {
    const { board } = await setup();
    const url = `/board?id=${board.id}`;
    const fromBoard: Nav = { path: '/board', url, go: vi.fn(), swap: vi.fn(), back: vi.fn(), current: () => url };
    openEditor(fromBoard, noteHref('n1'));
    open(board.id);
    await screen.findByRole('heading', { level: 1, name: 'Website redesign' });
    const editor: Nav = { path: '/note', url: '/note?id=n1', go: vi.fn(), swap: vi.fn(), back: vi.fn(), current: () => '/note?id=n1' };
    leaveEditor(editor);
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('reads column counts as cards', async () => {
    const { board } = await setup();
    open(board.id);
    const doing = await screen.findByRole('region', { name: /Doing/ });
    expect(within(doing).getByText('1 card')).toBeInTheDocument();
  });
});
