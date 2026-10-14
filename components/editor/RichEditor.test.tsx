import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import RichEditor, { openLinkOnModClick } from './RichEditor';

const props = { onChange: vi.fn(), readOnly: false, autoFocus: false };

describe('RichEditor', () => {
  it('shows a note formatted, keeping line breaks', async () => {
    render(<RichEditor {...props} value={'**Book** hotel\nPack'} />);
    const box = await screen.findByRole('textbox', { name: 'Note' });
    expect(box.querySelector('strong')).toHaveTextContent('Book');
    expect(box.querySelector('br')).not.toBeNull();
  });

  it('does not report a change when a note is opened', async () => {
    const onChange = vi.fn();
    render(<RichEditor {...props} onChange={onChange} value='## Old note' />);
    await screen.findByRole('textbox', { name: 'Note' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('loads a change made outside the editor without reporting it', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RichEditor {...props} onChange={onChange} value='First' />);
    rerender(<RichEditor {...props} onChange={onChange} value='**Second**' />);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Note' }).querySelector('strong')).toHaveTextContent('Second'),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets Escape through so it can leave the editor', async () => {
    render(<RichEditor {...props} value='Hello' />);
    const box = await screen.findByRole('textbox', { name: 'Note' });
    // ProseMirror cancels Escape by default; the note page ignores cancelled keys.
    const escape = createEvent.keyDown(box, { key: 'Escape', keyCode: 27 });
    fireEvent(box, escape);
    expect(escape.defaultPrevented).toBe(false);
  });

  it('is read-only in Trash', async () => {
    render(<RichEditor {...props} readOnly value='Gone' />);
    expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveAttribute('contenteditable', 'false');
  });

  it('does not report a change when only the cursor moves', async () => {
    // The editor adds an empty line after a final list, heading or code block.
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RichEditor {...props} onChange={onChange} value={'- a\n- b'} />);
    await user.click(await screen.findByRole('textbox', { name: 'Note' }));
    await user.keyboard('{Control>}a{/Control}');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not take focus from another field when it loads', async () => {
    const title = document.createElement('input');
    document.body.append(title);
    title.focus();
    render(<RichEditor {...props} autoFocus value='' />);
    await screen.findByRole('textbox', { name: 'Note' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(title).toHaveFocus();
    title.remove();
  });

  it('tells screen readers when it is read-only', async () => {
    const { rerender } = render(<RichEditor {...props} readOnly value='Gone' />);
    const box = await screen.findByRole('textbox', { name: 'Note' });
    expect(box).toHaveAttribute('aria-readonly', 'true');
    rerender(<RichEditor {...props} readOnly={false} value='Gone' />);
    await waitFor(() => expect(box).toHaveAttribute('aria-readonly', 'false'));
  });

  it('follows a link only on Cmd/Ctrl+click, also in Trash', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<RichEditor {...props} readOnly value='[site](https://a.com)' />);
    const link = (await screen.findByRole('textbox', { name: 'Note' })).querySelector('a') as HTMLAnchorElement;
    const plain = createEvent.click(link);
    fireEvent(link, plain);
    expect(plain.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
    const withModifier = createEvent.click(link, { ctrlKey: true });
    fireEvent(link, withModifier);
    expect(withModifier.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('does not reconfigure the editor on every render', async () => {
    const { rerender } = render(<RichEditor {...props} value='Hello' />);
    await screen.findByRole('textbox', { name: 'Note' });
    const setOptions = vi.spyOn(Editor.prototype, 'setOptions');
    rerender(<RichEditor {...props} onChange={vi.fn()} value='Hello' />);
    rerender(<RichEditor {...props} onChange={vi.fn()} value='Hello' />);
    expect(setOptions).not.toHaveBeenCalled();
    setOptions.mockRestore();
  });
});

describe('openLinkOnModClick', () => {
  const clickOn = (href: string, withModifier: boolean) => {
    const link = document.createElement('a');
    link.setAttribute('href', href);
    link.textContent = 'x';
    document.body.append(link);
    return { target: link, metaKey: withModifier, ctrlKey: false } as unknown as MouseEvent;
  };

  it('opens web links with Cmd/Ctrl+click only', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openLinkOnModClick(clickOn('https://a.com', false))).toBe(false);
    expect(openLinkOnModClick(clickOn('https://a.com', true))).toBe(true);
    expect(open).toHaveBeenCalledWith('https://a.com', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('never opens unsafe links', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openLinkOnModClick(clickOn('javascript:alert(1)', true))).toBe(false);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
