import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import NoteGrid, { DragPreview, dragAnnouncements, layoutMeasuring, withoutSize } from './NoteGrid';

// Lets a test hold saves open, to act while a move is still being saved.
const saves = vi.hoisted(() => ({ hold: false, waiting: [] as (() => void)[] }));
vi.mock('../../lib/notes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/notes')>();
  return {
    ...actual,
    moveNote: async (...args: Parameters<typeof actual.moveNote>) => {
      if (saves.hold) await new Promise<void>((resolve) => saves.waiting.push(resolve));
      return actual.moveNote(...args);
    },
  };
});

beforeEach(async () => {
  saves.hold = false;
  saves.waiting = [];
  await db.delete();
  await db.open();
});

const threeNotes = () =>
  Promise.all([
    createNote({ id: 'a', kind: 'note', title: 'A', position: 0 }),
    createNote({ id: 'b', kind: 'note', title: 'B', position: 1 }),
    createNote({ id: 'c', kind: 'note', title: 'C', position: 2 }),
  ]);

const savedOrder = async () => (await db.notes.orderBy('position').toArray()).map((n) => n.id);

const shownOrder = () => screen.getAllByRole('button', { name: /^Move / }).map((b) => b.getAttribute('aria-label'));

describe('NoteGrid', () => {
  it('moves a note with the arrow keys and saves the order', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable />);
    const handle = screen.getByRole('button', { name: 'Move A' });
    handle.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'a', 'c']));
    // dnd-kit has its own status region for pointer drags.
    expect(screen.getByText('Moved A to position 2 of 3')).toHaveAttribute('role', 'status');
    expect(handle).toHaveFocus();
  });

  it('moves twice when a key is pressed again before the first move is saved', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    // The notes prop stays the same, as when the database hasn't answered yet.
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable />);
    screen.getByRole('button', { name: 'Move A' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'c', 'a']));
    expect(screen.getByText('Moved A to position 3 of 3')).toBeInTheDocument();
  });

  it('does not take focus back after the user has moved on', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    const props = { notes, labelNames: new Map<string, string>(), mode: 'board' as const, onOpen: vi.fn() };
    const { rerender } = render(<NoteGrid {...props} reorderable />);
    screen.getByRole('button', { name: 'Move A' }).focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'a', 'c']));
    // Clicking blank space blurs the grip without focusing anything else.
    act(() => (document.activeElement as HTMLElement).blur());
    rerender(<NoteGrid {...props} notes={[...notes]} reorderable />);
    expect(screen.getByRole('button', { name: 'Move A' })).not.toHaveFocus();
  });

  it('moves a note from the grip menu, without dragging', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable />);
    await user.click(screen.getByRole('button', { name: 'Move A' }));
    expect(await screen.findByRole('menuitem', { name: 'Move later' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Move earlier' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Move to end' }));
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'c', 'a']));
  });

  it('keeps every key press when a save lands between presses', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    const props = { labelNames: new Map<string, string>(), mode: 'board' as const, onOpen: vi.fn(), reorderable: true };
    const { rerender } = render(<NoteGrid {...props} notes={notes} />);
    saves.hold = true;
    screen.getByRole('button', { name: 'Move A' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(shownOrder()).toEqual(['Move B', 'Move C', 'Move A']);
    // The first save finishes and the board receives its result while the
    // second is still being saved.
    saves.waiting.shift()?.();
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'a', 'c']));
    const afterFirst = await db.notes.orderBy('position').toArray();
    rerender(<NoteGrid {...props} notes={afterFirst} />);
    expect(shownOrder()).toEqual(['Move B', 'Move C', 'Move A']);
    await user.keyboard('{ArrowLeft}');
    // Saves run in the order they were made, as Dexie queues them.
    saves.hold = false;
    for (const release of saves.waiting.splice(0)) {
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'a', 'c']));
    rerender(<NoteGrid {...props} notes={await db.notes.orderBy('position').toArray()} />);
    expect(shownOrder()).toEqual(['Move B', 'Move A', 'Move C']);
  });

  it('keeps showing the saved order until the board receives it', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    const props = { labelNames: new Map<string, string>(), mode: 'board' as const, onOpen: vi.fn(), reorderable: true };
    const { rerender } = render(<NoteGrid {...props} notes={notes} />);
    saves.hold = true;
    screen.getByRole('button', { name: 'Move A' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    saves.waiting.shift()?.();
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'a', 'c']));
    rerender(<NoteGrid {...props} notes={await db.notes.orderBy('position').toArray()} />);
    saves.waiting.shift()?.();
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'c', 'a']));
    // The board still has the order after the first save only.
    expect(shownOrder()).toEqual(['Move B', 'Move C', 'Move A']);
  });

  it('moves a note to the end with End', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable />);
    screen.getByRole('button', { name: 'Move A' }).focus();
    await user.keyboard('{End}');
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'c', 'a']));
  });

  it('offers no drag handle when reordering is off', async () => {
    const notes = await threeNotes();
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable={false} />);
    expect(screen.queryByRole('button', { name: 'Move A' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open note: A' })).toBeInTheDocument();
  });
});

describe('dragAnnouncements', () => {
  const titles: Record<string, string> = { a: 'Groceries', b: '' };
  const announce = dragAnnouncements((id) => titles[id] || 'Untitled');
  const item = (id: string) => ({ id }) as never;

  it('names notes by title for screen readers', () => {
    expect(announce.onDragStart({ active: item('a') })).toBe('Picked up Groceries');
    expect(announce.onDragOver({ active: item('a'), over: item('b') })).toBe('Groceries is over Untitled');
    expect(announce.onDragOver({ active: item('a'), over: null })).toBe('Groceries is no longer over another note');
    expect(announce.onDragEnd({ active: item('a'), over: item('b') })).toBe('Dropped Groceries');
    expect(announce.onDragCancel({ active: item('a'), over: null })).toBe('Stopped moving Groceries');
  });
});

describe('layoutMeasuring', () => {
  it('reads drop targets from the layout, not the transformed DOM', () => {
    const grid = document.createElement('div');
    const cell = document.createElement('div');
    cell.dataset.size = 'b';
    grid.append(cell);
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 100, left: 20 } as DOMRect);
    const { droppable } = layoutMeasuring(JSON.stringify([['b', { x: 316, y: 50, width: 300, height: 80 }]]));
    expect(droppable?.measure?.(cell)).toEqual({ top: 150, left: 336, width: 300, height: 80, right: 636, bottom: 230 });
  });
});

describe('DragPreview', () => {
  it('keeps the copy of the dragged card out of focus and screen readers', () => {
    const { container } = render(
      <DragPreview width={200}>
        <button type='button'>Pin</button>
      </DragPreview>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveAttribute('inert');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper.style.width).toBe('200px');
  });
});

describe('withoutSize', () => {
  it('forgets the size of a card that is gone', () => {
    const sizes = { a: { width: 1, height: 2 }, b: { width: 3, height: 4 } };
    expect(withoutSize(sizes, 'a')).toEqual({ b: { width: 3, height: 4 } });
    expect(withoutSize(sizes, 'x')).toBe(sizes);
  });
});
