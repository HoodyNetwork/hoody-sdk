// Pure rules of a VM's changes from the Settings, Ports and Storage tabs: no React, no I/O.
//
// Contract, in plain words:
//   - The program changes a VM's settings only while it is stopped (Stopped, or Failed with nothing left running) and
//     no other change of it is out; the page says so before the person tries (`editBlock`). A disc can be swapped or
//     ejected while the VM runs or is paused, in any declared slot (`liveDiscBlock`); a slot that was empty when the VM
//     started has no drive in this run, which only the program knows: its refusal says so.
//   - An update sends only the fields that changed (`settingsBody`); the disk grow goes alone, in its own request.
//   - Every bound the program checks is checked here first (`settingsProblems`, `growProblem`, `discProblem`).
//   - A sent change whose answer is lost is proved by a fresh read of the same VM (same vm_id): each sent field matches
//     by its own rule (`fieldsMatch`). A read with no settings proves nothing; a read of another VM under the same name
//     says that VM is gone (`proofOf` 'gone'), never that the change was made.
//   - A live disc swap has no read that proves it: the program saves it in the VM's settings before the running VM is
//     asked. An eject is proved by the slot reading empty.
import { samePorts, portsBody } from './ports-logic';
import type { Vm, VmPort, VmSpec } from './logic';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// ── bounds (the VM program's) ───────────────────────────────────────────────────────────

export const MEMORY_MAX_MIB = 1024 * 1024;
export const VCPUS_MAX = 4096;
export const GRACE_MIN = 5;
export const GRACE_MAX = 900;
/** The shut-down wait the program uses when the VM sets none. */
export const GRACE_DEFAULT = 30;
export const DISK_BPS_MIN = 65_536;
export const DISK_IOPS_MIN = 8;
export const LIMIT_MAX = 1e15;
export const DISK_MAX_GIB = 16_384;
/** Disc slots: six, five when the VM's disk is on SATA. */
export const discSlots = (spec: Pick<VmSpec, 'bus'>) => (spec.bus === 'sata' ? 5 : 6);
const PATH_MAX = 4096;

// ── when a change may be asked ──────────────────────────────────────────────────────────

/** Why the VM's settings cannot be changed now, or null. */
export type EditBlock = 'notStopped' | 'creating' | 'noSettings' | 'orphaned';
export function editBlock(vm: Pick<Vm, 'state' | 'spec' | 'progress'>): EditBlock | null {
  if (vm.progress && vm.progress.phase !== 'committed') return 'creating';
  if (vm.state === 'Orphaned') return 'orphaned';
  if (vm.state === 'Creating') return 'creating';
  if (vm.state !== 'Stopped' && vm.state !== 'Failed') return 'notStopped';
  return vm.spec ? null : 'noSettings';
}

/** Why a disc cannot be swapped or ejected in place now (the VM runs or is paused), or null. */
export function liveDiscBlock(vm: Pick<Vm, 'state' | 'spec' | 'monitorStalled'>, slot: number): 'notRunning' | 'emptyAtStart' | 'stalled' | null {
  if (vm.state !== 'Running' && vm.state !== 'Paused') return 'notRunning';
  if (vm.monitorStalled) return 'stalled';
  // A declared drive may take a disc: one emptied in this run keeps its drive. Only the program knows whether a drive
  // that was empty at the start has none in this run; it refuses that send (BadState), and the tab says why then.
  return vm.spec && slot < Math.min(vm.spec.cdroms.length, discSlots(vm.spec)) ? null : 'emptyAtStart';
}

// ── the settings form ───────────────────────────────────────────────────────────────────

/** What the Settings tab edits, in the program's own units. Null limits: none; null grace: the program's default. */
export interface SettingsForm {
  readonly memoryMib: number;
  readonly vcpus: number;
  readonly autostart: boolean;
  /** NaN while the field is empty after an edit (the default applies). */
  readonly graceSeconds: number | null;
  readonly screen: boolean;
  readonly diskBps: number | null;
  readonly diskIops: number | null;
  readonly shareQuotaBytes: number | null;
}

export const formOf = (s: VmSpec): SettingsForm => ({
  memoryMib: s.memoryMib, vcpus: s.vcpus, autostart: s.autostart, graceSeconds: s.stopGraceSeconds, screen: s.display !== null,
  diskBps: s.diskBps, diskIops: s.diskIops, shareQuotaBytes: s.shareQuotaBytes,
});

