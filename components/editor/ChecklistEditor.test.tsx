import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from '../../lib/types';
import ChecklistEditor from './ChecklistEditor';

const Harness = ({ initial }: { initial: ChecklistItem[] }) => {
  const [items, setItems] = useState(initial);
  return (
    <>
      <ChecklistEditor items={items} onChange={setItems} />
      <output data-testid='state'>{items.map((i) => `${i.text}:${i.done ? 'x' : 'o'}`).join(',')}</output>
    </>
  );
};

const state = () => screen.getByTestId('state').textContent;
const textboxes = () => screen.getAllByRole('textbox', { name: 'List item' });

const start = [
  { id: 'a', text: 'Milk', done: false },
  { id: 'b', text: 'Eggs', done: false },
];

describe('ChecklistEditor', () => {
  it('adds an item below on Enter and focuses it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={start} />);
    await user.click(textboxes()[0]);
    await user.keyboard('{Enter}Tea');
    expect(state()).toBe('Milk:o,Tea:o,Eggs:o');
    expect(textboxes()[1]).toHaveFocus();
  });

  it('removes an empty item on Backspace and focuses the previous one', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[...start, { id: 'c', text: '', done: false }]} />);
    await user.click(textboxes()[2]);
    await user.keyboard('{Backspace}');
    expect(state()).toBe('Milk:o,Eggs:o');
    expect(textboxes()[1]).toHaveFocus();
  });

  it('moves ticked items to the completed section and back to the end', async () => {
    const user = userEvent.setup();
    render(<Harness initial={start} />);
    await user.click(screen.getByRole('checkbox', { name: 'Mark “Milk” done' }));
    expect(state()).toBe('Milk:x,Eggs:o');
    expect(screen.getByRole('button', { name: /1 completed/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Mark “Milk” not done' }));
    expect(state()).toBe('Eggs:o,Milk:o');
  });

  it('creates an item from the add row and keeps typing in it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);
    await user.type(screen.getByRole('textbox', { name: 'Add list item' }), 'Bread');
    expect(state()).toBe('Bread:o');
    expect(textboxes()[0]).toHaveFocus();
  });
});
