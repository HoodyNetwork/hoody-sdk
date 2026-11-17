// The Snapshots tab of one VM: its snapshots, and taking, restoring and deleting one.
//
// Contract, in plain words:
//   - The list is asked for only while the VM program answers for this computer.
//   - Taking and restoring need the VM stopped; deleting works in any state. Each action that is off says why.
//   - Restore and Delete ask first, naming the snapshot. The question is bound to the computer, the VM's own id and the
//     snapshot that opened it: when any of them is no longer what the tab shows, it closes and nothing is sent.
//   - A confirmed restore or delete reads the list once more first, and is sent only when that fresh list still holds
//     the same snapshot (same label, same time; restorable, for a restore). A read that fails sends nothing.
//   - Nothing is sent before the list has been read once: a take pressed during the first load would ride on a request
//     sent before the press.
//   - Every change is sent once and runs for as long as the VM program needs (minutes for a large disk). A lost answer
//     is held under the VM's one change lock (snapshots.ts): the tab shows it with Check again, which only reads, and
//     Stop tracking. A held restore is proved by no read. While any change of this VM is held, nothing else is sent.
//   - In a Hub shown inside another page every change is off, with the reason.
import { heldChanges, isFramed, refusal, useChangesVersion, useRunner, type HeldChange, type RunnerOutcome, type Target } from '@core';
import {
  AnatomySection, Band, CodeBlock, ConfirmDialog, createColumnHelper, DataTable, Drawer, EmptyState, Form, FormFooter, formatBytes, formatDateTime, HeldBand,
  Outcome, StatusPill, TextField, useStrings, type AnyAction, type RowActionEntry, type SectionState,
} from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHost } from '../data';
import type { VmReady } from '../logic';
import { freshList, labelCheck, removeCheck, restoreCheck, vmReadDisagrees, snapBlock, snapErrKey, snapReasonKey, suggestLabel, type SnapChange, type Snapshot, type SnapshotTaken } from '../snap-logic';
import {
  snapHeldBy, useRemoveSnapshot, useRestoreSnapshot, useSnapshots, useSnapshotsVm, useTakeSnapshot, VM_LOCK,
  type SnapVars, type TakeVars,
} from '../snapshots';
import strings from '../strings.en.json';
import { isVmUnsure, useVmUnsure } from './unsure';

const col = createColumnHelper<Snapshot>();
const NONE: readonly Snapshot[] = [];

const heldByTake = (h: HeldChange) => snapHeldBy('take', h);
const heldByRestore = (h: HeldChange) => snapHeldBy('restore', h);
const heldByRemove = (h: HeldChange) => snapHeldBy('remove', h);

/** The snapshot a question names: confirming acts on exactly it, for exactly that VM on that computer. */
interface Ask { readonly computer: string; readonly vm: string; readonly label: string; readonly createdUnix: number }

