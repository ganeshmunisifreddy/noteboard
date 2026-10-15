import { describe, expect, it } from 'vitest';
import { nextDate, presetOf, presetRepeat, REPEAT_PRESETS, repeatText } from './repeat';
import type { Repeat } from './types';

const rule = (overrides: Partial<Repeat>): Repeat => ({
  every: 1,
  unit: 'day',
  weekdays: [],
  anchor: '2026-10-15',
  ends: { type: 'never' },
  ...overrides,
});

describe('nextDate', () => {
  it('steps the presets', () => {
    expect(nextDate(presetRepeat('daily', '2026-10-15'), '2026-10-15')).toBe('2026-10-16');
    expect(nextDate(presetRepeat('weekdays', '2026-10-15'), '2026-10-16')).toBe('2026-10-19');
    expect(nextDate(presetRepeat('weekly', '2026-10-15'), '2026-10-15')).toBe('2026-10-22');
    expect(nextDate(presetRepeat('yearly', '2026-10-15'), '2026-10-15')).toBe('2027-10-15');
  });

  it('keeps the anchor’s day through short months', () => {
    const monthly = presetRepeat('monthly', '2026-01-31');
    expect(nextDate(monthly, '2026-01-31')).toBe('2026-02-28');
    expect(nextDate(monthly, '2026-02-28')).toBe('2026-03-31');
    expect(nextDate(monthly, '2026-03-31')).toBe('2026-04-30');
  });

  it('keeps 29 February in leap years', () => {
    const yearly = presetRepeat('yearly', '2028-02-29');
    expect(nextDate(yearly, '2028-02-29')).toBe('2029-02-28');
    expect(nextDate(yearly, '2031-02-28')).toBe('2032-02-29');
  });

  it('repeats every N days, weeks and months', () => {
    expect(nextDate(rule({ every: 3 }), '2026-10-20')).toBe('2026-10-21');
    expect(nextDate(rule({ every: 2, unit: 'week' }), '2026-10-15')).toBe('2026-10-29');
    expect(nextDate(rule({ every: 2, unit: 'month' }), '2026-10-15')).toBe('2026-12-15');
  });

  it('repeats on chosen weekdays in every Nth week', () => {
    // Anchor Thu 15 Oct; weeks start Monday 12 Oct; every other week.
    const repeat = rule({ every: 2, unit: 'week', weekdays: [1, 4] });
    expect(nextDate(repeat, '2026-10-15')).toBe('2026-10-26');
    expect(nextDate(repeat, '2026-10-26')).toBe('2026-10-29');
  });

  it('starts from the anchor when it is later', () => {
    expect(nextDate(rule({ anchor: '2026-10-20' }), '2026-10-15')).toBe('2026-10-20');
  });

  it('stops after the end date', () => {
    const repeat = rule({ ends: { type: 'on', date: '2026-10-17' } });
    expect(nextDate(repeat, '2026-10-16')).toBe('2026-10-17');
    expect(nextDate(repeat, '2026-10-17')).toBeNull();
  });
});

describe('presetOf', () => {
  it('recognises each preset', () => {
    for (const preset of REPEAT_PRESETS) expect(presetOf(presetRepeat(preset, '2026-10-15'))).toBe(preset);
  });

  it('calls anything else custom', () => {
    expect(presetOf(rule({ every: 2 }))).toBe('custom');
    expect(presetOf(rule({ unit: 'week', weekdays: [1, 4] }))).toBe('custom');
    expect(presetOf(rule({ ends: { type: 'after', count: 3, done: 0 } }))).toBe('custom');
  });
});

describe('repeatText', () => {
  it('names repeats', () => {
    expect(repeatText(presetRepeat('daily', '2026-10-15'))).toBe('Daily');
    expect(repeatText(presetRepeat('weekdays', '2026-10-15'))).toBe('Weekdays');
    expect(repeatText(presetRepeat('weekly', '2026-10-15'))).toBe('Weekly');
    expect(repeatText(presetRepeat('monthly', '2026-10-15'))).toBe('Monthly');
    expect(repeatText(presetRepeat('yearly', '2026-10-15'))).toBe('Yearly');
    expect(repeatText(rule({ unit: 'week', weekdays: [4, 1] }))).toBe('Weekly on Mon, Thu');
    expect(repeatText(rule({ every: 2, unit: 'week', weekdays: [0, 1] }))).toBe('Every 2 weeks on Mon, Sun');
    expect(repeatText(rule({ every: 3, unit: 'month' }))).toBe('Every 3 months');
  });

  it('adds how it ends', () => {
    expect(repeatText(rule({ ends: { type: 'on', date: '2027-03-01' } }))).toBe('Daily, until 1 Mar 2027');
    expect(repeatText(rule({ unit: 'week', ends: { type: 'after', count: 3, done: 1 } }))).toBe('Weekly, 2 times left');
    expect(repeatText(rule({ ends: { type: 'after', count: 3, done: 2 } }))).toBe('Daily, 1 time left');
  });
});