/** The update body, as the program reads it. */
export interface UpdateBody {
  memory_mib?: number;
  vcpus?: number;
  autostart?: boolean;
  stop_grace_seconds?: number | null;
  display?: 'auto' | null;
  disk_bps?: number | null;
  disk_iops?: number | null;
  share_quota_bytes?: number | null;
  ports?: { proto: 'tcp' | 'udp'; host: number; guest: number }[];
  cdroms?: (string | null)[];
  disk_gib?: number;
}

const blankToNull = (n: number | null) => (n === null || !Number.isFinite(n) ? null : n);

/** Only the fields the form changed. A screen turned on asks for any free screen number; turned off, for none. */
export function settingsBody(spec: VmSpec, f: SettingsForm): UpdateBody {
  const b: UpdateBody = {};
  if (f.memoryMib !== spec.memoryMib) b.memory_mib = f.memoryMib;
  if (f.vcpus !== spec.vcpus) b.vcpus = f.vcpus;
  if (f.autostart !== spec.autostart) b.autostart = f.autostart;
  const grace = blankToNull(f.graceSeconds);
  if (grace !== spec.stopGraceSeconds) b.stop_grace_seconds = grace;
  if (f.screen !== (spec.display !== null)) b.display = f.screen ? 'auto' : null;
  const bps = blankToNull(f.diskBps), iops = blankToNull(f.diskIops), quota = blankToNull(f.shareQuotaBytes);
  if (bps !== spec.diskBps) b.disk_bps = bps;
  if (iops !== spec.diskIops) b.disk_iops = iops;
  if (quota !== spec.shareQuotaBytes) b.share_quota_bytes = quota;
  return b;
}

export type SettingsField = 'memory' | 'vcpus' | 'grace' | 'diskBps' | 'diskIops' | 'shareQuota' | 'screen';
export type SettingsProblem = { readonly field: SettingsField; readonly problem: 'range' | 'whole' | 'audio' };

/** What the program would refuse in the form, field by field. */
export function settingsProblems(spec: VmSpec, f: SettingsForm): SettingsProblem[] {
  const out: SettingsProblem[] = [];
  const whole = (n: number) => Number.isSafeInteger(n);
  if (!whole(f.memoryMib) || f.memoryMib < 1 || f.memoryMib > MEMORY_MAX_MIB) out.push({ field: 'memory', problem: 'range' });
  if (!whole(f.vcpus)) out.push({ field: 'vcpus', problem: 'whole' });
  else if (f.vcpus < 1 || f.vcpus > VCPUS_MAX) out.push({ field: 'vcpus', problem: 'range' });
  const grace = blankToNull(f.graceSeconds);
  if (grace !== null && (!whole(grace) || grace < GRACE_MIN || grace > GRACE_MAX)) out.push({ field: 'grace', problem: 'range' });
  const bps = blankToNull(f.diskBps), iops = blankToNull(f.diskIops), quota = blankToNull(f.shareQuotaBytes);
  if (bps !== null && (!whole(bps) || bps < DISK_BPS_MIN || bps > LIMIT_MAX)) out.push({ field: 'diskBps', problem: 'range' });
  if (iops !== null && (!whole(iops) || iops < DISK_IOPS_MIN || iops > LIMIT_MAX)) out.push({ field: 'diskIops', problem: 'range' });
  if (quota !== null && (!whole(quota) || quota < 1)) out.push({ field: 'shareQuota', problem: 'range' });
  // A VM with sound needs its screen: the program refuses taking the screen away.
  if (!f.screen && spec.display !== null && spec.audio === 'output') out.push({ field: 'screen', problem: 'audio' });
  return out;
}

// ── disk and discs ──────────────────────────────────────────────────────────────────────

/** The disk's size in whole GiB, rounded up (what a bigger size is measured from). */
export const diskGib = (bytes: number) => Math.ceil(bytes / GIB);

/** Why a new disk size cannot be asked: not a whole number, not bigger than now, or past the program's largest. */
export function growProblem(currentBytes: number, gib: number): 'whole' | 'notBigger' | 'tooBig' | null {
  if (!Number.isSafeInteger(gib)) return 'whole';
  if (gib * GIB <= currentBytes) return 'notBigger';
  return gib > DISK_MAX_GIB ? 'tooBig' : null;
}

