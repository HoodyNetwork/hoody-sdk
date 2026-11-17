// Pure rules of the VMs page: no React, no I/O.
//
// Contract, in plain words:
//   - One parser per wire shape of the VM program (parseCaps, parseVmList, parseVm). Each checks every field it reads and
//     returns a typed value, or null when the answer is not that shape or contradicts itself. Nothing downstream reads a
//     raw field. `display_url` is never read: a screen address is one the Hub builds itself.
//   - hostFactsOf reads the computer's row from the Hoody API list (KVM switch, server support, state, expiry) with the
//     server kind core worked out. A kind of null is "not known": it is never read as shared.
//   - hostState says which of the page's states applies, and wantsVmReads whether the VM program is asked at all (never
//     for a stopped, expired or shared-server computer, or with no computer picked).
//   - rowKind names a list row by what can be done with it: a failed create (the VM never existed, its name is free) is
//     not a VM whose run failed.
//   - vmCode reads the VM program's error code off a rejection: one of the codes it documents, else null.
//   - pollMs is the one refresh cadence: 3 s while something is changing or for a minute after the person's own change,
//     else 30 s.
import type { ComputerState } from '@core';

// ── small readers ────────────────────────────────────────────────────────────────────

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** A whole number from 0 up that JavaScript holds exactly. */
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
/** A memory byte count, or `unbounded`: "no limit" (a ceiling) and "all of it" (a run's hold). The VM program sends
 *  these as null, or (older programs) as the largest 64-bit number, which JavaScript cannot hold exactly: null and any
 *  whole number from 2^53 bytes (8 PiB) up are `unbounded`, never a size. A missing value is not a reading (null here). */
const UNBOUNDED_FROM = 2 ** 53;
const memBytes = (v: unknown): number | 'unbounded' | null =>
  v === null ? 'unbounded' : count(v) ?? (typeof v === 'number' && Number.isInteger(v) && v >= UNBOUNDED_FROM ? 'unbounded' : null);
/** A count that cannot be none (memory, CPUs). */
const atLeastOne = (v: unknown): number | null => (count(v) === null || v === 0 ? null : (v as number));
/** A screen number: the VM program makes screens 1 to 9999 only. */
const displayNo = (v: unknown): number | null => (count(v) !== null && (v as number) >= 1 && (v as number) <= 9999 ? (v as number) : null);
const text = (v: unknown, max = 4096): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null => (typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : null);
/** An optional field: absent reads as `none`; present and unreadable is `bad`. */
const BAD = Symbol('bad');
function opt<T>(o: Record<string, unknown>, key: string, read: (v: unknown) => T | null): T | null | typeof BAD {
  if (!Object.hasOwn(o, key) || o[key] === undefined) return null;
  const v = read(o[key]);
  return v === null ? BAD : v;
}

// ── names ────────────────────────────────────────────────────────────────────────────

/** A VM name and a snapshot label: starts with a letter or digit, then lower-case letters, digits and hyphens, 1 to 63. */
export const VM_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const isVmName = (v: unknown): v is string => typeof v === 'string' && VM_NAME.test(v);
/** A VM's own id, and a run's, as the program gives them (never shown whole): exactly 16 lower-case hex digits, never
 *  all zeros. */
const VM_ID = /^(?!0{16})[0-9a-f]{16}$/;
const vmId = (v: unknown): string | null => (typeof v === 'string' && VM_ID.test(v) ? v : null);

// ── error codes ──────────────────────────────────────────────────────────────────────

/** Every code the VM program documents. */
export const VM_CODES = [
  'NameInvalid', 'SpecInvalid', 'NotFound', 'AlreadyExists', 'BadState', 'OperationInProgress', 'SourceBusy', 'KvmUnavailable', 'KvmCapExceeded',
  'MemoryExceedsCgroup', 'InsufficientSpace', 'QemuExecFailed', 'QemuExitedBeforeReady', 'QmpHandshakeFailed', 'StartupIndeterminate', 'StorageFailed',
  'RunAbnormalExit', 'JournalFailed', 'Orphaned', 'DisplayUnavailable', 'MethodNotAllowed', 'SidecarUnavailable', 'PortForwardConflict',
  'AudioBackendUnavailable', 'RequestBodyStalled', 'ConsoleUnavailable', 'ConsoleDeliveryIndeterminate', 'DownloadFailed', 'TpmStateMissing',
  'DisplayRangeExhausted', 'DisplayNotConfigured', 'DisplayInUse', 'MonitorCommandIndeterminate',
] as const;
export type VmCode = (typeof VM_CODES)[number];
const asCode = (v: unknown): VmCode | null => oneOf(v, VM_CODES);

