import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTheme } from '../../lib/theme';
import MoreMenu from './MoreMenu';

beforeEach(() => {
  localStorage.clear();
});

const actions = {
  onArchive: vi.fn(),
  onTrash: vi.fn(),
  onManageLabels: vi.fn(),
  onBackup: vi.fn(),
  onRestore: vi.fn(),
  onExport: vi.fn(),
};

describe('MoreMenu', () => {
  it('holds places, labels and backup, but not the theme choices', async () => {
    const user = userEvent.setup();
    render(<MoreMenu {...actions} />);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    for (const name of ['Archive', 'Trash', 'Manage labels', 'Back up notes', 'Restore from backup…', 'Export as Markdown']) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Use device theme' })).toBeNull();
  });

  it('offers to follow the device again after a theme was chosen', async () => {
    setTheme('dark');
    const user = userEvent.setup();
    render(<MoreMenu {...actions} />);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Use device theme' }));
    expect(localStorage.getItem('theme')).toBeNull();
  });
});
