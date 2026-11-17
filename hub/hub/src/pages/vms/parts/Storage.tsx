// The Storage tab of one VM: its disk (made bigger, never smaller), its disc drives and its shared folder.
// A bigger disk and a disc changed while the VM is stopped are updates (sent once, the disk size alone). While the VM
// runs or is paused, a drive that held a disc when it started can take another disc or be emptied in place; every
// other drive says why not before the person tries. A change whose answer is lost is held (update.ts): a disc
// swapped in place has no read that proves it, so it stays held until the person stops tracking it.
import { isFramed } from '@core';
import {
  AnatomySection, Band, ConfirmDialog, createColumnHelper, DataTable, Drawer, Facts, FormFooter, formatBytes, HeldBand, NumberField, Outcome, Stack,
  TextField, useStrings,
} from '@kit';
import { useEffect, useMemo, useState } from 'react';
import type { Host } from '../data';
import { vmCode, type VmReady } from '../logic';
import strings from '../strings.en.json';
import { DISK_MAX_GIB, discProblem, discSlots, discsWith, diskGib, editBlock, growProblem, liveDiscBlock } from '../update-logic';
import { type HeldOp, useVmChanges, type VmChanges } from '../update';
import { heldKey, heldReason, type Key, portsBlockKey, refusalKey } from './Ports';
import { isVmUnsure, useVmUnsure } from './unsure';

const col = createColumnHelper<{ slot: number; path: string | null }>();
const MINE: readonly HeldOp[] = ['disk', 'discs', 'swap', 'eject'];

/** Why one drive's disc cannot be changed now (the words' key), or null. Stopped: an update; running or paused: in place. */
export function discBlockKey(vm: VmReady, ch: Pick<VmChanges, 'held' | 'sending'>, framed: boolean, slot: number): Key | null {
  const stopped = portsBlockKey(vm, ch, framed);
  if (stopped === null || stopped !== 'settings.chg.why.notStopped') return stopped;
  const live = liveDiscBlock(vm, slot);
  return live ? (`settings.chg.why.live.${live}` as Key) : null;
}

/** The drives shown. While the VM runs or is paused: every declared drive, empty ones included (one emptied in this run
 *  can take a disc again). Otherwise: every drive holding a disc and the first empty one after them. */
export function shownSlots(vm: VmReady): number[] {
  const discs = vm.spec.cdroms;
  const max = discSlots(vm.spec);
  const live = editBlock(vm) === 'notStopped';
  const out: number[] = [];
  for (let i = 0; i < Math.min(discs.length, max); i++) if (live || discs[i]) out.push(i);
  if (!live) {
    const free = Array.from({ length: max }, (_, i) => i).find((i) => !discs[i]);
    if (free !== undefined) out.push(free);
  }
  return out.sort((a, b) => a - b);
}

