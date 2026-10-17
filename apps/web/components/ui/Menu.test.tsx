import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Menu from './Menu';

describe('Menu', () => {
  it('shows checked and disabled items to screen readers', async () => {
    const user = userEvent.setup();
    render(
      <Menu
        trigger={<button type='button'>Open</button>}
        items={[
          { label: 'To do', checked: false, onSelect: vi.fn() },
          { label: 'Doing', checked: true, onSelect: vi.fn() },
          { label: 'No boards yet', disabled: true },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Doing' })).toBeChecked();
    expect(screen.getByRole('menuitemcheckbox', { name: 'To do' })).not.toBeChecked();
    expect(screen.getByRole('menuitem', { name: 'No boards yet' })).toHaveAttribute('aria-disabled', 'true');
  });
});
