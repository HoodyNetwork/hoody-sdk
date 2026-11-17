// The VM list of the shown computer, as the page's "VMs" section: every VM with its state, what it runs with, and its
// power. Search, the state filter, sort and paging are the kit table's; a row opens the VM's own screen.
//
// The list read gives each VM's name and state. Memory, CPUs, disk, screen and ports come from each VM's own read,
// made only for the rows of the table page on screen; a cell whose read has not answered is left empty, never zero.
// Each row offers the one action its state calls for, and the rest in its menu (power-logic powerPlan); an action that
// cannot be sent now stays visible with its reason. A change that may have gone through, and a refusal, show as the
// section's notices: they name the VM, so they stay readable when its row is on another table page or gone.
// The section draws the list read's states (first read, failed, kept rows after a failure); the table draws its own
// "no VMs yet". The page shows this section only while the VM program answers or is still being asked (parts/gate.ts).
import {
  AnatomySection, Band, Button, createColumnHelper, DataTable, EmptyState, formatBytes, HeldBand, StatusPill, useDataView, useGo, useStrings,
  type RowActionEntry, type SectionState,
} from '@kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVmFlow, type VmRef } from '../changes';
import { useVmDetails, useVmList, type Host, type VmListRead, type VmRead } from '../data';
import { links } from '../links';
import { rowKind, type RowKind, type VmRow, type VmSpec } from '../logic';
import { blockOf, CONFIRMED_OPS, powerPlan, type VmOp } from '../power-logic';
import strings from '../strings.en.json';
import { KIND_TONE } from './tones';
import { VmAsk } from './VmAsk';
import { useVmWords } from './words';

export { KIND_TONE } from './tones';

/** Rows a person should look at first sort first. */
const ORDER: readonly RowKind[] = ['runFailed', 'createFailed', 'orphaned', 'creating', 'starting', 'stopping', 'running', 'paused', 'stopped', 'unknown'];
const col = createColumnHelper<VmRow>();
const MIB = 1024 * 1024;

const NO_ROWS: readonly VmRow[] = [];
/** The rows shown per table page. */
export const VM_PAGE_SIZE = 10;

const NO_SPECS: ReadonlyMap<string, VmSpec> = new Map();
/** The row's own read, answered now and about this very VM: the list and the VM's own read agree on which VM holds the
 *  name. Anything else (not read yet, a failed read, "not there" with an older answer kept, another VM under the name)
 *  proves nothing, and a change sent by that name could reach whatever holds it by then. */
const provenRead = (details: ReadonlyMap<string, VmRead>, r: VmRow): VmRead['vm'] => {
  const d = details.get(r.name);
  return d && d.vm && !d.failed && !d.missing && r.vmId && d.vm.vmId === r.vmId ? d.vm : undefined;
};

