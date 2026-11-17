// The Ports tab of one VM: the ports on the computer that lead into it, each tcp one with its web link, and the editor
// that replaces the whole list (the VM program replaces, it never merges).
// The list changes only while the VM is stopped; the button says why it cannot before the person tries. The editor
// checks every rule the VM program checks (ports-logic.ts) before sending; a port another VM already holds is known
// only from the refusal, which names that VM on the row. A change whose answer is lost is held until a fresh read of
// the same VM shows the new list, or the person stops tracking it.
import { isFramed, portAddress } from '@core';
import {
  AnatomySection, Band, Button, createColumnHelper, DataTable, Drawer, EmptyState, FormFooter, HeldBand, IconButton, NumberField,
  openOutside, Outcome, Row, Select, Stack, useStrings, type Option,
} from '@kit';
import { useEffect, useMemo, useState } from 'react';
import type { Host } from '../data';
import type { VmPort, VmReady } from '../logic';
import { vmCode } from '../logic';
import { checkPorts, conflictOf, conflictRow, draftsOf, hasWebLink, portFloor, portsToSend, PORTS_MAX, samePorts, suggestedHost, type PortDraft } from '../ports-logic';
import strings from '../strings.en.json';
import { editBlock, portsUpdate } from '../update-logic';
import { useVmChanges, type VmChanges } from '../update';
import { isVmUnsure, useVmUnsure } from './unsure';

const col = createColumnHelper<VmPort>();
/** A key of this page's strings (the words a rule picks). */
export type Key = Parameters<ReturnType<typeof useStrings<typeof strings>>>[0];

/** Why the list cannot be changed now (the words' key), or null. */
export function portsBlockKey(vm: VmReady, ch: Pick<VmChanges, 'held' | 'sending'>, framed: boolean): Key | null {
  if (framed) return 'settings.chg.why.framed';
  if (ch.held && !ch.held.gone) return 'settings.chg.why.held';
  if (ch.sending) return 'settings.chg.why.sending';
  const b = editBlock(vm);
  return b ? `settings.chg.why.${b}` as Key : null;
}

