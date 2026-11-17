// Text: one run of styled text. Inside another Text it is an inline span, so text can nest as it does on the web.
import { createContext, createElement, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { RGBA } from '@opentui/core';
import { el, TextAttributes } from './otui';
import { colour, colourTier, ground, plainInk, textColour, type Colour } from './tokens';
import { safeLinkUrl } from './safe';
import { useSem, type Sem } from './semantics';
import { useFocusInkCtx } from './FocusInk';
import { useDefaultInk } from './DefaultInk';
import { cellWidth, cutCells } from './TableCells';

export interface TextProps {
  colour?: Colour;
  bg?: Colour;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strike?: boolean;
  /** One line, cut with an ellipsis when it does not fit. Default: wrap by word. */
  truncate?: boolean;
  /** Width to stretch or cap (cells). */
  width?: number | 'auto' | `${number}%`;
  grow?: number;
  shrink?: number;
  align?: 'left' | 'center' | 'right';
  /** At most this many lines (wrapped text past them is cut). */
  maxLines?: number;
  /** A web link (http/https only, see safe.ts): the terminal's own link (OSC 8) where it has them; never opened here. */
  href?: string;
  /** Semantics (root text only: an inline span takes no ref). */
  sem?: Sem;
  children?: ReactNode;
}

const InText = createContext(false);
/** Under a OneLine: 'cut' (each Text cuts itself) or 'clip' (Texts lie unwrapped on one line, the box around cuts). */
const OneLineCtx = createContext<false | 'cut' | 'clip'>(false);

/**
 * One line per Text inside (a table cell, a list row's name): every root Text under it that sets neither `truncate`
 * nor `maxLines` behaves as `truncate`, so it ends in one "…" instead of wrapping and losing its second line to the
 * row's height (the web's `white-space: nowrap; text-overflow: ellipsis` cell). Compat-drawn text (spans, cells) goes
 * through Text and is covered too. `truncate={false}` on a Text opts it out; `<OneLine off>` ends it for a subtree.
 *
 * `mode="clip"` (ClipRow, a cell of several parts: an icon, a name, a note): the same Texts are laid out unwrapped
 * and never shrink, all on one line at their natural width (still what layout measures), and the clipping box around
 * them cuts the line at ITS edge with one "…" at the end, as the web clips the whole cell once, not each part.
 */
export function OneLine({ children, off, mode = 'cut' }: { children?: ReactNode; off?: boolean; mode?: 'cut' | 'clip' }): ReactElement {
  return createElement(OneLineCtx.Provider, { value: off === true ? false : mode }, children);
}
/** True under a OneLine. */
export const useOneLine = (): boolean => useContext(OneLineCtx) !== false;

/**
 * The compat runtime's separators for raw elements placed straight in a Text by a kit component (`<Link>` around a
 * tile's spans): a block child is a line of its own there too. Installed by jsx/dom.ts; prim knows no DOM tags.
 */
let joinRoot: ((children: ReactNode) => ReactNode) | null = null;
export function setTextChildrenJoin(fn: ((children: ReactNode) => ReactNode) | null): void { joinRoot = fn; }
/** True under a Text: children there must be inline. */
export const useInText = (): boolean => useContext(InText);

function attrs(p: TextProps): number {
  return (p.bold ? TextAttributes.BOLD : 0) | (p.dim ? TextAttributes.DIM : 0) | (p.italic ? TextAttributes.ITALIC : 0)
    | (p.underline ? TextAttributes.UNDERLINE : 0) | (p.inverse ? TextAttributes.INVERSE : 0) | (p.strike ? TextAttributes.STRIKETHROUGH : 0);
}

/** Plain text of children made only of strings and numbers (fragments and arrays included), else null. */
function plainOf(c: ReactNode): string | null {
  if (c === null || c === undefined || typeof c === 'boolean') return '';
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) { let out = ''; for (const x of c) { const t = plainOf(x as ReactNode); if (t === null) return null; out += t; } return out; }
  return null;
}

