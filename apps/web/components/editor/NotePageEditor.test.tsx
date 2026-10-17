import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createLabel, createNote, setDue } from '../../lib/notes';
import { renderAt } from '../../lib/testRouter';
import NotePage from '../../routes/NotePage';
import { ToastProvider } from '../ui/Toast';


beforeEach(async () => {
  await db.delete();
  await db.open();
});

const openNote = (id: string) => {
  return renderAt(
    <ToastProvider>
      <NotePage />
    </ToastProvider>,
    `/note?id=${id}`,
  );
};

// The page with the real rich editor (NotePage.test.tsx uses a stand-in).
describe('NotePage with the rich editor', () => {
  it('formats text from the bar under the top bar and saves it', async () => {
    await createNote({ id: 'e1', kind: 'note', content: 'Hello' });
    const user = userEvent.setup();
    openNote('e1');
    expect(await screen.findByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    await user.click(screen.getByRole('textbox', { name: 'Note' }));
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(async () => expect((await db.notes.get('e1'))?.content).toBe('**Hello**'));
  });

  it('does not change a note that was only opened and clicked', async () => {
    await createNote({ id: 'e2', kind: 'note', content: '- a\n- b' });
    await db.notes.update('e2', { updatedAt: 1000 });
    const user = userEvent.setup();
    const { unmount } = openNote('e2');
    await user.click(await screen.findByRole('textbox', { name: 'Note' }));
    await user.keyboard('{Control>}a{/Control}');
    await new Promise((resolve) => setTimeout(resolve, 500));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await db.notes.get('e2')).toMatchObject({ content: '- a\n- b', updatedAt: 1000 });
  });
});

describe('the editor page layout', () => {
  it('shows the date, labels and board as chips after the text', async () => {
    const label = await createLabel('Home');
    const note = await createNote({ kind: 'note', title: 'Trip', content: 'Pack', labelIds: [label.id] });
    await setDue(note.id, '2999-01-01', null, null);
    openNote(note.id);
    const chips = await screen.findByRole('group', { name: 'Details' });
    expect(within(chips).getByRole('button', { name: /Change date/ })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: 'Label: Home' })).toBeInTheDocument();
    // The chips come after the text.
    const text = await screen.findByRole('textbox', { name: 'Note' });
    expect(text.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has a separate title style with a quiet placeholder', async () => {
    const note = await createNote({ kind: 'note' });
    openNote(note.id);
    const title = await screen.findByRole('textbox', { name: 'Title' });
    expect(title).toHaveAttribute('placeholder', 'Title');
    expect(title.className).toMatch(/title/);
  });
});
