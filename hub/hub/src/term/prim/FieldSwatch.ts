// FieldSwatch: a DATA colour (one a person picked and the API stores: a computer's or realm's colour, a ColorPicker
// preset) drawn as a two-cell block. It is the one path for a colour that is not a Hub token (tokens.ts holds those), the
// terminal's form of the web's exception for user colours (app/conformance/exceptions.ts, kit/forms/ColorPicker.tsx).
// - Only '#RRGGBB' / '#RGB' is drawn; anything else draws nothing (never a guess).
// - truecolor: the colour itself; ansi16: the nearest of xterm's 16 (the terminal maps them onto its own); mono: nothing.
// - It never carries meaning alone: a caller always draws the colour's name or hex beside it, so the
//   choice still reads in mono. It is decoration for the semantics tree (no role, no name).
import type { ReactElement } from 'react';
import { el } from './otui';
import { colourTier } from './tokens';
import { useInText } from './Text';

/** xterm's default 16-colour palette, in index order: the targets of the ansi16 tier. */
const XTERM16: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0], [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
  [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0], [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
];

/** xterm indexes by hue sextant (red, yellow, green, cyan, blue, magenta): normal and bright. */
const NORMAL: readonly number[] = [1, 3, 2, 6, 4, 5];
const BRIGHT: readonly number[] = [9, 11, 10, 14, 12, 13];

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** The colour as '#rrggbb' when it is one ('#RGB' expanded), else null. */
export function dataHex(value: string | null | undefined): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? '').trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return '#' + h.toLowerCase();
}

/** What to draw a data colour with at the current tier: the hex, its nearest xterm 16, or undefined (mono / not a colour). */
export function dataColourAtTier(value: string | null | undefined): string | undefined {
  const h = dataHex(value);
  if (!h || colourTier() === 'mono') return undefined;
  if (colourTier() === 'truecolor') return h;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  // A colour with a clear hue keeps its hue: plain RGB distance sends pastels (Coral, Plum, Sage) to grey or blue. So a
  // saturated colour takes the xterm hue nearest its own (red, yellow, green, cyan, blue, magenta), bright when light;
  // a grey takes the nearest of black, the two greys and white. HSL as in CSS.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 510;
  const c = (max - min) / 255;
  const sat = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
  let best: number;
  if (sat > 0.2) {
    const hue = max === r ? (((g - b) / (max - min)) % 6 + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    const sextant = Math.round(hue) % 6; // 0 red, 1 yellow, 2 green, 3 cyan, 4 blue, 5 magenta
    best = (l > 0.55 ? BRIGHT : NORMAL)[sextant]!;
  } else {
    const greys = [0, 8, 7, 15];
    best = greys.reduce((a, i) => (Math.abs(XTERM16[i]![0] - (r + g + b) / 3) < Math.abs(XTERM16[a]![0] - (r + g + b) / 3) ? i : a), 0);
  }
  const [R, G, B] = XTERM16[best]!;
  return '#' + hex2(R) + hex2(G) + hex2(B);
}

export interface FieldSwatchProps {
  /** The data colour ('#RRGGBB' or '#RGB'). */
  value: string | null | undefined;
  /** Cells wide (default 2: one square-ish block). */
  cells?: number;
}

/** The block, or nothing when the colour cannot be drawn. Inline inside a Text, a text node of its own outside one. */
export function FieldSwatch({ value, cells = 2 }: FieldSwatchProps): ReactElement | null {
  const inside = useInText();
  const fg = dataColourAtTier(value);
  if (fg === undefined) return null;
  const block = '█'.repeat(Math.max(1, cells));
  return inside ? el('span', { fg }, block) : el('text', { fg, wrapMode: 'none', flexShrink: 0 }, block);
}

// Stays inside a text run, as the web's inline swatch does (term/jsx/dom.ts isInlineComponent).
(FieldSwatch as { hxInline?: boolean }).hxInline = true;
