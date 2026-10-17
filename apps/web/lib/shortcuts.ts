import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { newNoteHref, openEditor } from './routes';

export const SEARCH_INPUT_ID = 'note-search';

export type Shortcut = 'new-note' | 'new-list' | 'search';

type KeyInfo = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'defaultPrevented' | 'target'>;

const isTyping = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  // Menus use letters for type-ahead.
  return target.closest('[role="menu"],[role="dialog"],[role="listbox"]') !== null;
};

export const shortcutFor = (event: KeyInfo): Shortcut | null => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isTyping(event.target)) return null;
  if (event.key === 'n') return 'new-note';
  if (event.key === 'l') return 'new-list';
  if (event.key === '/') return 'search';
  return null;
};

export const useGlobalShortcuts = () => {
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutFor(event);
      if (!shortcut) return;
      if (shortcut === 'search') {
        const input = document.getElementById(SEARCH_INPUT_ID);
        if (!input) return;
        event.preventDefault();
        input.focus();
        return;
      }
      event.preventDefault();
      openEditor(router, newNoteHref(shortcut === 'new-note' ? 'note' : 'list'));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router]);
};
