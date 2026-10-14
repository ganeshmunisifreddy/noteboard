import type { NextRouter } from 'next/router';
import type { UrlObject } from 'url';
import { v4 as uuid } from 'uuid';
import type { NoteKind } from './types';

export const noteHref = (id: string): UrlObject => ({ pathname: '/note', query: { id } });

// New notes get their id up front so the editor's URL and identity stay the
// same when the note is first saved.
export const newNoteHref = (kind: NoteKind): UrlObject => ({
  pathname: '/note',
  query: { new: kind, id: uuid() },
});

let openedFromBoard = false;

// Survives a refresh in the editor, when the in-memory flag above is lost.
const BOARD_URL_KEY = 'boardUrl';

// The board renders after its notes load, too late for the browser's own
// scroll restoration, so it restores this itself (see pages/index.tsx).
const BOARD_SCROLL_KEY = 'boardScroll';

const rememberBoard = (url: string) => {
  try {
    sessionStorage.setItem(BOARD_URL_KEY, url);
    sessionStorage.setItem(BOARD_SCROLL_KEY, JSON.stringify({ url, y: window.scrollY }));
  } catch {
    // Back falls back to the plain board at the top.
  }
};

// The saved scroll position for this board URL, used once.
export const takeBoardScroll = (url: string): number | null => {
  try {
    const raw = sessionStorage.getItem(BOARD_SCROLL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(BOARD_SCROLL_KEY);
    const saved = JSON.parse(raw) as { url?: unknown; y?: unknown };
    return saved.url === url && typeof saved.y === 'number' ? saved.y : null;
  } catch {
    return null;
  }
};

const savedBoardUrl = () => {
  try {
    return sessionStorage.getItem(BOARD_URL_KEY) ?? '/';
  } catch {
    return '/';
  }
};

// Called by the board on mount; browser Back into the board resets the flag.
export const markOnBoard = () => {
  openedFromBoard = false;
};

export const openEditor = (router: NextRouter, href: UrlObject) => {
  if (router.pathname === '/') {
    openedFromBoard = true;
    rememberBoard(router.asPath);
    void router.push(href);
  } else {
    // Editor to editor (Make a copy, shortcuts): keep one history entry so
    // Back still lands on the board.
    void router.replace(href);
  }
};

// Back from the editor: pop history when we came from the board, so it keeps
// its filter and scroll position; otherwise reopen the last board view.
export const leaveEditor = (router: NextRouter) => {
  if (openedFromBoard) {
    openedFromBoard = false;
    router.back();
  } else {
    void router.push(savedBoardUrl());
  }
};
