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

// Called by the board on mount; browser Back into the board resets the flag.
export const markOnBoard = () => {
  openedFromBoard = false;
};

export const openEditor = (router: NextRouter, href: UrlObject) => {
  if (router.pathname === '/') {
    openedFromBoard = true;
    void router.push(href);
  } else {
    // Editor to editor (Make a copy, shortcuts): keep one history entry so
    // Back still lands on the board.
    void router.replace(href);
  }
};

// Back from the editor: pop history when we came from the board, so it keeps
// its filter and scroll position; otherwise go home.
export const leaveEditor = (router: NextRouter) => {
  if (openedFromBoard) {
    openedFromBoard = false;
    router.back();
  } else {
    void router.push('/');
  }
};
