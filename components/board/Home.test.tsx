import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
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
});
