// A VM's snapshots: the list read and the three changes (take, restore, delete). A core source of the VMs page with
// its own keys.
//
// Contract, in plain words:
//   - The list goes through its parser (snap-logic.ts); an answer that is not a snapshot list is the read's failure.
//   - No change is ever sent twice by the page. Taking and restoring copy whole disks and can run for minutes: the
//     request stays out until the VM program answers. A sent change whose answer is lost, or a 5xx, is held under the
//     VM's change lock (one per VM, shared with every other change to that VM, so nothing else is sent to it meanwhile)
//     until a fresh read proves it or the person stops tracking it:
//       take      proved by the label in a fresh list of the same VM, when a list read right before the send lacked it;
//       remove    proved by the label gone from a fresh list of the same VM;
//       restore   no read proves it: it stays held until the person stops tracking it.
//   - "The same VM" is the VM's own id: the proofs read a fresh detail of the VM beside the list, and a VM made later
//     under the same name proves nothing.
//   - Each change carries the computer it was pressed on, so a switch of computer while it is out never moves it.
import { coreSource, type SourceTable, type Target } from '@core';
import { VM_LOCK, vmLockKey } from './changes';
import { parseVm, type Vm } from './logic';
import { routes } from './routes';
import { parseSnapshots, parseSnapshotTaken, snapGoneProved, snapTakenProved, type SnapshotList, type SnapshotTaken } from './snap-logic';

/** The lock of every change to one VM (changes.ts): keyed by the VM's own id. */
const lockKey = (v: { vm: string }) => vmLockKey(v.vm);
export { VM_LOCK };

const must = <T,>(v: T | null): T => {
  if (v === null) throw new Error('BAD_ANSWER');
  return v;
};

/** What every snapshot change names: the computer it was pressed on, the VM (its own id and its name) and the label. */
export interface SnapVars { computer: string; target: Target; vm: string; name: string; label: string }
/** `absentBefore`: a list of the VM read fresh right before the send lacked the label (the page sends no take otherwise). */
export interface TakeVars extends SnapVars { absentBefore: boolean }

export type SnapOp = 'snap.take' | 'snap.restore' | 'snap.remove';
const identityOf = (op: SnapOp) => (v: SnapVars) => ({ computer: v.computer, vm: v.vm, name: v.name, op, label: v.label });

export const snapshotsTable: SourceTable = {
  reads: {
    snaps: {
      route: routes.snaps,
      input: (p: { name: string }) => ({ params: { name: p.name } }),
      select: (raw, p: { name: string }): SnapshotList => ({ vm: p.name, items: must(parseSnapshots(raw)) }),
    },
    // The VM itself under this source's own key: only a fresh one says which VM a fresh list belongs to.
    vm: {
      route: routes.vm,
      input: (p: { name: string }) => ({ params: { name: p.name } }),
      select: (raw, p: { name: string }): Vm => must(parseVm(raw, p.name)),
    },
  },
  changes: {
    take: {
      route: routes.snapCreate,
      input: (v: TakeVars) => ({ target: v.target, params: { name: v.name }, body: { label: v.label } }),
      // What the program noticed while taking it; an answer that is not the taken snapshot's still means it was taken.
      select: (raw, v: TakeVars) => parseSnapshotTaken(raw, v.name, v.label),
      reads: ['snaps', 'vm'],
      lock: VM_LOCK, lockKey,
      identity: (v: TakeVars) => ({ ...identityOf('snap.take')(v), absentBefore: v.absentBefore }),
      proves: snapTakenProved,
    },
    restore: {
      route: routes.snapRestore,
      input: (v: SnapVars) => ({ target: v.target, params: { name: v.name, label: v.label } }),
      reads: ['snaps', 'vm'],
      lock: VM_LOCK, lockKey,
      identity: identityOf('snap.restore'),
    },
    remove: {
      route: routes.snapDelete,
      input: (v: SnapVars) => ({ target: v.target, params: { name: v.name, label: v.label } }),
      reads: ['snaps', 'vm'],
      lock: VM_LOCK, lockKey,
      identity: identityOf('snap.remove'),
      proves: snapGoneProved,
    },
  },
};

const source = coreSource('vms', snapshotsTable);

export const SNAPS_REFRESH_MS = 30_000;

/** One VM's snapshots. `enabled` false: not read at all. */
export const useSnapshots = (name: string, enabled: boolean) => source.useQuery<SnapshotList, { name: string }>('snaps', { name }, { enabled, refetchInterval: SNAPS_REFRESH_MS });

/** The VM under this source's key, kept mounted beside the list so a held change's read-back can tell which VM the
 *  fresh list belongs to. It is read when the tab opens and by a read-back, not on a timer. */
export const useSnapshotsVm = (name: string, enabled: boolean) => source.useQuery<Vm, { name: string }>('vm', { name }, { enabled });

export const useTakeSnapshot = () => source.useMutation<SnapshotTaken | null, TakeVars>('take');
export const useRestoreSnapshot = () => source.useMutation<unknown, SnapVars>('restore');
export const useRemoveSnapshot = () => source.useMutation<unknown, SnapVars>('remove');

/** Which of this tab's changes sent a held change of the VM's lock ('self'), or another part of the Hub ('other'). */
export const snapHeldBy = (key: 'take' | 'restore' | 'remove', h: Parameters<typeof source.heldBy>[1]) => source.heldBy(key, h);
