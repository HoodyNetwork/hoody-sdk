// The list's text cells, kept out of view.tsx so the terminal sibling can draw them with its own prims. A gutter on the web is a
// web change: `termNameCell` is null here. The terminal sibling
// (NameCell.term.tsx) draws the name with the kit MarkCell, so names line up in a fixed mark gutter and cut at their end.
import { Icon, Tag, useStrings } from '@kit';
import type { ReactNode } from 'react';
import type { SchedRow } from '../logic';
import strings from '../strings.en.json';
import { type Zone, nextShort, nextText } from './words';

export interface NameCellProps {
  /** The row needs attention: a warn mark before the name. */
  attention: boolean;
  /** The mark's spoken label. */
  attentionLabel: string;
  name: string;
  /** A secondary label after the name (Schedules' kind tag). */
  after?: ReactNode;
}

export const termNameCell: ((p: NameCellProps) => ReactNode) | null = null;

/** The name cell: the warn mark when the row needs attention, the name (its children), then its kind tag. */
export function NameCell({ row, children }: { row: SchedRow; children: ReactNode }) {
  const t = useStrings(strings);
  return (
    <span>
      {row.attention && <Icon name="warn" size="sm" label={t('f.attention')} />} {children} <Tag>{t(`kind.${row.src}` as 'kind.cron')}</Tag>
    </span>
  );
}

/** The next run on a list row: the short form when there is one, else the words. */
export function NextLine({ row, now, zone }: { row: SchedRow; now: number; zone: Zone }) {
  const t = useStrings(strings);
  const n = nextShort(t, row, now, zone);
  return <span>{n ? n.rel : nextText(t, row, now, zone)}</span>;
}

/** The schedule in words (its children), the expression on hover when there is one. */
export function ScheduleCell({ row, children }: { row: SchedRow; children: ReactNode }) {
  const t = useStrings(strings);
  return <span title={row.sched.expr ? t('tip.expr', { expr: row.sched.expr }) : undefined}>{children}</span>;
}

/** The next run in the table: the short form with the full words on hover, else the words. */
export function NextCell({ row, now, zone }: { row: SchedRow; now: number; zone: Zone }) {
  const t = useStrings(strings);
  const n = nextShort(t, row, now, zone);
  if (n) return <span title={nextText(t, row, now, zone)}>{n.rel}</span>;
  return <span>{nextText(t, row, now, zone)}</span>;
}