/** Engine id of a cut's OUTER box. `~cut` at its end declares that the box drops what does not fit (as Box `drops`):
 *  its inner box asks for the whole text's width on purpose, so the layout gate exempts what the outer edge clips
 *  (a label that grows after the first layout kept its full width inside a 37-cell switcher). */
let cutSeq = 0;
const useCutId = (): string => useMemo(() => `endcut@c${cutSeq++}~cut`, []);

/**
 * `truncate` on plain text: cut at the END with one "…" cell (as the web's text-overflow: ellipsis), measured from
 * the box the row leaves it, instead of the engine's middle cut with "...". Rich children keep the engine's cut.
 */
function EndCut(p: TextProps & { plain: string }): ReactElement {
  const [w, setW] = useState<number | null>(null);
  const shown = w === null ? p.plain : cutCells(p.plain, w, 'end');
  const { plain: _plain, truncate: _t, width, grow, shrink, children: _c, ...rest } = p;
  const id = useCutId();
  // Two boxes. The OUTER one is what the row or column gives: it shrinks, clips and is measured, capped by its parent
  // (maxWidth 100%: in a column the width is the cross size, which shrink never cuts). The INNER one asks for the WHOLE
  // text's width (`width`, never `flexBasis`: a basis is on the parent's MAIN axis, the height in a column), so in a row
  // the outer's basis is the whole text and it grows back when room returns. The cap and the width are on DIFFERENT
  // boxes: both on one box (an explicit width with a percentage max) made Yoga give it nothing in a sized row beside
  // siblings ("▾  17"). A `width` from the caller sizes the outer box.
  return el('box', {
    id, flexDirection: 'row', flexGrow: grow ?? 0, flexShrink: shrink ?? 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden',
    ...(width !== undefined ? { width } : {}),
    onSizeChange(this: { width: number }) { const v = this.width; setW((o) => (o === v ? o : v)); },
  }, el('box', { flexDirection: 'row', flexShrink: 1, minWidth: 0, width: cellWidth(p.plain) },
  // The line never wraps (nowrap): with word wrap and one row, any moment the shown text is wider than the line (no
  // measure yet, or Yoga rounding an 18-cell box to 17.99) wrapped after the first word and showed it plus blanks
  // ("This         ▾", "Personal           17"). Unwrapped, the cut decides what shows; the box clips the rest.
  createElement(TextBody, { ...rest, nowrap: true } as TextProps, shown)));
}

/**
 * `truncate` on rich children (styled spans, compat elements): the same end cut. The words are laid out uncut on as
 * many lines as they have (a block child inside the run is a line of its own), clipped by the box at its right edge;
 * each line wider than the box gets one "…" in its last cell. Never the engine's middle cut with "...".
 */
function RichCut(p: TextProps): ReactElement {
  const [w, setW] = useState<number | null>(null);
  const [lines, setLines] = useState<readonly number[]>([]);
  const { truncate: _t, width, grow, shrink, ...rest } = p;
  const id = useCutId();
  const read = (n: { lineInfo?: { lineWidthCols?: number[] } }): void => {
    const next = n.lineInfo?.lineWidthCols ?? [];
    setLines((o) => (o.length === next.length && o.every((x, i) => x === next[i]) ? o : [...next]));
  };
  const marks = w === null ? [] : lines.flatMap((lw, i) => (lw > w && w > 0 ? [i] : []));
  return el('box', {
    id, flexDirection: 'row', flexGrow: grow ?? 0, flexShrink: shrink ?? 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden',
    ...(width !== undefined ? { width } : {}),
    onSizeChange(this: { width: number }) { const v = this.width; setW((o) => (o === v ? o : v)); },
  },
  el('box', {
    flexShrink: 0, flexDirection: 'row',
    // The text's own lines, read once laid out: the box around it resizes whenever they do.
    onSizeChange(this: { getChildren(): unknown[] }) { read((this.getChildren()[0] ?? {}) as { lineInfo?: { lineWidthCols?: number[] } }); },
  }, createElement(TextBody, { ...rest, nowrap: true } as TextProps)),
  ...marks.map((i) => el('text', { key: 'cut' + i, position: 'absolute', left: (w as number) - 1, top: i, ...cutInk(p) }, '\u2026')));
}
/** The "…" cell takes the line's own colours (so it covers the cut character on any ground). */
function cutInk(p: TextProps): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fg = textColour(p.colour) ?? plainInk();
  const bg = colour(p.bg);
  if (fg !== undefined) out.fg = fg;
  // No ground of its own: the page ground where the Hub paints it (ScreenRoot), else the terminal's own background.
  out.bg = bg ?? colour(ground('bg')) ?? RGBA.defaultBackground();
  return out;
}