export function Snapshots({ vm }: { vm: VmReady }) {
  const t = useStrings(strings);
  const host = useHost();
  const ready = host.state.kind === 'ready';
  const target = host.target;
  const computer = target?.container.id ?? '';
  const project = target?.project.id ?? '';
  const vmId = vm.vmId ?? '';
  const name = vm.name;
  const framed = isFramed();

  const list = useSnapshots(name, ready);
  // Kept mounted so a held change's read-back can tell which VM a fresh list belongs to. Its answer also has a say:
  // when it names another VM than the screen shows under this name, a change sent by name would reach that other VM.
  const vmRead = useSnapshotsVm(name, ready);
  const otherVm = vmReadDisagrees(vmId, vmRead.data?.vmId);
  // For a check made after an await: what the read says by then, not what the press saw.
  const otherVmNow = useRef(otherVm);
  otherVmNow.current = otherVm;
  const rows = list.data?.items ?? NONE;

  const mine = useCallback((op: string) => (i: Record<string, unknown>) => vmId !== '' && i.computer === computer && i.vm === vmId && i.op === op, [computer, vmId]);
  const pickTake = useMemo(() => mine('snap.take'), [mine]);
  const pickRestore = useMemo(() => mine('snap.restore'), [mine]);
  const pickRemove = useMemo(() => mine('snap.remove'), [mine]);
  const varsOf = (i: Record<string, unknown>): SnapVars => ({ computer: String(i.computer ?? ''), target: target as Target, vm: String(i.vm ?? ''), name: String(i.name ?? ''), label: String(i.label ?? '') });
  const take = useRunner<TakeVars>(useTakeSnapshot(), { lock: VM_LOCK, pick: pickTake, heldBy: heldByTake, vars: (i) => ({ ...varsOf(i), absentBefore: i.absentBefore === true }) });
  const restore = useRunner<SnapVars>(useRestoreSnapshot(), { lock: VM_LOCK, pick: pickRestore, heldBy: heldByRestore, vars: varsOf });
  const remove = useRunner<SnapVars>(useRemoveSnapshot(), { lock: VM_LOCK, pick: pickRemove, heldBy: heldByRemove, vars: varsOf });

  // A change of this VM another part of the page sent (power, settings) that may have gone through: snapshots wait.
  const version = useChangesVersion();
  const otherHeld = useMemo(
    () => vmId !== '' && heldChanges(VM_LOCK).some((h) => {
      const i = (h.identity ?? {}) as Record<string, unknown>;
      return h.target?.container.id === computer && h.target?.project.id === project && i.vm === vmId && !String(i.op ?? '').startsWith('snap.');
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is core's held-change signal
    [version, computer, project, vmId],
  );
  const anyHeld = otherHeld || take.held !== null || restore.held !== null || remove.held !== null;
  const anyBusy = take.busy || restore.busy || remove.busy;

  const [taking, setTaking] = useState(false);
  const [label, setLabel] = useState('');
  const [askRestore, setAskRestore] = useState<Ask | null>(null);
  const [askRemove, setAskRemove] = useState<Ask | null>(null);
  // A confirmed restore or delete reading the list once more, and what stopped it before anything was sent.
  const [checking, setChecking] = useState<{ change: 'restore' | 'remove'; label: string } | null>(null);
  const [stopped, setStopped] = useState<{ change: 'restore' | 'remove'; why: 'changed' | 'unread'; label: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [taken, setTaken] = useState<SnapshotTaken | null>(null);
  const [noSpace, setNoSpace] = useState(false);
  // A take reading the list before its send, and that read failing (nothing was sent).
  const [preTake, setPreTake] = useState(false);
  const [takeUnread, setTakeUnread] = useState(false);
  // What the tab shows now, for a check made after an await (a closure would still hold the VM of the press).
  const shown = useRef({ computer, vm: vmId });
  shown.current = { computer, vm: vmId };
  const anyOut = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  anyOut.current = anyBusy || anyHeld;

  // A question is bound to what opened it: another computer, another VM under the name, or a snapshot that left or
  // changed closes it.
  // The reads on screen do not agree on which VM holds this name: no change is sent by name meanwhile.
  const unsure = useVmUnsure(name) || otherVm;
  /** Asked inside every send, right before the request. */
  const unsureNow = (n: string): boolean => isVmUnsure(n) || otherVmNow.current;
  const bound = useCallback(
    (a: Ask) => a.computer === computer && a.vm === vmId && vmId !== '' && (list.data === undefined || list.data.items.some((s) => s.label === a.label && s.createdUnix === a.createdUnix)),
    [computer, vmId, list.data],
  );
  useEffect(() => {
    if (askRestore && (unsure || !bound(askRestore))) setAskRestore(null);
    if (askRemove && (unsure || !bound(askRemove))) setAskRemove(null);
  }, [askRestore, askRemove, bound, unsure]);
  // Nothing kept from another computer or another VM.
  const resetTake = take.reset, resetRestore = restore.reset, resetRemove = remove.reset;
  useEffect(() => {
    setTaking(false);
    setLabel('');
    setStopped(null);
    setTaken(null);
    setNoSpace(false);
    setTakeUnread(false);
    resetTake();
    resetRestore();
    resetRemove();
  }, [computer, vmId, resetTake, resetRestore, resetRemove]);
  useEffect(() => {
    if (!take.held) setNoSpace(false);
  }, [take.held]);

  const block = snapBlock(vm);
  /** Why a change is off now; `stoppedOnly`: it needs the VM stopped (take, restore). */
  const whyOff = (stoppedOnly: boolean): string | undefined => {
    if (framed) return t('snap.why.framed');
    if (unsure) return t('power.why.unread');
    if (vmId === '') return t('snap.why.noId');
    if (list.data === undefined) return t('snap.why.listUnread');
    if (stoppedOnly && block) return t(`snap.why.${block}`);
    if (anyBusy) return t('snap.why.busy');
    return anyHeld ? t('snap.why.held') : undefined;
  };
  const vars = (l: string): SnapVars | null => (target && vmId !== '' ? { computer, target, vm: vmId, name, label: l } : null);

  const check = labelCheck(label, rows);
  const takeOff = whyOff(true);
  const takeNow = async () => {
    const v = vars(label);
    if (!v || check !== 'ok' || takeOff !== undefined || preTake || unsureNow(v.name)) return;
    setTaken(null);
    // The list once more, fresh, right before the send: a take is sent only for a label that list lacks, and that
    // record is what lets a later read prove a take whose answer was lost.
    setPreTake(true);
    const press = { at: Date.now(), had: list.dataUpdatedAt };
    const fresh = freshList(await list.refetch().catch(() => null), press);
    // The tab was left while the list was read: nothing is sent, nothing is drawn.
    if (!mounted.current) return;
    setPreTake(false);
    if (!fresh) { setTakeUnread(true); return; }
    setTakeUnread(false);
    const here = shown.current;
    // The label is there now (the field says so), or the tab moved to another VM or computer: nothing is sent.
    // Asked again at the send: the VM's own read may have failed or lost the name while the list was read.
    if (unsureNow(v.name) || here.computer !== v.computer || here.vm !== v.vm || labelCheck(v.label, fresh) !== 'ok') return;
    void take.run({ ...v, absentBefore: true }).then((r) => {
      void list.refetch();
      if (r.outcome === 'done') {
        setTaking(false);
        const d = r.data as SnapshotTaken | null | undefined;
        setTaken(d && d.warnings.length > 0 ? d : null);
      } else if (r.outcome === 'pending') {
        setNoSpace(snapReasonKey(r.code) !== null);
        setTaking(false);
      }
    });
  };
  const restoreNow = async (a: Ask) => {
    setAskRestore(null);
    const v = vars(a.label);
    if (!v || !bound(a) || whyOff(true) !== undefined || unsureNow(v.name)) return;
    setStopped(null);
    setChecking({ change: 'restore', label: a.label });
    // The list once more, fresh: the snapshot must still be the one the question named.
    const press = { at: Date.now(), had: list.dataUpdatedAt };
    const fresh = freshList(await list.refetch().catch(() => null), press);
    // The tab was left while the list was read: nothing is sent, nothing is drawn.
    if (!mounted.current) return;
    setChecking(null);
    if (!fresh) { setStopped({ change: 'restore', why: 'unread', label: a.label }); return; }
    // Judged after the read, against what the tab shows NOW: the VM may have been replaced under its name meanwhile.
    if (restoreCheck(a, shown.current, fresh) !== 'ok') { setStopped({ change: 'restore', why: 'changed', label: a.label }); return; }
    // Another change of this VM went out or is held since the confirm: this one waits, unsent.
    if (anyOut.current || unsureNow(v.name)) return;
    setRestoring(a.label);
    await restore.run(v);
    setRestoring(null);
    void list.refetch();
  };
  const removeNow = async (a: Ask) => {
    setAskRemove(null);
    const v = vars(a.label);
    if (!v || !bound(a) || whyOff(false) !== undefined || unsureNow(v.name)) return;
    setStopped(null);
    setChecking({ change: 'remove', label: a.label });
    // The list once more, fresh: a delete goes by label, and the label may name another snapshot by now.
    const press = { at: Date.now(), had: list.dataUpdatedAt };
    const fresh = freshList(await list.refetch().catch(() => null), press);
    // The tab was left while the list was read: nothing is sent, nothing is drawn.
    if (!mounted.current) return;
    setChecking(null);
    if (!fresh) { setStopped({ change: 'remove', why: 'unread', label: a.label }); return; }
    if (removeCheck(a, shown.current, fresh) !== 'ok') { setStopped({ change: 'remove', why: 'changed', label: a.label }); return; }
    if (anyOut.current || unsureNow(v.name)) return;
    await remove.run(v);
    void list.refetch();
  };

  const detailOf = (change: SnapChange, o: RunnerOutcome | undefined): string | undefined => {
    const key = o?.kind === 'failed' ? snapErrKey(change, o.code) : null;
    return key ? t(key) : undefined;
  };

  const columns = useMemo(
    () => [
      col.display({ id: 'label', header: t('snap.col.label'), meta: { pinned: true, mono: true, list: 'primary', label: t('snap.col.label') }, cell: (c) => c.row.original.label }),
      col.display({ id: 'taken', header: t('snap.col.taken'), meta: { size: 'fit', priority: 1, listLabel: true, label: t('snap.col.taken'), fitText: (r) => formatDateTime(r.createdUnix * 1000) }, cell: (c) => formatDateTime(c.row.original.createdUnix * 1000) }),
      col.display({ id: 'size', header: t('snap.col.size'), meta: { size: 'fit', align: 'end', mono: true, priority: 2, listLabel: true, label: t('snap.col.size'), fitText: (r) => formatBytes(r.diskBytes) }, cell: (c) => formatBytes(c.row.original.diskBytes) }),
      col.display({
        id: 'restore',
        header: t('snap.col.restore'),
        meta: { width: '150px', priority: 3, list: 'status', label: t('snap.col.restore') },
        cell: (c) => (c.row.original.restorable ? <StatusPill tone="ok" dot>{t('snap.can')}</StatusPill> : <StatusPill tone="warn" dot>{t('snap.cannot')}</StatusPill>),
      }),
    ],
    [t],
  );
  const rowActions = (s: Snapshot): RowActionEntry[] => {
    const ask: Ask = { computer, vm: vmId, label: s.label, createdUnix: s.createdUnix };
    // The VM program's own sentence for why this snapshot cannot be restored, shown as it wrote it.
    const restoreOff = !s.restorable ? (s.blockedReason ? t('snap.why.blocked', { reason: s.blockedReason }) : t('snap.why.blockedNoReason')) : whyOff(true);
    const removeOff = whyOff(false);
    return [
      { id: 'restore', label: t('snap.row.restoreName', { label: s.label }), short: t('snap.row.restore'), inline: true, opens: true, onAction: () => setAskRestore(ask), ...(restoreOff ? { isDisabled: true, disabledReason: restoreOff } : {}) },
      { id: 'delete', label: t('snap.row.deleteName', { label: s.label }), short: t('snap.row.delete'), inline: true, opens: true, tone: 'danger', onAction: () => setAskRemove(ask), ...(removeOff ? { isDisabled: true, disabledReason: removeOff } : {}) },
    ];
  };

  const retry = () => void list.refetch();
  const state: SectionState = !ready
    ? { kind: 'loading', rows: 3, variant: 'table' }
    : list.data !== undefined
      ? list.isError ? { kind: 'stale', shown: rows.length, error: list.error, onRetry: retry, busy: list.isFetching } : { kind: 'ready' }
      : list.isError ? { kind: 'failed', error: list.error, onRetry: retry, busy: list.isFetching } : { kind: 'loading', rows: 3, variant: 'table' };

  const takeAction: AnyAction = {
    id: 'take', label: t('snap.take.open'), icon: 'plus', opens: 'dialog',
    onPress: () => { setLabel(suggestLabel(new Date(), rows)); take.reset(); setTakeUnread(false); setTaking(true); },
    ...(takeOff ? { disabledReason: takeOff } : {}),
  };
  const heldLabel = (h: Record<string, unknown> | null) => String(h?.label ?? '');
  const newest = rows.reduce<Snapshot | null>((a, s) => (a === null || s.createdUnix > a.createdUnix ? s : a), null);

  return (
    <>
      <AnatomySection
        id="vm-snapshots"
        title={t('snap.title')}
        description={t('snap.about')}
        actions={{ secondary: [takeAction] }}
        state={state}
        notices={
          <>
            {take.held ? (
              <HeldBand
                overlayId="vms-snap-held-take" elsewhere={null} text={t('snap.held.take', { label: heldLabel(take.held) })} note={noSpace ? t('snap.reason.InsufficientSpace') : undefined}
                readOnly={take.elsewhere !== null} onCheck={async () => { await take.check(); await list.refetch(); }} onDismiss={take.dismiss} inFlight={take.busy}
              />
            ) : null}
            {restore.held ? (
              <HeldBand overlayId="vms-snap-held-restore" elsewhere={null} text={t('snap.held.restore', { label: heldLabel(restore.held) })} readOnly={restore.elsewhere !== null} onCheck={restore.check} onDismiss={restore.dismiss} inFlight={restore.busy} />
            ) : null}
            {remove.held ? (
              <HeldBand
                overlayId="vms-snap-held-remove" elsewhere={null} text={t('snap.held.remove', { label: heldLabel(remove.held) })}
                readOnly={remove.elsewhere !== null} onCheck={async () => { await remove.check(); await list.refetch(); }} onDismiss={remove.dismiss} inFlight={remove.busy}
              />
            ) : null}
            {otherHeld ? <Band tone="warn" size="table" /* noDetails: no request was refused; another part's held change is named by its own band */>{t('snap.held.other')}</Band> : null}
            {checking !== null ? <Band size="table">{t(checking.change === 'remove' ? 'snap.remove.checking' : 'snap.restore.checking')}</Band> : null}
            {restoring !== null ? <Band size="table">{t('snap.restore.busy', { label: restoring })}</Band> : null}
            {stopped ? <Band size="table" onDismiss={() => setStopped(null)}>{t(`snap.${stopped.change}.${stopped.why}`, { label: stopped.label })}</Band> : null}
            {taken ? <Band tone="warn" size="table" /* noDetails: the take succeeded; these are the notes of its answer */ onDismiss={() => setTaken(null)}>{t('snap.take.warned', { label: taken.label, notes: taken.warnings.join(' ') })}</Band> : null}
            {taking || take.held || taken ? null : <Outcome /* noDetails: only the done outcome is drawn here; a refusal shows in the drawer's footer with its details */ outcome={take.outcome?.kind === 'done' ? take.outcome : undefined} doneText={t('snap.take.done')} onDismiss={take.reset} />}
            {restore.held ? null : <Outcome outcome={restore.outcome} doneText={t('snap.restore.done')} detail={detailOf('restore', restore.outcome)} error={refusal(restore.outcome)} onDismiss={restore.reset} />}
            {remove.held ? null : <Outcome outcome={remove.outcome} doneText={t('snap.remove.done')} detail={detailOf('remove', remove.outcome)} error={refusal(remove.outcome)} onDismiss={remove.reset} />}
          </>
        }
        flush
      >
        <DataTable
          label={t('snap.label', { vm: name })}
          data={rows as Snapshot[]}
          columns={columns}
          getRowId={(s) => s.label}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          countLabel={(n) => t('snap.count', { count: n })}
          empty={<EmptyState icon="clock" size="sm" title={t('snap.empty.title')} body={t('snap.empty.body')} />}
          actions={rowActions}
        />
        <ConfirmDialog
          overlayId="vms-snap-restore"
          isOpen={askRestore !== null}
          onOpenChange={(o) => !o && setAskRestore(null)}
          title={t('snap.restore.title', { label: askRestore?.label ?? '' })}
          body={t('snap.restore.body', { vm: name })}
          confirmLabel={t('snap.restore.go')}
          tone="danger"
          onConfirm={() => { if (askRestore) void restoreNow(askRestore); }}
        />
        <ConfirmDialog
          overlayId="vms-snap-remove"
          isOpen={askRemove !== null}
          onOpenChange={(o) => !o && setAskRemove(null)}
          title={t('snap.remove.title', { label: askRemove?.label ?? '' })}
          body={t('snap.remove.body', { vm: name })}
          confirmLabel={t('snap.remove.go')}
          tone="danger"
          onConfirm={() => { if (askRemove) void removeNow(askRemove); }}
        />
        <Drawer
          overlayId="vms-snap-take"
          resizeKey="vms-snap-take"
          isOpen={taking && ready}
          onOpenChange={(o) => !o && !take.busy && setTaking(false)}
          title={t('snap.take.title', { vm: name })}
          subtitle={t('snap.take.slow')}
          size="sm"
          dirty={false}
          footer={
            <FormFooter
              dirty
              requireDirty={false}
              submitDisabled={check !== 'ok' || takeOff !== undefined}
              busy={take.busy || preTake}
              busyLabel={t('snap.take.busy')}
              outcome={take.outcome}
              error={snapErrKey('take', take.outcome?.code) ? undefined : refusal(take.outcome)}
              /* noDetails: a refusal the tab has its own sentence for shows that sentence (its code names it); every other refusal passes error= */
              submitLabel={t('snap.take.go')}
              onSubmit={() => void takeNow()}
            />
          }
        >
          <Form onSubmit={() => void takeNow()} busy={take.busy || preTake}>
            <TextField
              label={t('snap.take.field')}
              value={label}
              onChange={setLabel}
              description={t('snap.take.rule')}
              errorMessage={check === 'invalid' ? t('snap.take.rule') : check === 'taken' ? t('snap.take.taken') : undefined}
            />
            {takeUnread || detailOf('take', take.outcome) ? <Band tone={takeUnread ? 'neutral' : 'danger'} size="table" /* noDetails: the tab's own sentence for this refusal's code; the footer names the outcome */>{takeUnread ? t('snap.take.unread') : detailOf('take', take.outcome)}</Band> : null}
          </Form>
        </Drawer>
      </AnatomySection>
      {newest ? (
        <AnatomySection id="vm-snapshots-move" title={t('snap.move.title')} description={t('snap.move.about')} state={{ kind: 'ready' }}>
          <CodeBlock label={t('snap.move.code')} code={`hoody vm snapshots export create ${name} ${newest.label}`} lang="shell" prompt />
        </AnatomySection>
      ) : null}
    </>
  );
}
