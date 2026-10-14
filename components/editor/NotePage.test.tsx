import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import NotePage from '../../pages/note';
import { ToastProvider } from '../ui/Toast';

const router = vi.hoisted(() => ({
  pathname: '/note',
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
  vi.clearAllMocks();
});

const savedContent = async (id: string) => (await db.notes.get(id))?.content;

describe('NotePage', () => {
  it('keeps the same editor and text when a new note is first saved', async () => {
    router.query = { new: 'note', id: 'n1' };
    const user = userEvent.setup();
    const { rerender } = render(<NotePage />);
    const body = await screen.findByRole('textbox', { name: 'Note' });
    await user.type(body, 'Milk');
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ pathname: '/note', query: { id: 'n1' } }, undefined, {
        shallow: true,
      }),
    );
    router.query = { id: 'n1' };
    rerender(<NotePage />);
    await user.type(body, ' and eggs');
    expect(screen.getByRole('textbox', { name: 'Note' })).toBe(body);
    expect(body).toHaveFocus();
    await waitFor(async () => expect(await savedContent('n1')).toBe('Milk and eggs'));
  });

  it('saves the last keystrokes when the editor closes before the autosave delay', async () => {
    await createNote({ id: 'n2', kind: 'note', title: 'Draft' });
    router.query = { id: 'n2' };
    const user = userEvent.setup();
    const { unmount } = render(<NotePage />);
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Quick');
    unmount();
    await waitFor(async () => expect(await savedContent('n2')).toBe('Quick'));
  });

  it('does not navigate back into a new note saved while leaving', async () => {
    router.query = { new: 'note', id: 'n7' };
    const user = userEvent.setup();
    const { unmount } = render(<NotePage />);
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Milk');
    unmount();
    await waitFor(async () => expect(await savedContent('n7')).toBe('Milk'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('moves a note the user emptied to trash on leaving', async () => {
    await createNote({ id: 'n3', kind: 'note', content: 'x' });
    router.query = { id: 'n3' };
    const user = userEvent.setup();
    const { unmount } = render(<NotePage />);
    await user.clear(await screen.findByRole('textbox', { name: 'Note' }));
    unmount();
    await waitFor(async () => expect((await db.notes.get('n3'))?.trashedAt).not.toBeNull());
  });

  it('does not save an untouched new note', async () => {
    router.query = { new: 'list', id: 'n4' };
    const { unmount } = render(<NotePage />);
    await screen.findByRole('textbox', { name: 'Add list item' });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await db.notes.get('n4')).toBeUndefined();
  });

  it('goes home on Escape when opened directly', async () => {
    await createNote({ id: 'n5', kind: 'note', title: 'Esc' });
    router.query = { id: 'n5' };
    const user = userEvent.setup();
    render(<NotePage />);
    await screen.findByRole('textbox', { name: 'Title' });
    await user.keyboard('{Escape}');
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('stays in the editor when Escape ends an IME composition', async () => {
    await createNote({ id: 'n8', kind: 'note', title: 'IME' });
    router.query = { id: 'n8' };
    render(<NotePage />);
    const body = await screen.findByRole('textbox', { name: 'Note' });
    fireEvent.keyDown(body, { key: 'Escape', isComposing: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('saves straight away when the tab is hidden', async () => {
    await createNote({ id: 'n9', kind: 'note', title: 'Hide' });
    router.query = { id: 'n9' };
    const user = userEvent.setup();
    render(<NotePage />);
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Swipe');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await savedContent('n9')).toBe('Swipe');
  });

  it('puts an archived note back exactly as it was on Undo', async () => {
    await createNote({ id: 'n10', kind: 'note', title: 'Keep order', pinned: true });
    await db.notes.update('n10', { updatedAt: 1000 });
    router.query = { id: 'n10' };
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <NotePage />
      </ToastProvider>,
    );
    await screen.findByRole('textbox', { name: 'Title' });
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () =>
      expect(await db.notes.get('n10')).toMatchObject({ archived: false, pinned: true, updatedAt: 1000 }),
    );
  });

  it('puts a deleted note back in its place on Undo', async () => {
    await createNote({ id: 'top', kind: 'note', title: 'Top', position: 0 });
    await createNote({ id: 'n11', kind: 'note', title: 'Stay put', position: 5 });
    router.query = { id: 'n11' };
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <NotePage />
      </ToastProvider>,
    );
    await screen.findByRole('textbox', { name: 'Title' });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await db.notes.get('n11')).toMatchObject({ trashedAt: null, position: 5 }));
  });

  it('shows a trashed note read-only with Restore', async () => {
    await createNote({ id: 'n6', kind: 'note', title: 'Old' });
    await db.notes.update('n6', { trashedAt: 1 });
    router.query = { id: 'n6' };
    const user = userEvent.setup();
    render(<NotePage />);
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('n6'))?.trashedAt).toBeNull());
  });

  it('says when a note does not exist', async () => {
    router.query = { id: 'missing' };
    render(<NotePage />);
    expect(await screen.findByText('Note not found')).toBeInTheDocument();
  });

  it('gives a new note an id when the URL has none', async () => {
    router.query = { new: 'note' };
    render(<NotePage />);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/note',
        query: { new: 'note', id: expect.any(String) },
      }),
    );
  });
});
