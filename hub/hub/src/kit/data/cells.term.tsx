// Cells for work on its way, in the terminal: progress as a text meter beside its words, stacked cell lines, an unknown
// outcome in a warn pill. The words and the row action are the web's (cells.pure.ts).
import { ClipRemeasure, ClipText } from '../../term/prim/TableClip';
import { useNameStart } from './listRow';
import { Children, useContext, useState, type ReactNode } from 'react';
import type * as Web from './cells';
import { Box, Text } from '../../term/prim';
import { useStrings } from '../strings';
import { Meter } from '../widgets/Widgets';
import { StatusPill } from './Display';
import { pctOf, progressWords } from './cells.pure';
import strings from './cells.strings.en.json';

export { progressFit, progressWords, checkAgainAction } from './cells.pure';
export type { Progress, CheckAgainOptions, ProgressCellProps, CellLinesProps, MarkCellProps } from './cells';

export const ProgressCell: typeof Web.ProgressCell = ({ name, ...p }) => {
  const t = useStrings(strings);
  const text = progressWords(p);
  const pct = pctOf(p);
  return (
    <Box dir="row" gap={1} shrink={0}>
      {pct !== null && <Meter value={pct} tone="neutral" label={t('progress.meter', { name, words: text })} />}
      <ClipText text={text} colour="ink" />
    </Box>
  );
};

/** One line per part; an absent part makes no line. */
export const CellLines: typeof Web.CellLines = ({ children }) => (
  <Box dir="column" shrink={0}>
    {Children.map(children, (c: ReactNode) => (c === null || c === undefined || typeof c === 'boolean' || c === ''
      ? null
      : <Box dir="row">{typeof c === 'string' || typeof c === 'number' ? <ClipText text={String(c)} /> : c}</Box>))}
  </Box>
);

/** The mark gutter: two cells (a one-cell glyph and a space) on every row, empty or not, so texts start in one column.
 *  The text is cut at its end with one "…" (ClipText); `after` (a Tag) gives way whole before that. */
export const MarkCell: typeof Web.MarkCell = ({ mark, children, after }) => {
  // In a list row the text box tells the row where the name starts (its meta line goes right under it).
  const nameStart = useNameStart();
  return (
  <Box dir="row" shrink={1} minWidth={0}>
    <Box dir="row" width={2} shrink={0}>{mark || null}</Box>
    <Box dir="row" shrink={1} minWidth={0} boxRef={nameStart ?? undefined}>
      {typeof children === 'string' || typeof children === 'number' ? <ClipText text={String(children)} grow={false} /> : children}
    </Box>
    {after ? <GiveWay>{after}</GiveWay> : null}
  </Box>
  );
};

/**
 * `after` gives way WHOLE: it shows in full where the row has room for it, else not at all (never a part of a tag, and
 * never a cut mark for it). The box holds the tag's width in the row (the tag itself, or a blank of its width while it
 * does not fit) and gives way first (shrink 1000), so its laid width says whether the tag fits; the tag is measured at
 * its own width, out of the flow, while it is hidden.
 */
function GiveWay({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<number | null>(null);
  const [need, setNeed] = useState<number | null>(null);
  const fits = room !== null && need !== null && room >= need;
  const measured = (w: number) => setNeed((o) => (o === w ? o : w));
  // The cell around it measures again once the blank that holds the tag's place is laid out: the blank is part of what
  // the cell needs, and in a cell just as wide as its title nothing else changes size when the tag gives way. It also
  // measures again once the tag itself is laid out (shown again): the blank had its width, so nothing in the cell changes
  // size then either, and a table whose cell reported its width while the tag was held kept the narrower want: whether a
  // later resize came after the tag showed was timing (Schedules at 200x50 drew one of two column layouts).
  const again = useContext(ClipRemeasure);
  const shown = (w: number) => { measured(w); again?.(); };
  return (
    <Box dir="row" shrink={1000} minWidth={0} drops onSize={(w) => setRoom((o) => (o === w ? o : w))}>
      {fits || need === null
        ? <Box dir="row" shrink={0} onSize={shown}><Text>{'  '}</Text>{children}</Box>
        : [<Box key="hold" width={need} shrink={1} minWidth={0} />,
          <Box key="measure" dir="row" shrink={0} onSize={(w) => { measured(w); again?.(); }} sem={{ hidden: true }} raw={{ position: 'absolute', left: 100000, top: 0 }}><Text>{'  '}</Text>{children}</Box>]}
    </Box>
  );
}

export const UnknownCell: typeof Web.UnknownCell = () => {
  const t = useStrings(strings);
  return <StatusPill tone="warn">{t('unknown')}</StatusPill>;
};
