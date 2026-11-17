// Width questions in the terminal. The web asks them in px; here one cell is CELL_PX wide, so a page's "narrower than
// 600 px" reads "narrower than 75 columns".
// - A media query (useMedia) is the viewport's: the terminal's width, as the web's is the window's.
// - A container question (useContainerNarrow, useContentNarrow) is the room the asker has: the nearest measured pane
//   (prim usePaneSize: the shell's content pane, a list or detail pane, a dialog body; else the terminal). It answers
//   again on every terminal resize and every change of that pane's width (a sidebar or a pane handle moving).
import type * as Web from './media';
import { useEffect, useState, type RefObject } from 'react';
import { usePaneSize, useTerminalSize } from '../term/prim';

export type { RowNeed } from './media';

/** px one column stands for when shared code asks a px question. "Phone" (the overlays' `(width < 600px)`) is then a
 *  terminal under 75 columns, the same line as termBreaks NARROW_COLS: an 80x24 terminal is not a phone, a phone's SSH
 *  app (40-60 columns) is. */
const CELL_PX = 8;
/** 1em in a media query is the browser default font size, not the page's. */
const EM_PX = 16;

type Cmp = '<' | '<=' | '>' | '>=';
const FLIP: Record<Cmp, Cmp> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };
const holds = (v: number, op: Cmp, n: number) => (op === '<' ? v < n : op === '<=' ? v <= n : op === '>' ? v > n : v >= n);
const LEN = '([\\d.]+)(px|em|rem)';
const len = (n: string, unit: string) => Number(n) * (unit === 'px' ? 1 : EM_PX);

/** One `( … )` feature against the viewport width in px: true / false, or null when it is not a width feature (hover,
 *  pointer, colour scheme, reduced motion, height: none of them holds in a terminal). */
function feature(f: string, px: number): boolean | null {
  let m = new RegExp(`^(max|min)-width\\s*:\\s*${LEN}$`).exec(f);
  if (m) return m[1] === 'max' ? px <= len(m[2]!, m[3]!) : px >= len(m[2]!, m[3]!);
  // Range forms (Media Queries 4): `width < 600px`, `600px <= width`, `600px <= width < 900px`.
  m = new RegExp(`^width\\s*(<=|>=|<|>)\\s*${LEN}$`).exec(f);
  if (m) return holds(px, m[1] as Cmp, len(m[2]!, m[3]!));
  m = new RegExp(`^${LEN}\\s*(<=|>=|<|>)\\s*width$`).exec(f);
  if (m) return holds(px, FLIP[m[3] as Cmp], len(m[1]!, m[2]!));
  m = new RegExp(`^${LEN}\\s*(<=|<|>=|>)\\s*width\\s*(<=|<|>=|>)\\s*${LEN}$`).exec(f);
  if (m) return holds(px, FLIP[m[3] as Cmp], len(m[1]!, m[2]!)) && holds(px, m[4] as Cmp, len(m[5]!, m[6]!));
  return null;
}

/** A media query against a viewport `px` wide. Comma = any of; `and` = all of; `not` and `only` as CSS. A query
 *  whose features are not all width features is false (a terminal has no hover, pointer or scheme to match). */
function matches(query: string, px: number): boolean {
  return query.split(',').some((part) => {
    let q = part.trim().toLowerCase();
    const not = /^not\s+/.test(q);
    q = q.replace(/^(not|only)\s+/, '').replace(/^(screen|all)\s*(and\s+)?/, '');
    if (!q) return !not;
    const feats = q.split(/\s+and\s+/).map((x) => /^\((.*)\)$/.exec(x.trim())?.[1]?.trim());
    const ok = feats.every((f) => f !== undefined && feature(f, px) === true);
    const known = feats.every((f) => f !== undefined && feature(f, px) !== null);
    return not ? known && !ok : ok;
  });
}

export const useMedia: typeof Web.useMedia = (query) => matches(query, useTerminalSize().width * CELL_PX);

export const titledRowNeed: typeof Web.titledRowNeed = () => () => 0;
export const rowContentSig: typeof Web.rowContentSig = () => '';
/** Rows are laid out by the engine: nothing folds by measurement. */
export const useRowFit: typeof Web.useRowFit = () => 0;
export const CONTENT_CONTAINER: typeof Web.CONTENT_CONTAINER = 'data-hub-content';

const noRef = (): void => {};
export const useContentNarrow: typeof Web.useContentNarrow = (px) => [noRef, usePaneSize().cols * CELL_PX < px];
/** The engine node behind a compat element ref (TermElement `__node`), as far as this module reads it. */
interface Measured { width: number; isDestroyed?: boolean; onLifecyclePass?: (() => void) | null }
/** Per node: who wants its width after each layout pass. One pass hook per node, installed once and never removed,
 *  so hooks of other modules chained on the same node (sticky, :empty) unwind in any order. */
const watchers = new WeakMap<Measured, Set<(w: number) => void>>();
function watchWidth(n: Measured, cb: (w: number) => void): () => void {
  let set = watchers.get(n);
  if (!set) {
    const s = new Set<(w: number) => void>();
    set = s;
    watchers.set(n, s);
    const before = n.onLifecyclePass ?? null;
    n.onLifecyclePass = () => { before?.(); if (!n.isDestroyed) for (const f of s) f(n.width); };
  }
  set.add(cb);
  cb(n.width);
  return () => { set.delete(cb); };
}
const nodeOf = (el: unknown): Measured | null => {
  const get = (el as { __node?: () => Measured | null } | null)?.__node;
  return typeof get === 'function' ? get() : null;
};

/** With a ref: the element's own laid-out width, re-read after every layout pass (the web's ResizeObserver on that
 *  element), so a bar inside a scrolling body is judged at the room it gets (the body's scrollbar column taken off),
 *  not at its pane's. Before its first layout, and without a ref, the nearest pane answers (as before). */
export const useContainerNarrow: typeof Web.useContainerNarrow = (px, ref?: RefObject<unknown>) => {
  const pane = usePaneSize().cols;
  const [cols, setCols] = useState<number | null>(null);
  const el = ref?.current ?? null;
  useEffect(() => {
    const n = nodeOf(ref?.current ?? null);
    if (!n) return;
    return watchWidth(n, (w) => { if (w > 0) setCols((c) => (c === w ? c : w)); });
  }, [ref, el]);
  return (cols ?? pane) * CELL_PX < px;
};
/** A terminal is never a tab left and come back to. */
export const useReloadOnReturn: typeof Web.useReloadOnReturn = () => {};