/** `onNew`: opens New VM, where one can be made; the empty list then carries it beside its words. */
export function VmTable({ host, list, onNew }: { host: Host; list: VmListRead; onNew?: () => void }) {
  const t = useStrings(strings);
  const words = useVmWords();
  const go = useGo();
  const name = host.name;
  const rows = list.rows ?? NO_ROWS;
  const reads = host.state.kind === 'ready';
  // The person's own change keeps the list read at its fast pace for a minute: this second reader of the same list
  // only sets that pace.
  const [changedAt, setChangedAt] = useState<number | null>(null);
  useVmList(reads, changedAt);
  // The settings read so far, by VM name: the cells read them, so they are kept in state that the columns follow.
  const [specs, setSpecs] = useState(NO_SPECS);
  const fact = (r: VmRow, show: (s: VmSpec) => string): string => { const s = specs.get(r.name); return s ? show(s) : ''; };
  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('list.col.name'), meta: { pinned: true, mono: true, list: 'primary' } }),
      col.accessor((r) => ORDER.indexOf(rowKind(r)), {
        id: 'state',
        header: t('list.col.state'),
        meta: { width: '140px', priority: 1, list: 'status' },
        cell: (c) => {
          const kind = rowKind(c.row.original);
          return <StatusPill tone={KIND_TONE[kind]} dot>{t(`state.${kind}`)}</StatusPill>;
        },
      }),
      col.display({
        id: 'memory', header: t('list.col.memory'), meta: { width: '110px', priority: 2, align: 'end' },
        cell: (c) => fact(c.row.original, (s) => formatBytes(s.memoryMib * MIB)),
      }),
      col.display({
        id: 'cpus', header: t('list.col.cpus'), meta: { width: '80px', priority: 3, align: 'end' },
        cell: (c) => fact(c.row.original, (s) => String(s.vcpus)),
      }),
      col.display({
        id: 'disk', header: t('list.col.disk'), meta: { width: '110px', priority: 3, align: 'end' },
        cell: (c) => fact(c.row.original, (s) => (s.diskBytes === null ? '' : formatBytes(s.diskBytes))),
      }),
      col.display({
        id: 'screen', header: t('list.col.screen'), meta: { width: '90px', priority: 4 },
        cell: (c) => fact(c.row.original, (s) => t(s.display !== null ? 'vm.on' : 'vm.off')),
      }),
      col.display({
        id: 'ports', header: t('list.col.ports'), meta: { width: '80px', priority: 4, align: 'end' },
        cell: (c) => fact(c.row.original, (s) => String(s.ports.length)),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fact reads only specs
    [t, specs],
  );
  const view = useDataView<VmRow>({
    rows: rows as VmRow[],
    columns,
    getRowId: (r) => r.name,
    search: (r) => [r.name, t(`state.${rowKind(r)}`)],
    filters: [{ id: 'state', label: t('list.filter.state'), value: (r) => rowKind(r), optionLabel: (v) => t(`state.${v as RowKind}`) }],
    sort: 'state',
    pageSize: VM_PAGE_SIZE,
  });
  // Each VM of the table page on screen, read on its own.
  const shownNames = useMemo(() => view.rows.map((r) => r.name), [view.rows]);
  // None while the list read failed: rows kept from before say nothing about now.
  const details = useVmDetails(shownNames, reads && !list.failed);
  const unread = shownNames.filter((n) => details.get(n)?.failed).length;
  useEffect(() => {
    const next = new Map<string, VmSpec>();
    for (const [n, d] of details) if (d.vm?.spec) next.set(n, d.vm.spec);
    setSpecs((was) => (was.size === next.size && [...next].every(([n, sp]) => was.get(n) === sp) ? was : next));
  }, [details]);

  const reread = useCallback((vm?: string) => {
    setChangedAt(Date.now());
    list.retry();
    if (vm) details.get(vm)?.retry();
  }, [list, details]);
  // What each name is now, for a question asked about a row: only a row whose own read agrees with the list counts. A row
  // whose VM was replaced under its name, whose own read failed, answers "not there" or has not answered, and every row
  // while the list read failed, is left out: a question about it closes, and its confirm sends nothing.
  const present = useMemo(
    () => (list.rows ? new Map(list.failed ? [] : list.rows.filter((r) => provenRead(details, r)).map((r) => [r.name, r.vmId])) : undefined),
    [list.rows, list.failed, details],
  );
  const flow = useVmFlow({ target: host.target, reread, present });

  const actions = (r: VmRow): RowActionEntry[] => {
    const kind = rowKind(r);
    // The VM's own read counts only while it answers now and is about this very VM, and the list read is not failing.
    const d = list.failed ? undefined : provenRead(details, r);
    // No such read: nothing is sent by this row's name, and every action says it is still reading the VM.
    const unsure = d === undefined;
    const plan = powerPlan(kind, d?.monitorStalled === true);
    const ref: VmRef | null = r.vmId ? { vmId: r.vmId, name: r.name, run: d?.run ?? null, neverCreated: kind === 'createFailed' } : null;
    const sending = ref ? flow.sending(ref.vmId) : false;
    const why = (op: VmOp) =>
      words.why(blockOf(op, {
        framed: flow.framed, sending, held: ref ? flow.held(ref.vmId) !== null : false, vmId: r.vmId, kind, host: host.state,
        memoryMib: d?.spec?.memoryMib ?? null, vcpus: d?.spec?.vcpus ?? null, read: d !== undefined, unsure,
      }));
    const entry = (op: VmOp, inline: boolean): RowActionEntry => {
      const reason = why(op);
      const remove = op === 'delete' && kind === 'createFailed';
      return {
        id: op,
        label: remove ? t('delete.remove.named', { vm: r.name }) : t(`power.named.${op}`, { vm: r.name }),
        short: remove ? t('delete.remove') : t(`power.${op}`),
        ...(inline ? { inline: true } : {}),
        tone: op === 'delete' || op === 'forceStop' ? 'danger' : 'default',
        opens: CONFIRMED_OPS.includes(op),
        isDisabled: reason !== undefined,
        disabledReason: reason,
        onAction: () => { if (ref && !unsure) flow.press(op, ref); },
      };
    };
    return [...(plan.primary ? [entry(plan.primary, true)] : []), ...plan.menu.map((op) => entry(op, false))];
  };

  // The list's own read: the first one, a failed one with nothing kept, kept rows after a failed one, or rows.
  const state: SectionState = list.rows
    ? list.failed ? { kind: 'stale', shown: list.rows.length, error: list.error, onRetry: list.retry, busy: list.fetching } : { kind: 'ready' }
    : list.failed
      ? { kind: 'failed', error: list.error, onRetry: list.retry, busy: list.fetching }
      : { kind: 'loading', rows: 5, variant: 'table' };
  // One notice at a time: the oldest change that may have gone through, else the last refusal. The next one shows once
  // this one is settled; each VM's own screen shows its own.
  const held = flow.allHeld.find((h) => h.own && h.id) ?? null;
  const result = flow.results[flow.results.length - 1] ?? null;
  return (
    <>
      <AnatomySection
        id="vms-list"
        title={t('list.title')}
        state={state}
        flush
        note={unread > 0 ? t('list.unread', { count: unread }) : undefined}
        notices={
          held ? (
            <HeldBand
              text={words.held(held)}
              readOnly={false}
              onCheck={() => flow.check(held)}
              onDismiss={() => flow.dismiss(held)}
              overlayId="vms-list-held"
              note={words.note(held, list.rows, undefined)}
              inFlight={flow.sending(held.vmId)}
            />
          ) : result ? (
            <Band tone={result.outcome === 'failed' ? 'danger' : 'warn'} error={result.error} onDismiss={() => flow.clearResult(result.vmId)}>
              {words.result(result)}
            </Band>
          ) : undefined
        }
      >
        <DataTable
          label={t('list.label', { name })}
          columns={columns}
          view={view}
          actions={actions}
          onRefresh={list.retry}
          noMatch={t('list.noMatch')}
          countLabel={(n) => t('list.count', { count: n })}
          onRowAction={(r) => go(links.item(r.name))}
          storageKey="vms"
          empty={
            <EmptyState
              icon="hoody-kit"
              title={t('list.empty.title', { name })}
              body={t('list.empty.body')}
              action={onNew ? <Button icon="plus" onPress={onNew}>{t('create.open')}</Button> : undefined}
            />
          }
        />
      </AnatomySection>
      <VmAsk flow={flow} computer={name} />
    </>
  );
}
