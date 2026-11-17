// One VM's own screen (/vms/<name>): its header and its tabs. Each tab is a part of its own (parts/<Tab>.tsx).
// The name in the address is checked before the computer is asked anything; a VM that is not there says so, and never
// shows another VM's facts.
// The header holds the VM's power: one main action for its state, and the rest (with Delete) in the menu. A change that
// may have gone through, a refusal and the VM's own problems show as the page's notices, above every tab.
import { Band, Button, ComputerRequired, DetailPage, HeldBand, LinkButton, StatusPill, useGo, useStrings, type DetailTab, type MenuAction, type SectionState } from '@kit';
import { useCallback, useMemo, useState } from 'react';
import { useVmFlow, type VmRef } from '../changes';
import { useHost, useVmList, useVmPaced } from '../data';
import { links } from '../links';
import { hasSpec, isVmName } from '../logic';
import { blockOf, powerPlan, type VmOp } from '../power-logic';
import strings from '../strings.en.json';
import { useGate } from './gate';
import { Logs } from './Logs';
import { kindOf, Overview } from './Overview';
import { Ports } from './Ports';
import { Screen } from './Screen';
import { Settings } from './Settings';
import { Snapshots } from './Snapshots';
import { Storage } from './Storage';
import { KIND_TONE } from './tones';
import { useMarkVmUnsure } from './unsure';
import { VmAsk } from './VmAsk';
import { useVmWords } from './words';

