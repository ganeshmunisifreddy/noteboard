import { describe, expect, it } from 'vitest';
import { localMoment } from './calendar';
import { newDue } from './due';
import { formFromDue, quickPicks, readDueForm, repeatOptions, type DueForm } from './dueForm';
import { presetRepeat } from './repeat';

const blank = (overrides: Partial<DueForm> = {}): DueForm => ({ ...formFromDue(null, '2026-10-15'), ...overrides });

describe('formFromDue', () => {
  it('starts today with no time and no repeat', () => {
    expect(formFromDue(null, '2026-10-15')).toEqual({
      date: '2026-10-15',
      time: '',
      repeat: 'none',
      every: '1',
      unit: 'week',
      weekdays: [4],
      ends: 'never',
      endDate: '',
      endCount: '5',
    });
  });

  it('reads an existing date and repeat', () => {
    const due = newDue('2026-10-20', '18:00', {
      every: 2,
      unit: 'week',
      weekdays: [1, 4],
      anchor: '2026-10-20',
      ends: { type: 'after', count: 4, done: 0 },
    });
    expect(formFromDue(due, '2026-10-15')).toMatchObject({
      date: '2026-10-20',
      time: '18:00',
      repeat: 'custom',
      every: '2',
      unit: 'week',
      weekdays: [1, 4],
      ends: 'after',
      endCount: '4',
    });
    expect(formFromDue(newDue('2026-10-20', null, presetRepeat('monthly', '2026-10-20')), '2026-10-15').repeat).toBe('monthly');
  });
});

describe('readDueForm', () => {
  it('reads a date with no time', () => {
    expect(readDueForm(blank())).toEqual({ ok: true, date: '2026-10-15', time: null, repeat: null });
  });

  it('reads a preset', () => {
    expect(readDueForm(blank({ time: '07:30', repeat: 'weekdays' }))).toEqual({
      ok: true,
      date: '2026-10-15',
      time: '07:30',
      repeat: presetRepeat('weekdays', '2026-10-15'),
    });
  });

  it('reads a custom repeat', () => {
    const result = readDueForm(
      blank({ repeat: 'custom', every: '2', unit: 'week', weekdays: [4, 1], ends: 'on', endDate: '2026-12-31' }),
    );
    expect(result).toEqual({
      ok: true,
      date: '2026-10-15',
      time: null,
      repeat: { every: 2, unit: 'week', weekdays: [1, 4], anchor: '2026-10-15', ends: { type: 'on', date: '2026-12-31' } },
    });
  });

  it('explains what is wrong', () => {
    expect(readDueForm(blank({ date: '' }))).toEqual({ ok: false, errors: { date: 'Choose a date.' } });
    expect(readDueForm(blank({ repeat: 'custom', every: '0' }))).toEqual({
      ok: false,
      errors: { every: 'Enter a number from 1 to 99.' },
    });
    expect(readDueForm(blank({ repeat: 'custom', ends: 'on', endDate: '2026-10-15' }))).toEqual({
      ok: false,
      errors: { endDate: 'The end date must be after the date.' },
    });
    expect(readDueForm(blank({ repeat: 'custom', ends: 'on', endDate: '' }))).toEqual({
      ok: false,
      errors: { endDate: 'Choose an end date.' },
    });
    expect(readDueForm(blank({ repeat: 'custom', ends: 'after', endCount: '1000' }))).toEqual({
      ok: false,
      errors: { endCount: 'Enter a number from 1 to 999.' },
    });
  });
});

describe('quickPicks', () => {
  it('offers later today before 5 pm, tomorrow and next Monday', () => {
    const picks = quickPicks(localMoment('2026-10-15', '12:00'), 'en-GB');
    expect(picks).toEqual([
      { label: 'Later today', detail: '18:00', date: '2026-10-15', time: '18:00' },
      { label: 'Tomorrow', detail: '9:00', date: '2026-10-16', time: '09:00' },
      { label: 'Next week', detail: 'Mon 9:00', date: '2026-10-19', time: '09:00' },
    ]);
    expect(quickPicks(localMoment('2026-10-15', '17:00')).map((p) => p.label)).toEqual(['Tomorrow', 'Next week']);
    // On a Monday, next week is the following Monday.
    expect(quickPicks(localMoment('2026-10-19', '08:00'))[2].date).toBe('2026-10-26');
  });
});

describe('repeatOptions', () => {
  it('names the options after the date', () => {
    expect(repeatOptions('2026-10-15').map((o) => o.label)).toEqual([
      'Doesn’t repeat',
      'Daily',
      'Weekdays (Mon–Fri)',
      'Weekly on Thu',
      'Monthly on day 15',
      'Yearly on 15 Oct',
      'Custom…',
    ]);
  });
});
