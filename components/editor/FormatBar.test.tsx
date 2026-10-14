import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RichEditor from './RichEditor';

let slot: HTMLDivElement | null = null;

afterEach(() => {
  slot?.remove();
  slot = null;
});

const setup = (value: string, readOnly = false) => {
  slot = document.createElement('div');
  document.body.append(slot);
  const onChange = vi.fn();
  render(<RichEditor value={value} onChange={onChange} readOnly={readOnly} autoFocus={false} barSlot={slot} />);
  return { onChange, user: userEvent.setup() };
};

const selectAll = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('textbox', { name: 'Note' }));
  await user.keyboard('{Control>}a{/Control}');
};

const lastSaved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0];

describe('FormatBar', () => {
  it('formats the selection and shows the current style', async () => {
    const { onChange, user } = setup('Hello');
    await selectAll(user);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() => expect(lastSaved(onChange)).toBe('**Hello**'));
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns a line into a heading', async () => {
    const { onChange, user } = setup('Hello');
    await selectAll(user);
    await user.click(screen.getByRole('button', { name: 'Heading 1' }));
    await waitFor(() => expect(lastSaved(onChange)).toBe('# Hello'));
  });

  it('turns a line into a bullet list', async () => {
    const { onChange, user } = setup('Hello');
    await selectAll(user);
    await user.click(screen.getByRole('button', { name: 'Bullet list' }));
    await waitFor(() => expect(lastSaved(onChange)).toBe('- Hello'));
  });

  it('is one keyboard toolbar', async () => {
    const { user } = setup('Hello');
    expect(await screen.findByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Heading 1' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveFocus();
  });

  it('adds a link to the selection', async () => {
    const { onChange, user } = setup('Hello');
    await selectAll(user);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.type(await screen.findByRole('textbox', { name: 'Link address' }), 'example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(lastSaved(onChange)).toBe('[Hello](https://example.com)'));
  });

  it('rejects an unsafe address', async () => {
    const { onChange, user } = setup('Hello');
    await selectAll(user);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.type(await screen.findByRole('textbox', { name: 'Link address' }), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a web or email address.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a link', async () => {
    const { onChange, user } = setup('[Hello](https://a.com)');
    await selectAll(user);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.click(await screen.findByRole('button', { name: 'Remove link' }));
    await waitFor(() => expect(lastSaved(onChange)).toBe('Hello'));
  });

  it('opens the link box with Ctrl+K', async () => {
    setup('Hello');
    fireEvent.keyDown(await screen.findByRole('textbox', { name: 'Note' }), { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: 'Link' })).toBeInTheDocument();
  });

  it('is hidden for notes in Trash', async () => {
    setup('Gone', true);
    await screen.findByRole('textbox', { name: 'Note' });
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
  });
});
