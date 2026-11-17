// The "KVM on computers" view: every computer of the shown realm (All realms: all of them) with whether it can run VMs,
// from the one computers list read the shell keeps. Each row offers the same KVM flow as "This computer" (kvm.ts), bound
// to that row's computer: Turn on KVM, or, when it is on, Open VMs (that computer becomes the current one) with Turn off
// KVM in its menu. A computer that cannot run VMs offers nothing and says why. A kind of server that is not known shows
// nothing: it is never called shared.
import { chooseComputer, isFramed, useComputersAll } from '@core';
import {
  AnatomySection, Band, Button, ComputerLink, createColumnHelper, DataTable, EmptyState, HeldBand, StatusPill, useDataView, useGo,
  useStrings, type RowActionEntry, type SectionState, type Tone,
} from '@kit';
import { useMemo } from 'react';
import { kvmFactsOfRow, useKvmFlow, type KvmTarget } from '../kvm';
import { kvmAction, type KvmAction, type KvmFacts } from '../kvm-logic';
import { links } from '../links';
import strings from '../strings.en.json';
import { heldKey, KvmDialog, KvmOutcome } from './KvmSection';

interface KvmRow { readonly target: KvmTarget; readonly action: KvmAction; readonly row: unknown }

const col = createColumnHelper<KvmRow>();
const NO_ROWS: readonly KvmRow[] = [];

/** The KVM word of a row: on, off, not possible (off and cannot be turned on), or nothing (not known). */
type KvmWord = 'on' | 'off' | 'no' | null;
const wordOf = (f: KvmFacts, a: KvmAction): KvmWord => (f.kvm === true ? 'on' : a.kind === 'blocked' ? 'no' : f.kvm === false ? 'off' : null);
const WORD_TONE: Record<Exclude<KvmWord, null>, Tone> = { on: 'ok', off: 'neutral', no: 'neutral' };
/** The state word of a computer (its status; paused apart from stopped, since only stopped lets KVM change). */
const stateOf = (status: string): 'running' | 'stopped' | 'paused' | 'starting' | 'other' =>
  status === 'running' || status === 'stopped' || status === 'paused' ? status : /^(starting|creating|provisioning|restarting|pending)$/.test(status) ? 'starting' : 'other';

