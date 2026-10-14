import { v4 as uuid } from 'uuid';
import { isMarkdownEmpty, itemsToMarkdown, markdownLines } from './markdown';
import type { ChecklistItem, Note } from './types';

export const newItem = (text = ''): ChecklistItem => ({ id: uuid(), text, done: false });

// Ticking keeps the item in place (the UI shows it under "completed");
// unticking moves it to the end so it reappears last in the open list.
export const toggleItemIn = (items: ChecklistItem[], itemId: string): ChecklistItem[] => {
  const item = items.find((i) => i.id === itemId);
  if (!item) return items;
  if (!item.done) return items.map((i) => (i.id === itemId ? { ...i, done: true } : i));
  return [...items.filter((i) => i.id !== itemId), { ...item, done: false }];
};

// Text notes are Markdown; list items are plain text.
export const convertKind = (
  note: Pick<Note, 'kind' | 'content' | 'items'>,
): Pick<Note, 'kind' | 'content' | 'items'> => {
  if (note.kind === 'note') {
    return { kind: 'list', content: '', items: markdownLines(note.content).map((line) => newItem(line)) };
  }
  return { kind: 'note', content: itemsToMarkdown(note.items), items: [] };
};

export const isNoteEmpty = (note: Pick<Note, 'kind' | 'title' | 'content' | 'items'>): boolean => {
  if (note.title.trim() !== '') return false;
  if (note.kind === 'note') return isMarkdownEmpty(note.content);
  return note.items.every((i) => i.text.trim() === '');
};