/** The VM program's code on a rejection (core puts it in `code`; the answer's own body is read as a second source), or
 *  null when it names none this page knows. */
export function vmCode(e: unknown): VmCode | null {
  const r = rec(e);
  if (!r) return null;
  return asCode(r.code) ?? asCode(rec(rec(r.data)?.error)?.code);
}

/** An error the VM program put on a VM or a create ({error: {code, message}}): its code when known, and its sentence. */
export interface VmFault {
  readonly code: VmCode | null;
  readonly message: string;
}
function faultOf(v: unknown): VmFault | null {
  const e = rec(rec(v)?.error);
  if (!e) return null;
  const message = text(e.message);
  if (typeof e.code !== 'string' || message === null) return null;
  return { code: asCode(e.code), message };
}

// ── capabilities ─────────────────────────────────────────────────────────────────────

export interface Budget { readonly used: number; readonly ceiling: number }
/** Memory one run holds: a VM's (`name`) or a run the program cannot match to a VM (`unidentifiedRun`), never both.
 *  bytes null: the run holds all the memory VMs may use (a run the program cannot size, on a computer with no limit). */
export interface Admitted { readonly name: string | null; readonly unidentifiedRun: string | null; readonly bytes: number | null; readonly estimated: boolean }
export interface Caps {
  /** /dev/kvm is there and can be opened inside the computer. */
  readonly kvmPresent: boolean;
  /** The lowest port a VM may take on the computer; null when the computer did not report it. */
  readonly portFloor: number | null;
  /** ceilingBytes null: no memory limit is set for VMs on this computer. */
  readonly memory: { readonly ceilingBytes: number | null; readonly admitted: readonly Admitted[] };
  /** KVM budgets with a ceiling; null where none is enforced. */
  readonly budgets: { readonly vms: Budget | null; readonly vcpus: Budget | null; readonly memslots: Budget | null };
  readonly provisioning: {
    readonly uefi: boolean; readonly virtioWinIso: boolean; readonly templates: boolean; readonly tpm: boolean;
    readonly secureBoot: boolean; readonly fileSharing: boolean; readonly audio: boolean; readonly machineType: string;
  };
  readonly freeDiskBytes: number;
}

function budgetOf(v: unknown): Budget | null | typeof BAD {
  if (v === null || v === undefined) return null;
  const b = rec(v);
  const used = count(b?.used), ceiling = count(b?.ceiling);
  return used === null || ceiling === null ? BAD : { used, ceiling };
}

export function parseCaps(wire: unknown): Caps | null {
  const w = rec(wire);
  const mem = rec(w?.memory), misc = rec(w?.misc), prov = rec(w?.provisioning), store = rec(w?.storage);
  if (!w || !mem || !misc || !prov || !store) return null;
  const kvmPresent = flag(w.kvm_present);
  const floor = w.unprivileged_port_start === null ? null : count(w.unprivileged_port_start);
  const ceiling = memBytes(mem.ceiling_bytes);
  const ceilingBytes = ceiling === 'unbounded' ? null : ceiling;
  const freeDiskBytes = count(store.free_bytes);
  if (kvmPresent === null || ceiling === null || freeDiskBytes === null || !Array.isArray(mem.admitted)) return null;
  if (w.unprivileged_port_start !== null && (floor === null || floor > 65535)) return null;
  const admitted: Admitted[] = [];
  for (const it of mem.admitted) {
    const a = rec(it);
    const held = memBytes(a?.admitted_bytes);
    if (!a || held === null) return null;
    const bytes = held === 'unbounded' ? null : held;
    const name = opt(a, 'name', (v) => (isVmName(v) ? v : null));
    const run = opt(a, 'unidentified_run', (v) => text(v, 256));
    const estimated = opt(a, 'estimated', flag);
    // Exactly one of the two names: both, or neither, contradicts the program's own rule.
    if (name === BAD || run === BAD || estimated === BAD || (name === null) === (run === null)) return null;
    admitted.push({ name, unidentifiedRun: run, bytes, estimated: estimated === true });
  }
  const vms = budgetOf(misc.kvm_vm), vcpus = budgetOf(misc.kvm_vcpu), memslots = budgetOf(misc.kvm_memslot);
  if (vms === BAD || vcpus === BAD || memslots === BAD) return null;
  const p = {
    uefi: flag(prov.uefi), virtioWinIso: flag(prov.virtio_win_iso), templates: flag(prov.templates), tpm: flag(prov.tpm),
    secureBoot: flag(prov.secure_boot), fileSharing: flag(prov.file_sharing), audio: flag(prov.audio), machineType: text(prov.machine_type, 128),
  };
  if (Object.values(p).some((v) => v === null)) return null;
  return { kvmPresent, portFloor: floor, memory: { ceilingBytes, admitted }, budgets: { vms, vcpus, memslots }, provisioning: p as Caps['provisioning'], freeDiskBytes };
}

