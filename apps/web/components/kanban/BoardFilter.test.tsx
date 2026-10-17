import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { addDays, localDate } from '../../lib/calendar';
import { db } from '../../lib/db';
import { newDue } from '../../lib/due';
import { createLabel, createNote } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import { renderAt } from '../../lib/testRouter';
import BoardPage from '../../routes/BoardPage';
import { ToastProvider } from '../ui/Toast';


beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.clearAllMocks();
});

const open = (id: string) => {
  return renderAt(
    <ToastProvider>
      <BoardPage />
    </ToastProvider>,
    `/board?id=${id}`,
  );
};

const setup = async () => {
  const board = await createBoard('Site', 'basic');
  const columns = await sortedColumns(board.id);
  const label = await createLabel('Design');
  const today = localDate(Date.now());
  const add = (id: string, columnId: string, boardPosition: number, extra = {}) =>
    createNote({ id, kind: 'note', title: id, boardId: board.id, columnId, boardPosition, ...extra });
  await add('Fonts', columns[0].id, 0, { labelIds: [label.id] });
  await add('Logo', columns[0].id, 1, { due: newDue(addDays(today, -2), null, null) });
  await add('Copy', columns[0].id, 2, { due: newDue(addDays(today, 3), null, null) });
  await add('Wireframes', columns[1].id, 0);
  return { board, columns, label };
};

const visibleTitles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('filtering a board', () => {
  it('filters by text, label and date, and counts what shows', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    const box = screen.getByRole('searchbox', { name: 'Filter cards by text' });
    expect(box).toHaveFocus();
    await user.type(box, 'o');
    expect(visibleTitles()).toEqual(['Fonts', 'Logo', 'Copy']);
    await user.clear(box);
    await user.click(screen.getByRole('button', { name: 'Design' }));
    expect(visibleTitles()).toEqual(['Fonts']);
    expect(screen.getByText('1 of 3 cards shown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Design' }));
    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(visibleTitles()).toEqual(['Logo']);
    await user.click(screen.getByRole('button', { name: 'Next 7 days' }));
    expect(visibleTitles()).toEqual(['Copy']);
    await user.click(screen.getByRole('button', { name: 'No date' }));
    expect(visibleTitles()).toEqual(['Fonts', 'Wireframes']);
    expect(screen.getByRole('button', { name: 'Filter, 2 cards match' })).toBeInTheDocument();
  });

  it('says when nothing matches, and Clear brings everything back', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter cards by text' }), 'zzz');
    expect(screen.getByText('No cards match the filter')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear' })[0]);
    expect(visibleTitles()).toHaveLength(4);
  });

  it('Escape clears and closes the filter, back to the Filter button', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter cards by text' }), 'fonts{Escape}');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(visibleTitles()).toHaveLength(4);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filter' })).toHaveFocus());
  });

  it('keeps a quick-added card shown, and moves among shown cards only', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('button', { name: 'No date' }));
    await user.click(screen.getByRole('button', { name: 'Add card to To do' }));
    await user.type(screen.getByRole('textbox', { name: 'Card title for To do' }), 'Brief{Enter}');
    expect(await screen.findByText('Brief')).toBeInTheDocument();
    // Shown in To do: Fonts, Brief. Move Brief up passes Fonts; Logo and Copy keep their order.
    await user.click(screen.getByRole('button', { name: 'Card actions for Brief' }));
    (await screen.findByRole('menuitem', { name: 'Move' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitem', { name: 'Move up' })).focus();
    await user.keyboard('{Enter}');
    await waitFor(async () =>
      expect(
        (await db.notes.toArray())
          .filter((n) => n.columnId === columns[0].id)
          .sort((a, b) => a.boardPosition - b.boardPosition)
          .map((n) => n.title),
      ).toEqual(['Brief', 'Fonts', 'Logo', 'Copy']),
    );
  });

  it('keeps a card shown, with focus, when its menu edit stops it matching', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('button', { name: 'Design' }));
    await user.click(screen.getByRole('button', { name: 'Card actions for Fonts' }));
    (await screen.findByRole('menuitem', { name: 'Labels' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitemcheckbox', { name: 'Design' })).focus();
    await user.keyboard('{Enter}');
    await waitFor(async () => expect((await db.notes.get('Fonts'))?.labelIds).toEqual([]));
    await user.keyboard('{Escape}{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Card actions for Fonts' })).toHaveFocus());
    expect(visibleTitles()).toEqual(['Fonts']);
  });

  it('announces how many cards match, and when none do', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    const box = screen.getByRole('searchbox', { name: 'Filter cards by text' });
    await user.type(box, 'o');
    const status = screen.getByTestId('filter-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('3 cards match');
    await user.type(box, 'zzz');
    expect(status).toHaveTextContent('No cards match the filter');
  });

  it('keeps the filter when its row is closed with the Filter button', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('button', { name: 'No date' }));
    await user.click(screen.getByRole('button', { name: 'Filter, 2 cards match' }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(visibleTitles()).toEqual(['Fonts', 'Wireframes']);
    expect(screen.getByRole('button', { name: 'Filter, 2 cards match' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('says a column has no matching cards when the filter hides them all', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(screen.getByText('No matching cards')).toBeInTheDocument();
  });
});
