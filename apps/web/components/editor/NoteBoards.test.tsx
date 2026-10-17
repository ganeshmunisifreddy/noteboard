import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { newDue } from '../../lib/due';
import { createNote } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import { renderAt } from '../../lib/testRouter';
import NotePage from '../../routes/NotePage';
import { ToastProvider } from '../ui/Toast';

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
  vi.clearAllMocks();
});

const open = (query: Record<string, string>) => {
  return renderAt(
    <ToastProvider>
      <NotePage />
    </ToastProvider>,
    `/note?${new URLSearchParams(query)}`,
  );
};

describe('boards in the editor', () => {
  it('puts a note on a board column and takes it off again', async () => {
    const user = userEvent.setup();
    const board = await createBoard('Website', 'basic');
    const [, doing] = await sortedColumns(board.id);
    await createNote({ id: 'n1', kind: 'note', title: 'Logo' });
    open({ id: 'n1' });
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    // Keyboard: jsdom's pointer moves close Radix submenus.
    (await screen.findByRole('menuitem', { name: 'Board' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitem', { name: 'Website' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitemcheckbox', { name: 'Doing' })).focus();
    await user.keyboard('{Enter}');
    await waitFor(async () => expect((await db.notes.get('n1'))?.columnId).toBe(doing.id));
    // The submenu says which column the note is in.
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    (await screen.findByRole('menuitem', { name: 'Board' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitem', { name: 'Website' })).focus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Doing' })).toBeChecked();
    // One Escape closes the menu and its submenus; another would leave the editor.
    await user.keyboard('{Escape}');
    const chip = await screen.findByRole('button', { name: 'Board: Website · Doing' });
    await user.click(chip);
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from board' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.boardId).toBeNull());
  });

  it('creates a new card in its column on the first edit', async () => {
    const user = userEvent.setup();
    const board = await createBoard('Website', 'basic');
    const [todo] = await sortedColumns(board.id);
    open({ new: 'note', id: 'fresh', column: todo.id, at: 'bottom' });
    await user.type(await screen.findByRole('textbox', { name: 'Title' }), 'Fonts');
    await waitFor(async () =>
      expect(await db.notes.get('fresh')).toMatchObject({ title: 'Fonts', boardId: board.id, columnId: todo.id }),
    );
  });

  it('has no Board button in Trash', async () => {
    await createNote({ id: 'n1', kind: 'note', title: 'Old' });
    await db.notes.update('n1', { trashedAt: 1 });
    open({ id: 'n1' });
    await screen.findByText(/This note is in Trash/);
    expect(screen.queryByRole('button', { name: 'Board' })).not.toBeInTheDocument();
  });

  it('says the date was reopened when a done card leaves the Done column', async () => {
    const user = userEvent.setup();
    const board = await createBoard('Website', 'basic');
    const [, , done] = await sortedColumns(board.id);
    await createNote({ id: 'n1', kind: 'note', title: 'Logo', boardId: board.id, columnId: done.id, boardPosition: 0 });
    await db.notes.update('n1', { due: { ...newDue('2999-01-01', null, null), doneAt: 5 } });
    open({ id: 'n1' });
    (await screen.findByRole('button', { name: 'More actions' })).focus();
    await user.keyboard('{Enter}');
    (await screen.findByRole('menuitem', { name: 'Board' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitem', { name: 'Website' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitemcheckbox', { name: 'To do' })).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Date reopened')).toBeInTheDocument();
  });
});