const MIB = 1024 * 1024;
/** What every running VM holds on top of its own memory (the VM program's start rule). */
export const VM_OVERHEAD_MIB = 256;

/** Memory for VMs on this computer: what running VMs hold, the ceiling, the largest VM that would still start (its own
 *  memory, after the per-VM overhead; 0 when none fits), whether a run the program cannot match holds some, and whether
 *  one run holds all of it (then nothing fits). With no limit set, ceilingBytes is null, and so is freeForNewVmMib
 *  unless a run holds everything: memory never stops a start. */
export function memoryUse(caps: Caps): { usedBytes: number; ceilingBytes: number | null; freeForNewVmMib: number | null; unidentified: boolean; holdsAll: boolean } {
  const usedBytes = caps.memory.admitted.reduce((n, a) => n + (a.bytes ?? 0), 0);
  const holdsAll = caps.memory.admitted.some((a) => a.bytes === null);
  const ceilingBytes = caps.memory.ceilingBytes;
  const freeForNewVmMib = holdsAll ? 0 : ceilingBytes === null ? null : Math.max(0, Math.floor(Math.max(0, ceilingBytes - usedBytes) / MIB) - VM_OVERHEAD_MIB);
  return { usedBytes, ceilingBytes, freeForNewVmMib, unidentified: caps.memory.admitted.some((a) => a.unidentifiedRun !== null), holdsAll };
}

// ── VMs ──────────────────────────────────────────────────────────────────────────────

export const VM_STATES = ['Creating', 'Stopped', 'Starting', 'Running', 'Paused', 'Stopping', 'Failed', 'Orphaned'] as const;
export type VmState = (typeof VM_STATES)[number];

/** A VM's shared folder as last measured. */
export interface VmShare { readonly bytes: number; readonly quotaBytes: number | null; readonly overQuota: boolean; readonly partial: boolean; readonly sampledUnix: number }

function shareOf(v: unknown): VmShare | null {
  const s = rec(v);
  if (!s) return null;
  const bytes = count(s.bytes), partial = flag(s.partial), sampledUnix = count(s.sampled_unix), overQuota = flag(s.over_quota);
  const quotaBytes = opt(s, 'quota_bytes', count);
  if (bytes === null || partial === null || sampledUnix === null || overQuota === null || quotaBytes === BAD) return null;
  // Over a limit that does not exist: the program never says so.
  if (overQuota && quotaBytes === null) return null;
  return { bytes, quotaBytes, overQuota, partial, sampledUnix };
}

/** One row of the VM list: the facts known for every VM without reading each one. */
export interface VmRow {
  readonly name: string;
  /** The VM's own id: a later VM under the same name has another one. Null: not given. */
  readonly vmId: string | null;
  readonly phase: 'committed' | 'creating';
  /** Null: the program gave no state for the row. */
  readonly state: VmState | null;
  readonly share: VmShare | null;
}

/** The VM list, or null when the answer is not one (an unreadable row makes the whole list unreadable: a list with a
 *  hole in it would read as "that VM is gone"). */
