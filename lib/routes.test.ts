import type { NextRouter } from 'next/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveEditor, markOnBoard, newNoteHref, noteHref, openEditor } from './routes';

const fakeRouter = (pathname: string, asPath = pathname) =>
  ({ pathname, asPath, push: vi.fn(), replace: vi.fn(), back: vi.fn() }) as unknown as NextRouter;

beforeEach(() => {
  markOnBoard();
  sessionStorage.clear();
});

describe('hrefs', () => {
  it('builds editor URLs', () => {
    expect(noteHref('abc')).toEqual({ pathname: '/note', query: { id: 'abc' } });
    const href = newNoteHref('list');
    expect(href.query).toEqual({ new: 'list', id: expect.any(String) });
    expect(newNoteHref('list').query).not.toEqual(href.query);
  });
});

describe('openEditor / leaveEditor', () => {
  it('goes back to the board it came from', () => {
    const board = fakeRouter('/');
    openEditor(board, noteHref('a'));
    expect(board.push).toHaveBeenCalledWith(noteHref('a'));

    const editor = fakeRouter('/note');
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
    expect(editor.push).not.toHaveBeenCalled();
  });

  it('goes home when the editor was opened directly', () => {
    const editor = fakeRouter('/note');
    leaveEditor(editor);
    expect(editor.push).toHaveBeenCalledWith('/');
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('replaces history when opening a note from the editor', () => {
    const board = fakeRouter('/');
    openEditor(board, noteHref('a'));
    const editor = fakeRouter('/note');
    openEditor(editor, noteHref('b'));
    expect(editor.replace).toHaveBeenCalledWith(noteHref('b'));
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
  });
});

describe('after a refresh in the editor', () => {
  it('returns to the board with the filter it was opened from', async () => {
    openEditor(fakeRouter('/', '/?view=lists'), noteHref('a'));
    vi.resetModules();
    const fresh = await import('./routes');
    const editor = fakeRouter('/note');
    fresh.leaveEditor(editor);
    expect(editor.push).toHaveBeenCalledWith('/?view=lists');
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('remembers the board scroll position for the way back', () => {
    window.scrollY = 320;
    openEditor(fakeRouter('/', '/?label=l1'), noteHref('a'));
    expect(JSON.parse(sessionStorage.getItem('boardScroll') ?? 'null')).toEqual({ url: '/?label=l1', y: 320 });
    window.scrollY = 0;
  });
});