/** Why a disc path cannot be asked: the program takes an absolute path to a file on the computer. */
export function discProblem(path: string): 'missing' | 'notAbsolute' | 'tooLong' | null {
  const p = path.trim();
  if (p === '') return 'missing';
  if (!p.startsWith('/') || p.includes('\0')) return 'notAbsolute';
  return p.length > PATH_MAX ? 'tooLong' : null;
}

/** The disc list after putting `source` (null: empty) in `slot`, positions kept; trailing empty slots dropped. */
export function discsWith(cdroms: readonly (string | null)[], slot: number, source: string | null): (string | null)[] {
  const out = [...cdroms];
  while (out.length <= slot) out.push(null);
  out[slot] = source;
  return trimDiscs(out);
}
const trimDiscs = (l: readonly (string | null)[]) => {
  const out = [...l];
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
};

// ── what a fresh read proves ────────────────────────────────────────────────────────────

/** What the page notes before it sends a change of one VM: the VM's identity and the fields it sends. */
export interface SentChange {
  readonly name: string;
  readonly vmId: string;
  readonly body: UpdateBody;
}

/** Each sent field against a fresh read of the VM's settings, by its own rule. */
export function fieldsMatch(body: UpdateBody, s: VmSpec): boolean {
  const checks: boolean[] = [];
  if (body.memory_mib !== undefined) checks.push(s.memoryMib === body.memory_mib);
  if (body.vcpus !== undefined) checks.push(s.vcpus === body.vcpus);
  if (body.autostart !== undefined) checks.push(s.autostart === body.autostart);
  // No wait set reads as the default.
  if (body.stop_grace_seconds !== undefined) checks.push(body.stop_grace_seconds === null ? s.stopGraceSeconds === null || s.stopGraceSeconds === GRACE_DEFAULT : s.stopGraceSeconds === body.stop_grace_seconds);
  // "auto" is any number; none is no screen.
  if (body.display !== undefined) checks.push(body.display === null ? s.display === null : s.display !== null);
  if (body.disk_bps !== undefined) checks.push(s.diskBps === body.disk_bps);
  if (body.disk_iops !== undefined) checks.push(s.diskIops === body.disk_iops);
  if (body.share_quota_bytes !== undefined) checks.push(s.shareQuotaBytes === body.share_quota_bytes);
  if (body.ports !== undefined) checks.push(samePorts(s.ports, body.ports as VmPort[]));
  if (body.cdroms !== undefined) {
    const a = trimDiscs(s.cdroms), b = trimDiscs(body.cdroms);
    checks.push(a.length === b.length && a.every((x, i) => x === b[i]));
  }
  // A grow is made once the disk is at least the size asked.
  if (body.disk_gib !== undefined) checks.push(s.diskBytes !== null && s.diskBytes >= body.disk_gib * GIB);
  return checks.length > 0 && checks.every(Boolean);
}

/** A fresh read of VMs against a sent change: 'applied' when the same VM shows every sent field; 'gone' when the name
 *  now holds another VM (or the read names none and was complete); undefined when the read proves nothing. */
export function proofOf(sent: SentChange, reads: readonly (Vm | null | undefined)[]): 'applied' | 'gone' | undefined {
  let gone = false;
  for (const vm of reads) {
    // A read without a vm_id names no VM: it proves nothing either way, never "gone".
    if (!vm || vm.name !== sent.name || vm.vmId === null) continue;
    if (vm.vmId !== sent.vmId) { gone = true; continue; }
    if (vm.spec && fieldsMatch(sent.body, vm.spec)) return 'applied';
  }
  return gone ? 'gone' : undefined;
}

/** An eject: the same VM's slot reads empty. */
export function ejectProof(sent: { name: string; vmId: string; slot: number }, reads: readonly (Vm | null | undefined)[]): 'applied' | 'gone' | undefined {
  let gone = false;
  for (const vm of reads) {
    // A read without a vm_id names no VM: it proves nothing either way, never "gone".
    if (!vm || vm.name !== sent.name || vm.vmId === null) continue;
    if (vm.vmId !== sent.vmId) { gone = true; continue; }
    if (vm.spec && !vm.spec.cdroms[sent.slot]) return 'applied';
  }
  return gone ? 'gone' : undefined;
}

/** The body of a port list change. */
export const portsUpdate = (ports: readonly VmPort[]): UpdateBody => ({ ports: portsBody(ports) });
