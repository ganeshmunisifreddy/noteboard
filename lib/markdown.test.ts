import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  isMarkdownEmpty,
  itemsToMarkdown,
  looksLikeMarkdown,
  markdownLines,
  parseMarkdown,
  safeUrl,
  tidyMarkdown,
  toPlainText,
} from './markdown';

describe('parseMarkdown', () => {
  it('keeps a single line break', () => {
    const [paragraph] = parseMarkdown('Book hotel\nPack');
    expect(paragraph.type).toBe('paragraph');
    expect(JSON.stringify(paragraph)).toContain('"type":"br"');
  });

  it('treats indented text as text, not code', () => {
    expect(parseMarkdown('    indented').map((t) => t.type)).toEqual(['paragraph']);
  });

  it('treats raw HTML as text', () => {
    expect(JSON.stringify(parseMarkdown('Hi <b>x</b>\n\n<div>y</div>'))).not.toContain('"type":"html"');
  });
});

describe('decodeEntities', () => {
  it('decodes the entities the editor writes', () => {
    expect(decodeEntities('&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39; &#x41; &unknown;')).toBe(`<b> & "x" 'y' A &unknown;`);
  });
});

describe('toPlainText', () => {
  it('drops Markdown symbols and adds link addresses', () => {
    expect(toPlainText('## Trip\n\n- **Book** hotel\n- [visa](https://x.com)')).toBe(
      'Trip\nBook hotel\nvisa\nhttps://x.com',
    );
  });

  it('keeps line breaks and decodes escapes', () => {
    expect(toPlainText('Book hotel\nPack')).toBe('Book hotel\nPack');
    expect(toPlainText('a &lt;b&gt; \\* c')).toBe('a <b> * c');
  });
});

describe('markdownLines', () => {
  it('gives each line of text without formatting', () => {
    expect(markdownLines('# Title\n\n1. one\n2. **two**\n   - nested\n\n> quote\n\n```\nx = 1\n```\n\n---\n\n  \n')).toEqual([
      'Title',
      'one',
      'two',
      'nested',
      'quote',
      'x = 1',
    ]);
  });

  it('keeps old plain-text lines that look like other Markdown as text', () => {
    // Task lists, reference definitions and pipe tables are not Noteboard formatting.
    expect(markdownLines('- [ ] buy milk\n- [x] call mom')).toEqual(['[ ] buy milk', '[x] call mom']);
    expect(markdownLines('[Wifi]: hunter2\n[Door]: 4512')).toEqual(['[Wifi]: hunter2', '[Door]: 4512']);
    expect(markdownLines('Name | Qty\n--- | ---\nmilk | 2')).toEqual(['Name | Qty', '--- | ---', 'milk | 2']);
    expect(isMarkdownEmpty('[Wifi]: hunter2')).toBe(false);
  });
});

describe('isMarkdownEmpty', () => {
  it('is empty when no text is left', () => {
    expect(isMarkdownEmpty('')).toBe(true);
    expect(isMarkdownEmpty('\n\n')).toBe(true);
    expect(isMarkdownEmpty('## \n\n- \n\n---')).toBe(true);
    expect(isMarkdownEmpty('x')).toBe(false);
  });
});

describe('itemsToMarkdown', () => {
  it('writes a bullet list that shows item text exactly as typed', () => {
    const texts = ['Milk', '*urgent* call', '1. first', '- dash', '#tag', 'a <b> c'];
    const markdown = itemsToMarkdown([...texts, '  '].map((text) => ({ text })));
    expect(markdown.split('\n')).toHaveLength(texts.length);
    expect(markdown.startsWith('- Milk\n')).toBe(true);
    expect(markdownLines(markdown)).toEqual(texts);
  });

  it('keeps item text that looks like a divider or an entity', () => {
    const texts = ['---', '***', '___', '- - -', '&amp;', '==='];
    expect(markdownLines(itemsToMarkdown(texts.map((text) => ({ text }))))).toEqual(texts);
  });
});

describe('safeUrl', () => {
  it('accepts web and email addresses', () => {
    expect(safeUrl('https://a.com/x?y=1')).toBe('https://a.com/x?y=1');
    expect(safeUrl('http://a.com')).toBe('http://a.com');
    expect(safeUrl(' mailto:me@x.com ')).toBe('mailto:me@x.com');
  });

  it('adds https to an address without a scheme', () => {
    expect(safeUrl('example.com')).toBe('https://example.com');
    expect(safeUrl('example.com:8080/path')).toBe('https://example.com:8080/path');
  });

  it('rejects anything else', () => {
    for (const input of ['', 'not a url', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://x.com', 'localhost', 'mailto:nobody']) {
      expect(safeUrl(input), input).toBeNull();
    }
  });
});

describe('looksLikeMarkdown', () => {
  it('spots Markdown structure and emphasis', () => {
    for (const text of ['## Head', '- item\n- item', 'intro\n1. one', '**bold** text', 'see [x](https://a.com)', '```\ncode\n```', 'run `npm`']) {
      expect(looksLikeMarkdown(text), text).toBe(true);
    }
  });

  it('leaves ordinary text alone', () => {
    for (const text of ['just words', 'a - b', '2 * 3', 'email me@x.com']) {
      expect(looksLikeMarkdown(text), text).toBe(false);
    }
  });
});

describe('tidyMarkdown', () => {
  it('drops trailing blank lines only', () => {
    expect(tidyMarkdown('## A\n\n')).toBe('## A');
    expect(tidyMarkdown('a  \nb')).toBe('a  \nb');
  });
});
