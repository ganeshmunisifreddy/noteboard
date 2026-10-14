const MIN_COLUMN = 160;
const MAX_COLUMNS = 4;

export const gapFor = (width: number) => (width < 600 ? 10 : 16);

export const columnCountFor = (width: number) => {
  const gap = gapFor(width);
  const fit = Math.floor((width + gap) / (MIN_COLUMN + gap));
  return Math.max(1, Math.min(MAX_COLUMNS, fit));
};

// Each card goes into the currently shortest column, so the board reads
// left to right. A column's height includes the gap below each of its cards;
// on a tie the column with fewer cards wins, then the leftmost one.
// Returns card indexes per column.
export const assignColumns = (heights: number[], columnCount: number, gap = 0): number[][] => {
  const columns: number[][] = Array.from({ length: columnCount }, () => []);
  const totals = new Array<number>(columnCount).fill(0);
  const isShorter = (a: number, b: number) =>
    totals[a] < totals[b] || (totals[a] === totals[b] && columns[a].length < columns[b].length);
  heights.forEach((height, index) => {
    let target = 0;
    for (let c = 1; c < columnCount; c += 1) {
      if (isShorter(c, target)) target = c;
    }
    columns[target].push(index);
    totals[target] += height + gap;
  });
  return columns;
};
