import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createLabel } from '../../lib/notes';
import LabelPicker from './LabelPicker';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const renderPicker = (selectedIds: string[] = []) => {
  const onChange = vi.fn();
  render(
    <LabelPicker selectedIds={selectedIds} onChange={onChange} trigger={<button type='button'>Labels</button>} />,
  );
  return onChange;
};

describe('LabelPicker', () => {
  it('creates a label and selects it', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.type(await screen.findByRole('textbox', { name: 'Label name' }), 'Work');
    await user.click(screen.getByRole('button', { name: 'Create “Work”' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([expect.any(String)]));
    expect((await db.labels.toArray()).map((l) => l.name)).toEqual(['Work']);
  });

  it('toggles an existing label', async () => {
    const home = await createLabel('Home');
    const user = userEvent.setup();
    const onChange = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Home' }));
    expect(onChange).toHaveBeenCalledWith([home.id]);
  });
});
