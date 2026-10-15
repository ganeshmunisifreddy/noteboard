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
// Lets a test hold image processing open, like a slow phone photo.
const processing = vi.hoisted(() => ({ gate: null as Promise<void> | null }));
// jsdom can't decode images; the processing itself is tested in lib/images.test.ts.
vi.mock('../../lib/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/images')>()),
  processImage: async (file: File) => {
    if (processing.gate) await processing.gate;
    return {
    bytes: bytesOf(`full-${file.name}`),
    type: 'image/jpeg',
    width: 10,
    height: 10,
    thumb: bytesOf(`thumb-${file.name}`),
    thumbType: 'image/jpeg',
    };
  },
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
  processing.gate = null;
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
    // The viewer's closing dialog blocks pointer events for a moment.
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
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

  it('keeps a new note whose image is still being added when leaving', async () => {
    let release = () => {};
    processing.gate = new Promise((resolve) => {
      release = resolve;
    });
    const { unmount } = open({ new: 'note', id: 'busy' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([photo()]);
    await waitFor(async () => expect(await db.notes.get('busy')).toBeDefined());
    unmount();
    release();
    await waitFor(async () => expect(await db.attachments.count()).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await db.notes.get('busy'))?.trashedAt).toBeNull();
  });

  it('still saves typing after the note could not be created for an image', async () => {
    vi.spyOn(db.notes, 'add').mockRejectedValueOnce(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    const user = userEvent.setup();
    const { unmount } = open({ new: 'note', id: 'retry' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([photo()]);
    expect(await screen.findByText('Couldn’t save: storage is full.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Groceries');
    unmount();
    await waitFor(async () => expect((await db.notes.get('retry'))?.title).toBe('Groceries'));
  });

  it('moves focus to the next image after removing one', async () => {
    await createNote({ id: 'n7', kind: 'note' });
    open({ id: 'n7' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([photo('a.jpg'), photo('b.jpg')]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open image 2 of 2' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove image' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open image 1 of 1' })).toHaveFocus());
  });

  it('moves focus to Add image after removing the only image', async () => {
    await createNote({ id: 'n8', kind: 'note' });
    open({ id: 'n8' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([photo()]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open image 1 of 1' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove image' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add image' })).toHaveFocus());
  });

  it('says when a chosen file is not an image', async () => {
    await createNote({ id: 'n9', kind: 'note' });
    open({ id: 'n9' });
    await screen.findByRole('button', { name: 'Add image' });
    choose([new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })]);
    expect(await screen.findByText('Couldn’t add scan.pdf: this browser can’t read it.')).toBeInTheDocument();
    expect(await db.attachments.count()).toBe(0);
  });

  it('sums up several unusable files in one message', async () => {
    await createNote({ id: 'n10', kind: 'note' });
    open({ id: 'n10' });
    await screen.findByRole('button', { name: 'Add image' });
    choose(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf'].map((name) => new File(['x'], name, { type: 'application/pdf' })));
    expect(await screen.findByText('Couldn’t add 4 files: this browser can’t read them.')).toBeInTheDocument();
  });

  it('says when a copy could not be made', async () => {
    await createNote({ id: 'n11', kind: 'note', title: 'Original' });
    open({ id: 'n11' });
    vi.spyOn(db.notes, 'add').mockRejectedValueOnce(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Make a copy' }));
    expect(await screen.findByText('Couldn’t make a copy: storage is full.')).toBeInTheDocument();
  });
});
