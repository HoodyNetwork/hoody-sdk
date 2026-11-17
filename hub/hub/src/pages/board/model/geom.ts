// Where tiles and dividers sit in pixels, and whether a layout fits. Pure.
//
// Contract, in plain words:
//   - The Board area has PAD px of padding and GAP px between tiles. tileBoxes(layout, w, h) gives every slot's
//     box in px; a tile's edge that touches another tile gives up GAP/2, an outer edge none.
//   - fits(layout, w, h) is true when every tile gets at least 240 x 160 px. When it is false the view shows one
//     tile at a time; the saved layout is never changed by width.
//   - presetFits(preset, w, h) judges a preset at even ratios (what applying it gives).
//   - dividers(layout, w, h) lists each split's divider: its tree path, direction, the line's box (the GAP between
//     the two sides) and the split's own length along its direction (for dragRatio).
//   - readingOrder is the slot order (left→right, top→bottom by tree order): chips, presets and labels follow it.
//   - A Board that pages (the view decides when) shows pages of the reading order at a fixed stride: pageCapacity tiles
//     each, so a tile's page never depends on the tiles after it. boardPages gives the pages, the one holding the active
//     slot and that page's layout: a preset for its count. The page comes from the active slot alone, so what the keys
//     act on is always on screen. The saved layout is never changed by paging.
import { equalise, isSlot, MIN_TILE, presetTree, PRESET_SLOTS, rects, slots, type Dir, type Node, type Path, type Preset, type Rect } from './tree';

export const PAD = 4;
export const GAP = 4;
const EPS = 1e-9;

