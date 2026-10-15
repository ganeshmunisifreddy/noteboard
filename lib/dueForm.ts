import { addDays, isDateString, isTimeString, localDate, MONTH_SHORT, parseDate, WEEKDAY_SHORT, weekdayOf } from './calendar';
import { formatTime } from './due';
import { presetOf, presetRepeat, type RepeatPreset } from './repeat';
import type { Due, Repeat, RepeatEnd, RepeatUnit } from './types';

export type RepeatChoice = 'none' | RepeatPreset | 'custom';

// The date popover's fields, as the inputs hold them (strings).
export type DueForm = {
  date: string;
  time: string; // '' = no time
  repeat: RepeatChoice;
  every: string;
  unit: RepeatUnit;
  weekdays: number[];
  ends: 'never' | 'on' | 'after';
  endDate: string;
  endCount: string;
};

export type DueFormErrors = Partial<Record<'date' | 'every' | 'weekdays' | 'endDate' | 'endCount', string>>;

export const formFromDue = (due: Due | null, today: string): DueForm => {
  const repeat = due?.repeat ?? null;
  const date = due?.date ?? today;
  return {
    date,
    time: due?.time ?? '',
    repeat: repeat ? presetOf(repeat) : 'none',
    every: String(repeat?.every ?? 1),
    unit: repeat?.unit ?? 'week',
    // Custom weeks start on the date's own weekday.
    weekdays: repeat && repeat.weekdays.length > 0 ? repeat.weekdays : [weekdayOf(date)],
    ends: repeat?.ends.type ?? 'never',
    endDate: repeat?.ends.type === 'on' ? repeat.ends.date : '',
    endCount: repeat?.ends.type === 'after' ? String(repeat.ends.count) : '5',
  };
};

const wholeIn = (text: string, min: number, max: number) => {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max ? value : null;
};

export const readDueForm = (
  form: DueForm,
): { ok: true; date: string; time: string | null; repeat: Repeat | null } | { ok: false; errors: DueFormErrors } => {
  const errors: DueFormErrors = {};
  const dateOk = isDateString(form.date);
  if (!dateOk) errors.date = 'Choose a date.';
  const time = isTimeString(form.time) ? form.time : null;
  let repeat: Repeat | null = null;
  if (form.repeat !== 'none' && form.repeat !== 'custom' && dateOk) repeat = presetRepeat(form.repeat, form.date);
  if (form.repeat === 'custom') {
    const every = wholeIn(form.every, 1, 99);
    if (every === null) errors.every = 'Enter a number from 1 to 99.';
    if (form.unit === 'week' && form.weekdays.length === 0) errors.weekdays = 'Choose at least one day.';
    let ends: RepeatEnd = { type: 'never' };
    if (form.ends === 'on') {
      if (!isDateString(form.endDate)) errors.endDate = 'Choose an end date.';
      else if (dateOk && form.endDate <= form.date) errors.endDate = 'The end date must be after the date.';
      else ends = { type: 'on', date: form.endDate };
    }
    if (form.ends === 'after') {
      const count = wholeIn(form.endCount, 1, 999);
      if (count === null) errors.endCount = 'Enter a number from 1 to 999.';
      else ends = { type: 'after', count, done: 0 };
    }
    if (every !== null && dateOk && !errors.weekdays) {
      const weekdays = form.unit === 'week' ? [...new Set(form.weekdays)].sort((a, b) => a - b) : [];
      repeat = { every, unit: form.unit, weekdays, anchor: form.date, ends };
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, date: form.date, time, repeat };
};

export type QuickPick = { label: string; detail: string; date: string; time: string };

export const quickPicks = (now: number, locale?: string): QuickPick[] => {
  const today = localDate(now);
  const picks: QuickPick[] = [];
  if (new Date(now).getHours() < 17) {
    picks.push({ label: 'Later today', detail: formatTime('18:00', locale), date: today, time: '18:00' });
  }
  picks.push({ label: 'Tomorrow', detail: formatTime('09:00', locale), date: addDays(today, 1), time: '09:00' });
  // The next Monday that isn't tomorrow.
  const toMonday = (8 - weekdayOf(today)) % 7 || 7;
  picks.push({ label: 'Next week', detail: `Mon ${formatTime('09:00', locale)}`, date: addDays(today, toMonday === 1 ? 8 : toMonday), time: '09:00' });
  return picks;
};

export const repeatOptions = (date: string): { value: RepeatChoice; label: string }[] => {
  const valid = isDateString(date);
  const { month, day } = valid ? parseDate(date) : { month: 1, day: 1 };
  return [
    { value: 'none', label: 'Doesn’t repeat' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
    { value: 'weekly', label: valid ? `Weekly on ${WEEKDAY_SHORT[weekdayOf(date)]}` : 'Weekly' },
    { value: 'monthly', label: valid ? `Monthly on day ${day}` : 'Monthly' },
    { value: 'yearly', label: valid ? `Yearly on ${day} ${MONTH_SHORT[month - 1]}` : 'Yearly' },
    { value: 'custom', label: 'Custom…' },
  ];
};
