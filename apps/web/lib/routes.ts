import { v4 as uuid } from 'uuid';
import { filterToQuery } from './filters';
import type { Nav } from './navigation';
import type { BoardFilter, NoteKind } from './types';

const withQuery = (path: string, query: Record<string, string>) => {
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
};

export const noteHref = (id: string) => withQuery('/note', { id });

export type NewCardPlace = { columnId: string; boardId?: string; at: 'top' | 'bottom' };

// New notes get their id up front so the editor's URL and identity stay the
// same when the note is first saved. A new card also carries its column.
export const newNoteHref = (kind: NoteKind, place?: NewCardPlace) =>
  withQuery('/note', {
    new: kind,
    id: uuid(),
    ...(place ? { column: place.columnId, at: place.at, ...(place.boardId ? { board: place.boardId } : {}) } : {}),
  });

export const boardHref = (id: string) => withQuery('/board', { id });
export const BOARDS_HREF = '/?view=boards';
export const homeHref = (filter: BoardFilter) => withQuery('/', filterToQuery(filter));

let openedFromBoard = false;

// Survives a refresh in the editor, when the in-memory flag above is lost.
const BOARD_URL_KEY = 'boardUrl';

// The board renders after its notes load, too late for the browser's own
// scroll restoration, so it restores this itself (see routes/Home.tsx).
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

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
const RESTORE_TIMEOUT_MS = 1000;

// The board's height comes from measuring its cards, a frame or two after the
// notes load, and until then the page can't scroll that far. Tries each frame
// for up to a second, and gives up as soon as the user scrolls themselves.
export const restoreScroll = (y: number) => {
  const deadline = performance.now() + RESTORE_TIMEOUT_MS;
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const name of USER_SCROLL_EVENTS) window.removeEventListener(name, stop);
  };
  for (const name of USER_SCROLL_EVENTS) window.addEventListener(name, stop, { passive: true });
  const attempt = () => {
    if (stopped) return;
    window.scrollTo(0, y);
    if (window.scrollY >= y - 1 || performance.now() > deadline) stop();
    else requestAnimationFrame(attempt);
  };
  attempt();
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

export const openEditor = (nav: Nav, href: string) => {
  // From the board or a kanban board: Back returns there.
  if (nav.path === '/' || nav.path === '/board') {
    openedFromBoard = true;
    rememberBoard(nav.url);
    nav.go(href);
  } else {
    // Editor to editor (Make a copy, shortcuts): keep one history entry so
    // Back still lands on the board.
    nav.swap(href);
  }
};

// Back from the editor: pop history when we came from the board, so it keeps
// its filter and scroll position; otherwise reopen the last board view.
export const leaveEditor = (nav: Nav) => {
  if (openedFromBoard) {
    openedFromBoard = false;
    nav.back();
  } else {
    nav.go(savedBoardUrl());
  }
};
