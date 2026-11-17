// Mark: the Hoody mark in cells (the web's `logo` icon, kit/icons.tsx: a filled square with the pixel h cut out of it:
// a stem on the left broken where the arch leaves it, the arch across and down on the right).
//   sm  3 x 1   a right half block, a heavy line and a heavy down-and-left corner (▐━┓): the stem as thick as half a
//               cell, the arch leaving it at mid height and turning down, written on the plate. As wide as it is tall
//               as seen, like the logo's h. The top bar's brand cell.
//   lg  14 x 7  full blocks and spaces only (a cell is half as wide as it is tall, so 14 x 7 is square). The lock
//               screen and any first screen with room for it.
// Colour: the plate and the cut are the theme's `markPlate` / `markCut` (tokens.ts). Without colour (the mono tier)
// nothing depends on it: `lg` is blocks in the terminal's own ink with the h left open, `sm` is the terminal's inverse.
// It is decoration: hidden from the semantics tree; the word beside it carries the name.
import { createElement, type ReactElement } from 'react';
import { Box } from './Box';
import { Text } from './Text';
import { colourTier } from './tokens';

/** `lg`, row by row: █ is the plate, a space is the cut. */
export const MARK_LG: readonly string[] = [
  '██████████████',
  '██  ██████████',
  '██  ██████████',
  '██  ██████████',
  '████        ██',
  '██  ██████  ██',
  '██████████████',
];
/** `sm`: the stem in the right half of its cell, the arch at mid height, turning down in the last cell. */
export const MARK_SM = '\u2590\u2501\u2513';
/** The box each size takes, in cells. */
export const MARK_SIZE = { sm: { cols: 3, rows: 1 }, lg: { cols: 14, rows: 7 } } as const;

export interface MarkProps {
  /** Default `sm`. `lg` falls back to `sm` when `fit` (the room there is, in cells) cannot hold it. */
  size?: keyof typeof MARK_SIZE;
  fit?: { cols: number; rows: number };
}

/** The size that is drawn: the one asked for when it fits (or no room was given), else `sm`. */
export function markSizeFor(size: keyof typeof MARK_SIZE, fit?: { cols: number; rows: number }): keyof typeof MARK_SIZE {
  const want = MARK_SIZE[size];
  return !fit || (fit.cols >= want.cols && fit.rows >= want.rows) ? size : 'sm';
}

export function Mark({ size = 'sm', fit }: MarkProps): ReactElement {
  const drawn = markSizeFor(size, fit);
  const { cols, rows } = MARK_SIZE[drawn];
  const mono = colourTier() === 'mono';
  if (drawn === 'sm') {
    return createElement(Box, { width: cols, height: rows, shrink: 0 },
      createElement(Text, { colour: 'markCut', bg: 'markPlate', inverse: mono, truncate: false, sem: { hidden: true } }, MARK_SM));
  }
  return createElement(Box, { dir: 'column', width: cols, height: rows, shrink: 0 },
    MARK_LG.map((line, i) => createElement(Text, { key: i, colour: 'markPlate', bg: 'markCut', truncate: false, sem: { hidden: true } }, line)));
}