export function parseVmList(wire: unknown): VmRow[] | null {
  if (!Array.isArray(wire)) return null;
  const out: VmRow[] = [];
  const seen = new Set<string>();
  for (const it of wire) {
    const r = rec(it);
    if (!r || !isVmName(r.name)) return null;
    const phase = oneOf(r.phase, ['committed', 'creating'] as const);
    const id = opt(r, 'vm_id', vmId);
    const state = opt(r, 'state', (v) => oneOf(v, VM_STATES));
    const share = opt(r, 'share', shareOf);
    if (phase === null || id === BAD || state === BAD || share === BAD) return null;
    // A row still being created is Creating or a failed create; any other state contradicts its phase.
    if (phase === 'creating' && state !== null && state !== 'Creating' && state !== 'Failed') return null;
    if (phase === 'committed' && state === 'Creating') return null;
    // One name, one row: two rows under a name cannot both be read.
    if (seen.has(r.name)) return null;
    seen.add(r.name);
    out.push({ name: r.name, vmId: id, phase, state, share });
  }
  return out;
}

/** A list row by what can be done with it. */
export type RowKind = 'stopped' | 'runFailed' | 'running' | 'paused' | 'starting' | 'stopping' | 'creating' | 'createFailed' | 'orphaned' | 'unknown';

export function rowKind(r: Pick<VmRow, 'phase' | 'state'>): RowKind {
  if (r.phase === 'creating') return r.state === 'Failed' ? 'createFailed' : 'creating';
  switch (r.state) {
    case 'Stopped': return 'stopped';
    case 'Failed': return 'runFailed';
    case 'Running': return 'running';
    case 'Paused': return 'paused';
    case 'Starting': return 'starting';
    case 'Stopping': return 'stopping';
    case 'Orphaned': return 'orphaned';
    default: return 'unknown';
  }
}

export interface VmPort { readonly proto: 'tcp' | 'udp'; readonly host: number; readonly guest: number }
export interface VmSpec {
  readonly memoryMib: number;
  readonly vcpus: number;
  readonly diskBytes: number | null;
  readonly firmware: 'uefi' | 'uefi-secure-boot' | 'bios';
  readonly bus: 'virtio' | 'sata';
  readonly displayAdapter: 'vga' | 'virtio-vga';
  readonly cpu: 'qemu-default' | 'westmere' | 'host';
  readonly tpm: boolean;
  readonly fileSharing: boolean;
  readonly agent: boolean;
  readonly console: boolean;
  readonly consoleInput: boolean;
  readonly audio: 'none' | 'output';
  readonly machineType: string;
  /** The screen's display number; null: the VM has no screen. */
  readonly display: number | null;
  /** The disc slots in order (slot 0 boots first); null: an empty slot. */
  readonly cdroms: readonly (string | null)[];
  readonly autostart: boolean;
  readonly diskBps: number | null;
  readonly diskIops: number | null;
  readonly shareQuotaBytes: number | null;
  readonly ports: readonly VmPort[];
  /** Null: the program's default applies. */
  readonly stopGraceSeconds: number | null;
}

const port = (v: unknown): number | null => { const n = count(v); return n !== null && n >= 1 && n <= 65535 ? n : null; };

