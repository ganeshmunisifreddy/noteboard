import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { convertKind, newItem } from '../../lib/checklist';
import { markdownLines, tidyMarkdown, toPlainText } from '../../lib/markdown';
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

  it('keeps old notes readable after an edit', () => {
    const notes = ['Groceries\n\n- [ ] buy milk\n- [x] call mom', '[Wifi]: hunter2\n[Door]: 4512', 'Name | Qty\n--- | ---\nmilk | 2'];
    for (const old of notes) {
      const target = load(old);
      expect(() => target.state.doc.check(), old).not.toThrow();
      target.commands.insertContentAt(1, '!');
      const [first, ...rest] = markdownLines(old);
      expect(markdownLines(tidyMarkdown(target.getMarkdown())), old).toEqual([`!${first}`, ...rest]);
      target.destroy();
    }
    editor = null;
  });

  it('writes text that looks like a block marker so it stays text', () => {
    const texts = ['# tag', '- dash', '1. one', '1) two', '---', '+ plus', '> quote', '==='];
    const target = load('');
    target.commands.setContent({
      type: 'doc',
      content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
    });
    expect(markdownLines(tidyMarkdown(target.getMarkdown()))).toEqual(texts);
  });

  it('keeps list item text through converting, editing and converting back', () => {
    const typed = ['# tag', '1. one', '- dash', '+ plus', '---', '***', '&amp;', '*urgent*'];
    const note = convertKind({ kind: 'list', content: '', items: typed.map((text) => newItem(text)) });
    const target = load(note.content);
    target.commands.insertContentAt(target.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: 'x' }] });
    const back = convertKind({ kind: 'note', content: tidyMarkdown(target.getMarkdown()), items: [] });
    expect(back.items.map((i) => i.text)).toEqual([...typed, 'x']);
  });

  it('pastes text into a code block as it is', () => {
    const target = load('```\nx\n```');
    target.commands.setTextSelection(2);
    expect(paste(target, ['text/plain'], '# comment\n- item')).toBeFalsy();
  });

  it('keeps image syntax and its address after an edit', () => {
    const old = 'see ![photo](http://x.com/a.png)';
    const saved = roundTrip(old);
    expect(saved).toContain('[photo](http://x.com/a.png)');
    expect(toPlainText(saved)).toBe(toPlainText(old));
  });
});