export function VmScreen({ name }: { name: string }) {
  const t = useStrings(strings);
  const host = useHost();
  const gate = useGate(host);
  const valid = isVmName(name);
  const asks = valid && host.state.kind === 'ready';
  const words = useVmWords();
  const go = useGo();
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const read = useVmPaced(valid ? name : '', asks, changedAt);
  // The VM list is read here too: a delete is proved only by a whole list that no longer holds the VM's id.
  const list = useVmList(asks, changedAt);
  const shown = read.vm;
  const reread = useCallback(() => { setChangedAt(Date.now()); list.retry(); read.retry(); }, [list, read]);
  // A change is sent by name, so the reads must agree on which VM holds the name: the VM's own read failed or answers
  // "not there" and an older answer is kept, the list read failed (rows kept from before say nothing about now), or the
  // list read gives the name to another VM (or to none), and nothing is sent or asked.
  const unsure = !!shown && (read.failed || read.missing || list.failed || (list.rows !== undefined && !list.rows.some((r) => r.name === shown.name && r.vmId === shown.vmId)));
  // What this name is now, for a question asked about it: the VM read, nothing once it reads "not there" or the reads
  // do not agree.
  // The tabs ask this before they send anything (parts/unsure.ts).
  useMarkVmUnsure(host.target?.container.id ?? null, name, unsure);
  const present = useMemo(
    () => (shown && !unsure ? new Map([[shown.name, shown.vmId]]) : shown || read.missing ? new Map<string, string | null>() : undefined),
    [shown, unsure, read.missing],
  );
  const flow = useVmFlow({
    target: host.target, reread, present,
    // This VM was deleted: its screen has nothing left to show.
    onDone: (op, v) => { if (op === 'delete' && v.name === name && (!shown || shown.vmId === v.vmId)) go(links.list); },
  });
  const computer = host.name;
  const crumb = { label: t('vm.crumb'), href: links.list };
  if (host.state.kind === 'none') return <ComputerRequired state="none" header={{ title: t('title'), subtitle: t('subtitle.none') }} />;
  // An address is never echoed as a title: the name shows only once it is known to be a VM name.
  if (!valid) {
    return (
      <DetailPage
        header={{ title: t('title'), breadcrumbs: [crumb] }}
        state={{ kind: 'notHere', icon: 'hoody-kit', title: t('vm.badName.title'), body: t('vm.badName.body'), action: { id: 'all-vms', label: t('st.allVms'), href: links.list } }}
      />
    );
  }
  const vm = read.vm;
  const kind = vm ? kindOf(vm) : null;
  // What the VM offers in its state, and why each action cannot be sent now. A press names the VM by its own id.
  const plan = vm && kind ? powerPlan(kind, vm.monitorStalled) : null;
  const ref: VmRef | null = vm && vm.vmId ? { vmId: vm.vmId, name: vm.name, run: vm.run, neverCreated: kind === 'createFailed' } : null;
  const sending = ref ? flow.sending(ref.vmId) : false;
  const block = (op: VmOp) =>
    vm && kind
      ? blockOf(op, { framed: flow.framed, sending, held: ref ? flow.held(ref.vmId) !== null : false, vmId: vm.vmId, kind, host: host.state, memoryMib: vm.spec?.memoryMib ?? null, vcpus: vm.spec?.vcpus ?? null, read: true, unsure })
      : null;
  const press = (op: VmOp) => { if (ref && !unsure) flow.press(op, ref); };
  const primary = plan?.primary ?? null;
  const danger = (op: VmOp) => op === 'delete' || op === 'forceStop';
  // The other actions, each written out in the menu's fixed order; a VM's state picks which of them it offers.
  const offers = (op: VmOp) => plan !== null && plan.menu.includes(op);
  const why = (op: VmOp) => {
    const b = block(op);
    // The menu's short reasons: only the blocks an action other than Start can meet.
    return b === 'framed' || b === 'noId' || b === 'sending' || b === 'held' || b === 'running' || b === 'unread' ? t(`power.short.${b}`) : undefined;
  };
  const menu: MenuAction[] = [
    ...(offers('stop') ? [{ id: 'stop', label: t('power.stop'), isDisabled: why('stop') !== undefined, disabledReason: why('stop'), onAction: () => press('stop') }] : []),
    ...(offers('pause') ? [{ id: 'pause', label: t('power.pause'), isDisabled: why('pause') !== undefined, disabledReason: why('pause'), onAction: () => press('pause') }] : []),
    ...(offers('reset') ? [{ id: 'reset', label: t('power.reset'), opens: true, isDisabled: why('reset') !== undefined, disabledReason: why('reset'), onAction: () => press('reset') }] : []),
    ...(offers('forceStop') ? [{ id: 'forceStop', label: t('power.forceStop'), tone: 'danger' as const, opens: true, isDisabled: why('forceStop') !== undefined, disabledReason: why('forceStop'), onAction: () => press('forceStop') }] : []),
    ...(offers('delete') ? [{ id: 'delete', label: t('power.delete'), tone: 'danger' as const, opens: true, isDisabled: why('delete') !== undefined, disabledReason: why('delete'), onAction: () => press('delete') }] : []),
  ];
  // The change of this VM that may have gone through: this VM's by its id, else one sent under this name earlier (a VM
  // that is gone, or was replaced under its name).
  const held = (ref ? flow.held(ref.vmId) : null) ?? flow.allHeld.find((h) => h.own && h.id?.name === name) ?? null;
  const ownHeld = held && held.own && held.id ? held : null;
  const result = ref ? flow.result(ref.vmId) : null;
  const header = {
    title: name,
    subtitle: computer ? t('vm.subtitle', { name: computer }) : undefined,
    breadcrumbs: [crumb, { label: name }],
    meta: kind ? <StatusPill tone={KIND_TONE[kind]} dot>{t(`state.${kind}`)}</StatusPill> : undefined,
    actions: primary ? (
      <Button
        variant={danger(primary) ? 'secondary' : 'primary'}
        tone={danger(primary) ? 'danger' : 'default'}
        busy={sending}
        isDisabled={!sending && block(primary) !== null}
        disabledReason={sending ? undefined : words.why(block(primary))}
        onPress={() => press(primary)}
      >
        {primary === 'delete' && kind === 'createFailed' ? t('delete.remove') : t(`power.${primary}`)}
      </Button>
    ) : undefined,
  };
  if (gate) {
    return (
      <DetailPage
        header={header}
        notice={
          <Band
            tone={gate.tone}
            error={gate.error}
            actions={
              <>
                {gate.recheck ? <Button size="sm" busy={gate.recheck.busy} onPress={gate.recheck.run}>{t('st.check')}</Button> : null}
                {gate.href ? <LinkButton size="sm" href={gate.href}>{gate.kind === 'shared' ? t('st.shared.action') : t('st.openComputers')}</LinkButton> : null}
              </>
            }
          >
            {gate.text}
          </Band>
        }
      />
    );
  }
  if (read.missing) {
    return (
      <DetailPage
        header={header}
        notice={
          ownHeld ? (
            <HeldBand
              text={words.held(ownHeld)}
              readOnly={false}
              onCheck={() => flow.check(ownHeld)}
              onDismiss={() => flow.dismiss(ownHeld)}
              overlayId="vms-vm-held-gone"
              note={words.note(ownHeld, list.rows, undefined)}
              inFlight={flow.sending(ownHeld.vmId)}
            />
          ) : undefined
        }
        state={{ kind: 'notHere', icon: 'hoody-kit', title: t('vm.missing.title', { vm: name, name: computer }), body: t('vm.missing.body'), action: { id: 'all-vms', label: t('st.allVms'), href: links.list } }}
      />
    );
  }
  // This VM's own read: the first one, a failed one with nothing kept, a kept answer after a failed one, or the VM.
  if (!vm) {
    return <DetailPage header={header} state={read.failed ? { kind: 'failed', error: read.error, onRetry: read.retry, busy: read.fetching } : { kind: 'loading', rows: 4 }} />;
  }
  const state: SectionState = read.failed ? { kind: 'stale', shown: 1, error: read.error, onRetry: read.retry, busy: read.fetching } : { kind: 'ready' };
  // The tabs, in their fixed order, one per line. A VM that exists (its settings are read) has them all; one still
  // being created, or one that was not created, has its Overview only. The open tab is ?tab=<id>.
  const tabs: DetailTab[] = [
    { id: 'overview', label: t('tab.overview'), content: <Overview vm={vm} host={host} /> },
  ];
  if (hasSpec(vm)) {
    // Each tab adds its own line here, in the order screen, ports, storage, snapshots, settings, logs.
    // Inside this block `vm` is a VmReady (its `spec` is never null).
    // Each tab is keyed by the computer and the VM's own id: when another VM takes the name, or another computer is
    // shown (it may hold a VM with the same id), every tab starts over, so a draft or an open question about the
    // earlier VM never carries over to another one.
    const tabKey = `${host.target?.project.id ?? '-'}/${host.target?.container.id ?? '-'}/${vm.vmId ?? 'no-id'}`;
    tabs.push(
      { id: 'screen', label: t('tab.screen'), content: <Screen key={tabKey} vm={vm} host={host} /> },
      { id: 'ports', label: t('tab.ports'), content: <Ports key={tabKey} vm={vm} host={host} /> },
      { id: 'storage', label: t('tab.storage'), content: <Storage key={tabKey} vm={vm} host={host} /> },
      { id: 'snapshots', label: t('tab.snapshots'), content: <Snapshots key={tabKey} vm={vm} /> },
      { id: 'settings', label: t('tab.settings'), content: <Settings key={tabKey} vm={vm} host={host} /> },
      { id: 'logs', label: t('tab.logs'), content: <Logs key={tabKey} vm={vm} /> },
    );
  }
  // A problem the VM carries shows in every state; a failed create's own reason stands in for it.
  const fault = vm.fault ?? vm.progress?.fault ?? null;
  const notices = ownHeld !== null || result !== null || vm.monitorStalled || kind === 'orphaned' || fault !== null;
  return (
    <>
      <DetailPage
        header={header}
        menu={menu}
        state={state}
        tabs={tabs}
        notice={
          notices ? (
            <>
              {ownHeld ? (
                <HeldBand
                  text={words.held(ownHeld)}
                  readOnly={false}
                  onCheck={() => flow.check(ownHeld)}
                  onDismiss={() => flow.dismiss(ownHeld)}
                  overlayId="vms-vm-held"
                  note={words.note(ownHeld, list.rows, vm)}
                  inFlight={flow.sending(ownHeld.vmId)}
                />
              ) : null}
              {result && ref ? (
                <Band tone={result.outcome === 'failed' ? 'danger' : 'warn'} error={result.error} onDismiss={() => flow.clearResult(ref.vmId)}>
                  {words.result(result)}
                </Band>
              ) : null}
              {vm.monitorStalled ? <Band tone="warn" /* noDetails: the VM's own state, no request was refused */>{t('vm.stalled')}</Band> : null}
              {kind === 'orphaned' ? <Band tone="warn" /* noDetails: the VM's own state, no request was refused */>{t('vm.orphaned')}</Band> : null}
              {fault ? <Band tone="danger" /* noDetails: the problem the VM recorded, in this page's words; no request was refused */>{words.fault(fault)}</Band> : null}
            </>
          ) : undefined
        }
      />
      <VmAsk flow={flow} computer={computer} />
    </>
  );
}
