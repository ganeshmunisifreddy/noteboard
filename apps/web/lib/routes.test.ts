import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Nav } from './navigation';
import { BOARDS_HREF, boardHref, homeHref, leaveEditor, markOnBoard, newNoteHref, noteHref, openEditor } from './routes';

const fakeNav = (path: string, url = path): Nav => ({ path, url, go: vi.fn(), swap: vi.fn(), back: vi.fn() });

beforeEach(() => {
  markOnBoard();
  sessionStorage.clear();
});

describe('hrefs', () => {
  it('builds editor URLs', () => {
    expect(noteHref('abc')).toBe('/note?id=abc');
    const href = newNoteHref('list');
    expect(href).toMatch(/^\/note\?new=list&id=[\w-]+$/);
    expect(newNoteHref('list')).not.toBe(href);
  });

  it('builds board links', () => {
    expect(boardHref('b1')).toBe('/board?id=b1');
    expect(BOARDS_HREF).toBe('/?view=boards');
  });

  it('builds a new card link with its place', () => {
    const query = new URLSearchParams(newNoteHref('list', { columnId: 'c1', boardId: 'b1', at: 'bottom' }).split('?')[1]);
    expect(Object.fromEntries(query)).toMatchObject({ new: 'list', column: 'c1', at: 'bottom', board: 'b1' });
    expect(query.get('id')).toEqual(expect.any(String));
  });

  it('builds board-view links, leaving out defaults', () => {
    expect(homeHref({ view: 'all', labelId: null, query: '' })).toBe('/');
    expect(homeHref({ view: 'lists', labelId: null, query: 'eggs & milk' })).toBe('/?view=lists&q=eggs+%26+milk');
  });
});

describe('openEditor / leaveEditor', () => {
  it('goes back to the board it came from', () => {
    const board = fakeNav('/');
    openEditor(board, noteHref('a'));
    expect(board.go).toHaveBeenCalledWith('/note?id=a');

    const editor = fakeNav('/note');
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
    expect(editor.go).not.toHaveBeenCalled();
  });

  it('goes home when the editor was opened directly', () => {
    const editor = fakeNav('/note');
    leaveEditor(editor);
    expect(editor.go).toHaveBeenCalledWith('/');
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('replaces history when opening a note from the editor', () => {
    openEditor(fakeNav('/'), noteHref('a'));
    const editor = fakeNav('/note');
    openEditor(editor, noteHref('b'));
    expect(editor.swap).toHaveBeenCalledWith('/note?id=b');
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
  });
});

describe('after a refresh in the editor', () => {
  it('returns to the board with the filter it was opened from', async () => {
    openEditor(fakeNav('/', '/?view=lists'), noteHref('a'));
    vi.resetModules();
    const fresh = await import('./routes');
    const editor = fakeNav('/note');
    fresh.leaveEditor(editor);
    expect(editor.go).toHaveBeenCalledWith('/?view=lists');
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('remembers the board scroll position for the way back', () => {
    window.scrollY = 320;
    openEditor(fakeNav('/', '/?label=l1'), noteHref('a'));
    expect(JSON.parse(sessionStorage.getItem('boardScroll') ?? 'null')).toEqual({ url: '/?label=l1', y: 320 });
    window.scrollY = 0;
  });
});
