import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addDays, localDate } from '../../lib/calendar';
import { newDue, upcomingSections } from '../../lib/due';
import { makeNote } from '../../lib/testUtils';
import { ToastProvider } from '../ui/Toast';
import UpcomingView from './UpcomingView';

const TODAY = localDate(Date.now());

const renderView = () => {
  const notes = [
    makeNote({ id: 'late', title: 'Pay bill', due: newDue(addDays(TODAY, -2), null, null) }),
    makeNote({ id: 'soon', title: 'Groceries', due: newDue(addDays(TODAY, 1), null, null) }),
    makeNote({ id: 'done', title: 'Dentist', due: { ...newDue(TODAY, null, null), doneAt: Date.now() } }),
  ];
  return render(
    <ToastProvider>
      <UpcomingView sections={upcomingSections(notes, Date.now())} labelNames={new Map()} onOpen={vi.fn()} />
    </ToastProvider>,
  );
};

describe('UpcomingView', () => {
  it('lists dated notes under headings in date order', () => {
    renderView();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Overdue', 'Tomorrow', 'Done (1)']);
    const overdue = screen.getByRole('region', { name: 'Overdue' });
    expect(within(overdue).getByText('Pay bill')).toBeInTheDocument();
  });

  it('keeps Done collapsed until asked', async () => {
    const user = userEvent.setup();
    renderView();
    const toggle = screen.getByRole('button', { name: 'Done (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Dentist')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Dentist')).toBeInTheDocument();
  });

  it('has no drag handles', () => {
    renderView();
    expect(screen.queryByRole('button', { name: /^Move/ })).not.toBeInTheDocument();
  });
});
