// TableMark: drawn decoration that is not part of the data (a row's cursor bar, a scrollbar, a checkbox, a sort arrow).
// It is left out of the engine's own mouse selection, so selecting a row or cells copies the values and the single
// spaces between them, never the marks. (A terminal's native selection copies whatever is on screen; marks stay at
// the edges of a row for that reason.)
import { type ReactElement } from 'react';
import { el, TextAttributes } from './otui';
import { colour, plainInk, textColour, type Colour } from './tokens';

export interface TableMarkProps {
  children: string;
  colour?: Colour;
  bg?: Colour;
  bold?: boolean;
  underline?: boolean;
  /** Fixed width in cells (the mark is padded or cut by the engine). */
  width?: number;
}

export function TableMark(p: TableMarkProps): ReactElement {
  const props: Record<string, unknown> = { selectable: false, wrapMode: 'none', flexShrink: 0, attributes: (p.bold ? TextAttributes.BOLD : 0) | (p.underline ? TextAttributes.UNDERLINE : 0) };
  // A mark naming no colour (a ClipRow's "…") is ink where the Hub paints the ground, as a root Text is: the engine's
  // own default is white when the terminal never said its colours, so on the light theme the "…" was white on white.
  const fg = textColour(p.colour) ?? plainInk();
  const bg = colour(p.bg);
  if (fg !== undefined) props.fg = fg;
  if (bg !== undefined) props.bg = bg;
  if (p.width !== undefined) props.width = p.width;
  return el('text', props, p.children);
}
