// The Board's layout: a split tree. Pure functions, no React, no I/O.
//
// Contract, in plain words:
//   - A layout is a slot (a leaf, named by its slot id) or a split: 'row' puts a beside b (a on the left), 'col'
//     puts a above b; ratio is a's share, strictly between 0 and 1. Every function returns a new tree.
//   - Geometry is in the unit square (rects); the view scales it. Pixel rules (minimum tile, snapping) take the
//     Board's size in pixels as input.
//   - Ratios set from the keyboard stay within RATIO_MIN..RATIO_MAX; pixel clamps keep every tile at least
//     MIN_TILE (240 x 160) where the Board is big enough, else split the room by the minimum sizes.
export type Dir = 'row' | 'col';
export interface SlotNode { readonly slot: string }
export interface SplitNode { readonly dir: Dir; readonly ratio: number; readonly a: Node; readonly b: Node }
export type Node = SlotNode | SplitNode;
export type Side = 'left' | 'right' | 'up' | 'down';
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export const RATIO_MIN = 0.1;
export const RATIO_MAX = 0.9;
export const MIN_TILE = { w: 240, h: 160 } as const;
export const SNAP_POINTS: readonly number[] = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
export const SNAP_PX = 12;

export const isSlot = (n: Node): n is SlotNode => 'slot' in n;
export const slotNode = (slot: string): SlotNode => ({ slot });
export const split = (dir: Dir, ratio: number, a: Node, b: Node): SplitNode => ({ dir, ratio, a, b });

/** Slot ids in reading order (depth first, a before b). */
export function slots(n: Node): string[] {
  return isSlot(n) ? [n.slot] : [...slots(n.a), ...slots(n.b)];
}

export function hasSlot(n: Node, slot: string): boolean {
  return isSlot(n) ? n.slot === slot : hasSlot(n.a, slot) || hasSlot(n.b, slot);
}

function mapSlot(n: Node, slot: string, f: (s: SlotNode) => Node): Node {
  if (isSlot(n)) return n.slot === slot ? f(n) : n;
  const a = mapSlot(n.a, slot, f), b = mapSlot(n.b, slot, f);
  return a === n.a && b === n.b ? n : { ...n, a, b };
}

/** Splits a slot: the new slot goes on `side` of it (right/down by default), each taking `ratio` of the room. */
export function splitSlot(n: Node, slot: string, fresh: string, side: Side = 'right'): Node {
  const dir: Dir = side === 'left' || side === 'right' ? 'row' : 'col';
  const before = side === 'left' || side === 'up';
  return mapSlot(n, slot, (s) => (before ? split(dir, 0.5, slotNode(fresh), s) : split(dir, 0.5, s, slotNode(fresh))));
}

/** The tree without a slot (its sibling takes the room); null when it was the only slot. */
export function removeSlot(n: Node, slot: string): Node | null {
  if (isSlot(n)) return n.slot === slot ? null : n;
  const a = removeSlot(n.a, slot), b = removeSlot(n.b, slot);
  if (a === null) return b;
  if (b === null) return a;
  return a === n.a && b === n.b ? n : { ...n, a, b };
}

/** Each slot's rectangle in the unit square. */
export function rects(n: Node, r: Rect = { x: 0, y: 0, w: 1, h: 1 }, out: Record<string, Rect> = {}): Record<string, Rect> {
  if (isSlot(n)) { out[n.slot] = r; return out; }
  if (n.dir === 'row') {
    const wa = r.w * n.ratio;
    rects(n.a, { x: r.x, y: r.y, w: wa, h: r.h }, out);
    rects(n.b, { x: r.x + wa, y: r.y, w: r.w - wa, h: r.h }, out);
  } else {
    const ha = r.h * n.ratio;
    rects(n.a, { x: r.x, y: r.y, w: r.w, h: ha }, out);
    rects(n.b, { x: r.x, y: r.y + ha, w: r.w, h: r.h - ha }, out);
  }
  return out;
}