export function Text(p: TextProps): ReactElement {
  const inside = useInText();
  const one = useContext(OneLineCtx);
  if (one !== false && !inside && p.truncate === undefined && p.maxLines === undefined) {
    if (one === 'clip') {
      // Its natural width, also in a column parent (whose stretch would otherwise give it the parent's width).
      const plain = plainOf(p.children);
      return createElement(TextBody, { ...p, nowrap: true, ...(plain !== null && p.width === undefined ? { width: cellWidth(plain) } : {}) } as TextProps);
    }
    p = { ...p, truncate: true };
  }
  if (!p.truncate || inside) return createElement(TextBody, p);
  const plain = plainOf(p.children);
  return plain !== null ? createElement(EndCut, { ...p, plain }) : createElement(RichCut, p);
}

function TextBody(p: TextProps & { /** RichCut's uncut lines. */ nowrap?: boolean }): ReactElement {
  const inside = useInText();
  const semRef = useSem(inside ? undefined : p.sem, {});
  // Inside a focused Pressable (default focus paint): its ink wins over the Text's own colours.
  const ink = useFocusInkCtx();
  const base = useDefaultInk();
  // A Text naming no colour takes the DefaultInk around it (a nested span inherits from its Text as before).
  if (base && !inside && p.colour === undefined) p = { ...p, colour: base };
  if (ink && !inside) p = { ...p, ...ink };
  const style: Record<string, unknown> = { attributes: attrs(p) };
  // A root Text naming no colour is ink where the Hub paints the ground (a span inherits from its Text as before).
  let fg = textColour(p.colour) ?? (inside ? undefined : plainInk());
  let bg = colour(p.bg);
  // `inverse` without a background of its own: OpenTUI 0.8.4 swaps the cell's colours and a cell with no background
  // then gets fg = bg (the words vanish). Swap explicitly instead: the words in the page background on their own colour
  // (ink when none). On the mono tier colours are dropped, so the terminal's real inverse attribute stays.
  if (p.inverse && bg === undefined && colourTier() !== 'mono') {
    bg = fg ?? colour('ink');
    fg = colour('bg');
    style.attributes = attrs({ ...p, inverse: false });
  }
  if (fg !== undefined) style.fg = fg;
  if (bg !== undefined) style.bg = bg;
  const link = safeLinkUrl(p.href);
  if (link?.kind === 'web') style.link = { url: link.url };
  if (inside) return el('span', style, p.children);
  const children = joinRoot ? joinRoot(p.children) : p.children;
  if (p.nowrap) { style.wrapMode = 'none'; style.flexShrink = 0; }
  else if (p.truncate) Object.assign(style, { truncate: true, wrapMode: 'none', flexShrink: p.shrink ?? 1 });
  else { style.wrapMode = 'word'; if (p.shrink !== undefined) style.flexShrink = p.shrink; }
  if (p.width !== undefined) style.width = p.width;
  if (p.grow !== undefined) style.flexGrow = p.grow;
  if (p.align) style.textAlign = p.align;
  if (p.maxLines !== undefined && !p.truncate) Object.assign(style, { maxHeight: Math.max(1, p.maxLines), overflow: 'hidden' });
  // A root text node takes no link: the link sits on an inner span.
  const kids = style.link ? el('span', { link: style.link }, children) : children;
  delete style.link;
  style.ref = semRef;
  return createElement(InText.Provider, { value: true }, el('text', style, kids));
}

/** A line break inside a Text. */
export const Br = (): ReactElement => el('br', null);
