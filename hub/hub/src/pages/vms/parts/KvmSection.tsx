// "This computer": two titled groups. "KVM" holds the KVM row (the switch, or KVM's state with its
// help) on the kit's form measure. "Room for VMs", once the VM program answers, holds every read-only fact of the card in
// ONE Facts grid: the kind of server (and "Not allowed"), then memory, the counts and the disk, so every label/value pair
// sits in one grid of cells. Before that answer the server facts close the first group. What is held, refused or
// next for the switch shows as the section's notices, above both groups.
// The KVM row says what its state means for VMs in its help, so nothing repeats the switch: while the switch shows there
// is no separate KVM fact; without it (the row does not say whether KVM is on) the same row shows the state as a value.
// A server kind that could not be checked is a Server row that says "Not known" and why; it is never called shared.
// The switch is the KVM flow of kvm.ts: on a stopped computer it acts (turning off is confirmed), on a running one it
// asks to stop the computer first; turning on is refused here only on what the computer's row proves (kvm-logic.ts).
// The section stays on screen whatever the gate says (stopped, expired, shared, unreachable, unreadable): KVM is changed
// here.
import {
  AnatomySection, Band, Button, ConfirmDialog, Facts, formatBytes, HeldBand, Outcome, SettingGroup, SettingRow, SettingSwitch, SubSection,
  useStrings, type Fact, type SectionState,
} from '@kit';
import { isFramed } from '@core';
import type { Host } from '../data';
import { useKvmFacts, useKvmFlow, type KvmFlow, type KvmTarget } from '../kvm';
import { kvmAction, kvmRefusal } from '../kvm-logic';
import { memoryUse, startBlock, type Caps, type HostFacts, type KvmStand } from '../logic';
import strings from '../strings.en.json';
import css from './KvmSection.module.css';

const MIB = 1024 * 1024;

