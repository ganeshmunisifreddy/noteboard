import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditorToolbar from './EditorToolbar';

const draft = {
  kind: 'note' as const,
  title: '',
  content: '',
  items: [],
  color: 'default' as const,
  labelIds: [],
  pinned: false,
  archived: false,
};

const props = {
  draft,
  trashed: false,
  onBack: vi.fn(),
  onChange: vi.fn(),
  onTogglePin: vi.fn(),
  onSwitchKind: vi.fn(),
  onArchive: vi.fn(),
  onCopy: vi.fn(),
  onDelete: vi.fn(),
  onRestore: vi.fn(),
  onDeleteForever: vi.fn(),
  onAddImages: vi.fn(),
  boardItems: [{ label: 'Trips', items: [{ label: 'Next', onSelect: vi.fn() }] }],
  dateButton: <button type='button'>Add date</button>,
};

const original = window.matchMedia;
const phone = () => {
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
};

afterEach(() => {
  window.matchMedia = original;
});

describe('EditorToolbar', () => {
  it('shows five actions and puts the rest in ⋮', async () => {
    const user = userEvent.setup();
    render(<EditorToolbar {...props} />);
    const bar = screen.getByRole('banner');
    for (const name of ['Pin note', 'Change colour', 'Add date', 'Labels', 'Add image', 'More actions']) {
      expect(within(bar).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(bar).queryByRole('button', { name: 'Archive' })).toBeNull();
    await user.click(within(bar).getByRole('button', { name: 'More actions' }));
    for (const name of ['Board', 'Turn into list', 'Make a copy', 'Archive', 'Delete']) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument();
    }
  });

  it('moves Labels and Add image into ⋮ on a phone', async () => {
    phone();
    const user = userEvent.setup();
    render(<EditorToolbar {...props} />);
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByRole('button', { name: 'Labels' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Add image' })).toBeNull();
    await user.click(within(bar).getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Labels…' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add image' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Labels…' }));
    expect(await screen.findByRole('dialog', { name: 'Labels' })).toBeInTheDocument();
  });
});
