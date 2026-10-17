import { useSyncExternalStore } from 'react';

const inset = () => {
  const view = window.visualViewport;
  return view ? Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop)) : 0;
};

// How much of the bottom of the window the on-screen keyboard covers.
export const useKeyboardInset = (): number =>
  useSyncExternalStore(
    (onChange) => {
      const view = window.visualViewport;
      view?.addEventListener('resize', onChange);
      view?.addEventListener('scroll', onChange);
      return () => {
        view?.removeEventListener('resize', onChange);
        view?.removeEventListener('scroll', onChange);
      };
    },
    inset,
    () => 0,
  );
