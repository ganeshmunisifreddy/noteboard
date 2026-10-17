import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The inline script in index.html runs before first paint.
const script = () => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('no inline script in index.html');
  return match[1];
};

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute('data-sidebar');
});

describe('the pre-paint script', () => {
  it('applies the saved theme and the collapsed sidebar', () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('sidebar', 'rail');
    new Function(script())();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('rail');
  });

  it('defaults to light with the full sidebar', () => {
    new Function(script())();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
});
