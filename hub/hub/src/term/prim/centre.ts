// `align-items: center` in a row, rounded toward the top. Centring a child in a line leaves (line height − child
// height) rows over; when that is odd the engine rounds the half row DOWN the screen (Yoga rounds 0.5 up), so a 1-row
// mark beside 2-row words sat on the words' second line (logs spike band: "! minutes)."). A reader takes the first
// line as the item's line: the half row goes below instead. Done per frame as a paint offset (translateY, as sticky
// does): the layout is untouched, and only a child the engine placed exactly half a row low moves, by one row up.
import { useLayoutEffect, type RefObject } from 'react';
import { parseAlign, parseWrap } from '@opentui/core';

export interface CentreKid {
  x: number; y: number; width: number; height: number; translateY: number;
  isDestroyed?: boolean;
  getPositionType?: () => unknown;
  getAlignSelf?: () => unknown;
  _positionType?: string;
  __hxSticky?: boolean;
}

export interface CentreRow {
  y: number; height: number; translateY: number;
  isDestroyed?: boolean;
  getChildren?: () => unknown[];
  getFlexWrap?: () => unknown;
  onLifecyclePass?: (() => void) | null;
}

/** One kid's natural place: rows from the row's top, as laid out (paint offsets removed). */
export interface Placed { top: number; height: number; x: number }

/** The paint offset (0 or −1) for each placed kid of a centring row. `content`: the row's content box (rows from its
 *  top, padding and border off) when the row is one line; null when it wraps (each line is as tall as its tallest
 *  kid, which sits at the line's top). */
export function centreUp(kids: readonly Placed[], content: { top: number; height: number } | null): number[] {
  const out = kids.map(() => 0);
  // Lines: one line unless wrapping; a wrapped line starts where a kid begins at or left of the one before it.
  const lines: number[][] = [];
  kids.forEach((k, i) => {
    const prev = i > 0 ? kids[i - 1]! : null;
    if (!lines.length || (content === null && prev !== null && k.x <= prev.x)) lines.push([]);
    lines[lines.length - 1]!.push(i);
  });
  for (const line of lines) {
    let top: number;
    let height: number;
    if (content) ({ top, height } = content);
    else {
      const tall = line.reduce((a, i) => (kids[i]!.height > kids[a]!.height ? i : a), line[0]!);
      top = kids[tall]!.top;
      height = kids[tall]!.height;
    }
    for (const i of line) {
      const left = height - kids[i]!.height;
      if (left > 0 && left % 2 === 1 && kids[i]!.top - top === (left + 1) / 2) out[i] = -1;
    }
  }
  return out;
}

const AUTO = parseAlign('auto');
const CENTER = parseAlign('center');
const NO_WRAP = parseWrap('nowrap');

/** Hooks the centring pass onto the row `n`'s lifecycle pass; returns the unhook. */
export function attachCentreUp(n: CentreRow, padTop: number, padBottom: number): () => void {
  const moved = new Set<CentreKid>();
  const pass = (): void => {
    if (n.isDestroyed) return;
    const all = (n.getChildren?.() ?? []) as CentreKid[];
    const kids = all.filter((k) => !k.isDestroyed && !k.__hxSticky && k._positionType !== 'absolute'
      && (k.getAlignSelf === undefined || k.getAlignSelf() === AUTO || k.getAlignSelf() === CENTER));
    const rowTop = n.y;
    const placed = kids.map((k) => ({ top: k.y - k.translateY - rowTop, height: k.height, x: k.x }));
    const wraps = n.getFlexWrap !== undefined && n.getFlexWrap() !== NO_WRAP;
    const offs = centreUp(placed, wraps ? null : { top: padTop, height: n.height - padTop - padBottom });
    const now = new Set<CentreKid>();
    kids.forEach((k, i) => {
      const off = offs[i]!;
      if (off !== 0) { now.add(k); if (k.translateY !== off) k.translateY = off; }
    });
    for (const k of moved) if (!now.has(k) && !k.isDestroyed && k.translateY !== 0) k.translateY = 0;
    moved.clear();
    for (const k of now) moved.add(k);
  };
  // Chained after whatever was there. Leaving, unhook only while still the chain's top: a pass chained on after this
  // one (useDrawnChildren, a width measure) would be dropped by putting `before` back; otherwise stay as a dead link.
  let alive = true;
  const before = n.onLifecyclePass ?? null;
  const mine = (): void => { before?.(); if (alive) pass(); };
  n.onLifecyclePass = mine;
  return () => {
    alive = false;
    if (!n.isDestroyed && n.onLifecyclePass === mine) n.onLifecyclePass = before;
    for (const k of moved) if (!k.isDestroyed) k.translateY = 0;
  };
}

/** While mounted (`on`), the row behind `node` rounds its centred kids toward the top (see above). `padTop` /
 *  `padBottom`: its own padding plus border, in rows. */
export function useCentreUp(node: RefObject<unknown> | (() => unknown), on: boolean, padTop: number, padBottom: number): void {
  useLayoutEffect(() => {
    if (!on) return;
    const n = (typeof node === 'function' ? node() : node.current) as CentreRow | null;
    return n ? attachCentreUp(n, padTop, padBottom) : undefined;
  }, [node, on, padTop, padBottom]);
}
