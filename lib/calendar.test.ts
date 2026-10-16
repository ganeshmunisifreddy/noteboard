import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  isDateString,
  isTimeString,
  localDate,
  localMoment,
  monthsBetween,
  shortDate,
  weekdayOf,
} from './calendar';

const inTimeZone = (zone: string, run: () => void) => {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
};

describe('calendar dates', () => {
  it('accepts real dates and times only', () => {
    expect(isDateString('2026-10-15')).toBe(true);
    expect(isDateString('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '26-10-15', '0999-01-01', '2026-10-15T00:00', 5, null]) {
      expect(isDateString(bad)).toBe(false);
    }
    expect(isTimeString('09:00')).toBe(true);
    expect(isTimeString('23:59')).toBe(true);
    for (const bad of ['24:00', '9:00', '09:60', '', null]) expect(isTimeString(bad)).toBe(false);
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-15', '2026-11-15')).toBe(31);
  });

  it('knows the weekday', () => {
    expect(weekdayOf('2026-10-15')).toBe(4); // Thursday
    expect(weekdayOf('2026-10-18')).toBe(0); // Sunday
  });

  it('adds months keeping the day, or the month’s last day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(monthsBetween('2026-11-15', '2027-02-01')).toBe(3);
  });

  it('writes short dates', () => {
    expect(shortDate('2027-03-01')).toBe('1 Mar 2027');
  });

  it('keeps local times across a clock change', () => {
    inTimeZone('Europe/London', () => {
      const before = localMoment('2026-10-24', '09:00');
      const after = localMoment('2026-10-25', '09:00');
      expect(after - before).toBe(25 * 60 * 60 * 1000);
      expect(new Date(after).getHours()).toBe(9);
      expect(localDate(after)).toBe('2026-10-25');
    });
  });
});
