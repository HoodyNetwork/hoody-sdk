// Unit model: the spacing scale must equal the terminal kit's prior art on the --sp-* tokens.
import { describe, expect, test } from 'bun:test';
import { cols, rows, SP_PX, type Gap } from '../../../src/term/prim/tokens';
import { offsetCells, roundHalfDown, sizeCells, spaceCells, toPx, UNIT } from './units';

// The scale's values on the --sp-* tokens, pinned. The scale itself lives in src/term/prim/tokens.ts (SPACE); the
// runtime's cols()/rows() and this translator read the same one (checked below).
const GAP_ROWS = [0, 0, 0, 1, 1, 1, 2, 2, 2];
const GAP_COLS = [0, 1, 1, 1, 2, 2, 3, 3, 4];
const PADDING = { sm: { x: 1, y: 0 }, md: { x: 2, y: 1 } };

const SP = [0, 4, 8, 12, 16, 20, 24, 32, 40]; // --sp-0..--sp-8 (tokens.css)

describe('spacing scale', () => {
  test('gives the pinned columns and rows on --sp-0..8', () => {
    expect(SP.map((px) => spaceCells(px, 'h'))).toEqual([...GAP_COLS]);
    expect(SP.map((px) => spaceCells(px, 'v'))).toEqual([...GAP_ROWS]);
  });
  test('the runtime scale is the same scale', () => {
    for (const g of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as Gap[]) {
      expect(cols(g)).toBe(spaceCells(SP_PX[g], 'h'));
      expect(rows(g)).toBe(spaceCells(SP_PX[g], 'v'));
    }
  });
  test('equals PADDING sm (8px) and md (16px)', () => {
    expect({ x: spaceCells(8, 'h'), y: spaceCells(8, 'v') }).toEqual(PADDING.sm);
    expect({ x: spaceCells(16, 'h'), y: spaceCells(16, 'v') }).toEqual(PADDING.md);
  });
  test('hairlines and odd values', () => {
    expect(spaceCells(1, 'h')).toBe(0);
    expect(spaceCells(2, 'h')).toBe(0); // --sp-half
    expect(spaceCells(3, 'h')).toBe(1); // --tabs-gap
    expect(spaceCells(6, 'h')).toBe(1); // --gap-dot
    expect(spaceCells(14, 'h')).toBe(2);
    expect(spaceCells(11, 'v')).toBe(0);
    expect(spaceCells(48, 'v')).toBe(3); // --sp-9
    expect(spaceCells(64, 'h')).toBe(5); // --sp-10
    expect(spaceCells(64, 'v')).toBe(3);
  });
  test('negative spacing mirrors', () => {
    expect(spaceCells(-8, 'h')).toBe(-1);
    expect(spaceCells(-1, 'h') === 0).toBe(true);
  });
});

describe('size scale', () => {
  test('widths are linear, half down, at least 1', () => {
    expect(sizeCells(240, 'h')).toBe(30); // --sidebar-w
    expect(sizeCells(20, 'h')).toBe(2); // 2.5 → 2
    expect(sizeCells(28, 'h')).toBe(3); // 3.5 → 3
    expect(sizeCells(1, 'h')).toBe(1);
    expect(sizeCells(0, 'h')).toBe(0);
  });
  test('heights under 64px are one row, then px/16', () => {
    for (const px of [16, 32, 36, 40, 44, 48, 56, 63]) expect(sizeCells(px, 'v')).toBe(1);
    expect(sizeCells(64, 'v')).toBe(4);
    expect(sizeCells(80, 'v')).toBe(5); // --field-textarea-min-h
    expect(sizeCells(200, 'v')).toBe(12); // 12.5 → 12
  });
  test('offsets are linear and may be 0', () => {
    expect(offsetCells(4, 'v')).toBe(0);
    expect(offsetCells(8, 'v')).toBe(0);
    expect(offsetCells(12, 'v')).toBe(1);
    expect(offsetCells(40, 'v')).toBe(2);
    expect(offsetCells(-12, 'h')).toBe(-1);
    expect(Object.is(offsetCells(-2, 'h'), -0)).toBe(false);
  });
  test('roundHalfDown', () => {
    expect([0.5, 1.5, 2.5, 2.51, -2.5].map(roundHalfDown)).toEqual([0, 1, 2, 3, -2]);
  });
});

describe('units', () => {
  test('ch is one column, rem 16px, em 13px', () => {
    expect(sizeCells(toPx(72, 'ch')!, 'h')).toBe(72); // --measure
    expect(toPx(1, 'rem')).toBe(UNIT.REM_PX);
    expect(toPx(2, 'em')).toBe(26);
    expect(sizeCells(toPx(15, 'rem')!, 'h')).toBe(30); // --field-w-sm
  });
  test('viewport, container and percent units have no px', () => {
    for (const u of ['vw', 'vh', 'cqi', '%', 'fr']) expect(toPx(10, u)).toBeUndefined();
    expect(toPx(0, '')).toBe(0);
    expect(toPx(3, '')).toBeUndefined();
  });
});