export function KvmSection({ host }: { host: Host }) {
  const t = useStrings(strings);
  const kvmFacts = useKvmFacts(host);
  const flow = useKvmFlow(host.recheck);
  const facts: HostFacts | null = host.facts.kind === 'ok' ? host.facts.facts : null;
  const ready = host.state.kind === 'ready' ? host.state : null;
  const caps: Caps | null = ready ? ready.caps : null;
  // KVM for the computer: with the VM program's answer, what both places say; without it, the Hoody API's switch alone.
  const kvm: KvmStand = ready ? ready.kvm : facts?.kvm === true ? 'on' : facts?.kvm === false ? 'off' : 'unknown';

  // The room VMs share, known only from the VM program's answer.
  const items: Fact[] = [];
  if (caps) {
    const m = memoryUse(caps);
    if (m.holdsAll) {
      // One run the VM program cannot size holds all of it (no meter: there is no size to show).
      items.push({ label: t('host.memory'), value: t('host.memory.allHeld') });
    } else if (m.ceilingBytes === null) {
      // No memory limit is set for VMs here: what they hold, with no meter and no "of" total.
      items.push({ label: t('host.memory'), value: t('host.memory.valueNoLimit', { used: formatBytes(m.usedBytes) }) });
    } else {
      const percent = m.ceilingBytes > 0 ? Math.min(100, Math.round((m.usedBytes / m.ceilingBytes) * 100)) : 0;
      items.push({
        label: t('host.memory'),
        value: t('host.memory.value', { used: formatBytes(m.usedBytes), total: formatBytes(m.ceilingBytes) }),
        meter: { value: percent, label: t('host.memory.meter', { percent }) },
      });
    }
    // The largest VM that can start, only while a VM can start here at all (KVM on and usable): otherwise the KVM row
    // already says no VM can start, and a size would contradict it.
    if (ready && startBlock(ready) === null) {
      const fits = m.freeForNewVmMib === null ? t('host.fits.noLimit') : m.freeForNewVmMib > 0 ? formatBytes(m.freeForNewVmMib * MIB) : t('host.fits.none');
      items.push({ label: t('host.fits'), value: fits });
    }
    // The two budgets carry a bar under their words: how much of the limit is in use.
    for (const [label, b] of [[t('host.running'), caps.budgets.vms], [t('host.cpus'), caps.budgets.vcpus]] as const) {
      if (!b) continue;
      const words = t('host.budget', { used: b.used, max: b.ceiling });
      items.push({ label, value: words, meter: { value: b.ceiling > 0 ? (b.used / b.ceiling) * 100 : 0, label: `${label}: ${words}` } });
    }
    items.push({ label: t('host.disk'), value: formatBytes(caps.freeDiskBytes) });
  }

  // The switch: shown while the row says whether KVM is on.
  const target: KvmTarget | null = kvmFacts && host.target ? { id: kvmFacts.id, name: host.name || kvmFacts.name, facts: kvmFacts } : null;
  const action = kvmFacts ? kvmAction(kvmFacts) : null;
  const framed = isFramed();
  const held = target ? flow.held(target.id) : null;
  const busy = target ? flow.sending(target.id) || held !== null : false;
  const result = target ? flow.result(target.id) : null;
  const blocked = action?.kind === 'blocked' ? action.reason : null;
  const waiting = action?.kind === 'turn' && action.step === 'wait';
  // The next step after one of the person's presses: KVM after a stop (on or off), or Start computer after KVM changed.
  const next: 'on' | 'off' | 'start' | null = !target || held ? null
    : flow.startOffered(target) ? 'start'
    : result?.outcome === 'done' && result.what === 'stop' && kvmFacts?.status === 'stopped' && kvmFacts.kvm !== result.want ? (result.want ? 'on' : 'off')
    : null;

  // The KVM row's help: the thing that most changes what the person can do with KVM here.
  const kvmHelp =
    framed && action?.kind === 'turn' ? t('kvm.why.framed')
    : blocked ? t(`kvm.why.${blocked}`)
    : waiting ? t('kvm.why.wait')
    : kvm === 'notInside' ? t('host.note.notInside')
    : kvm === 'off' && facts?.kind !== 'shared' ? t('host.note.kvmOff')
    : kvm === 'on' ? t('host.note.kvmOn')
    : undefined;
  const hasSwitch = target !== null && action !== null && action.kind !== 'none';
  // The Server row: the kind when the row says it; "Not known" once the VM program answered and the kind still is not.
  const kindUnknown = !facts?.kind && ready !== null && !ready.kindKnown;
  const server = facts?.kind ? t(facts.kind === 'bare_metal' ? 'host.server.bare' : 'host.server.shared') : kindUnknown ? t('host.server.unknown') : null;
  // "Not allowed" has its own row unless the KVM row's help already says it.
  const notAllowed = facts?.kind === 'bare_metal' && facts.kvmSupported === false && blocked !== 'notAllowed';
  const hasKvmRow = hasSwitch || kvm !== 'unknown';
  // The kind of server, and whether VMs are allowed there: read-only, so Facts. A kind that could not be checked says why
  // in the block's description (Facts carry no help).
  const hostFacts: Fact[] = [
    ...(server !== null ? [{ label: t('host.server'), value: server }] : []),
    ...(notAllowed ? [{ label: t('host.allowed'), value: t('host.allowed.no') }] : []),
  ];
  const state: SectionState = host.facts.kind === 'loading' ? { kind: 'loading', rows: 3 } : { kind: 'ready' };
  // One list of read-only facts for the card: the kind of server first, then the room VMs share (memory, counts, disk).
  // It sits in "Room for VMs" once the VM program answered; before that the server facts alone close the KVM block.
  const roomFacts: Fact[] = [...hostFacts, ...items];
  const kindNote = kindUnknown ? t('host.note.kindUnknown') : undefined;
  const roomNote = caps && unmatchedPart(caps) ? t('host.note.unmatched') : undefined;
  // What is held, refused or next for the KVM switch: the section's notices, above both blocks (never between them).
  const noticed = target !== null && (held !== null || (result !== null && result.outcome !== 'done') || next !== null);
  const notices =
    target !== null && noticed ? (
      <>
        {held !== null && (
          <HeldBand
            overlayId="vms-kvm-held-dismiss"
            text={t(heldKey(held.what, held.want), { name: target.name })}
            readOnly={!held.own}
            onCheck={() => flow.check(target.id)}
            onDismiss={() => flow.dismiss(target.id)}
          />
        )}
        {held === null && result !== null && result.outcome !== 'done' && <KvmOutcome flow={flow} id={target.id} name={target.name} />}
        {next !== null && (
          <Band tone="neutral" actions={next === 'start' ? <Button size="sm" onPress={() => flow.start(target)} isDisabled={framed}>{t('kvm.start')}</Button> : undefined}>
            {t(next === 'start' ? (kvmFacts?.kvm ? 'kvm.done.on' : 'kvm.done.off') : next === 'on' ? 'kvm.next.on' : 'kvm.next.off', { name: target.name })}
          </Band>
        )}
      </>
    ) : undefined;
  return (
    <AnatomySection id="vms-computer" title={t('host.title')} description={t('host.about')} state={state} notices={notices}>
      {(hasKvmRow || kindUnknown || (!caps && hostFacts.length > 0)) && (
        <SubSection title={t('host.facts')} description={kindNote}>
          {hasKvmRow && (
            // The row keeps the kit's form measure: its switch sits at the end of a form-width row, never at the far edge
            // of the full-width card.
            <div className={css.kvmRow}>
              <SettingGroup>
                {target && hasSwitch ? (
                  <SettingSwitch
                    label={t('kvm.switch')}
                    help={kvmHelp}
                    isSelected={kvmFacts?.kvm === true}
                    onChange={() => flow.press(target)}
                    isDisabled={framed || busy || blocked !== null || waiting}
                  />
                ) : kvm !== 'unknown' ? (
                  <SettingRow label={t('host.kvm')} help={kvmHelp}>{t(`host.kvm.${kvm}`)}</SettingRow>
                ) : null}
              </SettingGroup>
            </div>
          )}
          {!caps && hostFacts.length > 0 && <Facts items={hostFacts} columns={2} />}
        </SubSection>
      )}
      {caps && (
        <SubSection title={t('host.room')} description={roomNote}>
          {/* One grid for every fact: three cells to a row on a wide panel, one on a phone. */}
          <Facts label={t('host.room')} items={roomFacts} columns={2} />
        </SubSection>
      )}
      <KvmDialog flow={flow} />
    </AnatomySection>
  );
}

