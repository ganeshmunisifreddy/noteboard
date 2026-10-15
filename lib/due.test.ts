import { describe, expect, it } from 'vitest';
import { localMoment } from './calendar';
import {
  alertTime,
  completeDue,
  dueDescription,
  dueMoment,
  formatDue,
  formatDueLong,
  formatTime,
  isOverdue,
  newDue,
  upcomingSections,
} from './due';
import { presetRepeat } from './repeat';
import type { Due, Repeat } from './types';

// Thursday 15 October 2026, 12:00 local time.
const NOW = localMoment('2026-10-15', '12:00');
const DAY = 24 * 60 * 60 * 1000;

const due = (overrides: Partial<Due> = {}): Due => ({ ...newDue('2026-10-15', null, null), ...overrides });
const daily = (overrides: Partial<Repeat> = {}): Repeat => ({ ...presetRepeat('daily', '2026-10-10'), ...overrides });

describe('due moments', () => {
  it('uses 09:00 when there is no time', () => {
    expect(dueMoment(due())).toBe(localMoment('2026-10-15', '09:00'));
    expect(dueMoment(due({ time: '18:30' }))).toBe(localMoment('2026-10-15', '18:30'));
  });

  it('alerts at the snooze time when snoozed', () => {
    expect(alertTime(due({ snoozedUntil: NOW + 5 }))).toBe(NOW + 5);
    expect(alertTime(due())).toBe(localMoment('2026-10-15', '09:00'));
  });

  it('starts a repeat from the date', () => {
    const repeat = { ...presetRepeat('daily', '2020-01-01'), ends: { type: 'after' as const, count: 3, done: 2 } };
    expect(newDue('2026-10-15', '08:00', repeat)).toEqual({
      date: '2026-10-15',
      time: '08:00',
      repeat: { ...repeat, anchor: '2026-10-15', ends: { type: 'after', count: 3, done: 0 } },
      doneAt: null,
      alertedAt: null,
      snoozedUntil: null,
    });
  });
});

describe('isOverdue', () => {
  it('is overdue once the time has passed', () => {
    expect(isOverdue(due({ time: '11:00' }), NOW)).toBe(true);
    expect(isOverdue(due({ time: '13:00' }), NOW)).toBe(false);
  });

  it('is overdue from the day after a date with no time', () => {
    expect(isOverdue(due(), NOW)).toBe(false);
    expect(isOverdue(due({ date: '2026-10-14' }), NOW)).toBe(true);
  });

  it('is never overdue when done', () => {
    expect(isOverdue(due({ date: '2026-10-01', doneAt: NOW }), NOW)).toBe(false);
  });
});

describe('completeDue', () => {
  it('marks a date that doesn’t repeat as done', () => {
    expect(completeDue(due({ alertedAt: 1, snoozedUntil: 2 }), NOW)).toMatchObject({
      date: '2026-10-15',
      doneAt: NOW,
      alertedAt: null,
      snoozedUntil: null,
    });
  });

  it('moves a repeat to its next date', () => {
    const weekly = due({ repeat: presetRepeat('weekly', '2026-10-15') });
    expect(completeDue(weekly, NOW)).toMatchObject({ date: '2026-10-22', doneAt: null });
  });

  it('skips missed dates to today or later', () => {
    expect(completeDue(due({ date: '2026-10-10', repeat: daily() }), NOW)).toMatchObject({
      date: '2026-10-15',
      doneAt: null,
    });
  });

  it('counts dates moved past toward “after N times”', () => {
    const repeat = daily({ ends: { type: 'after', count: 3, done: 0 } });
    expect(completeDue(due({ date: '2026-10-14', repeat: { ...repeat, anchor: '2026-10-14' } }), NOW)).toMatchObject({
      date: '2026-10-15',
      repeat: { ends: { type: 'after', count: 3, done: 1 } },
      doneAt: null,
    });
  });

  it('is done on the last date once the series ends', () => {
    const after = daily({ ends: { type: 'after', count: 3, done: 0 } });
    expect(completeDue(due({ date: '2026-10-10', repeat: after }), NOW)).toMatchObject({
      date: '2026-10-12',
      // The last date counts as used too.
      repeat: { ends: { done: 3 } },
      doneAt: NOW,
    });
    const until = daily({ ends: { type: 'on', date: '2026-10-12' } });
    expect(completeDue(due({ date: '2026-10-10', repeat: until }), NOW)).toMatchObject({
      date: '2026-10-12',
      doneAt: NOW,
    });
  });
});

