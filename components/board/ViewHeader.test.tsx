import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BoardFilter } from '../../lib/types';
import ViewHeader from './ViewHeader';

const f = (over: Partial<BoardFilter>): BoardFilter => ({ view: 'all', labelId: null, query: '', ...over });

describe('ViewHeader', () => {
  it('names each section', () => {
    const cases: [Partial<BoardFilter>, string][] = [
      [{}, 'Notes'],
      [{ view: 'lists' }, 'Notes'],
      [{ view: 'upcoming' }, 'Upcoming'],
      [{ view: 'boards' }, 'Boards'],
      [{ view: 'archive' }, 'Archive'],
      [{ view: 'trash' }, 'Trash'],
      [{ labelId: 'l1' }, 'Office'],
    ];
    for (const [over, name] of cases) {
      const { unmount } = render(
        <ViewHeader filter={f(over)} labelName='Office' total={1} onView={vi.fn()} onEmptyTrash={vi.fn()} />,
      );
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(name);
      unmount();
    }
  });

  it('switches All, Text and Lists on Notes', async () => {
    const onView = vi.fn();
    render(<ViewHeader filter={f({ view: 'lists' })} total={3} onView={onView} onEmptyTrash={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Lists' })).toBeChecked();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Text' }));
    expect(onView).toHaveBeenCalledWith('notes');
  });

  it('heads search results with the count', () => {
    render(<ViewHeader filter={f({ query: 'qa' })} total={4} onView={vi.fn()} onEmptyTrash={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Results for “qa”');
    expect(screen.getByRole('status')).toHaveTextContent('4 notes');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('keeps the Trash line and Empty trash', async () => {
    const onEmptyTrash = vi.fn();
    render(<ViewHeader filter={f({ view: 'trash' })} total={2} onView={vi.fn()} onEmptyTrash={onEmptyTrash} />);
    expect(screen.getByText('Notes in Trash are deleted after 30 days.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Empty trash' }));
    expect(onEmptyTrash).toHaveBeenCalled();
  });
});
