import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('keeps runs of spaces and indentation', () => {
    const container = view('a    b\n    c');
    expect(container.querySelector('p')?.textContent).toBe('a    b    c');
  });
});

describe('MarkdownPreview clamping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const measure = (scrollHeight: number) => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    // Browsers report a first size as soon as an element is observed.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe() {
          this.callback();
        }
        disconnect() {}
      },
    );
  };

  it('fades the last line when the text is cut off', () => {
    measure(300);
    const { container } = render(<MarkdownPreview markdown='long' clamp />);
    expect(container.firstElementChild).toHaveAttribute('data-clamped', 'true');
  });

  it('does not fade text that fits', () => {
    measure(100);
    const { container } = render(<MarkdownPreview markdown='short' clamp />);
    expect(container.firstElementChild).not.toHaveAttribute('data-clamped');
  });
});
