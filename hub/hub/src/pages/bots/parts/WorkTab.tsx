// Work: the tasks (delegate sessions) the Bot opened, what each is doing and what it waits on.
// Stop asks first (with "also close it"); one stop at a time, and an unknown outcome shows only
// "Check again" until the state is read back, never a second Stop (C9).
import { AnatomySection, Checkbox, ConfirmDialog, DataTable, EmptyState, OutcomeBanner, Skeleton, StatusPill, TextButton, createColumnHelper, formatRelative, useDataView, useSearchParam, useStrings, type RowActionEntry, type Tone } from '@kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Change, Computer, Delegate, FinishedList } from '../data';
import { plainLine, scrubSecrets } from '../logic';
import strings from '../strings.en.json';
import { dialogOutcome } from './Bits';
import { taskCell } from './TaskCell';
import s from './pane.module.css';

const TONE: Record<Delegate['state'], Tone> = { working: 'info', waiting: 'warn', idle: 'neutral', stopping: 'warn', closed: 'neutral' };
const col = createColumnHelper<Delegate>();

interface Props {
  delegates: readonly Delegate[];
  computers: readonly Computer[];
  stop: Change<void, { sessionId: string; close: boolean }>;
  canStop: boolean;
  /** The finished tasks: their count always, the tasks themselves only once they are opened (`finished=1`). */
  finished: FinishedList & { open: boolean };
  /** True until the open tasks are first read. */
  loading?: boolean;
  error?: unknown;
  onRefresh?: () => void;
  /** Opens the message form for a task (its inline row action); without it the rows have no Message. */
  onMessageTask?: (task: Delegate) => void;
}

