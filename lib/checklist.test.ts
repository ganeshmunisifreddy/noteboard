import { describe, expect, it } from 'vitest';
import { convertKind, isNoteEmpty, newItem, toggleItemIn } from './checklist';

const items = [
  { id: 'a', text: 'Milk', done: false },
  { id: 'b', text: 'Eggs', done: false },
  { id: 'c', text: 'Bread', done: true },
];

describe('newItem', () => {
  it('creates an unticked item with a fresh id', () => {
    const one = newItem('Tea');
    expect(one).toMatchObject({ text: 'Tea', done: false });
    expect(one.id).not.toBe(newItem('Tea').id);
  });
});

describe('toggleItemIn', () => {
  it('ticks an item in place', () => {
    expect(toggleItemIn(items, 'a').map((i) => [i.id, i.done])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
    ]);
  });

  it('moves an unticked item to the end', () => {
    expect(toggleItemIn(items, 'c').map((i) => [i.id, i.done])).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
    ]);
    const reordered = toggleItemIn(
      [
        { id: 'x', text: 'X', done: true },
        { id: 'y', text: 'Y', done: false },
      ],
      'x',
    );
    expect(reordered.map((i) => i.id)).toEqual(['y', 'x']);
  });

  it('returns the same array for an unknown id', () => {
    expect(toggleItemIn(items, 'nope')).toBe(items);
  });
});

describe('convertKind', () => {
  it('turns lines of text into unticked items, without formatting', () => {
    const result = convertKind({ kind: 'note', content: '## Shop\n\n- **Milk**\n\n  \n1. Eggs', items: [] });
    expect(result.kind).toBe('list');
    expect(result.content).toBe('');
    expect(result.items.map((i) => [i.text, i.done])).toEqual([
      ['Shop', false],
      ['Milk', false],
      ['Eggs', false],
    ]);
  });

  it('turns items into a bullet list and drops ticks', () => {
    expect(convertKind({ kind: 'list', content: '', items })).toEqual({
      kind: 'note',
      content: '- Milk\n- Eggs\n- Bread',
      items: [],
    });
  });

  it('keeps item text as typed through a round trip', () => {
    const typed = ['*urgent* call', '1. first', '- dash', '#tag'];
    const note = convertKind({ kind: 'list', content: '', items: typed.map((text) => newItem(text)) });
    expect(convertKind(note).items.map((i) => i.text)).toEqual(typed);
  });
});

describe('isNoteEmpty', () => {
  it('is empty with no title and blank text', () => {
    expect(isNoteEmpty({ kind: 'note', title: ' ', content: '\n', items: [] })).toBe(true);
  });
  it('is not empty with a title', () => {
    expect(isNoteEmpty({ kind: 'list', title: 'Groceries', content: '', items: [] })).toBe(false);
  });
  it('treats a list of blank items as empty', () => {
    expect(isNoteEmpty({ kind: 'list', title: '', content: '', items: [newItem(' ')] })).toBe(true);
    expect(isNoteEmpty({ kind: 'list', title: '', content: '', items: [newItem('Tea')] })).toBe(false);
  });
  it('ignores items on a text note', () => {
    expect(isNoteEmpty({ kind: 'note', title: '', content: '', items: [newItem('Tea')] })).toBe(true);
  });

  it('treats a text note with only empty formatting as empty', () => {
    expect(isNoteEmpty({ kind: 'note', title: '', content: '## \n\n- \n\n---', items: [] })).toBe(true);
    expect(isNoteEmpty({ kind: 'note', title: '', content: '**x**', items: [] })).toBe(false);
  });
});