function specOf(v: unknown): VmSpec | null {
  const s = rec(v);
  if (!s) return null;
  const req = {
    memoryMib: atLeastOne(s.memory_mib), vcpus: atLeastOne(s.vcpus), firmware: oneOf(s.firmware, ['uefi', 'uefi-secure-boot', 'bios'] as const),
    bus: oneOf(s.bus, ['virtio', 'sata'] as const), displayAdapter: oneOf(s.display_adapter, ['vga', 'virtio-vga'] as const),
    cpu: oneOf(s.cpu, ['qemu-default', 'westmere', 'host'] as const), tpm: flag(s.tpm), fileSharing: flag(s.file_sharing), agent: flag(s.agent),
    console: flag(s.console), consoleInput: flag(s.console_input), audio: oneOf(s.audio, ['none', 'output'] as const),
    machineType: text(s.machine_type, 128), autostart: flag(s.autostart),
  };
  if (Object.values(req).some((x) => x === null)) return null;
  const diskBytes = opt(s, 'disk_bytes', count), display = opt(s, 'display', displayNo), diskBps = opt(s, 'disk_bps', count), diskIops = opt(s, 'disk_iops', count);
  const shareQuotaBytes = opt(s, 'share_quota_bytes', count), stopGraceSeconds = opt(s, 'stop_grace_seconds', count);
  if ([diskBytes, display, diskBps, diskIops, shareQuotaBytes, stopGraceSeconds].includes(BAD as never)) return null;
  let cdroms: (string | null)[] = [];
  if (s.cdroms !== undefined) {
    if (!Array.isArray(s.cdroms) || s.cdroms.length > 6) return null;
    cdroms = [];
    for (const c of s.cdroms) { if (c !== null && text(c) === null) return null; cdroms.push(c as string | null); }
  }
  const ports: VmPort[] = [];
  if (s.ports !== undefined) {
    if (!Array.isArray(s.ports) || s.ports.length > 128) return null;
    for (const it of s.ports) {
      const p = rec(it);
      const host = port(p?.host), guest = port(p?.guest);
      const proto = p && p.proto === undefined ? 'tcp' : oneOf(p?.proto, ['tcp', 'udp'] as const);
      if (!p || host === null || guest === null || proto === null) return null;
      ports.push({ proto, host, guest });
    }
  }
  return {
    ...(req as { [K in keyof typeof req]: NonNullable<(typeof req)[K]> }),
    diskBytes: diskBytes as number | null, display: display as number | null, cdroms, diskBps: diskBps as number | null, diskIops: diskIops as number | null,
    shareQuotaBytes: shareQuotaBytes as number | null, ports, stopGraceSeconds: stopGraceSeconds as number | null,
  };
}

export const CREATE_PHASES = ['reserving', 'importing', 'committing', 'committed', 'failed'] as const;
export interface VmProgress {
  readonly phase: (typeof CREATE_PHASES)[number];
  readonly bytesDone: number;
  readonly bytesTotal: number;
  readonly warnings: readonly string[];
  /** Why the create failed; null while it has not. */
  readonly fault: VmFault | null;
}

function progressOf(v: unknown): VmProgress | null {
  const p = rec(v);
  if (!p) return null;
  const phase = oneOf(p.phase, CREATE_PHASES), bytesDone = count(p.bytes_done), bytesTotal = count(p.bytes_total);
  const fault = opt(p, 'error', faultOf);
  if (phase === null || bytesDone === null || bytesTotal === null || fault === BAD) return null;
  let warnings: string[] = [];
  if (p.warnings !== undefined) {
    if (!Array.isArray(p.warnings) || p.warnings.some((x) => text(x) === null)) return null;
    warnings = p.warnings as string[];
  }
  // A create that failed says why; one that has not failed carries no error.
  if ((phase === 'failed') !== (fault !== null)) return null;
  return { phase, bytesDone, bytesTotal, warnings, fault };
}

export const SIDECAR_KINDS = ['passt', 'virtiofsd', 'swtpm'] as const;
export const SIDECAR_STATES = ['absent', 'starting', 'ready', 'degraded', 'stopped'] as const;
export interface VmSidecar { readonly kind: (typeof SIDECAR_KINDS)[number]; readonly state: (typeof SIDECAR_STATES)[number] }

/** One VM as the program describes it. */
export interface Vm {
  readonly name: string;
  readonly vmId: string | null;
  readonly state: VmState;
  /** The program's sentence for a Failed or Orphaned VM. */
  readonly reason: string | null;
  /** The current run's id (a newer run has another one). */
  readonly run: string | null;
  /** Create progress; null once the VM exists. */
  readonly progress: VmProgress | null;
  readonly sidecars: readonly VmSidecar[];
  /** The VM's settings; null while it is being created (no evidence, never "no settings"). */
  readonly spec: VmSpec | null;
  /** The VM stopped answering: pause and resume are refused, a stop cuts the power. */
  readonly monitorStalled: boolean;
  /** A refusal or failure the program recorded, whatever the state. */
  readonly fault: VmFault | null;
  readonly share: VmShare | null;
}

