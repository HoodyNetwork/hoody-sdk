// Pure rules of a VM's power changes and its delete: no React, no I/O.
//
// Contract, in plain words:
//   - powerPlan says what a VM offers in each state: one main action and the rest of its menu. A VM whose run failed
//     also offers Power off: it can read Failed while it still runs, and then neither Start nor Delete is taken. A VM that was not created
//     offers only its removal; a VM that stopped answering offers only Power off; a VM being created, or one that needs
//     repair, offers nothing.
//   - blockOf says why an action cannot be sent now, or null. Start is held back while the computer cannot start a VM
//     (KVM off or not usable inside, not enough memory left, a VM or CPU budget full), and until the VM's own read
//     is on screen (a start notes the run the VM had): the VM program answers those
//     with a status this page can only read as "may have gone through", so the page does not send what it knows will
//     be refused. Delete is offered for a VM that does not run.
//   - A sent change is told apart by its identity ({vm, name, op, run}): `vm` is the VM's own id at the press, `run` the
//     run it had then. proveChange judges a held change on fresh reads, by that id only:
//       shut down: the VM reads Stopping or Stopped.      power off: Stopped only (a VM already shutting down reads
//         Stopping before the power off arrives).      pause: Paused.      resume: Running.
//       start: only the VM's own read proves it, by a run other than the one noted at the press: with the VM Starting,
//         Running or Paused, or Failed or carrying an error (it started and then failed). When the program names no
//         run at all, the state alone stands. A list row proves no start: it does not name the run.
//       delete: a whole list read holds no row with that id (and no row of that name whose id it does not give).
//       reset: no read shows a reset happened; it is never proved.
//     A row or a VM under the same name with another id is another VM: it proves nothing about this one. Nothing here
//     ever answers "not applied": a read that does not show the effect leaves the change held.
//   - heldNote says what the last read showed about a change still held (not yet / that VM is gone), for its band.
import { memoryUse, startBlock, type HostState, type RowKind, type Vm, type VmCode, type VmRow } from './logic';

export const VM_OPS = ['start', 'stop', 'forceStop', 'pause', 'resume', 'reset', 'delete'] as const;
export type VmOp = (typeof VM_OPS)[number];
/** The changes asked before they are sent: they cut power, lose what the VM holds in memory, or remove the VM. */
export const CONFIRMED_OPS: readonly VmOp[] = ['forceStop', 'reset', 'delete'];

// ── what a VM offers ─────────────────────────────────────────────────────────────────

export interface PowerPlan {
  /** The one main action; null: none. */
  readonly primary: VmOp | null;
  /** The other actions, in menu order. */
  readonly menu: readonly VmOp[];
}

const NOTHING: PowerPlan = { primary: null, menu: [] };

/** What a VM of this kind offers. `stalled`: it runs and stopped answering (pause, resume and reset are refused, and a
 *  shut-down cuts the power, so only Power off is offered). */
export function powerPlan(kind: RowKind, stalled: boolean): PowerPlan {
  switch (kind) {
    case 'stopped':
    case 'runFailed':
      return { primary: 'start', menu: kind === 'runFailed' ? ['forceStop', 'delete'] : ['delete'] };
    case 'running':
      return stalled ? { primary: 'forceStop', menu: ['delete'] } : { primary: 'stop', menu: ['pause', 'reset', 'forceStop', 'delete'] };
    case 'paused':
      return { primary: 'resume', menu: ['stop', 'forceStop', 'delete'] };
    case 'starting':
    case 'stopping':
      return { primary: null, menu: ['forceStop', 'delete'] };
    case 'createFailed':
      return { primary: 'delete', menu: [] };
    default:
      return NOTHING;
  }
}

/** The kinds a delete is sent for: the VM does not run (or never existed). */
const DELETABLE: readonly RowKind[] = ['stopped', 'runFailed', 'createFailed'];

export type Block = 'framed' | 'sending' | 'held' | 'noId' | 'unread' | 'kvmOff' | 'kvmNotInside' | 'memory' | 'vmBudget' | 'cpuBudget' | 'running';