describe('date text', () => {
  it('uses the browser’s 12- or 24-hour style', () => {
    expect(formatTime('18:00', 'en-US')).toBe('6:00 PM');
    expect(formatTime('18:00', 'en-GB')).toBe('18:00');
  });

  it('names near days and adds the year when it differs', () => {
    expect(formatDue({ date: '2026-10-15', time: null }, NOW)).toBe('Today');
    expect(formatDue({ date: '2026-10-16', time: '09:30' }, NOW, 'en-GB')).toBe('Tomorrow, 9:30');
    expect(formatDue({ date: '2026-10-14', time: null }, NOW)).toBe('Yesterday');
    expect(formatDue({ date: '2026-10-20', time: null }, NOW)).toBe('Tue 20 Oct');
    expect(formatDue({ date: '2027-01-05', time: null }, NOW)).toBe('Tue 5 Jan 2027');
  });

  it('formatDue across midnight', () => {
    const tomorrow = { date: '2026-10-16', time: null };
    expect(formatDue(tomorrow, localMoment('2026-10-15', '23:59'))).toBe('Tomorrow');
    expect(formatDue(tomorrow, localMoment('2026-10-16', '00:01'))).toBe('Today');
  });

  it('writes the long form for exports', () => {
    expect(formatDueLong({ date: '2026-10-16', time: '09:30' }, 'en-GB')).toBe('Fri 16 Oct 2026, 9:30');
    expect(formatDueLong({ date: '2026-10-16', time: null })).toBe('Fri 16 Oct 2026');
  });

  it('describes a date for screen readers', () => {
    const weekly = due({ time: '11:00', repeat: presetRepeat('weekly', '2026-10-15') });
    expect(dueDescription(weekly, NOW, 'en-GB')).toBe('Due today, 11:00, overdue, repeats weekly');
    expect(dueDescription(due({ date: '2026-10-20', doneAt: NOW }), NOW)).toBe('Done, was due Tue 20 Oct');
  });
});

describe('upcomingSections', () => {
  const note = (id: string, d: Partial<Due> | null) => ({ id, due: d ? due(d) : null });

  it('groups and orders dated notes', () => {
    const sections = upcomingSections(
      [
        note('later', { date: '2026-11-30' }),
        note('none', null),
        note('today-6pm', { time: '18:00' }),
        note('today', {}),
        note('late-new', { date: '2026-10-13' }),
        note('late-old', { date: '2026-10-01' }),
        note('tomorrow', { date: '2026-10-16' }),
        note('week', { date: '2026-10-21' }),
        note('next-week', { date: '2026-10-22' }),
        note('done-new', { doneAt: NOW - DAY }),
        note('done-old', { doneAt: NOW - 2 * DAY }),
        note('done-long-ago', { doneAt: NOW - 31 * DAY }),
      ],
      NOW,
    );
    expect(sections.map((s) => [s.key, s.title, s.notes.map((n) => n.id)])).toEqual([
      ['overdue', 'Overdue', ['late-old', 'late-new']],
      ['today', 'Today', ['today', 'today-6pm']],
      ['tomorrow', 'Tomorrow', ['tomorrow']],
      ['week', 'Next 7 days', ['week']],
      ['later', 'Later', ['next-week', 'later']],
      ['done', 'Done', ['done-new', 'done-old']],
    ]);
  });

  it('leaves out empty sections', () => {
    expect(upcomingSections([note('a', { date: '2026-10-16' })], NOW).map((s) => s.key)).toEqual(['tomorrow']);
  });
});