/** One VM's detail, or null when the answer is not one. With `name`, an answer about another VM is not one either. */
export function parseVm(wire: unknown, name?: string): Vm | null {
  const w = rec(wire);
  if (!w || !isVmName(w.name) || (name !== undefined && w.name !== name)) return null;
  const state = oneOf(w.state, VM_STATES);
  const id = opt(w, 'vm_id', vmId), reason = opt(w, 'reason', (v) => text(v)), run = opt(w, 'run', vmId);
  const progress = opt(w, 'progress', progressOf), spec = opt(w, 'spec', specOf), stalled = opt(w, 'monitor_stalled', flag);
  const fault = opt(w, 'error', faultOf), share = opt(w, 'share', shareOf);
  if (state === null || [id, reason, run, progress, spec, stalled, fault, share].includes(BAD as never)) return null;
  const sidecars: VmSidecar[] = [];
  if (w.sidecars !== undefined) {
    if (!Array.isArray(w.sidecars)) return null;
    for (const it of w.sidecars) {
      const kind = oneOf(rec(it)?.kind, SIDECAR_KINDS), st = oneOf(rec(it)?.state, SIDECAR_STATES);
      if (kind === null || st === null) return null;
      sidecars.push({ kind, state: st });
    }
  }
  const prog = progress as VmProgress | null;
  // A stalled VM has a live process: it is running, being stopped, or failed while it ran. A create still in flight is
  // Creating. Anything else contradicts itself.
  if (stalled === true && state !== 'Running' && state !== 'Stopping' && state !== 'Failed') return null;
  if (prog && prog.phase !== 'committed' && prog.phase !== 'failed' && state !== 'Creating') return null;
  return {
    name: w.name, vmId: id as string | null, state, reason: reason as string | null, run: run as string | null, progress: prog,
    sidecars, spec: spec as VmSpec | null, monitorStalled: stalled === true, fault: fault as VmFault | null, share: share as VmShare | null,
  };
}

// ── the computer the VMs live in ─────────────────────────────────────────────────────

/** Core's server kind: a rented bare-metal server, a shared one (free or paid plan), or not known. */
export type ServerKind = 'bare_metal' | 'shared' | null;
export const serverKindOf = (planKind: 'paid' | 'bare_metal' | 'free' | null): ServerKind => (planKind === null ? null : planKind === 'bare_metal' ? 'bare_metal' : 'shared');

export interface HostFacts {
  readonly id: string;
  readonly name: string;
  readonly kind: ServerKind;
  /** The Hoody API's KVM switch for this computer; null: the row does not say. */
  readonly kvm: boolean | null;
  /** Whether the server allows VMs: false is a known no, null not checked lately. */
  readonly kvmSupported: boolean | null;
  readonly state: ComputerState;
  /** The server's time ended or the server was reinstalled: nothing of the computer runs. */
  readonly expired: boolean;
}

/** The computer's facts from its row in the Hoody API's list, or null when the row is not readable. `state` is core's
 *  computerState(row.status), `planKind` core's plan kind for the row. */
export function hostFactsOf(row: unknown, state: ComputerState, planKind: 'paid' | 'bare_metal' | 'free' | null): HostFacts | null {
  const r = rec(row);
  const id = text(r?.id, 64);
  if (!r || !id) return null;
  const server = rec(r.server);
  return {
    id, name: text(r.name, 256) ?? '', kind: serverKindOf(planKind), kvm: flag(r.kvm), kvmSupported: server ? flag(server.kvm_supported) : null, state,
    expired: r.server_expired === true || r.status === 'host_reinstalled',
  };
}

/** How the VM program's capability read stands. */
export type CapsRead =
  | { readonly kind: 'idle' } | { readonly kind: 'loading' } | { readonly kind: 'failed' }
  /** The VM program answered, and the answer is not a shape this Hub reads: never called unreachable. */
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'ok'; readonly caps: Caps };
/** How the computer's row stands: still being read, not readable (the list failed or does not show it), or read. */
export type FactsRead = { readonly kind: 'loading' } | { readonly kind: 'unknown' } | { readonly kind: 'ok'; readonly facts: HostFacts };

