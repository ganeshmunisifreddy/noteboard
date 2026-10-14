import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from './ThemeToggle';

beforeEach(() => {
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('switches between light and dark', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(localStorage.getItem('theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
