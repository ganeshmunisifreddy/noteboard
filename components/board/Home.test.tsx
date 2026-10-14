import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import Home from '../../pages/index';

const router = vi.hoisted(() => ({
  pathname: '/',
  asPath: '/',
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
  localStorage.clear();
  document.documentElement.removeAttribute('data-has-notes');
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
});
