import { describe, expect, it } from 'vitest';
import { MIN_GAP, moveId, moveToIndex, needsRenumber, neighbors, positionBetween } from './order';

describe('positionBetween', () => {
  it('goes halfway between neighbours', () => {
    expect(positionBetween(1, 2)).toBe(1.5);
  });
  it('goes before the first and after the last', () => {
    expect(positionBetween(null, 4)).toBe(3);
    expect(positionBetween(4, null)).toBe(5);
  });
  it('starts at zero with no neighbours', () => {
    expect(positionBetween(null, null)).toBe(0);
  });
});

describe('needsRenumber', () => {
  it('is true only when the gap is too small', () => {
    expect(needsRenumber(1, 1 + MIN_GAP / 2)).toBe(true);
    expect(needsRenumber(1, 2)).toBe(false);
    expect(needsRenumber(null, 2)).toBe(false);
    expect(needsRenumber(1, null)).toBe(false);
  });
});

describe('moveId', () => {
  it('moves an id to where another one is', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('returns the same array for unknown ids', () => {
    const ids = ['a', 'b'];
    expect(moveId(ids, 'a', 'x')).toBe(ids);
  });
});

describe('moveToIndex', () => {
  it('moves an id to an index', () => {
    expect(moveToIndex(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moveToIndex(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });
});

describe('neighbors', () => {
  it('finds the ids around an id', () => {
    expect(neighbors(['a', 'b', 'c'], 'b')).toEqual({ beforeId: 'a', afterId: 'c' });
    expect(neighbors(['a', 'b', 'c'], 'a')).toEqual({ beforeId: null, afterId: 'b' });
    expect(neighbors(['a', 'b', 'c'], 'c')).toEqual({ beforeId: 'b', afterId: null });
  });
});
