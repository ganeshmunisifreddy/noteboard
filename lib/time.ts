import { useEffect, useState } from 'react';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['week', 7 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
];

export const formatEdited = (timestamp: number, now: number): string => {
  const elapsed = now - timestamp;
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return `Edited ${relative.format(-Math.floor(elapsed / size), unit)}`;
  }
  return 'Edited just now';
};

// Current time, refreshed every interval so relative times stay current.
export const useNow = (intervalMs = 60_000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
};
