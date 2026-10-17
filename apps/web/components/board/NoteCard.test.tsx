import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { localDate } from '../../lib/calendar';
import { createNote, setDue } from '../../lib/notes';
import { makeAttachment } from '../../lib/testUtils';
import { ToastProvider } from '../ui/Toast';
import NoteCard from './NoteCard';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const groceries = () =>
  createNote({
    id: 'c1',
    kind: 'list',
    title: 'Groceries',
    items: [
      { id: 'i1', text: 'Milk', done: false },
      { id: 'i2', text: 'Bread', done: true },
    ],
  });

describe('NoteCard', () => {
  it('opens the note from the card', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={['Home']} mode='board' onOpen={onOpen} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('+1 completed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open note: Groceries' }));
    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('describes the card contents to screen readers', async () => {
    const note = await createNote({ id: 'c2', kind: 'note', content: 'Buy stamps' });
    render(<NoteCard note={note} labelNames={['Errands']} mode='board' onOpen={vi.fn()} />);
    const open = screen.getByRole('button', { name: 'Open note: Untitled' });
    expect(open).toHaveAccessibleDescription('Buy stamps Errands');
  });

  it('ticks a list item without opening the note', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={onOpen} />);
    await user.click(screen.getByRole('checkbox', { name: 'Mark “Milk” done' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.items[0].done).toBe(true));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not tick an item when its text is clicked', async () => {
    const note = await groceries();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={vi.fn()} />);
    await user.click(screen.getByText('Milk'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await db.notes.get('c1'))?.items[0].done).toBe(false);
  });

  it('deletes from the menu without opening the note', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.trashedAt).not.toBeNull());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('puts a deleted note back in its place on Undo', async () => {
    await createNote({ id: 'top', kind: 'note', title: 'Top', position: 0 });
    const note = await createNote({ id: 'c1', kind: 'note', title: 'Groceries', position: 5 });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <NoteCard note={note} labelNames={[]} mode='board' onOpen={vi.fn()} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await db.notes.get('c1')).toMatchObject({ trashedAt: null, position: 5 }));
  });

  it('offers restore in trash and no editing controls', async () => {
    const note = { ...(await groceries()), trashedAt: 1 };
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='trash' onOpen={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Mark “Milk” done' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    await db.notes.update('c1', { trashedAt: 1 });
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.trashedAt).toBeNull());
  });

  it('shows formatted text on the card', async () => {
    const note = await createNote({ id: 'c3', kind: 'note', content: '**Buy** stamps\n\n- glue' });
    const { container } = render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={vi.fn()} />);
    expect(container.querySelector('strong')).toHaveTextContent('Buy');
    expect(container.querySelector('li')).toHaveTextContent('glue');
    expect(screen.getByRole('button', { name: 'Open note: Untitled' })).toHaveAccessibleDescription(/Buy stamps/);
  });

  it('shows its images and says how many there are', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumb');
    const note = await createNote({ id: 'c4', kind: 'note', title: 'Trip' });
    const images = [0, 1, 2].map((position) => makeAttachment({ noteId: 'c4', position }));
    const { container } = render(<NoteCard note={note} images={images} labelNames={[]} mode='board' onOpen={vi.fn()} />);
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Open note: Trip' })).toHaveAccessibleDescription('3 images');
  });

  it('is not empty when it only has an image', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumb');
    const note = await createNote({ id: 'c5', kind: 'note' });
    render(<NoteCard note={note} images={[makeAttachment({ noteId: 'c5' })]} labelNames={[]} mode='board' onOpen={vi.fn()} />);
    expect(screen.queryByText('Empty note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open note: Untitled' })).toHaveAccessibleDescription('1 image');
  });

  it('shows an overdue date and describes it', async () => {
    const note = await createNote({ id: 'd1', kind: 'note', title: 'Bill' });
    await setDue(note.id, '2026-01-01', null, null);
    const stored = await db.notes.get(note.id);
    render(
      <ToastProvider>
        <NoteCard note={stored!} labelNames={[]} mode='board' onOpen={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByText(/Overdue · Thu 1 Jan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open note: Bill' })).toHaveAccessibleDescription(/Due thu 1 Jan|Due Thu 1 Jan/);
    expect(screen.getByRole('button', { name: 'Open note: Bill' })).toHaveAccessibleDescription(/overdue/);
  });

  it('shows today’s date without the overdue mark', async () => {
    const note = await createNote({ id: 'd2', kind: 'note', title: 'Call' });
    await setDue(note.id, localDate(Date.now()), '23:59', null);
    const stored = await db.notes.get(note.id);
    render(
      <ToastProvider>
        <NoteCard note={stored!} labelNames={[]} mode='board' onOpen={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByText(/^Today, 11:59/)).toBeInTheDocument();
    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it('shows where a board note lives', async () => {
    const note = await createNote({ id: 'p1', kind: 'note', title: 'Logo' });
    render(
      <ToastProvider>
        <NoteCard note={note} labelNames={[]} mode='board' onOpen={vi.fn()} place='Website · Doing' />
      </ToastProvider>,
    );
    expect(screen.getByText('Website · Doing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open note: Logo' })).toHaveAccessibleDescription(/Website · Doing/);
  });
});

describe('tick boxes on cards', () => {
  it('ticks a tick box in a text note from the card', async () => {
    const user = userEvent.setup();
    const note = await createNote({ kind: 'note', title: 'Shop', content: '```\n- [ ] code\n```\n- [ ] milk\n- [x] eggs' });
    render(
      <ToastProvider>
        <NoteCard note={note} labelNames={[]} mode='board' onOpen={vi.fn()} />
      </ToastProvider>,
    );
    const milk = screen.getByRole('checkbox', { name: 'Mark ‘milk’ done' });
    expect(screen.getByRole('checkbox', { name: 'Mark ‘eggs’ not done' })).toBeChecked();
    await user.click(milk);
    await waitFor(async () =>
      expect((await db.notes.get(note.id))?.content).toBe('```\n- [ ] code\n```\n- [x] milk\n- [x] eggs'),
    );
  });
});

describe('search matches on cards', () => {
  it('marks search matches in the title and text', async () => {
    const note = await createNote({ kind: 'note', title: 'Milk run', content: 'Buy **milk** today' });
    render(
      <ToastProvider>
        <NoteCard note={note} labelNames={[]} mode='board' onOpen={vi.fn()} highlight='milk' />
      </ToastProvider>,
    );
    const marks = document.querySelectorAll('mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['Milk', 'milk']);
  });
});

describe('image-only cards', () => {
  it('shows only the images (no empty body, no "Empty note")', async () => {
    const note = await createNote({ kind: 'note' });
    render(
      <ToastProvider>
        <NoteCard
          note={note}
          labelNames={[]}
          mode='board'
          onOpen={vi.fn()}
          images={[makeAttachment({ noteId: note.id })]}
          imageCount={1}
        />
      </ToastProvider>,
    );
    expect(screen.queryByText('Empty note')).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-only-images', 'true');
  });
});

describe('tick box names and numbered lists', () => {
  it('names a tick box by its plain text, and leaves numbered "[ ]" lines as text', async () => {
    const note = await createNote({ kind: 'note', title: 'T', content: '- [ ] **milk** &amp; eggs\n\n1. [ ] one' });
    render(
      <ToastProvider>
        <NoteCard note={note} labelNames={[]} mode='board' onOpen={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByRole('checkbox', { name: 'Mark ‘milk & eggs’ done' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText(/\[ \] one/)).toBeInTheDocument();
  });
});
