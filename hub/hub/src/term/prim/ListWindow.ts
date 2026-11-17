// ListWindow: the virtual window of a long list of lines (a table, a log): only the items touching the lines in view are
// drawn, so a list of 5,000 rows holds as many engine nodes as one of 50. Pure math (offsets, the window, keep-in-view,
// the wheel, the scrollbar thumb) and two pieces built on it: useListWindow (cursor-following scroll state) and
// ScrollThumb (the 1-cell scrollbar: █ thumb on a ░ track, never selected by a mouse drag).
//
// Use (a list of `n` rows, each `h(i)` lines tall, `cursor` the row with the keyboard):
//   const [size, onSize] = useBoxSize();
//   const w = useListWindow({ heights, cursor, view: size?.height ?? 20 });
//   for (let i = w.from; i < w.to; i++) draw(i);   // and <ScrollThumb {...w.bar} view={w.view} /> beside it
//   wheel: w.scroll(+3) / w.scroll(-3) moves the view only; the next cursor move brings the cursor back into view.
import { createElement, useMemo, useState, type ReactElement } from 'react';
import { Box } from './Box';
import { TableMark } from './TableMark';


/**
 * The first drawn line after a move: unchanged while the cursor's lines [at, at + h) are in view, else the least
 * scroll that brings them in. Always within [0, max(0, total - view)].
 */
export function keepInView(top: number, at: number, h: number, view: number, total: number): number {
  const last = Math.max(0, total - view);
  let t = Math.min(Math.max(0, top), last);
  if (at < t) t = at;
  else if (at + h > t + view) t = at + h - view;
  return Math.min(Math.max(0, t), last);
}

/** A scroll by `by` lines (the wheel), clamped. */
export function scrollBy(top: number, by: number, view: number, total: number): number {
  return Math.min(Math.max(0, top + by), Math.max(0, total - view));
}

/** The scrollbar's thumb in a track of `view` cells: its first cell and its length (at least 1). Null when all fits. */
export function thumb(top: number, view: number, total: number): { start: number; size: number } | null {
  if (total <= view || view <= 0) return null;
  const size = Math.max(1, Math.round((view * view) / total));
  const room = view - size;
  const start = Math.round((top / Math.max(1, total - view)) * room);
  return { start: Math.min(room, Math.max(0, start)), size };
}

/** The line offsets of items of the given heights (prefix sums; `at[i]` is item i's first line, `at[n]` the total). */
export function lineOffsets(heights: readonly number[]): number[] {
  const at = new Array<number>(heights.length + 1);
  at[0] = 0;
  for (let i = 0; i < heights.length; i++) at[i + 1] = at[i]! + heights[i]!;
  return at;
}

/** The items drawn in lines [top, top + view): the first item touching `top`, through the last starting before the end
 *  (binary search over the offsets: a 5,000-row table finds its window in a dozen steps). */
export function windowOf(at: readonly number[], top: number, view: number): { from: number; to: number } {
  const n = at.length - 1;
  if (n <= 0) return { from: 0, to: 0 };
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (at[mid]! <= top) lo = mid;
    else hi = mid - 1;
  }
  let to = lo;
  while (to < n && at[to]! < top + view) to++;
  return { from: lo, to };
}

export interface ListWindow {
  /** First drawn line. */
  top: number;
  /** Items [from, to) are drawn. */
  from: number;
  to: number;
  /** Lines in all, and the window's height. */
  total: number;
  view: number;
  /** Line offsets (offsets[i] = item i's first line). */
  offsets: readonly number[];
  /** The scrollbar thumb, null when all fits. */
  bar: { start: number; size: number } | null;
  /** The wheel: scroll by lines (the cursor is not moved; pull it into view with the caller's own move). */
  scroll: (by: number) => void;
  /** Lines from the window's top to item `i`'s first line (draw the first item at `offsets[from] - top`). */
  lineOf: (i: number) => number;
}

/** Scroll state that keeps the `cursor` item in view; `heights[i]` is item i's lines (1 for a one-line row). */
export function useListWindow({ heights, cursor, view }: { heights: readonly number[]; cursor: number; view: number }): ListWindow {
  const offsets = useMemo(() => lineOffsets(heights), [heights]);
  const total = offsets[heights.length] ?? 0;
  const v = Math.max(1, view);
  const [top, setTop] = useState(0);
  // The view follows the cursor when the cursor moves (or the lines change); the wheel moves the view alone.
  const [seen, setSeen] = useState<{ cursor: number; offsets: readonly number[]; view: number } | null>(null);
  const at = offsets[Math.max(0, Math.min(cursor, heights.length - 1))] ?? 0;
  const h = heights[cursor] ?? 1;
  const follow = !seen || seen.cursor !== cursor || seen.offsets !== offsets || seen.view !== v;
  const now = follow ? keepInView(top, at, h, v, total) : scrollBy(top, 0, v, total);
  if (now !== top) setTop(now);
  if (follow) setSeen({ cursor, offsets, view: v });
  const { from, to } = windowOf(offsets, now, v);
  return {
    top: now, from, to, total, view: v, offsets, bar: thumb(now, v, total),
    scroll: (by) => setTop((tp) => scrollBy(tp, by, v, total)),
    lineOf: (i) => (offsets[i] ?? 0) - now,
  };
}

/** The 1-cell scrollbar for a ListWindow: a █ thumb on a ░ track, left out of mouse selection. Nothing when all fits. */
export function ScrollThumb({ bar, view }: { bar: { start: number; size: number } | null; view: number }): ReactElement | null {
  if (!bar) return null;
  const cells: ReactElement[] = [];
  for (let i = 0; i < view; i++) {
    const on = i >= bar.start && i < bar.start + bar.size;
    cells.push(createElement(TableMark, { key: i, colour: on ? 'muted' : 'line', children: on ? '█' : '░' }));
  }
  return createElement(Box, { dir: 'column', width: 1, shrink: 0 }, ...cells);
}
