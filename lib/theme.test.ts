import { beforeEach, describe, expect, it } from 'vitest';
import { readTheme, resolveTheme, setTheme } from './theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme', () => {
  it('defaults to system', () => {
    expect(readTheme()).toBe('system');
    localStorage.setItem('theme', 'purple');
    expect(readTheme()).toBe('system');
  });

  it('resolves system from the device setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('saves the choice and applies it', () => {
    setTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    setTheme('system');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light'); // the jsdom stub reports light
  });
});