export interface BlockFacts {
  /** The Hub is shown inside another page: core refuses every change unsent. */
  readonly framed: boolean;
  /** A change of this VM is out now. */
  readonly sending: boolean;
  /** A change of this VM may have gone through and is not settled. */
  readonly held: boolean;
  /** The VM's own id; null: the program gave none, so nothing can be bound to this VM. */
  readonly vmId: string | null;
  readonly kind: RowKind;
  readonly host: HostState;
  /** The VM's memory and CPUs when its settings are read; null: not read (the program then decides). */
  readonly memoryMib: number | null;
  readonly vcpus: number | null;
  /** The VM's own read is on screen: a start notes the run the VM had, so it waits for that read. */
  readonly read: boolean;
  /** The reads on screen do not agree on which VM holds this name (or the VM's own read failed and an older answer
   *  is shown): a change is sent by name, so none is sent until they agree. */
  readonly unsure?: boolean;
}

/** Why `op` cannot be sent for this VM now, or null when it can. */
export function blockOf(op: VmOp, f: BlockFacts): Block | null {
  if (f.framed) return 'framed';
  if (f.vmId === null) return 'noId';
  if (f.unsure) return 'unread';
  if (f.sending) return 'sending';
  if (f.held) return 'held';
  if (op === 'delete') return DELETABLE.includes(f.kind) ? null : 'running';
  if (op !== 'start') return null;
  if (!f.read) return 'unread';
  const kvm = startBlock(f.host);
  if (kvm) return kvm;
  if (f.host.kind !== 'ready') return null;
  const caps = f.host.caps;
  if (caps.budgets.vms && caps.budgets.vms.used >= caps.budgets.vms.ceiling) return 'vmBudget';
  if (f.vcpus !== null && caps.budgets.vcpus && caps.budgets.vcpus.used + f.vcpus > caps.budgets.vcpus.ceiling) return 'cpuBudget';
  const freeMib = memoryUse(caps).freeForNewVmMib;
  if (f.memoryMib !== null && freeMib !== null && freeMib < f.memoryMib) return 'memory';
  return null;
}

// ── a sent change ────────────────────────────────────────────────────────────────────

/** What a sent change was about: the VM's own id and name, the operation, and the run the VM had at the press. */
export interface ChangeIdentity {
  readonly vm: string;
  readonly name: string;
  readonly op: VmOp;
  readonly run: string | null;
}

const isOp = (v: unknown): v is VmOp => typeof v === 'string' && (VM_OPS as readonly string[]).includes(v);

/** A held change's identity as this page wrote it, or null when it is not one (another part's change of the VM). */
export function parseIdentity(v: unknown): ChangeIdentity | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.vm !== 'string' || !o.vm || typeof o.name !== 'string' || !o.name || !isOp(o.op)) return null;
  if (o.run !== null && typeof o.run !== 'string') return null;
  return { vm: o.vm, name: o.name, op: o.op, run: o.run };
}

/** The VM id any held change of the VM lock names, or null (every part's identity carries `vm`). */
export function heldVmId(v: unknown): string | null {
  const vm = v !== null && typeof v === 'object' ? (v as Record<string, unknown>).vm : null;
  return typeof vm === 'string' && vm ? vm : null;
}

type Lists = readonly (readonly VmRow[])[];
type Details = readonly Vm[];

const isRow = (v: unknown): v is VmRow => v !== null && typeof v === 'object' && typeof (v as VmRow).name === 'string' && 'phase' in v;
const isVm = (v: unknown): v is Vm => v !== null && typeof v === 'object' && typeof (v as Vm).name === 'string' && 'sidecars' in v;
/** Fresh list answers as proveChange takes them: only whole lists. */
export const listsOf = (answers: readonly unknown[] | undefined): Lists => (answers ?? []).filter((a): a is VmRow[] => Array.isArray(a) && a.every(isRow));
/** Fresh detail answers as proveChange takes them. */
export const detailsOf = (answers: readonly unknown[] | undefined): Details => (answers ?? []).filter(isVm);

/** The state the fresh reads give for this very VM (by id): a detail read wins, as it is the fuller one. */
function seen(id: ChangeIdentity, lists: Lists, details: Details): { state: Vm['state'] | null; vm: Vm | null } | null {
  const vm = details.find((d) => d.vmId === id.vm);
  if (vm) return { state: vm.state, vm };
  for (const l of lists) {
    const row = l.find((r) => r.vmId === id.vm);
    if (row) return { state: row.state, vm: null };
  }
  return null;
}

