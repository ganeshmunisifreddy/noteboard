import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { tidyMarkdown, toPlainText } from '../../lib/markdown';
import { editorExtensions } from './extensions';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const load = (markdown: string) => {
  editor = new Editor({ extensions: editorExtensions(), content: markdown, contentType: 'markdown' });
  return editor;
};

const roundTrip = (markdown: string) => tidyMarkdown(load(markdown).getMarkdown());

const paste = (target: Editor, types: string[], text: string) => {
  // Only the listed types have data, as on a real clipboard.
  const getData = (type: string) => (type === 'text/plain' ? text : type === 'text/html' && types.includes(type) ? `<p>${text}</p>` : '');
  const event = { clipboardData: { types, getData } } as unknown as ClipboardEvent;
  return target.view.someProp('handlePaste', (handle) => handle(target.view, event, Slice.empty));
};

describe('editor Markdown', () => {
  it('keeps formatted notes as they are', () => {
    const notes = [
      '## Before we go\n\n- **Book** hotel\n- Check [visa](https://x.com)\n\n1. one\n2. two\n\n> quote\n\n```\ncode\n```\n\n---\n\nRun `npm` ~~now~~ *really*',
      '- a\n  - b\n- c',
      '### Small',
      'Intro\n\n    indented line',
    ];
    for (const markdown of notes) expect(roundTrip(markdown)).toBe(markdown);
  });

  it('keeps line breaks of old notes', () => {
    expect(roundTrip('Book hotel\nPack')).toBe('Book hotel  \nPack');
  });

  it('keeps the text of old plain notes the same after an edit', () => {
    const old = '2 * 3 and snake_case <b>x</b>';
    expect(toPlainText(old)).toBe(old);
    expect(toPlainText(roundTrip(old))).toBe(old);
  });

  it('turns pasted Markdown text into formatting', () => {
    const target = load('');
    expect(paste(target, ['text/plain'], '## Pasted\n\n- **a**')).toBe(true);
    const markdown = tidyMarkdown(target.getMarkdown());
    expect(markdown).toContain('## Pasted');
    expect(markdown).toContain('- **a**');
  });

  it('leaves pastes from web pages and plain sentences to the editor', () => {
    const target = load('');
    expect(paste(target, ['text/html', 'text/plain'], '## x')).toBeFalsy();
    expect(paste(target, ['text/plain'], 'just words')).toBeFalsy();
  });
});