export function Ports({ vm, host }: { vm: VmReady; host: Host }) {
  const t = useStrings(strings);
  const ch = useVmChanges(host.target, vm);
  const [open, setOpen] = useState(false);
  const framed = isFramed();
  const floor = portFloor(host.state.kind === 'ready' ? host.state.caps.portFloor : null);
  const ports = vm.spec.ports;
  const target = host.target;
  // The reads on screen do not agree on which VM holds this name: no change is sent by name meanwhile.
  const unsure = useVmUnsure(vm.name);
  const why: Key | null = unsure ? 'power.why.unread' : portsBlockKey(vm, ch, framed);
  const idle = vm.state !== 'Running';
  // While the name is unsure, no editor stays open: the name may stand for another VM. The button says why.
  useEffect(() => { if (unsure) setOpen(false); }, [unsure]);

  const columns = useMemo(
    () => [
      col.accessor((p) => p.proto, { id: 'proto', header: t('ports.col.proto'), meta: { width: '110px' }, cell: (c) => t(c.getValue() === 'tcp' ? 'ports.tcp' : 'ports.udp') }),
      col.accessor((p) => p.host, { id: 'host', header: t('ports.col.host'), meta: { width: '150px', mono: true, priority: 1 } }),
      col.accessor((p) => p.guest, { id: 'guest', header: t('ports.col.guest'), meta: { width: '120px', mono: true } }),
    ],
    [t],
  );

  const held = ch.held;
  const result = ch.result && ch.result.op === 'ports' ? ch.result : null;
  const gone = held?.gone === true;
  const reason = held?.own && ch.heldError ? heldReason(ch.heldError) : null;
  const edit = { id: 'ports-edit', label: t(ports.length ? 'ports.edit' : 'ports.open'), icon: ports.length ? ('pen' as const) : ('plus' as const), opens: 'dialog' as const, onPress: () => { ch.clearResult(); setOpen(true); }, ...(why ? { disabledReason: t(why) } : {}) };

  return (
    <AnatomySection
      id="vm-ports"
      title={t('ports.title')}
      description={t('ports.about')}
      state={{ kind: 'ready' }}
      note={ports.some(hasWebLink) ? t('ports.webNote') : undefined}
      actions={{ primary: edit }}
      notices={
        held ? (
          <HeldBand
            /* A newer hold in its place remounts the band: a Stop tracking question open for the older one closes. */
            key={held.hold ?? String(held.change.at)}
            overlayId="vms-ports-held-dismiss"
            text={gone ? t('settings.chg.held.gone', { vm: vm.name }) : `${t(heldKey(held.op), { vm: vm.name })}${reason ? ` ${t(reason)}` : ''}`}
            readOnly={!held.own}
            dismissBody={t('settings.chg.held.dismissBody')}
            onCheck={() => ch.check(held)}
            onDismiss={() => ch.dismiss(held)}
          />
        ) : result && result.outcome === 'done' && !open ? (
          <Outcome outcome={{ kind: 'done' }} doneText={t('ports.saved')} />
        ) : undefined
      }
      flush
    >
      <DataTable
        bare
        fill={false}
        label={t('ports.label', { vm: vm.name })}
        data={ports as VmPort[]}
        columns={columns}
        getRowId={(p) => `${p.proto}/${p.host}`}
        actions={(p) => {
          if (!hasWebLink(p) || !target) return [];
          const url = portAddress(target.project, target.container, p.host);
          return [
            { id: 'open', label: t('ports.openLink', { port: p.host }), short: t('ports.openShort'), inline: true, icon: 'external' as const, onAction: () => { openOutside(url); }, ...(idle ? { isDisabled: true, disabledReason: t('ports.why.notRunning') } : {}) },
            { id: 'copy', label: t('ports.copyLink', { port: p.host }), icon: 'copy' as const, copy: url, onAction: () => undefined },
          ];
        }}
        empty={<EmptyState icon="hoody-kit" title={t('ports.empty.title')} body={t('ports.empty.body')} />}
      />
      {open && <PortsDrawer vm={vm} ch={ch} floor={floor} onClose={() => setOpen(false)} />}
    </AnatomySection>
  );
}

/** The held note's sentence key for what is held. */
export const heldKey = (op: string): Key =>
  ['settings', 'ports', 'discs', 'disk', 'swap', 'eject'].includes(op) ? `settings.chg.held.${op}` as Key : 'settings.chg.held.other';

/** The reason a pending answer carried, in plain words (only for the codes the program answers with a 5xx before it
 *  changed anything), or null. */
export const heldReason = (e: unknown): Key | null => {
  const c = vmCode(e);
  return c === 'InsufficientSpace' || c === 'MemoryExceedsCgroup' ? `settings.chg.held.${c}` as Key : null;
};

/** The words of a definite refusal of an update (a 4xx with the VM program's code). */
export const refusalKey = (e: unknown): Key => {
  const c = vmCode(e);
  const known = ['BadState', 'OperationInProgress', 'NotFound', 'SpecInvalid', 'PortForwardConflict', 'DisplayRangeExhausted', 'DisplayInUse', 'Orphaned'];
  return c && known.includes(c) ? `settings.chg.refused.${c}` as Key : 'settings.chg.refused.other';
};

const PROTOS = ['tcp', 'udp'] as const;

