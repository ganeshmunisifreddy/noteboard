import { useCallback, useSyncExternalStore } from 'react';

type Entry = { url: string; users: number; timer?: ReturnType<typeof setTimeout> };

const entries = new WeakMap<ArrayBuffer, Entry>();
const RELEASE_DELAY_MS = 1000;

const acquire = (bytes: ArrayBuffer, type: string) => {
  let entry = entries.get(bytes);
  if (!entry) {
    entry = { url: URL.createObjectURL(new Blob([bytes], { type })), users: 0 };
    entries.set(bytes, entry);
  }
  clearTimeout(entry.timer);
  entry.users += 1;
};

// Freed a moment after the last user leaves, so a quick remount (React's
// Strict Mode, a card moving between columns) reuses the URL.
const release = (bytes: ArrayBuffer) => {
  const entry = entries.get(bytes);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  entry.timer = setTimeout(() => {
    if (entry.users > 0) return;
    URL.revokeObjectURL(entry.url);
    entries.delete(bytes);
  }, RELEASE_DELAY_MS);
};

// A URL an <img> can show for stored image bytes; null until ready.
export const useObjectUrl = (bytes: ArrayBuffer | null | undefined, type: string): string | null => {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!bytes) return () => {};
      acquire(bytes, type);
      notify();
      return () => release(bytes);
    },
    [bytes, type],
  );
  return useSyncExternalStore(
    subscribe,
    () => (bytes ? (entries.get(bytes)?.url ?? null) : null),
    () => null,
  );
};
