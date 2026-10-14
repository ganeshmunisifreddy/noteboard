import type { NextRouter } from 'next/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveEditor, markOnBoard, newNoteHref, noteHref, openEditor } from './routes';

const fakeRouter = (pathname: string) =>
  ({ pathname, push: vi.fn(), replace: vi.fn(), back: vi.fn() }) as unknown as NextRouter;

beforeEach(() => {
  markOnBoard();
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
