// The detail header's line under the name, in the terminal. The web draws each "·" with ::before in a lead before every
// item and clips the lead of whatever begins a line (negative start margin + clip-path); the terminal has neither, so the
// line started two cells left of its box and no "·" was drawn at all. Here: a wrapping row, a faint " · " before every
// item that does not begin a line. Which items begin a line is worked out from the items' own widths and the row's
// width (the same greedy fill the row does), never from where they landed, so it cannot flip back and forth.
import { Children, useState, type ReactNode } from 'react';
import { Box, Text } from '@term/prim';
import type * as Web from './HeadLine';

const DOT = ' · ';
const DOT_W = 3;

/** Per item: does it begin a line? (the first always; an unmeasured width counts as fitting.) */
function lineStarts(widths: readonly (number | undefined)[], room: number): boolean[] {
  let used = 0;
  return widths.map((w, i) => {
    const need = w ?? 0;
    if (i === 0 || (room > 0 && used + DOT_W + need > room)) { used = need; return true; }
    used += DOT_W + need;
    return false;
  });
}

export const HeadLine: typeof Web.HeadLine = ({ children }) => {
  const items = Children.toArray(children);
  const [room, setRoom] = useState(0);
  const [widths, setWidths] = useState<readonly (number | undefined)[]>([]);
  const starts = lineStarts(items.map((_, i) => widths[i]), room);
  return (
    <Box dir="row" wrap grow={1} minWidth={0} onSize={(w) => setRoom((o) => (o === w ? o : w))}>
      {items.map((item, i) => (
        <Box key={i} dir="row" shrink={0}>
          {starts[i] ? null : <Text colour="faint">{DOT}</Text>}
          <Box dir="row" shrink={0} onSize={(w) => setWidths((o) => { if (o[i] === w) return o; const n = [...o]; n[i] = w; return n; })}>{item}</Box>
        </Box>
      ))}
    </Box>
  );
};

/** One item: its parts in a row; bare words (a project name, "Current computer") become text. */
export const HeadItem: typeof Web.HeadItem = ({ children }: { children: ReactNode }) => (
  <Box dir="row" gapX={1} shrink={0}>
    {Children.map(children, (c) => (typeof c === 'string' || typeof c === 'number' ? <Text>{String(c)}</Text> : c))}
  </Box>
);
