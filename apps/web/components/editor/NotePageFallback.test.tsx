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
// The editor chunk can't be fetched (offline before it was cached).
vi.mock('./RichEditor', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('NotePage without the rich editor', () => {
  it('falls back to the plain text box', async () => {
    await createNote({ id: 'f1', kind: 'note', content: '**Old**' });
    router.query = { id: 'f1' };
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <NotePage />
      </ToastProvider>,
    );
    expect(await screen.findByText("Formatting tools couldn't load. You can still edit the text.")).toBeInTheDocument();
    const box = await screen.findByRole('textbox', { name: 'Note' });
    expect(box).toHaveValue('**Old**');
    await user.type(box, '!');
    await waitFor(async () => expect((await db.notes.get('f1'))?.content).toBe('**Old**!'));
  });
});