export interface Box { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

/** Every slot's box in px inside a w x h Board area. */
export function tileBoxes(layout: Node, w: number, h: number): Record<string, Box> {
  const iw = Math.max(0, w - 2 * PAD), ih = Math.max(0, h - 2 * PAD);
  const out: Record<string, Box> = {};
  for (const [slot, r] of Object.entries(rects(layout))) {
    const l = r.x > EPS ? GAP / 2 : 0, rt = r.x + r.w < 1 - EPS ? GAP / 2 : 0;
    const t = r.y > EPS ? GAP / 2 : 0, b = r.y + r.h < 1 - EPS ? GAP / 2 : 0;
    out[slot] = { left: PAD + r.x * iw + l, top: PAD + r.y * ih + t, width: Math.max(0, r.w * iw - l - rt), height: Math.max(0, r.h * ih - t - b) };
  }
  return out;
}

/** Every tile gets MIN_TILE at this size. */
export function fits(layout: Node, w: number, h: number): boolean {
  return Object.values(tileBoxes(layout, w, h)).every((b) => b.width + EPS >= MIN_TILE.w && b.height + EPS >= MIN_TILE.h);
}

export function presetFits(preset: Preset, w: number, h: number): boolean {
  const ids = Array.from({ length: PRESET_SLOTS[preset] }, (_, i) => 's' + i);
  return fits(equalise(presetTree(preset, ids)), w, h);
}

export interface Divider {
  readonly path: Path;
  readonly dir: Dir;
  readonly ratio: number;
  /** The gap between the two sides, in px. */
  readonly box: Box;
  /** The split's own length along its direction, in px (for dragRatio). */
  readonly length: number;
  /** The split's start along its direction, in px (pointer → ratio). */
  readonly start: number;
  /** The slots on each side (for the accessible name). */
  readonly a: readonly string[];
  readonly b: readonly string[];
}

export function dividers(layout: Node, w: number, h: number): Divider[] {
  const iw = Math.max(0, w - 2 * PAD), ih = Math.max(0, h - 2 * PAD);
  const out: Divider[] = [];
  const walk = (n: Node, r: Rect, path: Array<'a' | 'b'>) => {
    if (isSlot(n)) return;
    if (n.dir === 'row') {
      const x = PAD + (r.x + r.w * n.ratio) * iw;
      out.push({ path, dir: n.dir, ratio: n.ratio, box: { left: x - GAP / 2, top: PAD + r.y * ih, width: GAP, height: r.h * ih }, length: r.w * iw, start: PAD + r.x * iw, a: slots(n.a), b: slots(n.b) });
      walk(n.a, { ...r, w: r.w * n.ratio }, [...path, 'a']);
      walk(n.b, { ...r, x: r.x + r.w * n.ratio, w: r.w * (1 - n.ratio) }, [...path, 'b']);
    } else {
      const y = PAD + (r.y + r.h * n.ratio) * ih;
      out.push({ path, dir: n.dir, ratio: n.ratio, box: { left: PAD + r.x * iw, top: y - GAP / 2, width: r.w * iw, height: GAP }, length: r.h * ih, start: PAD + r.y * ih, a: slots(n.a), b: slots(n.b) });
      walk(n.a, { ...r, h: r.h * n.ratio }, [...path, 'a']);
      walk(n.b, { ...r, y: r.y + r.h * n.ratio, h: r.h * (1 - n.ratio) }, [...path, 'b']);
    }
  };
  walk(layout, { x: 0, y: 0, w: 1, h: 1 }, []);
  return out;
}

/** The zone of a tile a pointer is over while dragging another tile onto it: the middle half swaps, edge bands split. */
export function dropZone(box: Box, x: number, y: number): 'centre' | 'left' | 'right' | 'up' | 'down' | null {
  const fx = (x - box.left) / box.width, fy = (y - box.top) / box.height;
  if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null;
  if (fx >= 0.25 && fx <= 0.75 && fy >= 0.25 && fy <= 0.75) return 'centre';
  // The nearest edge wins in the bands.
  const d = { left: fx, right: 1 - fx, up: fy, down: 1 - fy };
  return (Object.entries(d) as Array<[keyof typeof d, number]>).sort((p, q) => p[1] - q[1])[0]![0];
}

/** A ratio as the nearest simple fraction label for the drag caption ("1/3"), else a percentage. */
export function ratioLabel(r: number): string {
  for (const [n, d] of [[1, 4], [1, 3], [1, 2], [2, 3], [3, 4]] as const) if (Math.abs(r - n / d) < 1e-6) return n + '/' + d;
  return Math.round(r * 100) + '%';
}

/** The slot order (reading order) of a layout. */
export const readingOrder = (layout: Node): string[] => slots(layout);

export type PageCapacity = 1 | 2 | 4;

/** How many tiles a page shows at this size: every one at MIN_TILE. */
export function pageCapacity(w: number, h: number): PageCapacity {
  return presetFits('grid', w, h) ? 4 : presetFits('two-side', w, h) ? 2 : 1;
}

const PAGE_PRESET: Readonly<Record<number, Preset>> = { 1: 'one', 2: 'two-side', 3: 'one-two', 4: 'grid' };

/** A page's layout over its slots (1 to 4, in reading order): the preset for that count, which reads in that order. */
export function pageLayout(ids: readonly string[]): Node {
  return presetTree(PAGE_PRESET[ids.length] as Preset, ids);
}

export interface BoardPages {
  readonly pages: ReadonlyArray<readonly string[]>;
  /** The page the active slot is on. */
  readonly index: number;
  readonly slots: readonly string[];
  readonly layout: Node;
  /** Every slot's box on its own page: a tile off the page keeps the size it has on its page, so a page flip resizes no frame. */
  readonly boxes: Readonly<Record<string, Box>>;
}

/** The page holding the active slot, as drawn: what the arrows and swaps move over. */
export function pageLayoutOf(layout: Node, active: string, capacity: PageCapacity): Node {
  const order = readingOrder(layout);
  const start = Math.floor(Math.max(0, order.indexOf(active)) / capacity) * capacity;
  return pageLayout(order.slice(start, start + capacity));
}

/** The layout's slots as pages of `capacity` tiles in a w x h area, on the page of the active slot. */
export function boardPages(layout: Node, active: string, capacity: PageCapacity, w: number, h: number): BoardPages {
  const order = readingOrder(layout);
  const pages: string[][] = [];
  for (let i = 0; i < order.length; i += capacity) pages.push(order.slice(i, i + capacity));
  const index = Math.floor(Math.max(0, order.indexOf(active)) / capacity);
  const here = pages[index] as string[];
  return { pages, index, slots: here, layout: pageLayout(here), boxes: Object.assign({}, ...pages.map((p) => tileBoxes(pageLayout(p), w, h))) as Record<string, Box> };
}

/** The slot that takes over when `slot` closes on a Board paged at `capacity`: the next one on its page, else the one before
 *  it in reading order (on its page, or the last of the page before). Undefined when it is the only slot or not there. */
export function pageHeir(layout: Node, slot: string, capacity: PageCapacity): string | undefined {
  const order = readingOrder(layout);
  const i = order.indexOf(slot);
  if (i < 0) return undefined;
  const sameNext = (i + 1) % capacity !== 0 ? order[i + 1] : undefined;
  return sameNext ?? order[i - 1];
}
