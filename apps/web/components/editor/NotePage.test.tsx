import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import { useScrollToTop } from '../../lib/navigation';
import { renderAt } from '../../lib/testRouter';
import NotePage from '../../routes/NotePage';
import { ToastProvider } from '../ui/Toast';

// Typing into Tiptap's contenteditable is unreliable in jsdom; the editor is
// tested in RichEditor.test.tsx and FormatBar.test.tsx.
vi.mock('./RichEditor', async () => {
  const { default: NoteBody } = await import('./NoteBody');
  return {
    default: ({ value, onChange, readOnly, autoFocus }: import('./RichEditor').RichEditorProps) => (
      <NoteBody value={value} onChange={onChange} readOnly={readOnly} autoFocus={autoFocus} />
    ),
  };
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  vi.clearAllMocks();
});

const savedContent = async (id: string) => (await db.notes.get(id))?.content;

describe('NotePage', () => {
  it('keeps the same editor and text when a new note is first saved', async () => {
    const user = userEvent.setup();
    const view = renderAt(<NotePage />, '/note?new=note&id=n1');
    const body = await screen.findByRole('textbox', { name: 'Note' });
    await user.type(body, 'Milk');
    await waitFor(() => expect(view.url()).toBe('/note?id=n1'));
    expect(view.action()).toBe('REPLACE');
    await user.type(body, ' and eggs');
    expect(screen.getByRole('textbox', { name: 'Note' })).toBe(body);
    expect(body).toHaveFocus();
    await waitFor(async () => expect(await savedContent('n1')).toBe('Milk and eggs'));
  });

  it('keeps the scroll position when a new note is first saved', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const Page = () => {
      useScrollToTop();
      return <NotePage />;
    };
    const view = renderAt(<Page />, '/note?new=note&id=n12');
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Milk');
    await waitFor(() => expect(view.url()).toBe('/note?id=n12'));
    // Let the router's (transition) render for the new URL commit.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('saves the last keystrokes when the editor closes before the autosave delay', async () => {
    await createNote({ id: 'n2', kind: 'note', title: 'Draft' });
    const user = userEvent.setup();
    const { unmount } = renderAt(<NotePage />, '/note?id=n2');
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Quick');
    unmount();
    await waitFor(async () => expect(await savedContent('n2')).toBe('Quick'));
  });

  it('does not navigate back into a new note saved while leaving', async () => {
    const user = userEvent.setup();
    const view = renderAt(<NotePage />, '/note?new=note&id=n7');
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Milk');
    view.unmount();
    await waitFor(async () => expect(await savedContent('n7')).toBe('Milk'));
    expect(view.url()).toBe('/note?new=note&id=n7');
  });

  it('moves a note the user emptied to trash on leaving', async () => {
    await createNote({ id: 'n3', kind: 'note', content: 'x' });
    const user = userEvent.setup();
    const { unmount } = renderAt(<NotePage />, '/note?id=n3');
    await user.clear(await screen.findByRole('textbox', { name: 'Note' }));
    unmount();
    await waitFor(async () => expect((await db.notes.get('n3'))?.trashedAt).not.toBeNull());
  });

  it('does not save an untouched new note', async () => {
    const { unmount } = renderAt(<NotePage />, '/note?new=list&id=n4');
    await screen.findByRole('textbox', { name: 'Add list item' });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await db.notes.get('n4')).toBeUndefined();
  });

  it('goes home on Escape when opened directly', async () => {
    await createNote({ id: 'n5', kind: 'note', title: 'Esc' });
    const user = userEvent.setup();
    const view = renderAt(<NotePage />, '/note?id=n5');
    await screen.findByRole('textbox', { name: 'Title' });
    await user.keyboard('{Escape}');
    expect(view.url()).toBe('/');
  });

  it('stays in the editor when Escape ends an IME composition', async () => {
    await createNote({ id: 'n8', kind: 'note', title: 'IME' });
    const view = renderAt(<NotePage />, '/note?id=n8');
    const body = await screen.findByRole('textbox', { name: 'Note' });
    fireEvent.keyDown(body, { key: 'Escape', isComposing: true });
    expect(view.url()).toBe('/note?id=n8');
  });

  it('saves straight away when the tab is hidden', async () => {
    await createNote({ id: 'n9', kind: 'note', title: 'Hide' });
    const user = userEvent.setup();
    renderAt(<NotePage />, '/note?id=n9');
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
    const user = userEvent.setup();
    renderAt(
      <ToastProvider>
        <NotePage />
      </ToastProvider>,
      '/note?id=n10',
    );
    await screen.findByRole('textbox', { name: 'Title' });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    // Leaving the editor can leave pointer events blocked for a moment.
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
    await user.click(undo);
    await waitFor(async () =>
      expect(await db.notes.get('n10')).toMatchObject({ archived: false, pinned: true, updatedAt: 1000 }),
    );
  });

  it('puts a deleted note back in its place on Undo', async () => {
    await createNote({ id: 'top', kind: 'note', title: 'Top', position: 0 });
    await createNote({ id: 'n11', kind: 'note', title: 'Stay put', position: 5 });
    const user = userEvent.setup();
    renderAt(
      <ToastProvider>
        <NotePage />
      </ToastProvider>,
      '/note?id=n11',
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
    const user = userEvent.setup();
    renderAt(<NotePage />, '/note?id=n6');
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('n6'))?.trashedAt).toBeNull());
  });

  it('says when a note does not exist', async () => {
    renderAt(<NotePage />, '/note?id=missing');
    expect(await screen.findByText('Note not found')).toBeInTheDocument();
  });

  it('gives a new note an id when the URL has none', async () => {
    const view = renderAt(<NotePage />, '/note?new=note');
    await waitFor(() => expect(view.url()).toMatch(/^\/note\?new=note&id=[\w-]+$/));
    expect(view.action()).toBe('REPLACE');
  });

  it('does not show the formatting bar for list notes', async () => {
    await createNote({ id: 'n20', kind: 'list', title: 'Shop' });
    renderAt(
      <ToastProvider>
        <NotePage />
      </ToastProvider>,
      '/note?id=n20',
    );
    await screen.findByRole('textbox', { name: 'Title' });
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
  });
});
