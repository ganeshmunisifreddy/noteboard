import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import { bytesOf } from '../../lib/testUtils';
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
// jsdom can't decode images; the processing itself is tested in lib/images.test.ts.
vi.mock('../../lib/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/images')>()),
  processImage: async (file: File) => ({
    bytes: bytesOf(`full-${file.name}`),
    type: 'image/jpeg',
    width: 10,
    height: 10,
    thumb: bytesOf(`thumb-${file.name}`),
    thumbType: 'image/jpeg',
  }),
}));
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
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image');
});

const photo = (name = 'receipt.jpg') => new File(['x'], name, { type: 'image/jpeg' });

const open = (query: Record<string, string>) => {
  router.query = query;
  return render(
    <ToastProvider>
      <NotePage />
    </ToastProvider>,
  );
};

const choose = (files: File[]) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
};

describe('images in the note editor', () => {
  it('adds images from the Add image button', async () => {
    await createNote({ id: 'n1', kind: 'note', title: 'Trip' });
    open({ id: 'n1' });
    expect(await screen.findByRole('button', { name: 'Add image' })).toBeInTheDocument();
    choose([photo('a.jpg'), photo('b.jpg')]);
    expect(await screen.findByRole('button', { name: 'Open image 2 of 2' })).toBeInTheDocument();
    expect(await db.attachments.count()).toBe(2);
  });

  it('saves a new note when its first image is added and keeps it on leaving', async () => {
    const { unmount } = open({ new: 'note', id: 'fresh' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([photo()]);
    await screen.findByRole('button', { name: 'Open image 1 of 1' });
    expect(router.replace).toHaveBeenCalled();
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await db.notes.get('fresh')).toMatchObject({ trashedAt: null });
  });

  it('adds a pasted image without cancelling a text paste', async () => {
    await createNote({ id: 'n2', kind: 'note' });
    open({ id: 'n2' });
    await screen.findByRole('button', { name: 'Add image' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [photo()], types: ['text/plain', 'Files'] } });
    act(() => {
      window.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(false);
    expect(await screen.findByRole('button', { name: 'Open image 1 of 1' })).toBeInTheDocument();
  });

  it('adds dropped images', async () => {
    await createNote({ id: 'n3', kind: 'note' });
    const { container } = open({ id: 'n3' });
    await screen.findByRole('button', { name: 'Add image' });
    const page = container.firstElementChild as HTMLElement;
    const dataTransfer = { types: ['Files'], files: [photo()] };
    fireEvent.dragOver(page, { dataTransfer });
    expect(screen.getByText('Drop to add images')).toBeInTheDocument();
    fireEvent.drop(page, { dataTransfer });
    expect(await screen.findByRole('button', { name: 'Open image 1 of 1' })).toBeInTheDocument();
    expect(screen.queryByText('Drop to add images')).toBeNull();
  });

  it('removes an image from the viewer and puts it back on Undo', async () => {
    await createNote({ id: 'n4', kind: 'note' });
    open({ id: 'n4' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([photo()]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open image 1 of 1' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove image' }));
    await waitFor(async () => expect(await db.attachments.count()).toBe(0));
    // The page takes clicks again once the viewer has closed.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await db.attachments.count()).toBe(1));
  });

  it('returns focus to the image after the viewer closes', async () => {
    await createNote({ id: 'n6', kind: 'note' });
    open({ id: 'n6' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([photo('a.jpg'), photo('b.jpg')]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open image 1 of 2' }));
    await user.keyboard('{ArrowRight}{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open image 2 of 2' })).toHaveFocus());
  });

  it('can’t add images to a note in Trash', async () => {
    await createNote({ id: 'n5', kind: 'note', title: 'Gone' });
    await db.notes.update('n5', { trashedAt: Date.now() });
    open({ id: 'n5' });
    await screen.findByRole('button', { name: 'Restore' });
    expect(screen.queryByRole('button', { name: 'Add image' })).toBeNull();
  });
});