export function Storage({ vm, host }: { vm: VmReady; host: Host }) {
  const t = useStrings(strings);
  const ch = useVmChanges(host.target, vm);
  const framed = isFramed();
  const [grow, setGrow] = useState(false);
  const [disc, setDisc] = useState<number | null>(null);
  const [eject, setEject] = useState<number | null>(null);
  // The reads on screen do not agree on which VM holds this name: no change is sent by name meanwhile.
  const unsure = useVmUnsure(vm.name);
  const unread: Key | null = unsure ? 'power.why.unread' : null;
  const diskBytes = vm.spec.diskBytes;
  const growWhy = unread ?? portsBlockKey(vm, ch, framed) ?? (diskBytes === null ? 'settings.chg.why.noSettings' : null);
  const free = host.state.kind === 'ready' ? host.state.caps.freeDiskBytes : null;
  const live = editBlock(vm) === 'notStopped';
  const held = ch.held;
  const reason = held?.own && ch.heldError ? heldReason(ch.heldError) : null;
  const result = ch.result && MINE.includes(ch.result.op) ? ch.result : null;
  const say = { vm: vm.name };
  const share = vm.share;
  const drives = useMemo(() => shownSlots(vm).map((slot) => ({ slot, path: vm.spec.cdroms[slot] ?? null })), [vm]);
  const columns = useMemo(
    () => [
      col.accessor((d) => d.slot, { id: 'slot', header: t('storage.col.drive'), meta: { width: '120px' }, cell: (c) => t('storage.slot', { n: c.getValue() + 1 }) }),
      col.accessor((d) => d.path, { id: 'path', header: t('storage.col.disc'), meta: { mono: true }, cell: (c) => c.getValue() ?? t('storage.slot.empty') }),
    ],
    [t],
  );
  const shareQuota = vm.spec.shareQuotaBytes ?? share?.quotaBytes ?? null;
  const shareUsed = share ? (share.partial ? t('storage.share.partial', { used: formatBytes(share.bytes) }) : formatBytes(share.bytes)) : null;
  const facts = [
    { label: t('storage.disk.size'), value: diskBytes === null ? t('storage.disk.unknown') : formatBytes(diskBytes) },
    ...(vm.spec.fileSharing
      ? [{ label: t('storage.share.used'), value: shareUsed === null ? t('storage.disk.unknown') : shareQuota !== null ? t('storage.share.usedValue', { used: shareUsed, quota: formatBytes(shareQuota) }) : t('storage.share.usedNoLimit', { used: shareUsed }) }]
      : []),
  ];
  const growAction = { id: 'disk-grow', label: t('storage.grow'), icon: 'plus' as const, opens: 'dialog' as const, onPress: () => { ch.clearResult(); setGrow(true); }, ...(growWhy ? { disabledReason: t(growWhy) } : {}) };

  const sendEject = () => {
    if (eject === null) return;
    // Asked at the press: the VM's screen may have lost the name since the question opened. Nothing is sent.
    if (isVmUnsure(vm.name)) { setEject(null); return; }
    if (live) ch.eject(eject);
    else ch.update('discs', { cdroms: discsWith(vm.spec.cdroms, eject, null) });
  };
  // The eject question closes once its send is out: what came back is the section's note.
  const ejecting = ch.sending === 'eject' || (ch.sending === 'discs' && eject !== null);
  useEffect(() => { if (eject !== null && (held !== null || result !== null || unsure) && !ejecting) setEject(null); }, [eject, held, result, ejecting, unsure]);
  // While the name is unsure, no editor stays open: the name may stand for another VM. The button says why.
  useEffect(() => { if (unsure) { setGrow(false); setDisc(null); } }, [unsure]);

  return (
    <AnatomySection
      id="vm-storage"
      title={t('storage.title')}
      description={t('storage.about')}
      state={{ kind: 'ready' }}
      actions={{ primary: growAction }}
      flush
      notices={
        <>
          {held ? (
            <HeldBand
              /* A newer hold in its place remounts the band: a Stop tracking question open for the older one closes. */
            key={held.hold ?? String(held.change.at)}
            overlayId="vms-storage-held-dismiss"
              text={held.gone ? t('settings.chg.held.gone', say) : `${t(heldKey(held.op), say)}${reason ? ` ${t(reason)}` : ''}`}
              readOnly={!held.own}
              dismissBody={t('settings.chg.held.dismissBody')}
              onCheck={() => ch.check(held)}
              onDismiss={() => ch.dismiss(held)}
            />
          ) : result && !grow && disc === null ? (
            <Outcome
              outcome={{ kind: result.outcome }}
              doneText={t('settings.chg.done')}
              detail={result.outcome === 'failed' ? t(refusalKey(result.error)) : undefined}
              error={result.error}
            />
          ) : null}
          {vm.spec.fileSharing && share?.overQuota ? <Band tone="warn" /* noDetails: a measured fact about the folder */>{t('storage.share.over')}</Band> : null}
        </>
      }
    >
      <Facts label={t('storage.facts', say)} items={facts} />
      <DataTable
        bare
        fill={false}
        label={t('storage.discs.label', say)}
        data={drives}
        columns={columns}
        getRowId={(d) => String(d.slot)}
        actions={(d) => {
          const why = unread ?? discBlockKey(vm, ch, framed, d.slot);
          const off = why ? { isDisabled: true, disabledReason: t(why) } : {};
          return [
            { id: 'disc', label: t(d.path ? 'storage.disc.change' : 'storage.disc.insert'), inline: true, opens: true, onAction: () => { ch.clearResult(); setDisc(d.slot); }, ...off },
            ...(d.path ? [{ id: 'eject', label: t('storage.disc.eject'), opens: true, onAction: () => { ch.clearResult(); setEject(d.slot); }, ...off }] : []),
          ];
        }}
      />
      {grow && diskBytes !== null && <GrowDrawer vm={vm} diskBytes={diskBytes} ch={ch} free={free} onClose={() => setGrow(false)} />}
      {disc !== null && <DiscDrawer vm={vm} ch={ch} slot={disc} live={live} onClose={() => setDisc(null)} />}
      <ConfirmDialog
        overlayId="vms-storage-eject"
        isOpen={eject !== null}
        onOpenChange={(o) => { if (!o && !ejecting) setEject(null); }}
        title={t('storage.disc.ejectTitle', { n: (eject ?? 0) + 1, vm: vm.name })}
        body={t(live ? 'storage.disc.ejectBody' : 'storage.disc.ejectBodyStopped')}
        confirmLabel={t('storage.disc.eject')}
        busy={ejecting}
        onConfirm={sendEject}
      />
    </AnatomySection>
  );
}

