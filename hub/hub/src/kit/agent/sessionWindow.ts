// sessionWindow: which transcript blocks the terminal mounts (SessionView.term). Pure; no engine.
import { cellWidth } from '@term/prim';
import type { ConvBlock } from './source';

/** Rows a block will take at `width` before it ever drew (wrapped text, a footer, the gap). Only needs to be close: the
 *  block is measured once it draws, and the scroll anchor keeps the reader's place while estimates are replaced. */
export function estimateRows(b: ConvBlock, width: number): number {
  const w = Math.max(10, width);
  const wrapped = (s: string) => s.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(cellWidth(l) / w)), 0);
  switch (b.k) {
    case 'user': return 2 + wrapped(b.text) + (b.note ? 1 : 0) + 1;
    case 'steps':
    case 'summary': return 2;
    case 'reply': return wrapped(b.text) + Math.ceil(b.text.split('\n\n').length / 2) + (b.final ? 2 : 0) + 1;
    case 'decided':
    case 'line': return 2;
  }
}

/** The blocks to mount: those whose rows meet [top - h, top + 2h] (one screen of overscan each side). With nothing in
 *  that range (heights shrank under a stale top) the last screen's worth from the end. */
export function windowOf(heights: readonly number[], top: number, h: number): { from: number; to: number } {
  const n = heights.length;
  if (n === 0) return { from: 0, to: -1 };
  const lo = top - h, hi = top + 2 * h;
  let y = 0, from = -1, to = -1;
  for (let i = 0; i < n; i++) {
    const end = y + heights[i]!;
    if (end > lo && y < hi) { if (from < 0) from = i; to = i; }
    y = end;
  }
  if (from >= 0) return { from, to };
  let i = n - 1, rows = 0;
  while (i > 0 && rows < 2 * h) rows += heights[i--]!;
  return { from: Math.max(0, i), to: n - 1 };
}
