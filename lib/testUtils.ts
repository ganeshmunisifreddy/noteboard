import type { Note } from './types';

let counter = 0;

export const makeNote = (overrides: Partial<Note> = {}): Note => {
  counter += 1;
  return {
    id: `note-${counter}`,
    kind: 'note',
    title: '',
    content: '',
    items: [],
    color: 'default',
    labelIds: [],
    pinned: false,
    archived: false,
    trashedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
};
