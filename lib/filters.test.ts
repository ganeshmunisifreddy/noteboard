import { describe, expect, it } from 'vitest';
import {
  emptyMessage,
  filterToQuery,
  matchesQuery,
  matchesView,
  parseFilter,
  selectBoardNotes,
} from './filters';
import { makeNote } from './testUtils';
import type { BoardFilter } from './types';

const all: BoardFilter = { view: 'all', labelId: null, query: '' };

describe('parseFilter', () => {
  it('defaults to all', () => {
    expect(parseFilter({})).toEqual(all);
  });
  it('reads view, label and search', () => {
    expect(parseFilter({ view: 'lists', label: 'l1', q: 'milk' })).toEqual({
      view: 'lists',
      labelId: 'l1',
      query: 'milk',
    });
  });
  it('ignores unknown views and repeated params', () => {
    expect(parseFilter({ view: 'bogus', q: ['a', 'b'] })).toEqual(all);
  });
  it('drops the label in archive and trash', () => {
    expect(parseFilter({ view: 'trash', label: 'l1' }).labelId).toBeNull();
  });
});

describe('filterToQuery', () => {
  it('omits defaults', () => {
    expect(filterToQuery(all)).toEqual({});
  });
  it('round-trips through the query string', () => {
    const filters: BoardFilter[] = [
      all,
      { view: 'notes', labelId: null, query: '' },
      { view: 'all', labelId: 'l1', query: 'eggs & milk' },
      { view: 'trash', labelId: null, query: 'x' },
    ];
    for (const filter of filters) {
      expect(parseFilter(filterToQuery(filter))).toEqual(filter);
    }
  });
});

describe('matchesView', () => {
  const plain = makeNote();
  const list = makeNote({ kind: 'list' });
  const archived = makeNote({ archived: true });
  const trashed = makeNote({ trashedAt: 5 });
  const labelled = makeNote({ labelIds: ['l1'] });

  it('hides archived and trashed notes from the board', () => {
    expect([plain, list, archived, trashed].map((n) => matchesView(n, all))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
  it('shows only archived notes in archive', () => {
    const f: BoardFilter = { ...all, view: 'archive' };
    expect([plain, archived, trashed].map((n) => matchesView(n, f))).toEqual([false, true, false]);
  });
  it('shows only trashed notes in trash, archived or not', () => {
    const f: BoardFilter = { ...all, view: 'trash' };
    const both = makeNote({ archived: true, trashedAt: 1 });
    expect([plain, trashed, both].map((n) => matchesView(n, f))).toEqual([false, true, true]);
  });
  it('filters by kind and label', () => {
    expect(matchesView(list, { ...all, view: 'notes' })).toBe(false);
    expect(matchesView(list, { ...all, view: 'lists' })).toBe(true);
    expect(matchesView(plain, { ...all, labelId: 'l1' })).toBe(false);
    expect(matchesView(labelled, { ...all, labelId: 'l1' })).toBe(true);
  });
});

describe('matchesQuery', () => {
  const labels = new Map([['l1', 'Work']]);
  it('matches title, text, items and label names, ignoring case', () => {
    expect(matchesQuery(makeNote({ title: 'Sprint' }), 'sprint', labels)).toBe(true);
    expect(matchesQuery(makeNote({ content: 'Buy MILK' }), 'milk', labels)).toBe(true);
    expect(
      matchesQuery(makeNote({ kind: 'list', items: [{ id: 'i', text: 'Eggs', done: true }] }), 'egg', labels),
    ).toBe(true);
    expect(matchesQuery(makeNote({ labelIds: ['l1'] }), 'work', labels)).toBe(true);
    expect(matchesQuery(makeNote({ title: 'Other' }), 'milk', labels)).toBe(false);
  });
  it('matches everything for a blank query', () => {
    expect(matchesQuery(makeNote(), '  ', labels)).toBe(true);
  });
  it('searches only the field for the current kind', () => {
    const note = makeNote({ kind: 'note', items: [{ id: 'i', text: 'hidden', done: false }] });
    expect(matchesQuery(note, 'hidden', labels)).toBe(false);
  });
});

describe('selectBoardNotes', () => {
  it('splits pinned from others, newest first', () => {
    const a = makeNote({ id: 'a', updatedAt: 1 });
    const b = makeNote({ id: 'b', updatedAt: 3, pinned: true });
    const c = makeNote({ id: 'c', updatedAt: 2 });
    const d = makeNote({ id: 'd', updatedAt: 4, pinned: true });
    const result = selectBoardNotes([a, b, c, d], [], all);
    expect(result.pinned.map((n) => n.id)).toEqual(['d', 'b']);
    expect(result.others.map((n) => n.id)).toEqual(['c', 'a']);
  });
  it('lists trash by deletion time with no pinned section', () => {
    const a = makeNote({ id: 'a', trashedAt: 10, pinned: true });
    const b = makeNote({ id: 'b', trashedAt: 20 });
    const result = selectBoardNotes([a, b], [], { ...all, view: 'trash' });
    expect(result.pinned).toEqual([]);
    expect(result.others.map((n) => n.id)).toEqual(['b', 'a']);
  });
  it('searches label names', () => {
    const note = makeNote({ id: 'a', labelIds: ['l1'] });
    const result = selectBoardNotes([note], [{ id: 'l1', name: 'Home' }], { ...all, query: 'home' });
    expect(result.others.map((n) => n.id)).toEqual(['a']);
  });
});

describe('emptyMessage', () => {
  it('describes each view', () => {
    expect(emptyMessage(all)).toBe('Notes you add appear here');
    expect(emptyMessage({ ...all, view: 'notes' })).toBe('No notes yet');
    expect(emptyMessage({ ...all, view: 'lists' })).toBe('No lists yet');
    expect(emptyMessage({ ...all, view: 'archive' })).toBe('Archive is empty');
    expect(emptyMessage({ ...all, view: 'trash' })).toBe('Trash is empty');
    expect(emptyMessage({ ...all, labelId: 'l1' })).toBe('No notes with this label');
    expect(emptyMessage({ ...all, query: ' milk ' })).toBe('No results for “milk”');
  });
});
