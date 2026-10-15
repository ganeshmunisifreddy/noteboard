import type { Attachment, Note } from './types';

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
    position: 0,
    due: null,
    ...overrides,
  };
};

export const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

export const makeAttachment = (overrides: Partial<Attachment> = {}): Attachment => {
  counter += 1;
  return {
    id: `image-${counter}`,
    noteId: 'note-1',
    position: 0,
    type: 'image/jpeg',
    width: 100,
    height: 50,
    size: 3,
    alt: '',
    createdAt: 0,
    thumb: bytesOf('thumb'),
    thumbType: 'image/jpeg',
    ...overrides,
  };
};
