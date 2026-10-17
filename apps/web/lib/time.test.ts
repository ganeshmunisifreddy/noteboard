import { describe, expect, it } from 'vitest';
import { formatEdited } from './time';

const now = 1_800_000_000_000;
const minute = 60_000;

describe('formatEdited', () => {
  it('says just now under a minute, and for future times', () => {
    expect(formatEdited(now - 30_000, now)).toBe('Edited just now');
    expect(formatEdited(now + 5_000, now)).toBe('Edited just now');
  });
  it('uses the largest whole unit', () => {
    expect(formatEdited(now - 5 * minute, now)).toBe('Edited 5 minutes ago');
    expect(formatEdited(now - 120 * minute, now)).toBe('Edited 2 hours ago');
    expect(formatEdited(now - 24 * 60 * minute, now)).toBe('Edited yesterday');
    expect(formatEdited(now - 3 * 24 * 60 * minute, now)).toBe('Edited 3 days ago');
  });
});
