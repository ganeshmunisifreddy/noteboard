import { useSyncExternalStore } from 'react';

export type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
};

const STORAGE_KEY = 'notes';
const EMPTY: Note[] = [];

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedNotes: Note[] = EMPTY;

// Must return the same array until the stored value changes,
// otherwise useSyncExternalStore re-renders forever.
const getSnapshot = (): Note[] => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedNotes;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : EMPTY;
      cachedNotes = Array.isArray(parsed) ? parsed : EMPTY;
    } catch {
      cachedNotes = EMPTY;
    }
  }
  return cachedNotes;
};

// The server can't see localStorage, so SSR renders the empty state.
// pages/_document.jsx hides it before first paint when notes exist.
const getServerSnapshot = (): Note[] => EMPTY;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // Keep other open tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

const sortByPinned = (notes: Note[]) =>
  [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));

export const saveNotes = (notes: Note[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortByPinned(notes)));
  } catch {
    // Storage full or unavailable (e.g. private mode); nothing more we can do.
  }
  listeners.forEach((listener) => listener());
};

export const useNotes = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
