// How tall a Board's area is in Scroll mode. Pure.
//
// Contract, in plain words:
//   - Fit (the default, mode absent) keeps the area the view's height: the layout's ratios share it.
//   - Scroll keeps the width but lets the area grow taller than the view, so every tile gets at least the slot
//     height: what each of two stacked tiles gets in the view, never under MIN_TILE.h, never over the view's inner
//     height. A layout that already gives every tile that much stays the view's height.
//   - The ratios are kept: the area grows until the smallest tile (for its share of the height and its gaps) reaches
//     the slot height. tileBoxes, fits and dividers then take the grown height as they take the view's in Fit.
import { fits, GAP, PAD } from '../model/geom';
import { equalise, MIN_TILE, presetTree, PRESET_SLOTS, rects, type Node, type Preset } from '../model/tree';
import type { BoardMode } from './mode';

const EPS = 1e-9;

/** The height each tile gets at least in Scroll mode, for a view viewH px tall. */
export function scrollSlot(viewH: number): number {
  const inner = Math.max(0, viewH - 2 * PAD);
  return Math.min(inner, Math.max(MIN_TILE.h, (viewH - 2 * PAD - GAP) / 2));
}

/** The area's height in Scroll mode: at least the view's, tall enough that every tile gets the slot height. */
export function scrollHeight(layout: Node, viewH: number): number {
  const slot = scrollSlot(viewH);
  if (slot <= 0) return viewH;
  let inner = 0;
  for (const r of Object.values(rects(layout))) {
    const gaps = (r.y > EPS ? GAP / 2 : 0) + (r.y + r.h < 1 - EPS ? GAP / 2 : 0);
    if (r.h > EPS) inner = Math.max(inner, (slot + gaps) / r.h);
  }
  return Math.max(viewH, Math.ceil(inner - EPS + 2 * PAD));
}

/** The Board area's height for its mode. */
export function boardHeight(mode: BoardMode, layout: Node, viewH: number): number {
  return mode === 'scroll' ? scrollHeight(layout, viewH) : viewH;
}

/** Every tile gets MIN_TILE in this mode at this view size (Fit: the view's height; Scroll: the grown one). */
export function layoutFits(mode: BoardMode, layout: Node, w: number, viewH: number): boolean {
  return fits(layout, w, boardHeight(mode, layout, viewH));
}

/** A preset fits in this mode at this view size, judged at even ratios as presetFits is. */
export function presetFitsIn(mode: BoardMode, preset: Preset, w: number, viewH: number): boolean {
  const l = equalise(presetTree(preset, Array.from({ length: PRESET_SLOTS[preset] }, (_, i) => 's' + i)));
  return fits(l, w, boardHeight(mode, l, viewH));
}
