import { describe, expect, it } from 'vitest';
import { shortcutFor } from './shortcuts';

const press = (key: string, target: Element = document.body, mods: Partial<KeyboardEvent> = {}) =>
  shortcutFor({
    key,
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    defaultPrevented: false,
    ...mods,
  } as KeyboardEvent);

describe('shortcutFor', () => {
  it('maps n, l and /', () => {
    expect(press('n')).toBe('new-note');
    expect(press('l')).toBe('new-list');
    expect(press('/')).toBe('search');
    expect(press('x')).toBeNull();
  });

  it('ignores keys typed into fields', () => {
    expect(press('n', document.createElement('input'))).toBeNull();
    expect(press('n', document.createElement('textarea'))).toBeNull();
  });

  it('ignores keys inside menus and dialogs', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('div');
    menu.appendChild(item);
    document.body.appendChild(menu);
    expect(press('n', item)).toBeNull();
    menu.remove();
  });

  it('ignores modified and handled keys', () => {
    expect(press('n', document.body, { metaKey: true })).toBeNull();
    expect(press('l', document.body, { ctrlKey: true })).toBeNull();
    expect(press('/', document.body, { defaultPrevented: true })).toBeNull();
  });
});
