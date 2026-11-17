// DataTable cells for work on its way: a transfer's
// progress in bytes, and an outcome the Hub cannot tell with its Check again. A cell holds text-slot parts only (Meter,
// StatusPill), so Check again is the row's inline RowAction (checkAgainAction), never a button inside the cell.
import { Children, type ReactNode } from 'react';
import { useStrings } from '../strings';
import { Meter } from '../widgets/Widgets';
import { StatusPill } from './Display';
import { pctOf, progressWords, type Progress } from './cells.pure';
import strings from './cells.strings.en.json';
import s from './cells.module.css';

export { progressFit, progressWords, checkAgainAction } from './cells.pure';
export type { Progress, CheckAgainOptions } from './cells.pure';

/** The props of ProgressCell: the progress and the item's name. */
export interface ProgressCellProps extends Progress {
  /** The item moving (its file name): the meter's accessible name starts with it. */
  name: string;
}

/** A transfer's progress cell: a neutral Meter beside the words when the total is known, the words alone when not. */
export function ProgressCell({ name, ...p }: ProgressCellProps) {
  const t = useStrings(strings);
  const text = progressWords(p);
  const pct = pctOf(p);
  return (
    <span className={s.progress}>
      {pct !== null && <Meter value={pct} tone="neutral" label={t('progress.meter', { name, words: text })} />}
      <span>{text}</span>
    </span>
  );
}

/** The props of CellLines. */
export interface CellLinesProps {
  /** The cell's parts, one line each: the name, then its sub-line (a RowNote, a Tag). Null, false and '' make no line. */
  children: ReactNode;
}

/** A cell of stacked lines, so a name keeps its sub-line under it without a raw <br>. Each line is its own block and
 * cuts on its own with an ellipsis, so a long sub-line never pushes the name. A part with its own wrap rule keeps it: a
 * RowNote wraps unless `cut`, and a cut one still wraps whole on keyboard focus or touch. A child component that renders
 * nothing leaves an empty line, which the CSS hides: a conditional sub-line leaves no gap. The row grows to hold the
 * lines. */
export function CellLines({ children }: CellLinesProps) {
  return (
    <span className={s.lines}>
      {/* Children.map keys each line by its child's own key or its position, holes included, so a conditional child that
          comes or goes never shifts the lines after it. */}
      {Children.map(children, (c) => (c === null || c === undefined || typeof c === 'boolean' || c === '' ? null : <span className={s.line}>{c}</span>))}
    </span>
  );
}

export interface MarkCellProps {
  /** A small mark before the cell's text (an attention icon); absent = the same empty gutter, so every row's text starts
   *  at the same place whether or not it has a mark. */
  mark?: ReactNode;
  /** The cell's text (a name): cut at its end with an ellipsis when the column is too narrow. */
  children: ReactNode;
  /** A secondary label after the text (a kind Tag): it gives way first (whole, never cut) so the text keeps its room. */
  after?: ReactNode;
}

/** A cell whose text may carry a leading mark: the mark sits in a fixed gutter (one icon wide) on every row, so names
 *  line up down the column with or without it. */
export function MarkCell({ mark, children, after }: MarkCellProps) {
  return (
    <span className={s.marked}>
      <span className={s.mark}>{mark || null}</span>
      <span className={s.markedText}>{children}</span>
      {after ? <span className={s.markedAfter}>{after}</span> : null}
    </span>
  );
}

/** An outcome the Hub cannot tell (a change or download that may have gone through): the kit's words in a warn pill.
 * Pair it with checkAgainAction on the row, and never offer the original verb again on that row. */
export function UnknownCell() {
  const t = useStrings(strings);
  return <StatusPill tone="warn">{t('unknown')}</StatusPill>;
}