const EPS = 1e-9;

/** The slot next to `slot` on that side (most shared edge, then nearest centre), or null at the Board's edge. */
export function neighbour(n: Node, slot: string, side: Side): string | null {
  const all = rects(n), me = all[slot];
  if (!me) return null;
  const horizontal = side === 'left' || side === 'right';
  let best: { id: string; overlap: number; dist: number } | null = null;
  for (const [id, r] of Object.entries(all)) {
    if (id === slot) continue;
    const touches = side === 'right' ? Math.abs(r.x - (me.x + me.w)) < EPS
      : side === 'left' ? Math.abs(r.x + r.w - me.x) < EPS
        : side === 'down' ? Math.abs(r.y - (me.y + me.h)) < EPS
          : Math.abs(r.y + r.h - me.y) < EPS;
    if (!touches) continue;
    const overlap = horizontal ? Math.min(me.y + me.h, r.y + r.h) - Math.max(me.y, r.y) : Math.min(me.x + me.w, r.x + r.w) - Math.max(me.x, r.x);
    if (overlap <= EPS) continue;
    const dist = horizontal ? Math.abs(r.y + r.h / 2 - (me.y + me.h / 2)) : Math.abs(r.x + r.w / 2 - (me.x + me.w / 2));
    if (!best || overlap > best.overlap + EPS || (Math.abs(overlap - best.overlap) <= EPS && dist < best.dist)) best = { id, overlap, dist };
  }
  return best ? best.id : null;
}

/** A split addressed by its path from the root ('a'/'b' steps). */
export type Path = ReadonlyArray<'a' | 'b'>;

export function nodeAt(n: Node, path: Path): Node | null {
  let cur: Node = n;
  for (const step of path) {
    if (isSlot(cur)) return null;
    cur = cur[step];
  }
  return cur;
}

/** Sets the ratio of the split at path (clamped to RATIO_MIN..RATIO_MAX); unchanged when path is not a split. */
export function setRatio(n: Node, path: Path, ratio: number): Node {
  if (!Number.isFinite(ratio)) return n;
  if (path.length === 0) return isSlot(n) ? n : { ...n, ratio: Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio)) };
  if (isSlot(n)) return n;
  const [step, ...rest] = path as Array<'a' | 'b'>;
  const child = setRatio(n[step as 'a' | 'b'], rest, ratio);
  return child === n[step as 'a' | 'b'] ? n : { ...n, [step as 'a' | 'b']: child };
}

/** The path to a slot (its ancestors' steps), or null. */
export function pathTo(n: Node, slot: string, at: Array<'a' | 'b'> = []): Array<'a' | 'b'> | null {
  if (isSlot(n)) return n.slot === slot ? at : null;
  return pathTo(n.a, slot, [...at, 'a']) ?? pathTo(n.b, slot, [...at, 'b']);
}

/**
 * Moves the divider on `side` of a slot by delta (keyboard resize, Alt+Shift+arrows): the nearest ancestor split
 * whose divider lies on that side of the slot. Unchanged when the slot touches the Board's edge there.
 */
export function resizeToward(n: Node, slot: string, side: Side, delta = 0.05): Node {
  const path = pathTo(n, slot);
  if (!path) return n;
  const dir: Dir = side === 'left' || side === 'right' ? 'row' : 'col';
  const want: 'a' | 'b' = side === 'right' || side === 'down' ? 'a' : 'b';
  for (let i = path.length - 1; i >= 0; i--) {
    const at = path.slice(0, i), s = nodeAt(n, at);
    if (s && !isSlot(s) && s.dir === dir && path[i] === want) {
      return setRatio(n, at, s.ratio + (want === 'a' ? delta : -delta));
    }
  }
  return n;
}

