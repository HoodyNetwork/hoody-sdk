// Verdict in the terminal: the top plate of a side panel as one framed box. Row 1: the label and the count in caps
// (the count moves under the label when both do not fit); then the sentence in bold, wrapping as ONE run of text with
// its marked phrase inline; the muted next line; the slot and the facts; last the meter, one run of cells per step
// across the plate's width.
// Nothing rests on colour: a mark is bold, and underlined when it is a warning or the tier has no colour; each kind of
// segment has its own glyph (done ━, limited ╍, blocking ╳, optional and unknown ┄, to do ─) and the count says the
// same in words, as on the web. `state` is the same plate in the strong line (a cell grid has no ink plate).
import { createContext, isValidElement, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import type * as Web from './Verdict';
import { Box, Text, useBoxSize } from '@term/prim';
import { colourTier, type Colour } from '@term/kit';
import { pieces } from '../layouts/termParts';

export type { VerdictSegment, VerdictMarkProps, VerdictProps } from './Verdict';

/** The web's reading width of the sentence and the next line (64ch). */
const READ = 64;

interface MarkCounter {
  n: number;
  label: string;
  told: boolean;
}
const MarkCount = createContext<MarkCounter | null>(null);

/** The web's dev assert: a verdict colours at most one phrase. Names the verdict, never its text; once per verdict. */
function assertOneMark(c: MarkCounter): void {
  if (!import.meta.env.DEV || c.n <= 1 || c.told) return;
  c.told = true;
  console.error(`hub Verdict "${c.label}": ${c.n} VerdictMark phrases; a verdict colours at most one`);
}

const MARK: Record<Web.VerdictMarkProps['tone'], Colour> = { warn: 'warn', danger: 'danger', good: 'ok' };

export const VerdictMark: typeof Web.VerdictMark = ({ tone, children }) => {
  const count = useContext(MarkCount);
  useLayoutEffect(() => {
    if (!count) return;
    count.n += 1;
    assertOneMark(count);
    return () => {
      count.n -= 1;
    };
  }, [count]);
  return <Text bold colour={MARK[tone]} underline={tone === 'warn' || colourTier() === 'mono'}>{children}</Text>;
};

/** A sentence or a next line. Text and marks are one Text (the mark is a span inside it, so the line wraps by word
 *  as a whole); anything else (an inline link is a control with its own box) sits in a wrapping row beside its text. */
function Run({ children, colour, bold }: { children: ReactNode; colour: Colour; bold?: boolean }): ReactNode {
  const ps = pieces(children);
  if (ps.length === 0) return null;
  const spans = ps.every((p) => typeof p === 'string' || typeof p === 'number' || (isValidElement(p) && p.type === VerdictMark));
  if (spans) return <Box maxWidth={READ} shrink={1}><Text colour={colour} bold={bold}>{children}</Text></Box>;
  const runs: ReactNode[] = [];
  let text = '';
  const flush = (): void => {
    if (text !== '') runs.push(<Text key={runs.length} colour={colour} bold={bold} shrink={1}>{text}</Text>);
    text = '';
  };
  for (const p of ps) {
    if (typeof p === 'string' || typeof p === 'number') text += String(p);
    else {
      flush();
      runs.push(<Box key={runs.length} dir="row" shrink={0}>{p}</Box>);
    }
  }
  flush();
  return <Box dir="row" wrap shrink={1} align="start" maxWidth={READ}>{runs}</Box>;
}

const SEG: Record<Web.VerdictSegment, { glyph: string; colour: Colour }> = {
  done: { glyph: '━', colour: 'ink' },
  limited: { glyph: '╍', colour: 'warn' },
  blocking: { glyph: '╳', colour: 'danger' },
  optional: { glyph: '┄', colour: 'muted' },
  unknown: { glyph: '┄', colour: 'muted' },
  todo: { glyph: '─', colour: 'lineStrong' },
};

/** Cells of each of `n` segments sharing `width` cells with one cell between two: equal, the first ones one wider
 *  until the row is full, never under one cell. */
function segmentWidths(width: number, n: number): number[] {
  const room = Math.max(n, width - (n - 1));
  const base = Math.floor(room / n);
  return Array.from({ length: n }, (_, i) => base + (i < room - base * n ? 1 : 0));
}

/** The meter: decoration (the count carries it in words), so it has no semantics, as the web's is aria-hidden. */
function Meter({ segments, state }: { segments: readonly Web.VerdictSegment[]; state: boolean }): ReactNode {
  const [size, onSize] = useBoxSize();
  const widths = segmentWidths(size?.width ?? 0, segments.length);
  return (
    <Box dir="row" gap={1} height={1} shrink={0} onSize={onSize} drops sem={{ hidden: true }}>
      {segments.map((g, i) => (
        <Text key={i} colour={g === 'done' && state ? 'ok' : SEG[g].colour} truncate={false}>{SEG[g].glyph.repeat(widths[i] ?? 1)}</Text>
      ))}
    </Box>
  );
}

export const Verdict: typeof Web.Verdict = ({ tone = 'calm', label, children, next, segments, count, slot, facts }) => {
  const marks = useRef<MarkCounter>({ n: 0, label, told: false }).current;
  marks.label = label;
  return (
    <MarkCount.Provider value={marks}>
      <Box dir="column" border borderColour={tone === 'state' ? 'lineStrong' : 'line'} padX={1} shrink={0} sem={{ role: 'group', name: label }}>
        <Box dir="row" wrap justify="between" gapX={2} shrink={0}>
          <Text colour="muted" shrink={1}>{label.toUpperCase()}</Text>
          {count != null && <Text colour="muted" shrink={1}>{count.toUpperCase()}</Text>}
        </Box>
        <Run colour="ink" bold>{children}</Run>
        {next != null && <Run colour="muted">{next}</Run>}
        {slot != null && <Box dir="column" shrink={0}>{slot}</Box>}
        {facts != null && <Box dir="column" shrink={0}>{facts}</Box>}
        {segments && segments.length > 0 && <Meter segments={segments} state={tone === 'state'} />}
      </Box>
    </MarkCount.Provider>
  );
};