/** Closes a drawer once its send is out and answered: held (the tab's note says so) or done. A refusal keeps it open. */
function useCloseWhen(ch: VmChanges, ops: readonly HeldOp[], onClose: () => void) {
  const result = ch.result && ops.includes(ch.result.op) ? ch.result : null;
  const closeNow = (ch.held !== null && !ch.held.gone) || result?.outcome === 'done';
  useEffect(() => { if (closeNow) onClose(); }, [closeNow, onClose]);
  return result && result.outcome !== 'done' ? result : null;
}

function GrowDrawer({ vm, diskBytes, ch, free, onClose }: { vm: VmReady; diskBytes: number; ch: VmChanges; free: number | null; onClose: () => void }) {
  const t = useStrings(strings);
  const now = diskGib(diskBytes);
  const [gib, setGib] = useState(Number.NaN);
  const [tried, setTried] = useState(false);
  const problem = growProblem(diskBytes, gib);
  const failure = useCloseWhen(ch, ['disk'], onClose);
  const sending = ch.sending === 'disk';
  const submit = () => {
    setTried(true);
    if (problem || isVmUnsure(vm.name)) return;
    // The program takes a bigger disk only on its own, never with another field.
    if (ch.update('disk', { disk_gib: gib })) setTried(false);
  };
  const help = free !== null ? t('storage.grow.free', { free: formatBytes(free) }) : undefined;
  const typed = !Number.isNaN(gib);
  return (
    <Drawer
      overlayId="vms-disk-grow"
      resizeKey="vms-disk-grow"
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('storage.grow.title', { vm: vm.name })}
      subtitle={t('storage.grow.subtitle')}
      size="sm"
      dirty={typed}
      busy={sending}
      footer={
        <FormFooter
          dirty={typed}
          busy={sending}
          submitLabel={t('storage.grow.go')}
          submitDisabled={tried && problem !== null}
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
        <NumberField
          label={t('storage.grow.size')}
          value={gib}
          onChange={setGib}
          formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
          placeholder={String(now + 1)}
          description={help}
          errorMessage={tried && problem ? t(`storage.grow.err.${problem}` as Key, { now: formatBytes(diskBytes), max: DISK_MAX_GIB }) : undefined}
          width="sm"
        />
      </Stack>
    </Drawer>
  );
}

function DiscDrawer({ vm, ch, slot, live, onClose }: { vm: VmReady; ch: VmChanges; slot: number; live: boolean; onClose: () => void }) {
  const t = useStrings(strings);
  const [path, setPath] = useState(vm.spec.cdroms[slot] ?? '');
  const [tried, setTried] = useState(false);
  const problem = discProblem(path);
  const dirty = path.trim() !== (vm.spec.cdroms[slot] ?? '');
  const failure = useCloseWhen(ch, live ? ['swap'] : ['discs'], onClose);
  const sending = ch.sending === (live ? 'swap' : 'discs');
  // A live insert the program refuses as "not now" names a drive that was empty when the VM started: it has no drive in
  // this run. Said in the page's words, never the program's.
  const refusedWords = (e: unknown): Key => (live && vmCode(e) === 'BadState' ? 'settings.chg.why.live.emptyAtStart' : refusalKey(e));
  const submit = () => {
    setTried(true);
    if (problem || !dirty || isVmUnsure(vm.name)) return;
    const p = path.trim();
    const sent = live ? ch.swap(slot, p) : ch.update('discs', { cdroms: discsWith(vm.spec.cdroms, slot, p) });
    if (sent) setTried(false);
  };
  return (
    <Drawer
      overlayId="vms-disc"
      resizeKey="vms-disc"
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('storage.disc.title', { n: slot + 1, vm: vm.name })}
      subtitle={t(live ? 'storage.disc.subtitleLive' : 'storage.disc.subtitleStopped')}
      size="md"
      dirty={dirty}
      busy={sending}
      footer={
        <FormFooter
          dirty={dirty}
          busy={sending}
          submitLabel={t('storage.disc.go')}
          submitDisabled={tried && problem !== null}
          onSubmit={submit}
          outcome={failure ? { kind: failure.outcome } : undefined}
          error={failure?.error}
          /* A refusal reads in the page's words, with Details. */
          failedDetail={failure?.outcome === 'failed' ? t(refusedWords(failure.error)) : undefined}
          /* A held answer is the tab's own note: no second word of it as a toast. */
          toastOnLeave={false}
        />
      }
    >
      <TextField
        label={t('storage.disc.path')}
        mono
        value={path}
        onChange={setPath}
        description={t('storage.disc.path.help')}
        errorMessage={tried && problem ? t(`storage.disc.err.${problem}` as Key) : undefined}
        spellCheck="false"
        autoComplete="off"
      />
    </Drawer>
  );
}
