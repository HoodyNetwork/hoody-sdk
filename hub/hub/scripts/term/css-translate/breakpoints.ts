// WIDTH BANDS. A stylesheet's @media and @container width conditions compare the viewport's or a container's width
// with a handful of lengths (600px, 768px, ...). Between two neighbouring lengths no condition changes, so every width
// in such a range, a band, gives the same translation. A table is built per band (real px = cells x CELL_W_PX), never
// per coarse "narrow / medium / wide" class: at 80 columns (640 px) `@container guide (width < 760px)` is true.
//
// Two widths are judged: the viewport's for @media, the page pane's for @container (every container, named or not: a
// container narrower than the pane, a card in a grid, is still judged by the pane; report.ts counts those).
import { toPx } from './units';

/** The lengths (px, ascending, unique) width conditions compare with. */
export interface Thresholds { media: number[]; container: number[] }

const AT = /@(media|container)\s+([^{;]+)\{/g;
const FEATURE = /\(([^()]*)\)/g;
const LENGTH = /(-?\d*\.?\d+)(px|rem|em)\b/g;

const uniq = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

/** Every length a width condition of this stylesheet compares with. */
export function thresholdsOf(css: string): Thresholds {
  const media: number[] = [];
  const container: number[] = [];
  for (const at of css.matchAll(AT)) {
    const into = at[1] === 'media' ? media : container;
    for (const f of at[2]!.matchAll(FEATURE)) {
      const text = f[1]!;
      if (!/\b(width|inline-size)\b/.test(text)) continue;
      for (const l of text.matchAll(LENGTH)) { const px = toPx(Number(l[1]), l[2]!); if (px !== undefined && Number.isFinite(px)) into.push(px); }
    }
  }
  return { media: uniq(media), container: uniq(container) };
}

export function mergeThresholds(list: Iterable<Thresholds>): Thresholds {
  const media: number[] = [];
  const container: number[] = [];
  for (const t of list) { media.push(...t.media); container.push(...t.container); }
  return { media: uniq(media), container: uniq(container) };
}

/** The band of a width among thresholds, named by its lower edge in px (0 below the first): `600` is every width over
 *  600 px up to the next length. A width exactly on a length is a band of its own, `640e` (`width < 640px` is false
 *  there and `width <= 640px` true). Named by px, never by position: a new length in a stylesheet then renames only
 *  the band it splits, and no cached table of one band is read as another's. */
export function bandOf(px: number, thresholds: readonly number[]): string {
  let floor = 0;
  for (const t of thresholds) { if (t === px) return `${px}e`; if (t < px && t > floor) floor = t; }
  return `${floor}`;
}

/** The key of a table: the viewport's band among @media lengths, the pane's among @container lengths. */
export const bandKey = (viewportPx: number, containerPx: number, t: Thresholds): string => `m${bandOf(viewportPx, t.media)}c${bandOf(containerPx, t.container)}`;