/** KVM for this computer, from the two places that know: `on` the switch is on (or not known) and it works inside;
 *  `off` the switch is off; `notInside` the switch is on and the computer cannot use it; `unknown` neither says. */
export type KvmStand = 'on' | 'off' | 'notInside' | 'unknown';

export type HostState =
  | { readonly kind: 'loading' }
  /** No computer is picked. */
  | { readonly kind: 'none' }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'expired' }
  /** A shared server: VMs cannot run here, and the VM program is not asked. */
  | { readonly kind: 'shared' }
  /** The VM program did not answer; the cause is not known. */
  | { readonly kind: 'unreachable' }
  /** The VM program answered in a shape this Hub does not read. */
  | { readonly kind: 'unreadable' }
  /** The VM program answers. kindKnown false: what kind of server this is could not be checked. */
  | { readonly kind: 'ready'; readonly kvm: KvmStand; readonly kindKnown: boolean; readonly caps: Caps };

/** Whether the VM program is asked at all: never without a computer, nor for one that is stopped, expired or on a
 *  shared server. A row that cannot be read claims nothing, so the program is asked. */
export function wantsVmReads(hasComputer: boolean, facts: FactsRead): boolean {
  if (!hasComputer || facts.kind === 'loading') return false;
  if (facts.kind === 'unknown') return true;
  const f = facts.facts;
  return !f.expired && f.state !== 'stopped' && f.kind !== 'shared';
}

export function kvmStand(kvm: boolean | null, kvmPresent: boolean): KvmStand {
  if (kvm === false) return 'off';
  if (kvmPresent) return 'on';
  return kvm === true ? 'notInside' : 'unknown';
}

export function hostState(hasComputer: boolean, facts: FactsRead, caps: CapsRead): HostState {
  if (!hasComputer) return { kind: 'none' };
  if (facts.kind === 'loading') return { kind: 'loading' };
  const f = facts.kind === 'ok' ? facts.facts : null;
  if (f?.expired) return { kind: 'expired' };
  if (f?.state === 'stopped') return { kind: 'stopped' };
  if (f?.kind === 'shared') return { kind: 'shared' };
  if (caps.kind === 'failed') return { kind: 'unreachable' };
  if (caps.kind === 'unreadable') return { kind: 'unreadable' };
  if (caps.kind !== 'ok') return { kind: 'loading' };
  return { kind: 'ready', kvm: kvmStand(f ? f.kvm : null, caps.caps.kvmPresent), kindKnown: f !== null && f.kind !== null, caps: caps.caps };
}

/** Why a VM cannot be started on this computer now, or null. */
export function startBlock(host: HostState): 'kvmOff' | 'kvmNotInside' | null {
  if (host.kind !== 'ready' || host.kvm === 'on') return null;
  return host.kvm === 'off' ? 'kvmOff' : 'kvmNotInside';
}

// ── refresh ──────────────────────────────────────────────────────────────────────────

export const POLL_FAST_MS = 3_000;
export const POLL_SLOW_MS = 30_000;
/** How long after the person's own change the list keeps its fast pace. */
export const POLL_AFTER_CHANGE_MS = 60_000;
const MOVING: readonly (VmState | null)[] = ['Creating', 'Starting', 'Stopping'];

/** The refresh pace: fast while a VM is being created, starting or stopping, and for a minute after the person's own
 *  change (`lastChangeAt`, ms; null: none); slow otherwise. A failed create is not moving. */
export function pollMs(rows: readonly Pick<VmRow, 'phase' | 'state'>[] | null, lastChangeAt: number | null, now: number): number {
  if (lastChangeAt !== null && now >= lastChangeAt && now - lastChangeAt < POLL_AFTER_CHANGE_MS) return POLL_FAST_MS;
  return (rows ?? []).some((r) => MOVING.includes(r.state) || (r.phase === 'creating' && r.state === null)) ? POLL_FAST_MS : POLL_SLOW_MS;
}

// ── one VM's screen (list, overview, power, delete) ──────────────────────────────────

/** A VM that exists: its settings are read. A VM still being created, or one that was not created, is not one. */
export type VmReady = Vm & { readonly spec: VmSpec };
export const hasSpec = (vm: Vm): vm is VmReady => vm.spec !== null;
