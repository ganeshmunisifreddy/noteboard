import { lazy } from 'react';

// Separate chunks: the editor (with Tiptap) and boards load when first opened.
// Home preloads the editor's chunk once the board has settled.
export const loadNotePage = () => import('./NotePage');
export const NotePage = lazy(loadNotePage);
export const BoardPage = lazy(() => import('./BoardPage'));
