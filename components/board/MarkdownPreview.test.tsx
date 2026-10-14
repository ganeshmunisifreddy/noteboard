import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkdownPreview from './MarkdownPreview';

const view = (markdown: string) => render(<MarkdownPreview markdown={markdown} />).container;

describe('MarkdownPreview', () => {
  it('shows formatting', () => {
    const container = view(
      '## Trip\n\n- **Book** hotel\n- *maybe* ~~not~~\n\n1. one\n\n> quote\n\n```\ncode\n```\n\n---\n\nRun `npm`',
    );
    for (const tag of ['strong', 'em', 's', 'ul', 'ol', 'blockquote', 'pre', 'hr', 'code']) {
      expect(container.querySelector(tag), tag).not.toBeNull();
    }
    expect(container.textContent).toContain('Trip');
  });

  it('keeps line breaks', () => {
    expect(view('Book hotel\nPack').querySelector('br')).not.toBeNull();
  });

  it('shows raw HTML as text and never runs it', () => {
    const container = view('Hi <b>x</b> <img src=x onerror=alert(1)> &lt;i&gt;');
    expect(container.querySelector('b, img, i')).toBeNull();
    expect(container.textContent).toBe('Hi <b>x</b> <img src=x onerror=alert(1)> <i>');
  });

  it('shows links without making them clickable', () => {
    const container = view('[site](https://a.com) and [bad](javascript:alert(1))');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('site and bad');
  });

  it('does not turn indented text into code', () => {
    expect(view('    indented').querySelector('pre')).toBeNull();
  });
});