export function WorkTab({ delegates, computers, stop, canStop, finished, loading, error, onRefresh, onMessageTask }: Props) {
  const t = useStrings(strings);
  const [closeToo, setCloseToo] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [lastStop, setLastStop] = useState<string | null>(null);
  const open = useMemo(() => delegates.filter((d) => d.state !== 'closed'), [delegates]);
  const unknown = stop.outcome === 'pending';
  const [, setFinishedParam] = useSearchParam('finished');
  // The Bot in view (this tab stays mounted across a Bot switch) and the one the last Stop was asked on: what that stop
  // left behind is said only while its Bot is the one shown.
  const [sel] = useSearchParam('sel');
  const [askedOn, setAskedOn] = useState<typeof sel>(undefined);
  const where = useCallback((d: Delegate) => computers.find((x) => x.id === d.computerId)?.name ?? '', [computers]);

  const started = useMemo(
    () => col.accessor('startedAt', { header: t('work.col.started'), meta: { width: '110px', priority: 3, size: 'fit', fitText: (d: Delegate) => formatRelative(d.startedAt) }, cell: (c) => formatRelative(c.getValue()) }),
    [t],
  );
  const columns = useMemo(
    () => [
      col.accessor('title', {
        header: t('work.col.task'),
        // Measured columns: Where and Started take their words' width (their widths stay their floors), the
        // task takes the rest; State is a pill and keeps its width.
        meta: { pinned: true, size: 'fill' },
        cell: (c) => (
          taskCell(c.row.original, t)
        ),
      }),
      col.accessor(where, {
        id: 'computer',
        header: t('work.col.where'),
        meta: { width: '160px', priority: 2, size: 'fit' },
      }),
      col.accessor('state', {
        header: t('work.col.state'),
        meta: { width: '170px' },
        cell: (c) =>
          unknown && lastStop === c.row.original.sessionId ? (
            <StatusPill tone="warn">{t('work.unknown')}</StatusPill>
          ) : (
            <StatusPill tone={TONE[c.getValue()]} dot>
              {t(`work.state.${c.getValue()}`)}
            </StatusPill>
          ),
      }),
      started,
    ],
    [t, where, unknown, lastStop, started],
  );
  // The Finished table has no row actions, so Started is its last cell, which ends 16 px in, not 12: the kit pads it
  // (DataTable Edges). The open table's Started is followed by its actions cell.

  // The open tasks: searchable (task, what it waits on, computer), newest first, a page at a time; the keys carry a `w` prefix.
  const view = useDataView<Delegate>({
    rows: loading ? undefined : open,
    columns,
    getRowId: (d) => d.sessionId,
    search: (d) => [plainLine(scrubSecrets(d.title), 80), d.waitingOn ? plainLine(scrubSecrets(d.waitingOn), 140) : '', where(d)],
    sort: '-startedAt',
    pageSize: 20,
    more: true,
    param: 'w',
    isLoading: loading,
    error,
  });

  // Each Stop asks afresh for its own task: no tick and no refusal carried over from an earlier ask (a pending one is
  // never cleared: reset leaves it as it is).
  const ask = (sessionId: string) => {
    setAskedOn(sel);
    stop.reset();
    setCloseToo(false);
    setTarget(sessionId);
  };
  const cancel = () => {
    setTarget(null);
    setCloseToo(false);
    stop.reset();
  };
  // The dialog is bound to its task: once that task is not in this Bot's open list (another Bot shown, the task gone),
  // it is not drawn.
  const asking = target !== null && open.some((d) => d.sessionId === target);
  // Its task left the list and no stop of it is out: the ask is forgotten, so the task coming back (a switch back to
  // this Bot) never brings the dialog back unasked.
  useEffect(() => {
    if (target !== null && !asking && !stop.running) {
      setTarget(null);
      setCloseToo(false);
    }
  }, [target, asking, stop.running]);
  // A refusal that came back after its dialog went (the task left the list while the stop was out) is said on the page.
  const leftRefusal = !asking && askedOn === sel && (stop.outcome === 'failed' || stop.outcome === 'not_sent') ? stop.outcome : null;
  const go = () => {
    if (!target) return;
    setLastStop(target);
    // A refused or failed stop keeps the dialog open with its reason; a pending one hands over to the page banner.
    void stop.run({ sessionId: target, close: closeToo }).then((r) => {
      if (r.outcome !== 'done' && r.outcome !== 'pending') return;
      setTarget(null);
      setCloseToo(false);
    });
  };

  // Message is the row's inline action (the same form the Details panel opens); Stop sits in the row menu, confirmed as before.
  const entries = (d: Delegate): RowActionEntry[] => [
    ...(onMessageTask ? [{ id: 'message', label: t('task.message'), inline: true, opens: true, onAction: () => onMessageTask(d) }, '-' as const] : []),
    { id: 'stop', label: t('work.stopMenu'), icon: 'stop', tone: 'danger', isDisabled: unknown || !canStop || d.state === 'stopping', onAction: () => ask(d.sessionId) },
  ];

  return (
    <div className={s.tabBody}>
      <AnatomySection
        id="bot-work"
        title={t('work.title')}
        description={t('work.desc')}
        notices={
          unknown ? (
            <OutcomeBanner kind="pending" title={t('work.unknown')} body={t('work.unknownBody')} onCheck={() => stop.readBack()} onDismiss={() => stop.dismiss()} />
          ) : leftRefusal ? (
            <OutcomeBanner kind={leftRefusal} error={{ outcome: leftRefusal, code: stop.code }} onDismiss={() => stop.reset()} />
          ) : undefined
        }
      />
      <DataTable
        fill={false}
        label={t('work.title')}
        view={view}
        columns={columns}
        search={t('work.search')}
        noViewMenu
        onRefresh={onRefresh}
        onRetry={onRefresh}
        countLabel={(n) => t('work.count', { count: n })}
        noMatch={t('work.noMatch')}
        empty={<EmptyState size="sm" icon="programs" title={t('work.empty')} body={t('work.emptyBody')} />}
        actions={entries}
      />
      {/* The button shows unless the agent's count says there is nothing finished (and the list is closed); the count is the agent's, not the open list's. */}
      {(finished.count !== 0 || finished.open) && (
        <div className={s.finishedBar}>
          <TextButton icon={finished.open ? 'chevron-up' : 'chevron-down'} onPress={() => setFinishedParam(finished.open ? undefined : '1', { replace: true })}>
            {finished.open ? t('work.hideFinished') : finished.count === undefined ? t('work.showFinishedAny') : t('work.showFinished', { count: finished.count })}
          </TextButton>
        </div>
      )}
      {finished.open && finished.loading && finished.rows.length === 0 && <Skeleton rows={3} />}
      {finished.open && finished.rows.length > 0 && (
        <DataTable bare fill={false} label={t('work.finishedTitle')} data={finished.rows} columns={columns} getRowId={(d) => d.sessionId} noViewMenu />
      )}
      {finished.open && !finished.loading && !finished.error && finished.count === 0 && <p className={s.help}>{t('work.finishedNone')}</p>}
      {finished.open && finished.error && (
        <p className={s.help}>
          {t('work.finishedError')} <TextButton onPress={finished.retry}>{t('action.tryAgain')}</TextButton>
        </p>
      )}
      {finished.open && finished.canMore && (
        <div className={s.finishedBar}>
          <TextButton onPress={finished.more}>{t('work.more')}</TextButton>
        </div>
      )}
      <ConfirmDialog
        overlayId="bots-work-stop"
        isOpen={asking}
        onOpenChange={(o) => !o && cancel()}
        title={t('work.stopTitle')}
        body={t('work.stopBody')}
        confirmLabel={t('work.stopGo')}
        tone="danger"
        busy={stop.running}
        outcome={dialogOutcome(stop)}
        onCheck={() => stop.readBack()}
        onConfirm={go}
      >
        <Checkbox label={t('work.alsoClose')} isSelected={closeToo} onChange={setCloseToo} />
      </ConfirmDialog>
    </div>
  );
}
