import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { newDue } from '../../lib/due';
import { trashNote } from '../../lib/notes';
import { makeNote } from '../../lib/testUtils';
import ReminderAlerts from './ReminderAlerts';
import { ToastProvider } from './Toast';

const router = vi.hoisted(() => ({
  pathname: '/',
  asPath: '/',
  query: {},
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock('next/router', () => ({ useRouter: () => router }));

const due = () => ({ ...newDue('2026-10-15', '09:00', null), snoozedUntil: Date.now() - 1000 });

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderPanel = () =>
  render(
    <ToastProvider>
      <ReminderAlerts />
    </ToastProvider>,
  );

const panel = () => screen.findByRole('region', { name: 'Reminders' });

describe('ReminderAlerts', () => {
  it('shows and announces a reminder that came due', async () => {
    await db.notes.add(makeNote({ id: 'n1', title: 'Groceries', due: due() }));
    renderPanel();
    expect(within(await panel()).getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Reminder: Groceries');
  });

  it('opens the note', async () => {
    const user = userEvent.setup();
    await db.notes.add(makeNote({ id: 'n1', title: 'Groceries', due: due() }));
    renderPanel();
    await user.click(within(await panel()).getByRole('button', { name: 'Open' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/note', query: { id: 'n1' } });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Reminders' })).not.toBeInTheDocument());
  });

  it('snoozes for 10 minutes', async () => {
    const user = userEvent.setup();
    await db.notes.add(makeNote({ id: 'n1', title: 'Groceries', due: due() }));
    renderPanel();
    await user.click(within(await panel()).getByRole('button', { name: 'Snooze' }));
    const before = Date.now();
    await user.click(await screen.findByRole('menuitem', { name: '10 minutes' }));
    await waitFor(async () => {
      const snoozed = (await db.notes.get('n1'))?.due?.snoozedUntil ?? 0;
      expect(snoozed).toBeGreaterThanOrEqual(before + 10 * 60 * 1000);
    });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Reminders' })).not.toBeInTheDocument());
  });

  it('marks done with Undo', async () => {
    const user = userEvent.setup();
    await db.notes.add(makeNote({ id: 'n1', title: 'Groceries', due: due() }));
    renderPanel();
    await user.click(within(await panel()).getByRole('button', { name: 'Mark done' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.due?.doneAt).not.toBeNull());
    expect(await screen.findByText('Marked done')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.due?.doneAt).toBeNull());
  });

  it('dismisses without changing the note', async () => {
    const user = userEvent.setup();
    await db.notes.add(makeNote({ id: 'n1', title: 'Groceries', due: due() }));
    renderPanel();
    await user.click(within(await panel()).getByRole('button', { name: 'Dismiss reminder for Groceries' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Reminders' })).not.toBeInTheDocument());
    expect((await db.notes.get('n1'))?.due).toMatchObject({ doneAt: null, alertedAt: expect.any(Number) });
  });

  it('shows three rows and a link to the rest', async () => {
    await db.notes.bulkAdd(['a', 'b', 'c', 'd'].map((id) => makeNote({ id, title: `Task ${id}`, due: due() })));
    renderPanel();
    const region = await panel();
    await waitFor(() => expect(within(region).getAllByRole('listitem')).toHaveLength(3));
    expect(within(region).getByRole('link', { name: '+1 more · View in Upcoming' })).toHaveAttribute('href', '/?view=upcoming');
    expect(screen.getByRole('status')).toHaveTextContent('4 reminders');
  });

  it('drops a row when its note goes to Trash', async () => {
    await db.notes.add(makeNote({ id: 'n1', title: 'Groceries', due: due() }));
    renderPanel();
    await panel();
    await act(() => trashNote('n1'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Reminders' })).not.toBeInTheDocument());
  });

  it('opens what the service worker asks for', async () => {
    const container = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    try {
      renderPanel();
      act(() => {
        container.dispatchEvent(new MessageEvent('message', { data: { type: 'open-reminder', url: '/note?id=n9' } }));
      });
      expect(router.push).toHaveBeenCalledWith('/note?id=n9');
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });
});
