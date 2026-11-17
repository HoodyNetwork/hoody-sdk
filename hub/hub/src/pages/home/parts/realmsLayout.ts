// How the terminal's realms card lays its rows out (RealmsCard.term.tsx): cells a row needs, and how many columns keep
// every row whole.

/** A row's cells besides its words: side padding (1 + 1), the swatch, and the gap after it. */
const ROW_CHROME = 4;
/** The gap between two columns, in cells (the web grid's --sp-5). */
export const REALM_COL_GAP = 3;

/** Cells a row needs to show its name, count and "Showing" whole. */
export function realmRowCells(words: readonly string[]): number {
  return ROW_CHROME + words.reduce((n, w) => n + [...w].length, 0) + Math.max(0, words.length - 1);
}

/** Two columns when the widest realm row fits in half of `width` cells (the All realms row always spans). */
export function realmColumns(width: number, rowCells: readonly number[]): 1 | 2 {
  return rowCells.length > 1 && Math.max(...rowCells) * 2 + REALM_COL_GAP <= width ? 2 : 1;
}
