// Notes are ordered by a fractional `position`; moving one only rewrites it.
export const MIN_GAP = 1e-6;

export const positionBetween = (before: number | null, after: number | null): number => {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
};

// After many moves into the same gap, floats run out of room between two
// neighbours; then all positions are renumbered first.
export const needsRenumber = (before: number | null, after: number | null) =>
  before !== null && after !== null && Math.abs(after - before) < MIN_GAP;

export const moveToIndex = (ids: string[], id: string, index: number): string[] => {
  const rest = ids.filter((x) => x !== id);
  return [...rest.slice(0, index), id, ...rest.slice(index)];
};

// Moves `activeId` into the slot `overId` occupies.
export const moveId = (ids: string[], activeId: string, overId: string): string[] => {
  if (!ids.includes(activeId) || !ids.includes(overId)) return ids;
  return moveToIndex(ids, activeId, ids.indexOf(overId));
};

export const neighbors = (ids: string[], id: string) => {
  const index = ids.indexOf(id);
  return {
    beforeId: index > 0 ? ids[index - 1] : null,
    afterId: index >= 0 && index < ids.length - 1 ? ids[index + 1] : null,
  };
};
