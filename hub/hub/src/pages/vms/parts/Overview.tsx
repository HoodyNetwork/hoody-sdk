// The Overview tab of one VM: its state and what it runs with, read-only.
// It takes the parsed VM (never the wire). A VM still being created shows how far its create is; one that was not
// created shows nothing it never had: no zeros stand in for settings that do not exist.
import { AnatomySection, Facts, formatBytes, Meter, StatusPill, useStrings, type Fact } from '@kit';
import type { Host } from '../data';
import { rowKind, type Vm } from '../logic';
import strings from '../strings.en.json';
import { KIND_TONE } from './tones';

const MIB = 1024 * 1024;

/** The row kind of a VM read on its own: a create in flight or failed is told by its progress. */
export const kindOf = (vm: Vm) => rowKind({ phase: vm.progress && vm.progress.phase !== 'committed' ? 'creating' : 'committed', state: vm.state });

export function Overview({ vm }: { vm: Vm; host: Host }) {
  const t = useStrings(strings);
  const kind = kindOf(vm);
  // The header shows the state of a VM that exists; one with no settings to show names it here, so the facts are never empty.
  const items: Fact[] = vm.spec ? [] : [{ label: t('vm.fact.state'), value: <StatusPill tone={KIND_TONE[kind]} dot>{t(`state.${kind}`)}</StatusPill> }];
  const p = vm.progress;
  if (kind === 'creating' && p && p.bytesTotal > 0) {
    const percent = Math.min(100, Math.floor((p.bytesDone / p.bytesTotal) * 100));
    items.push({ label: t('vm.progress'), value: t('vm.progress.value', { done: formatBytes(p.bytesDone), total: formatBytes(p.bytesTotal) }) });
    items.push({ label: t('state.creating'), value: <Meter value={percent} tone="neutral" label={t('vm.progress.meter', { percent })} /> });
  }
  if (vm.spec) {
    const s = vm.spec;
    items.push({ label: t('vm.fact.memory'), value: formatBytes(s.memoryMib * MIB) });
    items.push({ label: t('vm.fact.cpus'), value: String(s.vcpus) });
    if (s.diskBytes !== null) items.push({ label: t('vm.fact.disk'), value: formatBytes(s.diskBytes) });
    items.push({ label: t('vm.fact.firmware'), value: t(`vm.firmware.${s.firmware}`) });
    items.push({ label: t('vm.fact.tpm'), value: t(s.tpm ? 'vm.yes' : 'vm.no') });
    items.push({ label: t('vm.fact.bus'), value: t(`vm.bus.${s.bus}`) });
    items.push({ label: t('vm.fact.screen'), value: t(s.display !== null ? 'vm.on' : 'vm.off') });
    items.push({ label: t('vm.fact.ports'), value: String(s.ports.length) });
    items.push({ label: t('vm.fact.autostart'), value: t(s.autostart ? 'vm.yes' : 'vm.no') });
  }
  // A helper is named only while it has a problem.
  const degraded = vm.sidecars.filter((c) => c.state === 'degraded');
  if (degraded.length > 0) items.push({ label: t('vm.helpers'), value: degraded.map((c) => t(`vm.helper.${c.kind}`)).join(', ') });
  // No settings: the VM is being created, was not created, or its settings could not be read this time (a VM that
  // exists and runs can answer without them).
  const note = vm.spec ? undefined : t(kind === 'createFailed' ? 'vm.note.createFailed' : kind === 'creating' ? 'vm.note.creating' : 'vm.note.unread');
  return (
    <AnatomySection id="vm-overview" title={t('vm.overview')} state={{ kind: 'ready' }} note={note}>
      <Facts label={t('vm.facts')} items={items} columns={2} />
    </AnatomySection>
  );
}