function weight(n: Node, dir: Dir): number {
  if (isSlot(n)) return 1;
  return n.dir === dir ? weight(n.a, dir) + weight(n.b, dir) : Math.max(weight(n.a, dir), weight(n.b, dir));
}

/** Every split sized so the slots along it share the room evenly (double-click a divider, `=`). */
export function equalise(n: Node): Node {
  if (isSlot(n)) return n;
  const wa = weight(n.a, n.dir), wb = weight(n.b, n.dir);
  return { ...n, ratio: wa / (wa + wb), a: equalise(n.a), b: equalise(n.b) };
}

/** The smallest size a subtree can take in pixels with every tile at MIN_TILE. */
export function minSize(n: Node): { w: number; h: number } {
  if (isSlot(n)) return { ...MIN_TILE };
  const a = minSize(n.a), b = minSize(n.b);
  return n.dir === 'row' ? { w: a.w + b.w, h: Math.max(a.h, b.h) } : { w: Math.max(a.w, b.w), h: a.h + b.h };
}

/**
 * A dragged ratio for the split at path, given the split's own length in pixels along its direction: snapped to
 * 1/4, 1/3, 1/2, 2/3, 3/4 within SNAP_PX, then clamped so both sides keep their minimum size (when the room is
 * smaller than both minimums, the room is shared in proportion to them).
 */
export function dragRatio(s: SplitNode, ratio: number, lengthPx: number): number {
  if (!Number.isFinite(ratio) || !(lengthPx > 0)) return s.ratio;
  let r = ratio;
  for (const p of SNAP_POINTS) if (Math.abs(r - p) * lengthPx <= SNAP_PX) { r = p; break; }
  const key = s.dir === 'row' ? 'w' : 'h';
  const minA = minSize(s.a)[key], minB = minSize(s.b)[key];
  if (minA + minB >= lengthPx) return minA / (minA + minB);
  return Math.min(1 - minB / lengthPx, Math.max(minA / lengthPx, r));
}

// ---- presets (Layout ▾) ----

export const PRESETS = ['one', 'two-side', 'two-stacked', 'one-two', 'grid', 'three-cols'] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_SLOTS: Readonly<Record<Preset, number>> = { one: 1, 'two-side': 2, 'two-stacked': 2, 'one-two': 3, grid: 4, 'three-cols': 3 };
/** Each preset's picture for the Layout menu (kit MenuThumb cells, [x, y, w, h] in grid units), drawn in the order and
 *  on the side `presetTree` places the slots: the Board places tiles by physical left, so a right-to-left page draws the
 *  same picture. */
export const PRESET_CELLS: Readonly<Record<Preset, readonly (readonly [number, number, number, number])[]>> = {
  one: [[0, 0, 1, 1]],
  'two-side': [[0, 0, 1, 1], [1, 0, 1, 1]],
  'two-stacked': [[0, 0, 1, 1], [0, 1, 1, 1]],
  'one-two': [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]],
  grid: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]],
  'three-cols': [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]],
};

/** The preset's tree over these slot ids (exactly PRESET_SLOTS[preset] of them, in reading order). */
export function presetTree(preset: Preset, ids: readonly string[]): Node {
  if (ids.length !== PRESET_SLOTS[preset]) throw new Error('preset ' + preset + ' takes ' + PRESET_SLOTS[preset] + ' slots');
  const [a, b, c, d] = ids.map(slotNode) as SlotNode[];
  switch (preset) {
    case 'one': return a as SlotNode;
    case 'two-side': return split('row', 0.5, a as Node, b as Node);
    case 'two-stacked': return split('col', 0.5, a as Node, b as Node);
    case 'one-two': return split('row', 0.5, a as Node, split('col', 0.5, b as Node, c as Node));
    case 'grid': return split('col', 0.5, split('row', 0.5, a as Node, b as Node), split('row', 0.5, c as Node, d as Node));
    case 'three-cols': return split('row', 1 / 3, a as Node, split('row', 0.5, b as Node, c as Node));
  }
}
