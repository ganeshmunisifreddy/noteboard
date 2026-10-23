import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { addDays, localDate } from '../../lib/calendar';
import { createNote, setDue } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import { renderAt } from '../../lib/testRouter';
import Home from '../../routes/Home';


const editorLoad = vi.hoisted(() => ({ preload: vi.fn(() => Promise.resolve()) }));
vi.mock('../editor/useRichEditor', () => ({ preloadRichEditor: editorLoad.preload }));

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  sessionStorage.clear();
});

describe('Home', () => {
  it('does not show the empty state before notes have loaded', async () => {
    await createNote({ kind: 'note', title: 'Sprint' });
    renderAt(<Home />);
    expect(screen.queryByText('Notes you add appear here')).not.toBeInTheDocument();
    expect(await screen.findByText('Sprint')).toBeInTheDocument();
    expect(screen.queryByText('Notes you add appear here')).not.toBeInTheDocument();
  });

  it('shows the search from the URL after Back, and keeps typing in place', async () => {
    const user = userEvent.setup();
    const view = renderAt(<Home />, ['/?q=milk', '/']);
    const box = screen.getByRole('searchbox', { name: 'Search notes' });
    await user.type(box, 'eggs');
    expect(view.url()).toBe('/?q=eggs');
    // Typing replaces the URL without remounting the box, so it keeps focus.
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toBe(box);
    expect(box).toHaveFocus();
    view.back();
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toHaveValue('milk');
  });

  it('restores the scroll position when coming back from the editor', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await createNote({ kind: 'note', title: 'Long board' });
    sessionStorage.setItem('boardScroll', JSON.stringify({ url: '/', y: 640 }));
    renderAt(<Home />);
    await screen.findByText('Long board');
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640));
    expect(sessionStorage.getItem('boardScroll')).toBeNull();
    scrollTo.mockRestore();
  });

  it('restores a backup chosen in the file picker', async () => {
    const { container } = renderAt(<Home />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const backup = JSON.stringify({
      format: 'noteboard-backup',
      version: 1,
      exportedAt: 'x',
      notes: [{ id: 'r1', title: 'From backup', updatedAt: 5 }],
      labels: [],
    });
    fireEvent.change(input, { target: { files: [new File([backup], 'backup.json', { type: 'application/json' })] } });
    expect(await screen.findByText('From backup')).toBeInTheDocument();
  });

  it('starts a new note straight away from New and the phone + button', async () => {
    const user = userEvent.setup();
    const view = renderAt(<Home />);
    await user.click(await screen.findByRole('button', { name: 'New' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(view.path()).toBe('/note');
    expect(view.query()).toMatchObject({ new: 'note' });
    view.back();
    await user.click(screen.getByRole('button', { name: 'New note' }));
    expect(view.path()).toBe('/note');
    expect(view.query()).toMatchObject({ new: 'note' });
  });

  it('loads the note editor in the background', async () => {
    renderAt(<Home />);
    await waitFor(() => expect(editorLoad.preload).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('keeps app options in the header and sections in the sidebar', async () => {
    renderAt(<Home />);
    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('button', { name: 'More options' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Main menu' })).toBeInTheDocument();
    expect(within(screen.getAllByRole('navigation', { name: 'Sections' })[0]).getByRole('link', { name: 'Trash' })).toBeInTheDocument();
  });

  it('links to Upcoming from the sidebar', async () => {
    const bill = await createNote({ kind: 'note', title: 'Pay bill' });
    await setDue(bill.id, addDays(localDate(Date.now()), -1), null, null);
    await createNote({ kind: 'note', title: 'No date' });
    renderAt(<Home />);
    await screen.findByText('Pay bill');
    expect(screen.getAllByRole('link', { name: /^Upcoming/ })[0]).toHaveAttribute('href', '/?view=upcoming');

    const { unmount } = renderAt(<Home />, '/?view=upcoming');
    expect(await screen.findByRole('heading', { name: 'Overdue' })).toBeInTheDocument();
    unmount();
  });

  it('shows a small empty state with the section’s message', async () => {
    renderAt(<Home />, '/?view=archive');
    expect(await screen.findByText('Archive is empty')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('says when nothing has a date', async () => {
    await createNote({ kind: 'note', title: 'No date' });
    renderAt(<Home />, '/?view=upcoming');
    expect(await screen.findByText('No upcoming dates. Add one from a note’s ⏰ button.')).toBeInTheDocument();
  });

  it('hides board notes from the main board but finds them with their place', async () => {
    const board = await createBoard('Website', 'basic');
    const [todo] = await sortedColumns(board.id);
    await createNote({ kind: 'note', title: 'Logo idea', boardId: board.id, columnId: todo.id, boardPosition: 0 });
    await createNote({ kind: 'note', title: 'Groceries' });
    const { unmount } = renderAt(<Home />);
    await screen.findByText('Groceries');
    expect(screen.queryByText('Logo idea')).not.toBeInTheDocument();
    unmount();

    renderAt(<Home />, '/?q=logo');
    // The title's match is marked, so the heading's text is split.
    expect(await screen.findByRole('heading', { name: 'Logo idea' })).toBeInTheDocument();
    expect(screen.getByText('Website · To do')).toBeInTheDocument();
  });

  it('links to Boards from the sidebar', async () => {
    renderAt(<Home />);
    expect((await screen.findAllByRole('link', { name: 'Boards' }))[0]).toHaveAttribute('href', '/?view=boards');
  });

  it('shows board tiles in the Boards view', async () => {
    await createBoard('House move', 'basic');
    renderAt(<Home />, '/?view=boards');
    expect(await screen.findByRole('link', { name: /House move/ })).toBeInTheDocument();
    expect(screen.queryByText('Notes you add appear here')).not.toBeInTheDocument();
  });

  it('searches all notes from the Boards view', async () => {
    const user = userEvent.setup();
    const view = renderAt(<Home />, '/?view=boards');
    await user.type(await screen.findByRole('searchbox', { name: 'Search notes' }), 'x');
    expect(view.url()).toBe('/?q=x');
    expect(view.action()).toBe('REPLACE');
  });
});
