// Terminal cells of a string where the runtime has no Bun.stringWidth (the same bundle under Node): the count Bun gives,
// from a table Bun itself wrote (widths.gen.ts, `bun scripts/term/widths.ts`). Under Bun, TableCells.ts and Caret.ts
// call Bun.stringWidth and this file is not used.
// A grapheme of one code point takes the table's width. A longer grapheme follows Bun's emoji rules: a keycap and a flag
// take 2; VS16, a ZWJ or a skin tone after a base that takes them makes one emoji of 2 cells, and what a ZWJ joins
// takes none; everything else adds up code point by code point. Escape sequences take no cells, skipped as Bun skips
// them (CSI, OSC, DCS/SOS/PM/APC strings, short escapes; 7- and 8-bit forms; ESC, CAN and SUB cut one short).
// width.term.test.ts checks every code point, the emoji sequences and the escape sequences against Bun.stringWidth.
import { JOINS, PICTOGRAPHIC, SKIN_BASE, VS16_WIDE, WIDE, ZERO } from './widths.gen';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Whether `cp` is in a list of [first, last] ranges (binary search). */
function inRanges(ranges: readonly number[], cp: number): boolean {
  let lo = 0;
  let hi = (ranges.length >> 1) - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (cp < ranges[2 * m]!) hi = m - 1;
    else if (cp > ranges[2 * m + 1]!) lo = m + 1;
    else return true;
  }
  return false;
}

const cellsOf = (cp: number): number => (inRanges(ZERO, cp) ? 0 : inRanges(WIDE, cp) ? 2 : 1);
const isSkin = (cp: number): boolean => cp >= 0x1f3fb && cp <= 0x1f3ff;
// The Unicode property, not a code point range: this file only measures flags; kit/flag.ts builds them.
const REGIONAL = /^\p{Regional_Indicator}$/u;
const isRegional = (cp: number): boolean => REGIONAL.test(String.fromCodePoint(cp));
const isTag = (cp: number): boolean => cp >= 0xe0020 && cp <= 0xe007f;
const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;

/** The cells of one grapheme, given as code points. */
function graphemeCells(all: readonly number[]): number {
  // Zero-cell code points at the start are skipped. Such a Prepend format character (U+0600-0605, U+06DD, U+070F,
  // U+08E2) joins the emoji after it into one grapheme; safeText drops it, so the rest is measured as it is drawn.
  let lead = 0;
  while (lead < all.length - 1 && inRanges(ZERO, all[lead]!)) lead++;
  const cps = lead === 0 ? all : all.slice(lead);
  if (cps.length === 1) return cellsOf(cps[0]!);
  if (cps.includes(KEYCAP)) return 2;
  if (isRegional(cps[0]!) && !cps.some(isSkin)) return 2;
  let cells = 0;
  let unit = 0; // cells of the current base
  let emoji = false; // the current base is an emoji a ZWJ can join onto
  let prev = -1;
  for (const cp of cps) {
    if (cp === VS16) {
      if (prev >= 0 && unit === 1 && inRanges(VS16_WIDE, prev)) { cells += 1; unit = 2; emoji = true; } else if (prev >= 0 && inRanges(PICTOGRAPHIC, prev)) emoji = true;
    } else if (cp === VS15 || isTag(cp)) {
      // no cells
    } else if (cp === ZWJ) {
      if (prev >= 0 && inRanges(JOINS, prev)) { if (unit === 1) { cells += 1; unit = 2; } emoji = true; }
    } else if (isSkin(cp) && prev >= 0 && inRanges(SKIN_BASE, prev)) {
      if (unit === 1) { cells += 1; unit = 2; }
      emoji = true;
    } else if (prev === ZWJ && emoji && inRanges(PICTOGRAPHIC, cp)) {
      // joined into the emoji before it
    } else {
      unit = cellsOf(cp);
      cells += unit;
      emoji = false;
    }
    prev = cp;
  }
  return cells;
}

const ESC = 0x1b;
const BEL = 0x07;
/** CAN and SUB cancel a sequence. */
const CAN = 0x18;
const SUB = 0x1a;
/** The 8-bit forms: CSI, ST, OSC, and the string introducers DCS, SOS, PM, APC. */
const CSI8 = 0x9b;
const ST8 = 0x9c;
const OSC8 = 0x9d;
const STRING8 = new Set([0x90, 0x98, 0x9e, 0x9f]);
/** After ESC: the letters that open a string (DCS P, SOS X, PM ^, APC _). */
const STRING7 = new Set([0x50, 0x58, 0x5e, 0x5f]);

/** Whether `s` holds anything that may start an escape sequence. */
function hasEscape(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === ESC || c === CSI8 || c === OSC8 || STRING8.has(c)) return true;
  }
  return false;
}

/** Where a control sequence ends: after its final byte, an ST, a CAN or a SUB; at an ESC, which starts what follows. */
function csiEnd(cps: readonly number[], j: number): number {
  for (; j < cps.length; j++) {
    const c = cps[j]!;
    if (c === ESC) return j;
    if (c === CAN || c === SUB || c === ST8 || (c >= 0x40 && c <= 0x7e)) return j + 1;
  }
  return j;
}

/** Where a string (OSC, DCS, SOS, PM, APC) ends: after its terminator, or at an ESC, which starts what follows. */
function stringEnd(cps: readonly number[], j: number, bel: boolean): number {
  for (; j < cps.length; j++) {
    const c = cps[j]!;
    if (c === ST8 || c === CAN || c === SUB || (bel && c === BEL)) return j + 1;
    if (c === ESC) return j;
  }
  return j;
}

/** `s` without the escape sequences Bun.stringWidth skips (7- and 8-bit forms). */
function visible(s: string): string {
  if (!hasEscape(s)) return s;
  const cps: number[] = [];
  for (const ch of s) cps.push(ch.codePointAt(0)!);
  let out = '';
  let i = 0;
  while (i < cps.length) {
    const c = cps[i]!;
    if (c === ESC) {
      const d = cps[i + 1];
      if (d === undefined) i += 1;
      else if (d === 0x5b) i = csiEnd(cps, i + 2);
      else if (d === 0x5d) i = stringEnd(cps, i + 2, true);
      else if (STRING7.has(d)) i = stringEnd(cps, i + 2, false);
      else if (d >= 0x20 && d <= 0x2f) i = cps[i + 2] === ESC ? i + 2 : Math.min(i + 3, cps.length);
      else if (d >= 0x30 && d <= 0x7e) i += 2;
      else i += 1;
    } else if (c === CSI8) i = csiEnd(cps, i + 1);
    else if (c === OSC8) i = stringEnd(cps, i + 1, true);
    else if (STRING8.has(c)) i = stringEnd(cps, i + 1, false);
    else { out += String.fromCodePoint(c); i += 1; }
  }
  return out;
}

/** Terminal cells `s` takes, as Bun.stringWidth counts them. */
export function portableWidth(s: string): number {
  let cells = 0;
  for (const { segment } of segmenter.segment(visible(s))) {
    const cps: number[] = [];
    for (const ch of segment) cps.push(ch.codePointAt(0)!);
    cells += graphemeCells(cps);
  }
  return cells;
}
