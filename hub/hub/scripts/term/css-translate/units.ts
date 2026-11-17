// THE UNIT MODEL. One constants block; every px → cell conversion in css-translate goes through the functions below.
//
// Nominal cell: 8 px wide x 16 px tall (a 13 px body font in a 20 px line box is about one 16 px row; a monospace cell
// is about half as wide as tall). Three scales, chosen by what the length MEANS, not one formula for everything:
//
// 1. SPACE (gap, row-gap, column-gap, padding, margin): stepped tables (held in src/term/prim/tokens.ts SPACE, shared with the
//    runtime's cols()/rows()) that keep the first terminal kit's values on the --sp-* scale (GAP_COLS = [0,1,1,1,2,2,3,3,4], GAP_ROWS = [0,0,0,1,1,1,2,2,2]
//    for --sp-0..--sp-8 = 0,4,8,12,16,20,24,32,40 px; PADDING sm = 8 px → x1 y0, md = 16 px → x2 y1).
//    - Horizontal: any spacing of 3 px or more is at least one column. Between inline items (icon + label, chips in a
//      row, cells of a table row) zero columns glues words together ("Running12 ports"), so 4 px (--sp-1) and 8 px
//      (--sp-2) both become 1, 16 px 2, 24 px 3; above 24 px it grows by one column per 16 px (32 → 3, 40 → 4) so big
//      page gutters do not eat a narrow terminal. 2 px (--sp-half) and 1 px hairlines are 0.
//    - Vertical: below 12 px is 0 rows. --sp-1/--sp-2 (4/8 px) between stacked lines are under half a 20 px line box;
//      giving them a row would double the height of every list and form (the measured page CSS uses --sp-2 as the
//      stacking gap in most flex columns, see the css-translate report, section "unit model"), and a 40-row terminal cannot afford
//      it. 12-20 px (--sp-3 = --gap-block, --sp-4, --sp-5) is one blank row: the block separation survives. 24-40 px
//      (--gap-between-sections, --gap-category) is 2; above that one more row per 24 px.
// 2. SIZE (width, height, min/max, flex-basis, grid tracks): linear, round half DOWN (a terminal is narrow; at a tie the
//    narrower box wins), at least 1 for any positive length. Vertical sizes under 64 px are ONE row: they are a text
//    line plus control chrome (32/36/40/44/48 px controls and rows, a 56 px bar), and the terminal draws that line
//    without chrome. From 64 px on, rows = px / 16 (a textarea's 80 px → 5 rows).
// 3. OFFSET (top/right/bottom/left): linear, round half down, no minimum (top: 4px → 0, left: 240px → 30).
//
// Other units: ch = 1 column (exact); rem = 16 px; em = 13 px (the body font, --t-body); ex = em / 2; % passes through
// as a Yoga percent; fr only inside grid templates (grid.ts); vw/vh/cq*/dvh/svh/lvh are NOT expressible (no viewport
// or container unit in Yoga) and are reported, never guessed.
// Keywords: auto → 'auto' where Yoga takes it; min-content / max-content / fit-content are reported (Yoga sizes an auto
// box from content in its main axis but stretches it on the cross axis; no keyword says "shrink-wrap").

import { SPACE, spaceCells as sharedSpaceCells } from '../../../src/term/prim/tokens';

export const UNIT = {
  CELL_W_PX: SPACE.CELL_W_PX,
  CELL_H_PX: SPACE.CELL_H_PX,
  REM_PX: 16,
  EM_PX: 13,
  /** The spacing steps live in src/term/prim/tokens.ts (SPACE), the one scale the runtime and this translator share. */
  SPACE_COL_STEPS: SPACE.COL_STEPS,
  SPACE_COL_TAIL_PX: SPACE.COL_TAIL_PX,
  SPACE_ROW_STEPS: SPACE.ROW_STEPS,
  SPACE_ROW_TAIL_PX: SPACE.ROW_TAIL_PX,
  /** Vertical sizes strictly below this are one row (a line plus control chrome). */
  SIZE_ONE_ROW_BELOW_PX: 64,
  /** Lengths under this many px are hairlines (borders, 2 px bars). */
  HAIRLINE_PX: 3,
} as const;

export type Axis = 'h' | 'v';

/** Round half down (2.5 → 2, -2.5 → -2: toward zero at a tie). */
export function roundHalfDown(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const f = Math.floor(a);
  return s * (a - f > 0.5 ? f + 1 : f);
}

/** Spacing (gap/padding/margin) px → cells: the runtime's own function, so the two cannot drift. */
export const spaceCells: (px: number, axis: Axis) => number = sharedSpaceCells;

/** Size (width/height/min/max/basis/track) px → cells. */
export function sizeCells(px: number, axis: Axis): number {
  if (px <= 0) return 0;
  if (axis === 'h') return Math.max(1, roundHalfDown(px / UNIT.CELL_W_PX));
  if (px < UNIT.SIZE_ONE_ROW_BELOW_PX) return 1;
  return Math.max(1, roundHalfDown(px / UNIT.CELL_H_PX));
}

/** Offset (top/left/...) px → cells. */
export function offsetCells(px: number, axis: Axis): number {
  const c = roundHalfDown(px / (axis === 'h' ? UNIT.CELL_W_PX : UNIT.CELL_H_PX));
  return c === 0 ? 0 : c; // no -0
}

/** A unit-bearing length → px (ch → CELL_W_PX per ch, so /8 gives the ch count back exactly). Undefined when the
 *  unit has no px meaning here (%, fr, viewport and container units). */
export function toPx(n: number, unit: string): number | undefined {
  switch (unit.toLowerCase()) {
    case '':
      return n === 0 ? 0 : undefined;
    case 'px':
      return n;
    case 'rem':
      return n * UNIT.REM_PX;
    case 'em':
      return n * UNIT.EM_PX;
    case 'ex':
      return (n * UNIT.EM_PX) / 2;
    case 'ch':
      return n * UNIT.CELL_W_PX;
    case 'lh':
      return n * UNIT.CELL_H_PX;
    case 'pt':
      return (n * 4) / 3;
    default:
      return undefined;
  }
}

/** The documented model, embedded in the output table. */
export const UNIT_MODEL_DOC = {
  cell: `${UNIT.CELL_W_PX}px x ${UNIT.CELL_H_PX}px`,
  space:
    'gap/padding/margin: columns 0 (<3px), 1 (3-13), 2 (14-21), 3 (22-35), 4 (36-47), +1 per 16px over 40; rows 0 (<12px), 1 (12-23), 2 (24-47), +1 per 24px over 24. The runtime\'s own function (src/term/prim/tokens.ts spaceCells).',
  size: `width/height/min/max/basis: columns = px/8 rounded half down (>=1); rows = 1 below ${UNIT.SIZE_ONE_ROW_BELOW_PX}px, else px/16 rounded half down`,
  offset: 'top/right/bottom/left: px/8 or px/16, rounded half down, may be 0',
  units: `ch = 1 column; rem = ${UNIT.REM_PX}px; em = ${UNIT.EM_PX}px; % passes through; vw/vh/cq* not expressible`,
};
