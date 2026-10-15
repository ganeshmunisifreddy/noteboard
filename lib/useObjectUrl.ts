import { useCallback, useSyncExternalStore } from 'react';

type Entry = { url: string; users: number; timer?: ReturnType<typeof setTimeout> };

// Keyed by image id and kind, not by the bytes: live queries hand back new
// copies of unchanged bytes after every write, and a new URL each time would
// make every image flicker.
const entries = new Map<string, Entry>();
const RELEASE_DELAY_MS = 1000;

const acquire = (key: string, bytes: ArrayBuffer, type: string) => {
  let entry = entries.get(key);
  if (!entry) {
    entry = { url: URL.createObjectURL(new Blob([bytes], { type })), users: 0 };
    entries.set(key, entry);
  }
  clearTimeout(entry.timer);
  entry.users += 1;
};

// Freed a moment after the last user leaves, so a quick remount (React's
// Strict Mode, a card moving between columns) reuses the URL.
const release = (key: string) => {
  const entry = entries.get(key);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  entry.timer = setTimeout(() => {
    if (entry.users > 0) return;
    URL.revokeObjectURL(entry.url);
    entries.delete(key);
  }, RELEASE_DELAY_MS);
};

// A URL an <img> can show for stored image bytes; null until ready. `key`
// names the image (e.g. "<id>:thumb"); its bytes never change.
export const useObjectUrl = (key: string | null, bytes: ArrayBuffer | null | undefined, type: string): string | null => {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!key || !bytes) return () => {};
      acquire(key, bytes, type);
      notify();
      return () => release(key);
    },
    [key, bytes, type],
  );
  return useSyncExternalStore(
    subscribe,
    () => (key && bytes ? (entries.get(key)?.url ?? null) : null),
    () => null,
  );
};