function PortsDrawer({ vm, ch, floor, onClose }: { vm: VmReady; ch: VmChanges; floor: { floor: number; confirmed: boolean }; onClose: () => void }) {
  const t = useStrings(strings);
  const [rows, setRows] = useState<PortDraft[]>(() => draftsOf(vm.spec.ports));
  const [tried, setTried] = useState(false);
  const checked = checkPorts(rows, floor.floor);
  const toSend = portsToSend(rows, floor.floor);
  const dirty = toSend === null || !samePorts(toSend, vm.spec.ports);
  const result = ch.result && ch.result.op === 'ports' ? ch.result : null;
  const conflict = result?.outcome === 'failed' ? conflictOf(result.error) : null;
  const conflictAt = conflict ? conflictRow(rows, conflict) : -1;
  const sending = ch.sending === 'ports';
  const protoOpts = useMemo((): Option<'tcp' | 'udp'>[] => PROTOS.map((p) => ({ value: p, label: t(p === 'tcp' ? 'ports.tcp' : 'ports.udp') })), [t]);

  const set = (i: number, patch: Partial<PortDraft>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const errOf = (i: number, field: 'guest' | 'host'): string | undefined => {
    if (field === 'host' && i === conflictAt && conflict) return t('ports.conflict', { port: conflict.host, proto: t(conflict.proto === 'tcp' ? 'ports.tcp' : 'ports.udp'), holder: conflict.holder });
    if (!tried) return undefined;
    const p = checked.rows.find((x) => x.index === i && x.field === field);
    return p ? t(`ports.err.${p.problem}` as Key, { floor: floor.floor }) : undefined;
  };
  const submit = () => {
    setTried(true);
    // Asked at the press: the VM's screen may have lost the name since the editor opened. Nothing is sent.
    if (!toSend || isVmUnsure(vm.name)) return;
    if (ch.update('ports', portsUpdate(toSend))) setTried(false);
  };
  // A pending answer closes the editor (the tab's note shows what is held); a done one closes it too.
  const closeNow = (ch.held !== null && !ch.held.gone) || result?.outcome === 'done';
  useEffect(() => { if (closeNow) onClose(); }, [closeNow, onClose]);
  // A refusal stays in the footer with its Details; a recognised conflict also names the VM on its row.
  const failure = result && result.outcome !== 'done' ? result : null;

  return (
    <Drawer
      overlayId="vms-ports-edit"
      resizeKey="vms-ports"
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('ports.drawer.title', { vm: vm.name })}
      subtitle={t('ports.drawer.subtitle')}
      size="lg"
      dirty={dirty}
      busy={sending}
      footer={
        <FormFooter
          dirty={dirty}
          busy={sending}
          submitLabel={t('ports.save')}
          submitDisabled={tried && toSend === null}
          onSubmit={submit}
          outcome={failure ? { kind: failure.outcome } : undefined}
          error={failure?.error}
          /* A refusal reads in the page's words, with Details. */
          failedDetail={failure?.outcome === 'failed' ? t(refusalKey(failure.error)) : undefined}
          /* A held answer is the tab's own note: no second word of it as a toast. */
          toastOnLeave={false}
        />
      }
    >
      <Stack gap={4}>
        <Band tone="neutral" /* noDetails: facts about the computer, not a rejection */>
          {rows.length === 0 ? t('ports.none') : t(floor.confirmed ? 'ports.floor' : 'ports.floor.unconfirmed', { floor: floor.floor })}
        </Band>
        {rows.map((r, i) => (
          <Row key={i} gap={2} align="start" wrap>
            <Select<'tcp' | 'udp'>
              aria-label={t('ports.row.proto', { n: i + 1 })}
              options={protoOpts}
              value={r.proto}
              onChange={(v) => set(i, { proto: v })}
              width="xs"
            />
            {/* The computer's port first, then the VM's: the order of the table's columns. */}
            <NumberField
              aria-label={t('ports.row.host', { n: i + 1 })}
              placeholder={t('ports.f.host')}
              value={r.host}
              onChange={(v) => set(i, { host: v })}
              formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
              errorMessage={errOf(i, 'host')}
              width="sm"
            />
            <NumberField
              aria-label={t('ports.row.guest', { n: i + 1 })}
              placeholder={t('ports.f.guest')}
              value={r.guest}
              onChange={(v) => set(i, { guest: v, ...(Number.isFinite(r.host) ? {} : { host: suggestedHost(v, floor.floor) }) })}
              formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
              errorMessage={errOf(i, 'guest')}
              width="sm"
            />
            <IconButton icon="trash" label={t('ports.row.remove', { n: i + 1 })} onPress={() => setRows((cur) => cur.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <Button
          variant="secondary"
          icon="plus"
          onPress={() => setRows((cur) => [...cur, { proto: 'tcp', guest: Number.NaN, host: Number.NaN }])}
          isDisabled={rows.length >= PORTS_MAX}
        >
          {t('ports.add')}
        </Button>
      </Stack>
    </Drawer>
  );
}