/** Something the page cannot match to a VM holds part of the memory (when it holds all of it, the memory row says so). */
const unmatchedPart = (caps: Caps): boolean => {
  const m = memoryUse(caps);
  return m.unidentified && !m.holdsAll;
};

/** The held band's sentence key for the held change of a computer. */
export const heldKey = (what: string, want: boolean | null) =>
  what === 'kvm' ? (want ? 'kvm.held.on' : 'kvm.held.off') : what === 'stop' || what === 'force-stop' ? 'kvm.held.stop' : what === 'start' ? 'kvm.held.start' : 'kvm.held.other';

/** A computer's last definite refusal, in the page's words when it has them. */
export function KvmOutcome({ flow, id, name }: { flow: KvmFlow; id: string; name: string }) {
  const t = useStrings(strings);
  const r = flow.result(id);
  if (!r || r.outcome === 'done') return null;
  const words = r.what === 'kvm' && r.outcome === 'failed' ? kvmRefusal(r.error, r.want === true) : null;
  const title = r.what === 'kvm' ? t(r.want ? 'kvm.out.on' : 'kvm.out.off', { name }) : t(r.what === 'stop' ? 'kvm.out.stop' : 'kvm.out.start', { name });
  return <Outcome outcome={r.outcome} title={title} detail={words ? t(`kvm.err.${words}`) : undefined} error={r.error} />;
}

/** The flow's confirm dialog: stop the computer first, or turn KVM off a stopped computer. */
export function KvmDialog({ flow }: { flow: KvmFlow }) {
  const t = useStrings(strings);
  const a = flow.ask;
  return (
    <ConfirmDialog
      isOpen={a !== null}
      onOpenChange={(open) => { if (!open) flow.cancel(); }}
      overlayId="vms-kvm-ask"
      title={a ? t(a.kind === 'confirmOff' ? 'kvm.ask.off.title' : a.want ? 'kvm.ask.stopOn.title' : 'kvm.ask.stopOff.title', { name: a.name }) : ''}
      body={a ? t(a.kind === 'confirmOff' ? 'kvm.ask.off.body' : 'kvm.ask.stop.body') : undefined}
      confirmLabel={a ? t(a.kind === 'confirmOff' ? 'kvm.ask.off.go' : 'kvm.ask.stop.go') : undefined}
      onConfirm={flow.confirm}
      busy={flow.confirming}
    />
  );
}