/** Whether fresh reads prove a held change applied. Never 'not_applied': a read that does not show the effect proves
 *  nothing about a request that may still be taken. */
export function proveChange(identity: unknown, lists: Lists, details: Details): 'applied' | undefined {
  const id = parseIdentity(identity);
  if (!id || id.op === 'reset') return undefined;
  if (id.op === 'delete') {
    if (lists.length === 0) return undefined;
    // Gone from every whole list read, and no row of its name hides its id.
    const gone = lists.every((l) => !l.some((r) => r.vmId === id.vm || (r.name === id.name && r.vmId === null)));
    return gone ? 'applied' : undefined;
  }
  const s = seen(id, lists, details);
  if (!s) return undefined;
  switch (id.op) {
    case 'stop':
      return s.state === 'Stopping' || s.state === 'Stopped' ? 'applied' : undefined;
    case 'forceStop':
      return s.state === 'Stopped' ? 'applied' : undefined;
    case 'pause':
      return s.state === 'Paused' ? 'applied' : undefined;
    case 'resume':
      return s.state === 'Running' ? 'applied' : undefined;
    case 'start': {
      const v = s.vm;
      if (!v) return undefined;
      const up = v.state === 'Starting' || v.state === 'Running' || v.state === 'Paused';
      // An answer that names no run proves no start: the program names the run of every VM that is up.
      if (v.run === null) return undefined;
      if (v.run === id.run) return undefined;
      // A new run: it runs, or it started and failed (the VM says something went wrong).
      return up || v.state === 'Failed' || v.fault !== null ? 'applied' : undefined;
    }
    default:
      return undefined;
  }
}

/** What the reads on screen say about a change still held: 'gone' the VM it was sent for is no longer here (a list
 *  read lacks its id, or its name now belongs to another VM), 'notYet' the VM is here and does not show the change,
 *  null nothing can be said. */
export function heldNote(id: ChangeIdentity, list: readonly VmRow[] | undefined, vm: Vm | undefined): 'gone' | 'notYet' | null {
  if (id.op === 'reset') return null;
  if (vm && vm.name === id.name && vm.vmId !== null && vm.vmId !== id.vm) return 'gone';
  if (list) {
    const row = list.find((r) => r.vmId === id.vm);
    if (!row) return list.some((r) => r.name === id.name && r.vmId === null) ? null : id.op === 'delete' ? null : 'gone';
    return 'notYet';
  }
  return vm && vm.vmId === id.vm ? 'notYet' : null;
}

// ── words ────────────────────────────────────────────────────────────────────────────

/** The codes whose reason a held note adds: the VM program answered them with a status that reads "may have gone
 *  through", and each says why it would not have. */
export const REPORTED_CODES: readonly VmCode[] = [
  'KvmUnavailable', 'KvmCapExceeded', 'MemoryExceedsCgroup', 'InsufficientSpace', 'DisplayUnavailable', 'SidecarUnavailable',
  'AudioBackendUnavailable', 'ConsoleUnavailable', 'DownloadFailed',
];
/** The codes this page has a sentence for (strings `power.code.<Code>`). */
export const WORDED_CODES = [
  'KvmUnavailable', 'KvmCapExceeded', 'MemoryExceedsCgroup', 'InsufficientSpace', 'DisplayUnavailable', 'SidecarUnavailable', 'AudioBackendUnavailable',
  'PortForwardConflict', 'TpmStateMissing', 'DisplayRangeExhausted', 'DisplayInUse', 'BadState', 'OperationInProgress', 'SourceBusy', 'NotFound',
  'Orphaned', 'QemuExecFailed', 'QemuExitedBeforeReady', 'QmpHandshakeFailed', 'RunAbnormalExit', 'SpecInvalid', 'StorageFailed',
] as const satisfies readonly VmCode[];
export type WordedCode = (typeof WORDED_CODES)[number];
export const wordedCode = (c: VmCode | null): WordedCode | null => (c !== null && (WORDED_CODES as readonly VmCode[]).includes(c) ? (c as WordedCode) : null);
