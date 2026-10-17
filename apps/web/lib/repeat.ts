import { addDays, addMonths, daysBetween, monthsBetween, shortDate, WEEKDAY_SHORT, weekdayOf } from './calendar';
import type { Repeat, RepeatUnit } from './types';

export const REPEAT_UNITS: RepeatUnit[] = ['day', 'week', 'month', 'year'];
export const REPEAT_PRESETS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const;
export type RepeatPreset = (typeof REPEAT_PRESETS)[number];

const MON_TO_FRI = [1, 2, 3, 4, 5];

export const presetRepeat = (preset: RepeatPreset, anchor: string): Repeat => {
  const base: Repeat = { every: 1, unit: 'day', weekdays: [], anchor, ends: { type: 'never' } };
  switch (preset) {
    case 'daily':
      return base;
    case 'weekdays':
      return { ...base, unit: 'week', weekdays: MON_TO_FRI };
    case 'weekly':
      return { ...base, unit: 'week' };
    case 'monthly':
      return { ...base, unit: 'month' };
    case 'yearly':
      return { ...base, unit: 'year' };
  }
};

const sameDays = (a: number[], b: number[]) => {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((day, i) => day === y[i]);
};

export const presetOf = (repeat: Repeat): RepeatPreset | 'custom' => {
  if (repeat.every !== 1 || repeat.ends.type !== 'never') return 'custom';
  switch (repeat.unit) {
    case 'day':
      return 'daily';
    case 'week':
      if (repeat.weekdays.length === 0) return 'weekly';
      return sameDays(repeat.weekdays, MON_TO_FRI) ? 'weekdays' : 'custom';
    case 'month':
      return 'monthly';
    case 'year':
      return 'yearly';
  }
};

// Weeks start on Monday.
const weekStart = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

const following = ({ anchor, every, unit, weekdays }: Repeat, after: string): string | null => {
  if (unit === 'week' && weekdays.length > 0) {
    // The chosen weekdays, in every `every`-th week counted from the anchor's week.
    const start = weekStart(anchor);
    let day = anchor > after ? anchor : addDays(after, 1);
    for (let i = 0; i < every * 7 + 7; i += 1, day = addDays(day, 1)) {
      const week = Math.floor(daysBetween(start, day) / 7);
      if (week % every === 0 && weekdays.includes(weekdayOf(day))) return day;
    }
    return null;
  }
  if (anchor > after) return anchor;
  if (unit === 'day' || unit === 'week') {
    const step = unit === 'day' ? every : every * 7;
    return addDays(anchor, (Math.floor(daysBetween(anchor, after) / step) + 1) * step);
  }
  // Months and years count from the anchor, so the 31st comes back after a short month.
  const step = unit === 'month' ? every : every * 12;
  let k = Math.max(1, Math.floor(monthsBetween(anchor, after) / step));
  while (addMonths(anchor, k * step) <= after) k += 1;
  return addMonths(anchor, k * step);
};

// The first date of the repeat after `after`, or null past its end date.
// "After N times" is counted by Mark done (lib/due.ts), not here.
export const nextDate = (repeat: Repeat, after: string): string | null => {
  const next = following(repeat, after);
  if (next === null) return null;
  if (repeat.ends.type === 'on' && next > repeat.ends.date) return null;
  return next;
};

const UNIT_PLURALS: Record<RepeatUnit, string> = { day: 'days', week: 'weeks', month: 'months', year: 'years' };

// Monday first, as in the picker.
const dayList = (days: number[]) =>
  [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => WEEKDAY_SHORT[day])
    .join(', ');

const PRESET_NAMES: Record<RepeatPreset, string> = {
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export const repeatText = (repeat: Repeat): string => {
  const preset = presetOf({ ...repeat, ends: { type: 'never' } });
  const onDays = repeat.unit === 'week' && repeat.weekdays.length > 0 ? ` on ${dayList(repeat.weekdays)}` : '';
  let text: string;
  if (preset !== 'custom') text = PRESET_NAMES[preset];
  else if (repeat.every === 1) text = `Weekly${onDays}`;
  else text = `Every ${repeat.every} ${UNIT_PLURALS[repeat.unit]}${onDays}`;
  if (repeat.ends.type === 'on') text += `, until ${shortDate(repeat.ends.date)}`;
  if (repeat.ends.type === 'after') {
    const left = repeat.ends.count - repeat.ends.done;
    text += left > 0 ? `, ${left} ${left === 1 ? 'time' : 'times'} left` : ', ended';
  }
  return text;
};
