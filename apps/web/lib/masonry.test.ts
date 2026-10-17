import { describe, expect, it } from 'vitest';
import { assignColumns, columnCountFor, gapFor } from './masonry';

describe('columnCountFor', () => {
  it('fits columns of at least 160px, between 1 and 4', () => {
    expect(columnCountFor(0)).toBe(1);
    expect(columnCountFor(300)).toBe(1);
    expect(columnCountFor(343)).toBe(2);
    expect(columnCountFor(700)).toBe(4);
    expect(columnCountFor(1248)).toBe(4);
  });
});

describe('gapFor', () => {
  it('uses a tighter gap on small screens', () => {
    expect(gapFor(343)).toBe(10);
    expect(gapFor(800)).toBe(16);
  });
});

describe('assignColumns', () => {
  it('fills left to right, then the shortest column', () => {
    expect(assignColumns([100, 50, 80, 30, 40], 3)).toEqual([[0], [1, 3], [2, 4]]);
  });
  it('sends ties to the leftmost column', () => {
    expect(assignColumns([0, 0, 0, 0], 2)).toEqual([[0, 2], [1, 3]]);
  });
  it('counts the gap below each card', () => {
    // Without gaps the 2nd column (79) looks shorter than the 3rd (80); with
    // a 16px gap per card it is 111 against 96.
    expect(assignColumns([100, 40, 80, 39, 10], 3, 16)).toEqual([[0], [1, 3], [2, 4]]);
  });
  it('puts everything in one column', () => {
    expect(assignColumns([5, 5], 1)).toEqual([[0, 1]]);
  });
});
