import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, localDate } from '../../lib/calendar';
import { db } from '../../lib/db';
import { createLabel, createNote, setDue } from '../../lib/notes';
import { renderAt } from '../../lib/testRouter';
import AppShell from './AppShell';
import Sidebar from './Sidebar';


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
  desktop(true);
});

afterEach(() => {
  window.matchMedia = original;
});

const nav = () => screen.getAllByRole('navigation', { name: 'Sections' })[0];

describe('Sidebar', () => {
  it('lists every section and the labels, and marks the current one', async () => {
    await createLabel('Office');
    renderAt(<Sidebar variant='side' onEditLabels={vi.fn()} />, '/?view=lists');
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
    renderAt(<Sidebar variant='side' onEditLabels={vi.fn()} />);
    expect(await within(nav()).findByRole('link', { name: 'Upcoming, 2 due' })).toBeInTheDocument();
  });

  it('opens Edit labels', async () => {
    const onEditLabels = vi.fn();
    renderAt(<Sidebar variant='side' onEditLabels={onEditLabels} />);
    await userEvent.setup().click(within(nav()).getByRole('button', { name: 'Edit labels' }));
    expect(onEditLabels).toHaveBeenCalled();
  });
});

describe('AppShell', () => {
  const top = (onMenu: (opener: HTMLElement) => void) => (
    <header>
      <button type='button' onClick={(e) => onMenu(e.currentTarget)}>
        Main menu
      </button>
    </header>
  );

  it('collapses to the rail on desktop and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt(
      <AppShell renderTop={top} onEditLabels={vi.fn()}>
        body
      </AppShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Main menu' }));
    expect(localStorage.getItem('sidebar')).toBe('rail');
    unmount();
    renderAt(
      <AppShell renderTop={top} onEditLabels={vi.fn()}>
        body
      </AppShell>,
    );
    expect(nav().closest('[data-sidebar]')).toHaveAttribute('data-sidebar', 'rail');
  });

  it('opens a drawer below desktop width, closes it on a pick and returns focus', async () => {
    desktop(false);
    const user = userEvent.setup();
    renderAt(
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

  it('returns focus to ☰ even when the click didn’t focus it (Safari)', async () => {
    desktop(false);
    renderAt(
      <AppShell renderTop={top} onEditLabels={vi.fn()}>
        body
      </AppShell>,
    );
    const menu = screen.getByRole('button', { name: 'Main menu' });
    fireEvent.click(menu); // a click that doesn't move focus
    const drawer = await screen.findByRole('dialog', { name: 'Sections' });
    fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(menu).toHaveFocus());
  });

  it('doesn’t keep a hidden sidebar on phones', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 600px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    renderAt(
      <AppShell renderTop={top} onEditLabels={vi.fn()}>
        body
      </AppShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
  });
});
