import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, localDate } from '../../lib/calendar';
import { db } from '../../lib/db';
import { createLabel, createNote, setDue } from '../../lib/notes';
import AppShell from './AppShell';
import Sidebar from './Sidebar';

const router = vi.hoisted(() => ({
  pathname: '/',
  asPath: '/',
  query: {} as Record<string, string>,
  isReady: true,
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(() => Promise.resolve()),
  events: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('next/router', () => ({ useRouter: () => router }));

const original = window.matchMedia;
const desktop = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 1024px') ? matches : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  router.query = {};
  desktop(true);
});

afterEach(() => {
  window.matchMedia = original;
});

const nav = () => screen.getAllByRole('navigation', { name: 'Sections' })[0];

describe('Sidebar', () => {
  it('lists every section and the labels, and marks the current one', async () => {
    await createLabel('Office');
    router.query = { view: 'lists' };
    render(<Sidebar variant='side' onEditLabels={vi.fn()} />);
    expect(await within(nav()).findByRole('link', { name: 'Office' })).toHaveAttribute('href', expect.stringContaining('label='));
    for (const name of ['Notes', 'Upcoming', 'Boards', 'Archive', 'Trash']) {
      expect(within(nav()).getByRole('link', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(within(nav()).getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav()).getByRole('link', { name: 'Trash' })).toHaveAttribute('href', '/?view=trash');
  });

  it('counts notes due today or overdue on Upcoming', async () => {
    const today = localDate(Date.now());
    const a = await createNote({ kind: 'note', title: 'A' });
    const b = await createNote({ kind: 'note', title: 'B' });
    const c = await createNote({ kind: 'note', title: 'C' });
    await setDue(a.id, addDays(today, -1), null, null);
    await setDue(b.id, today, null, null);
    await setDue(c.id, addDays(today, 3), null, null);
    render(<Sidebar variant='side' onEditLabels={vi.fn()} />);
    expect(await within(nav()).findByRole('link', { name: 'Upcoming, 2 due' })).toBeInTheDocument();
  });

  it('opens Edit labels', async () => {
    const onEditLabels = vi.fn();
    render(<Sidebar variant='side' onEditLabels={onEditLabels} />);
    await userEvent.setup().click(within(nav()).getByRole('button', { name: 'Edit labels' }));
    expect(onEditLabels).toHaveBeenCalled();
  });
});

describe('AppShell', () => {
  const top = (onMenu: () => void) => (
    <header>
      <button type='button' onClick={onMenu}>
        Main menu
      </button>
    </header>
  );

  it('collapses to the rail on desktop and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <AppShell renderTop={top} onEditLabels={vi.fn()}>
        body
      </AppShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Main menu' }));
    expect(localStorage.getItem('sidebar')).toBe('rail');
    unmount();
    render(
      <AppShell renderTop={top} onEditLabels={vi.fn()}>
        body
      </AppShell>,
    );
    expect(nav().closest('[data-sidebar]')).toHaveAttribute('data-sidebar', 'rail');
  });

  it('opens a drawer below desktop width, closes it on a pick and returns focus', async () => {
    desktop(false);
    const user = userEvent.setup();
    render(
      <AppShell renderTop={top} onEditLabels={vi.fn()}>
        body
      </AppShell>,
    );
    const menu = screen.getByRole('button', { name: 'Main menu' });
    await user.click(menu);
    const drawer = await screen.findByRole('dialog', { name: 'Sections' });
    await user.click(within(drawer).getByRole('link', { name: 'Trash' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(menu).toHaveFocus());
  });
});
