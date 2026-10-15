import { useSyncExternalStore } from 'react';

// A media query as state; `serverValue` is used for the server render.
export const useMediaQuery = (query: string, serverValue = false): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