export function KvmTab() {
  const t = useStrings(strings);
  const go = useGo();
  const all = useComputersAll();
  const flow = useKvmFlow(all.retry);
  const framed = isFramed();
  const rows = useMemo((): readonly KvmRow[] => {
    if (!all.rows) return NO_ROWS;
    const out: KvmRow[] = [];
    for (const row of all.rows) {
      const facts = kvmFactsOfRow(row);
      if (facts) out.push({ target: { id: facts.id, name: facts.name, facts }, action: kvmAction(facts), row });
    }
    return out;
  }, [all.rows]);

  const columns = useMemo(
    () => [
      col.accessor((r) => r.target.name, {
        id: 'name',
        header: t('kvm.col.computer'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => <ComputerLink name={c.row.original.target.name} id={c.row.original.target.id} variant="nav" cut />,
      }),
      col.accessor((r) => (r.target.facts.kind === 'bare_metal' ? t('host.server.bare') : r.target.facts.kind === 'shared' ? t('host.server.shared') : ''), {
        id: 'server',
        header: t('kvm.col.server'),
        meta: { width: '140px', priority: 2 },
      }),
      col.accessor((r) => wordOf(r.target.facts, r.action) ?? '', {
        id: 'kvm',
        header: t('kvm.col.kvm'),
        meta: { width: '170px', priority: 1, list: 'status' },
        cell: (c) => {
          const { target, action } = c.row.original;
          const w = wordOf(target.facts, action);
          if (!w) return null;
          // Not possible says why in the cell itself: a shared server, a server that allows no VMs, an expired computer.
          return <StatusPill tone={WORD_TONE[w]} dot>{action.kind === 'blocked' ? t(`kvm.pill.no.${action.reason}`) : t(`kvm.pill.${w}`)}</StatusPill>;
        },
      }),
      col.accessor((r) => stateOf(r.target.facts.status), {
        id: 'state',
        header: t('kvm.col.state'),
        meta: { width: '130px', priority: 3, list: false },
        cell: (c) => t(`kvm.status.${stateOf(c.row.original.target.facts.status)}`),
      }),
    ],
    [t],
  );

  const actions = (r: KvmRow): readonly RowActionEntry[] => {
    const { target, action } = r;
    const name = target.name;
    const busy = flow.sending(target.id) || flow.held(target.id) !== null;
    const off = framed ? t('kvm.why.framed') : busy ? t('kvm.why.busy') : action.kind === 'turn' && action.step === 'wait' ? t('kvm.why.wait') : undefined;
    const out: RowActionEntry[] = [];
    if (flow.startOffered(target)) out.push({ id: 'start', label: t('kvm.tab.startFor', { name }), short: t('kvm.start'), inline: true, isDisabled: framed, ...(framed ? { disabledReason: t('kvm.why.framed') } : {}), onAction: () => flow.start(target) });
    if (action.kind !== 'turn') return out;
    if (action.want) {
      out.push({ id: 'on', label: t('kvm.tab.onFor', { name }), short: t('kvm.tab.on'), inline: true, isDisabled: off !== undefined, ...(off ? { disabledReason: off } : {}), onAction: () => flow.press(target) });
      return out;
    }
    out.push({
      id: 'open', label: t('kvm.tab.openFor', { name }), short: t('kvm.tab.open'), inline: true,
      onAction: () => { chooseComputer(r.row as Parameters<typeof chooseComputer>[0]); go(links.list); },
    });
    out.push({ id: 'off', label: t('kvm.tab.offFor', { name }), opens: true, isDisabled: off !== undefined, ...(off ? { disabledReason: off } : {}), onAction: () => flow.press(target) });
    return out;
  };

  const view = useDataView<KvmRow>({
    rows: rows as KvmRow[],
    columns,
    getRowId: (r) => r.target.id,
    search: (r) => [r.target.name],
    sort: 'name',
  });
  const state: SectionState = all.rows
    ? all.failed ? { kind: 'stale', shown: rows.length, error: all.error, onRetry: all.retry, busy: all.loading } : { kind: 'ready' }
    : all.failed
      ? { kind: 'failed', error: all.error, onRetry: all.retry, busy: all.loading }
      : { kind: 'loading', rows: 5, variant: 'table' };

  // What may have gone through, and the last definite refusals, one line per computer above the table.
  const helds = rows.filter((r) => flow.held(r.target.id) !== null);
  const refused = rows.filter((r) => flow.held(r.target.id) === null && flow.result(r.target.id) !== null);
  const stopped = rows.filter((r) => {
    const res = flow.result(r.target.id);
    return flow.held(r.target.id) === null && res?.outcome === 'done' && res.what === 'stop' && r.target.facts.status === 'stopped' && r.target.facts.kvm !== res.want;
  });
  return (
    <AnatomySection id="vms-kvm" title={t('kvm.tab.title')} state={state} flush>
      {helds.map((r) => {
        const h = flow.held(r.target.id)!;
        return (
          <HeldBand
            key={r.target.id}
            overlayId="vms-kvm-tab-held-dismiss"
            text={t(heldKey(h.what, h.want), { name: r.target.name })}
            readOnly={!h.own}
            onCheck={() => flow.check(r.target.id)}
            onDismiss={() => flow.dismiss(r.target.id)}
          />
        );
      })}
      {stopped.map((r) => {
        const res = flow.result(r.target.id)!;
        return (
          <Band key={r.target.id} tone="neutral" size="table" actions={<Button size="sm" onPress={() => flow.press(r.target)} isDisabled={framed}>{t(res.want ? 'kvm.tab.on' : 'kvm.tab.off')}</Button>}>
            {t(res.want ? 'kvm.next.on' : 'kvm.next.off', { name: r.target.name })}
          </Band>
        );
      })}
      {refused.map((r) => <KvmOutcome key={r.target.id} flow={flow} id={r.target.id} name={r.target.name} />)}
      <DataTable
        label={t('kvm.tab.label')}
        columns={columns}
        view={view}
        actions={actions}
        onRowAction={false}
        onRefresh={all.retry}
        noMatch={t('kvm.tab.noMatch')}
        countLabel={(n) => t('kvm.tab.count', { count: n })}
        storageKey="vms-kvm"
        empty={<EmptyState icon="computer" title={t('kvm.tab.empty')} />}
      />
      <KvmDialog flow={flow} />
    </AnatomySection>
  );
}
