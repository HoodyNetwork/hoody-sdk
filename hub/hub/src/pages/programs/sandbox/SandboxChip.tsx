// The Sandbox column's chip: what the program's sandbox status says, never more (model.ts chipOf). Every visible
// saved program is read, a program without a block included: a cleared block can still drain or hold the
// UNCONFINED line. Temporary programs have no sandbox, so no read and no chip.
import { reachOf, useCurrentComputer } from '@core';
import { StatusPill, makeT, useStrings, type StringKey, type createColumnHelper } from '@kit';
import type { Row as ProgramRow } from '../logic';
import { useHost, useStatus } from './data';
import { CHIP_TONE, chipOf } from './model';
import strings from './strings.en.json';

type Key = StringKey<typeof strings>;

export function SandboxChip({ row }: { row: ProgramRow }) {
  const t = useStrings(strings);
  const target = useCurrentComputer();
  const saved = row.scope !== 'temporary';
  const status = useStatus(row.id, target, saved && !!target);
  const host = useHost(target, saved);
  if (!saved) return null;
  // A refresh that failed over an earlier answer: that answer is not shown as current.
  if (status.isError && status.data) return <StatusPill tone="warn">{t('sb.chip.stale')}</StatusPill>;
  // A first read that failed: said (no answer from the computer, or an answer that could not be read), never
  // "Checking…" for ever. A refetch in flight keeps these words until it answers.
  if (status.isError && !status.data) return <StatusPill tone="warn">{t(reachOf(status.error) === 'unreachable' ? 'sb.chip.noAnswer' : 'sb.chip.unread')}</StatusPill>;
  // An answer that is not a status (select: null) is read, not still being checked.
  if (status.isSuccess && status.data === null) return <StatusPill tone="warn">{t('sb.chip.unread')}</StatusPill>;
  const chip = chipOf({ status: status.data ?? null, enabled: row.enabled, host: host.data ?? null });
  return (
    <StatusPill tone={CHIP_TONE[chip]} dot={chip === 'set'}>
      {t(`sb.chip.${chip}` as Key)}
    </StatusPill>
  );
}

const HEADER = makeT(strings)('sb.col');

/** The programs list's Sandbox field (view.tsx mounts it in one line: `...sandboxColumns(col, none)`): a table column,
 *  where a temporary program (no sandbox) shows `none`, the table's word for nothing to say; and a list-row field, which
 *  a temporary program leaves out. It drops before State on a narrow table. */
export function sandboxColumns(col: ReturnType<typeof createColumnHelper<ProgramRow>>, none: string) {
  return [
    col.display({
      id: 'sandbox',
      header: HEADER,
      meta: { width: '184px', priority: 3, list: false },
      cell: (c) => (c.row.original.scope === 'temporary' ? none : <SandboxChip row={c.row.original} />),
    }),
    col.display({
      id: 'sandboxList',
      header: HEADER,
      meta: { list: 'meta', table: false },
      cell: (c) => <SandboxChip row={c.row.original} />,
    }),
  ];
}
