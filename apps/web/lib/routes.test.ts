import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Nav } from './navigation';
import {
  BOARDS_HREF,
  boardHref,
  homeHref,
  leaveEditor,
  markOnBoard,
  newNoteHref,
  noteHref,
  openEditor,
  restoreScroll,
} from './routes';

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

describe('restoreScroll', () => {
  // The page can only scroll as far as it is tall; the board grows once its
  // cards are measured, a frame or two after the notes load.
  const fakePage = (height: number) => {
    const page = { height, y: 0 };
    vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => {
      page.y = Math.min(y, page.height);
    }) as typeof window.scrollTo);
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => page.y);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const nextFrame = () => frames.shift()?.(0);
    return { page, frames, nextFrame };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps trying until the page is tall enough', () => {
    const { page, nextFrame } = fakePage(0);
    restoreScroll(320);
    expect(page.y).toBe(0);
    nextFrame();
    page.height = 1000;
    nextFrame();
    expect(page.y).toBe(320);
  });

  it('stops when the user scrolls first', () => {
    const { page, frames, nextFrame } = fakePage(0);
    restoreScroll(320);
    window.dispatchEvent(new Event('wheel'));
    page.height = 1000;
    nextFrame();
    expect(page.y).toBe(0);
    expect(frames).toHaveLength(0);
  });
});
