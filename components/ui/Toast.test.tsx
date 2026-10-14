import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

const Trigger = ({ onAction }: { onAction: () => void }) => {
  const toast = useToast();
  return (
    <button type='button' onClick={() => toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction })}>
      Delete
    </button>
  );
};

describe('Toast', () => {
  it('shows a message with a working Undo', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger onAction={onAction} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect((await screen.findAllByText('Moved to trash')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
