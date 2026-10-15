import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { addDays, localDate } from '../../lib/calendar';
import { createNote, setDue } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import Home from '../../pages/index';

const router = vi.hoisted(() => {
  const handlers = new Map<string, Set<() => void>>();
  return {
    events: {
      on: (event: string, handler: () => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)?.add(handler);
      },
      off: (event: string, handler: () => void) => handlers.get(event)?.delete(handler),
      emit: (event: string) => handlers.get(event)?.forEach((handler) => handler()),
    },
    pathname: '/',
  asPath: '/',
  query: {} as Record<string, string>,
  isReady: true,
  push: vi.fn(),
  replace: vi.fn(),
    back: vi.fn(),
  };
});

vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/head', () => ({ default: () => null }));

const editorLoad = vi.hoisted(() => ({ preload: vi.fn(() => Promise.resolve()) }));
vi.mock('../editor/useRichEditor', () => ({ preloadRichEditor: editorLoad.preload }));

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  document.documentElement.removeAttribute('data-has-notes');
  router.query = {};
  sessionStorage.clear();
});

describe('Home', () => {
  it('hides the empty state while notes load when returning to the board', async () => {
    await createNote({ kind: 'note', title: 'Sprint' });
    expect(localStorage.getItem('hasNotes')).toBe('1');
    render(<Home />);
    expect(document.documentElement.hasAttribute('data-has-notes')).toBe(true);
    expect(await screen.findByText('Sprint')).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.hasAttribute('data-has-notes')).toBe(false));
  });

  it('shows the search from the URL after Back', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Home />);
    // The user typed a search, then pressed Back to an earlier one.
    await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'eggs');
    router.query = { q: 'milk' };
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      router.events.emit('routeChangeComplete');
    });
    rerender(<Home />);
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toHaveValue('milk');
  });

  it('restores the scroll position when coming back from the editor', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await createNote({ kind: 'note', title: 'Long board' });
    sessionStorage.setItem('boardScroll', JSON.stringify({ url: '/', y: 640 }));
    render(<Home />);
    await screen.findByText('Long board');
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640));
    expect(sessionStorage.getItem('boardScroll')).toBeNull();
    scrollTo.mockRestore();
  });

  it('restores a backup chosen in the file picker', async () => {
    const { container } = render(<Home />);
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

  it('loads the note editor in the background', async () => {
    render(<Home />);
    await waitFor(() => expect(editorLoad.preload).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('keeps app options in the header and sections in the sidebar', async () => {
    render(<Home />);
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
    render(<Home />);
    await screen.findByText('Pay bill');
    expect(screen.getAllByRole('link', { name: /^Upcoming/ })[0]).toHaveAttribute('href', '/?view=upcoming');

    router.query = { view: 'upcoming' };
    const { unmount } = render(<Home />);
    expect(await screen.findByRole('heading', { name: 'Overdue' })).toBeInTheDocument();
    unmount();
  });

  it('shows a small empty state with the section’s message', async () => {
    router.query = { view: 'archive' };
    render(<Home />);
    expect(await screen.findByText('Archive is empty')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('says when nothing has a date', async () => {
    router.query = { view: 'upcoming' };
    await createNote({ kind: 'note', title: 'No date' });
    render(<Home />);
    expect(await screen.findByText('No upcoming dates. Add one from a note’s ⏰ button.')).toBeInTheDocument();
  });

  it('hides board notes from the main board but finds them with their place', async () => {
    const board = await createBoard('Website', 'basic');
    const [todo] = await sortedColumns(board.id);
    await createNote({ kind: 'note', title: 'Logo idea', boardId: board.id, columnId: todo.id, boardPosition: 0 });
    await createNote({ kind: 'note', title: 'Groceries' });
    const { unmount } = render(<Home />);
    await screen.findByText('Groceries');
    expect(screen.queryByText('Logo idea')).not.toBeInTheDocument();
    unmount();

    router.query = { q: 'logo' };
    render(<Home />);
    // The title's match is marked, so the heading's text is split.
    expect(await screen.findByRole('heading', { name: 'Logo idea' })).toBeInTheDocument();
    expect(screen.getByText('Website · To do')).toBeInTheDocument();
  });

  it('links to Boards from the sidebar', async () => {
    render(<Home />);
    expect((await screen.findAllByRole('link', { name: 'Boards' }))[0]).toHaveAttribute('href', '/?view=boards');
  });

  it('shows board tiles in the Boards view', async () => {
    await createBoard('House move', 'basic');
    router.query = { view: 'boards' };
    render(<Home />);
    expect(await screen.findByRole('link', { name: /House move/ })).toBeInTheDocument();
    expect(screen.queryByText('Notes you add appear here')).not.toBeInTheDocument();
  });

  it('searches all notes from the Boards view', async () => {
    const user = userEvent.setup();
    router.query = { view: 'boards' };
    render(<Home />);
    await user.type(await screen.findByRole('searchbox', { name: 'Search notes' }), 'x');
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/', query: { q: 'x' } }, undefined, { shallow: true });
  });
});
