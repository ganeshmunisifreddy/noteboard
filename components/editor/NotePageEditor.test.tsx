import { render, screen, waitFor } from '@testing-library/react';
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
});

const openNote = (id: string) => {
  router.query = { id };
  return render(
    <ToastProvider>
      <NotePage />
    </ToastProvider>,
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
