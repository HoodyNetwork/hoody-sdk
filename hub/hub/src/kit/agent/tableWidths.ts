// tableWidths: column widths of a markdown table drawn in cells (the terminal reply). Pure; no engine.
import { cellWidth } from '@term/prim';

export const SEP = ' │ ';
/** Narrowest a column may be squeezed to before the table is drawn as stacked rows instead. */
export const MIN_COL = 8;

/** Column widths for `avail` cells: natural widths when they fit, else squeezed (wider columns give up room first); null
 *  when even MIN_COL per column does not fit (stacked rows then). Pure: tested. */
export function tableWidths(natural: readonly number[], avail: number): number[] | null {
  const n = natural.length;
  if (n === 0) return [];
  const room = avail - cellWidth(SEP) * (n - 1);
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= room) return [...natural];
  if (room < MIN_COL * n) return null;
  const w = natural.map((x) => Math.max(1, x));
  // One cell at a time from the widest column still above MIN_COL, until the row fits.
  let over = w.reduce((a, b) => a + b, 0) - room;
  while (over > 0) {
    let k = -1;
    for (let i = 0; i < n; i++) if (w[i]! > MIN_COL && (k < 0 || w[i]! > w[k]!)) k = i;
    if (k < 0) return null;
    w[k] = w[k]! - 1;
    over -= 1;
  }
  return w;
}

