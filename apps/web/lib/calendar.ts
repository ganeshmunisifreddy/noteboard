// Calendar dates as 'YYYY-MM-DD' strings. Day and month arithmetic runs in
// UTC, so a clock change never adds or loses a day; only localDate and
// localMoment use the device's time zone.

export type DateParts = { year: number; month: number; day: number }; // month 1–12

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const parseDate = (date: string): DateParts => {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
};

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

export const formatDate = ({ year, month, day }: DateParts) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

// Years from 1000 on: Date.UTC reads years below 100 as 19xx.
export const isDateString = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
};

export const isTimeString = (value: unknown): value is string => typeof value === 'string' && TIME_PATTERN.test(value);

const dayNumber = (date: string) => {
  const { year, month, day } = parseDate(date);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
};

const fromDayNumber = (days: number) => {
  const d = new Date(days * DAY_MS);
  return formatDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
};

export const addDays = (date: string, days: number) => fromDayNumber(dayNumber(date) + days);

export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

export const weekdayOf = (date: string) => new Date(dayNumber(date) * DAY_MS).getUTCDay();

// The same day of the month `months` later, or that month's last day when
// it's shorter (31 Jan + 1 month = 28 Feb).
export const addMonths = (date: string, months: number) => {
  const { year, month, day } = parseDate(date);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return formatDate({ year: nextYear, month: nextMonth, day: Math.min(day, daysInMonth(nextYear, nextMonth)) });
};

export const monthsBetween = (from: string, to: string) => {
  const a = parseDate(from);
  const b = parseDate(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
};

// The device's local date at a moment.
export const localDate = (ms: number) => {
  const d = new Date(ms);
  return formatDate({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
};

// A local date and time as ms since epoch.
export const localMoment = (date: string, time: string) => {
  const { year, month, day } = parseDate(date);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
};

export const shortDate = (date: string) => {
  const { year, month, day } = parseDate(date);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
};
