import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, isFiltering, matchesCard, type CardFilter } from './boardFilter';
import { localMoment } from './calendar';
import { newDue } from './due';
import { makeNote } from './testUtils';

const NOW = localMoment('2026-10-15', '12:00');
const labels = new Map([['l1', 'Design']]);
const match = (note: ReturnType<typeof makeNote>, filter: Partial<CardFilter>) =>
  matchesCard(note, { ...EMPTY_FILTER, ...filter }, labels, NOW);

describe('isFiltering', () => {
  it('is off for the empty filter and blank text', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, query: '  ' })).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, date: 'none' })).toBe(true);
  });
});

describe('matchesCard', () => {
  it('matches text in the title, body, items and label names', () => {
    expect(match(makeNote({ title: 'Pick fonts' }), { query: 'FONT' })).toBe(true);
    expect(match(makeNote({ labelIds: ['l1'] }), { query: 'design' })).toBe(true);
    expect(match(makeNote({ title: 'Logo' }), { query: 'fonts' })).toBe(false);
  });

  it('matches one label', () => {
    expect(match(makeNote({ labelIds: ['l1'] }), { labelId: 'l1' })).toBe(true);
    expect(match(makeNote(), { labelId: 'l1' })).toBe(false);
  });

  it('sorts dates into overdue, next 7 days and no date', () => {
    const overdue = makeNote({ due: newDue('2026-10-14', null, null) });
    const today = makeNote({ due: newDue('2026-10-15', '18:00', null) });
    const lateToday = makeNote({ due: newDue('2026-10-15', '09:00', null) }); // passed at noon
    const week = makeNote({ due: newDue('2026-10-22', null, null) });
    const later = makeNote({ due: newDue('2026-10-23', null, null) });
    const none = makeNote();
    const done = makeNote({ due: { ...newDue('2026-10-14', null, null), doneAt: 1 } });
    const pick = (date: CardFilter['date']) =>
      [overdue, today, lateToday, week, later, none, done].filter((n) => match(n, { date })).map((n) => n.id);
    expect(pick('overdue')).toEqual([overdue.id, lateToday.id]);
    expect(pick('week')).toEqual([today.id, week.id]);
    expect(pick('none')).toEqual([none.id]);
  });

  it('needs every part to match', () => {
    const note = makeNote({ title: 'Fonts', labelIds: ['l1'] });
    expect(match(note, { query: 'fonts', labelId: 'l1', date: 'none' })).toBe(true);
    expect(match(note, { query: 'fonts', labelId: 'l1', date: 'overdue' })).toBe(false);
  });
});
