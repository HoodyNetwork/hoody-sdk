// Remote storage's reads and changes, its own core source of the computers page (its own keys). Every change goes
// to the computer's files program and none is ever resent: a lost answer is held under its lock until a fresh list
// proves it or its sender dismisses it (C9); a connect no list can prove (logic.ts), so only its sender's Dismiss
// frees it. The connect carries keys, passwords and tokens: its lock names only the computer, and what the hold shows (its
// identity) is the provider and the account name, never a secret, so nothing derived from a secret is kept anywhere.
// Pending uploads (files not yet in the storage) are read the same way; deliver, stop and discard are each sent once
// and read back through that list (logic.ts deliverProved, stopProved); a discard is proved only by its own answer.
// The source id is 'computers', a stable sender name, not a folder: every held change records its sender as
// 's:<source id>:<key>', so a new id would make holds already sent another page's (no Dismiss here) for good.
import { coreSource, download, save, subjectOf, targetOf, type HeldChange, type SourceTable, type Subject } from '@core';
import { backendsOf, connectProved, deliverProved, diskOf, heldFilesOf, heldOf, mountProved, mountsOf, removeProved, stopProved, unmountProved, type Backend, type Held, type HeldFile, type HeldFiles, type Listed, type Mount } from './logic';
import type { ProviderId } from './providers';
import { storageRoutes } from './routes';

export const CONNECT_LOCK = 'computer.storage_connect';
export const MOUNT_LOCK = 'computer.storage_mount';
export const UNMOUNT_LOCK = 'computer.storage_unmount';
export const REMOVE_LOCK = 'computer.storage_remove';
export const DELIVER_LOCK = 'computer.storage_deliver';
export const STOP_LOCK = 'computer.storage_stop';
export const DISCARD_LOCK = 'computer.storage_discard';
/** The largest held file downloaded here (the browser holds it whole before saving). */
export const HELD_FILE_MAX = 256 * 1024 * 1024;

export interface ConnectVars extends Subject { type: ProviderId; body: Record<string, string | number | boolean> }
/** `leaf`: the folder it opens at, made once per press (logic.ts folderLeaf). */
export interface MountVars extends Subject { backend: string; label: string; leaf: string }
export interface UnmountVars extends Subject { mount: string; label: string }
export interface RemoveVars extends Subject { backend: string; name: string }
export interface TestParams extends Subject { backend: string }
/** A change of one pending upload; `name`: what the page called it when pressed (its folder or storage), `storage`:
 *  its storage's name then (the words of a band that outlives the lists). */
export interface HeldVars extends Subject { item: string; name: string; storage: string }
export interface HeldFilesParams extends Subject { item: string; cursor: string }
export type TestState = 'connected' | 'disconnected' | 'unknown';

// Core builds a read's key from its input even while the read is off: no target without a placed computer.
const at = (p: Subject) => (p.id && p.project && p.server ? { target: targetOf(p) } : {});
const userOf = (body: Record<string, unknown>): string => (typeof body.user === 'string' ? body.user : '');

export const storageTable: SourceTable = {
  reads: {
    backends: { route: storageRoutes.backends, input: (p: Subject) => at(p), select: (raw, p: Subject) => ({ ...backendsOf(raw), computer: p.id }) },
    mounts: { route: storageRoutes.mounts, input: (p: Subject) => at(p), select: (raw, p: Subject) => ({ ...mountsOf(raw), computer: p.id }) },
    held: { route: storageRoutes.held, input: (p: Subject) => at(p), select: (raw, p: Subject) => ({ ...heldOf(raw), computer: p.id }), staleTime: 0 },
    heldFiles: {
      route: storageRoutes.heldFiles,
      input: (p: HeldFilesParams) => ({ ...at(p), params: { id: p.item }, query: p.cursor ? { cursor: p.cursor } : {} }),
      select: (raw) => heldFilesOf(raw),
      staleTime: 0,
    },
    // The computer's own disk (Files' glance), from the API's stats read of the computer.
    storageDisk: { route: storageRoutes.stats, input: (p: Subject) => ({ params: { id: p.id } }), select: (raw) => diskOf(raw) },
    test: {
      route: storageRoutes.test,
      input: (p: TestParams) => ({ ...at(p), params: { id: p.backend } }),
      select: (raw): TestState => {
        const s = (raw as { status?: unknown } | null)?.status;
        return s === 'connected' || s === 'disconnected' ? s : 'unknown';
      },
      staleTime: 0,
    },
  },
  changes: {
    connect: {
      route: storageRoutes.connect,
      input: (v: ConnectVars) => ({ target: targetOf(v), params: { type: v.type }, body: { ...v.body } }),
      reads: ['backends'],
      lock: CONNECT_LOCK,
      lockKey: (v: ConnectVars) => ({ computer: v.id }),
      identity: (v: ConnectVars) => ({ computer: v.id, type: v.type, user: userOf(v.body) }),
      // The answer (the stored settings, masked) is not kept in the outcome.
      select: () => undefined,
      acrossRealms: true,
      proves: connectProved,
    },
    mount: {
      route: storageRoutes.mount,
      input: (v: MountVars) => ({ target: targetOf(v), body: { backend_id: v.backend, mount_path: v.leaf, label: v.label } }),
      reads: ['mounts'],
      lock: MOUNT_LOCK,
      lockKey: (v: MountVars) => ({ computer: v.id, backend: v.backend }),
      identity: (v: MountVars) => ({ computer: v.id, backend: v.backend, label: v.label, leaf: v.leaf }),
      acrossRealms: true,
      proves: mountProved,
    },
    unmount: {
      route: storageRoutes.unmount,
      // Files written to the folder and not uploaded yet stay on the computer (the program's default, said aloud).
      input: (v: UnmountVars) => ({ target: targetOf(v), params: { id: v.mount }, query: { uploads: 'keep' } }),
      reads: ['mounts'],
      lock: UNMOUNT_LOCK,
      lockKey: (v: UnmountVars) => ({ computer: v.id, mount: v.mount }),
      identity: (v: UnmountVars) => ({ computer: v.id, mount: v.mount, label: v.label }),
      acrossRealms: true,
      proves: unmountProved,
    },
    remove: {
      route: storageRoutes.remove,
      // A folder of it opened meanwhile (elsewhere) is closed with it; its files not uploaded yet stay, as on Close.
      input: (v: RemoveVars) => ({ target: targetOf(v), params: { id: v.backend }, query: { uploads: 'keep' } }),
      reads: ['backends'],
      lock: REMOVE_LOCK,
      lockKey: (v: RemoveVars) => ({ computer: v.id, backend: v.backend }),
      identity: (v: RemoveVars) => ({ computer: v.id, backend: v.backend, name: v.name }),
      acrossRealms: true,
      proves: removeProved,
    },
    // Every complete file of the item goes to its storage with its saved settings, replacing newer copies there (the
    // page asks first). A lost answer is proved only by the item being delivered (logic.ts).
    deliver: {
      route: storageRoutes.deliver,
      input: (v: HeldVars) => ({ target: targetOf(v), params: { id: v.item } }),
      reads: ['held', 'mounts'],
      lock: DELIVER_LOCK,
      lockKey: (v: HeldVars) => ({ computer: v.id, item: v.item }),
      identity: (v: HeldVars) => ({ computer: v.id, item: v.item, name: v.name, storage: v.storage }),
      select: () => undefined,
      acrossRealms: true,
      proves: deliverProved,
    },
    stop: {
      route: storageRoutes.stopHeld,
      input: (v: HeldVars) => ({ target: targetOf(v), params: { id: v.item } }),
      reads: ['held', 'mounts'],
      lock: STOP_LOCK,
      lockKey: (v: HeldVars) => ({ computer: v.id, item: v.item }),
      identity: (v: HeldVars) => ({ computer: v.id, item: v.item, name: v.name, storage: v.storage }),
      select: () => undefined,
      acrossRealms: true,
      proves: stopProved,
    },
    discard: {
      route: storageRoutes.discard,
      input: (v: HeldVars) => ({ target: targetOf(v), params: { id: v.item } }),
      reads: ['held', 'mounts'],
      lock: DISCARD_LOCK,
      lockKey: (v: HeldVars) => ({ computer: v.id, item: v.item }),
      identity: (v: HeldVars) => ({ computer: v.id, item: v.item, name: v.name, storage: v.storage }),
      acrossRealms: true,
    },
  },
};

const source = coreSource('computers', storageTable);
type Who = Parameters<typeof subjectOf>[0];
/** A computer whose project, id and server are known: only then is there a files-program address. */
export const placed = (c: Who): boolean => { const x = subjectOf(c); return !!(x.id && x.project && x.server); };

export function useBackends(c: Who, enabled: boolean) {
  return source.useQuery<Listed<Backend>, Subject>('backends', subjectOf(c), { enabled: enabled && placed(c) });
}
/** The folders, read again every 30 s while shown (another program may write into one), every 5 s while one is
 *  syncing or has files waiting (`fast`): their sync words never stay on an old read. */
export function useMounts(c: Who, enabled: boolean, fast = false) {
  return source.useQuery<Listed<Mount>, Subject>('mounts', subjectOf(c), { enabled: enabled && placed(c), refetchInterval: fast ? 5_000 : 30_000 });
}
/** The computer's own disk for the glance, read only while `enabled` (Files: while the computer runs): undefined when
 *  not read, 'reading' before the answer, null when the read failed or does not say (never 0), else its use and size
 *  in bytes. */
export function useDisk(c: Who, enabled: boolean): { used: number; total: number } | null | 'reading' | undefined {
  const on = enabled && !!subjectOf(c).id;
  const q = source.useQuery<{ used: number; total: number } | null, Subject>('storageDisk', subjectOf(c), { enabled: on });
  if (!on) return undefined;
  if (q.isError) return null;
  return q.data === undefined ? 'reading' : q.data;
}
/** A backend's connection test, read only while `enabled` (after the person asked for it). */
export function useBackendTest(c: Who, backend: string, enabled: boolean) {
  return source.useQuery<TestState, TestParams>('test', { ...subjectOf(c), backend }, { enabled: enabled && placed(c) && !!backend });
}
/** What waits on the computer, read again every 30 s while shown (another client or the program may add an upload
 *  that waits), every 5 s while something on it is moving (uploading, delivering). */
export function useHeld(c: Who, enabled: boolean, moving: boolean) {
  return source.useQuery<Listed<Held>, Subject>('held', subjectOf(c), { enabled: enabled && placed(c), refetchInterval: moving ? 5_000 : 30_000 });
}
export function useHeldFiles(c: Who, item: string, cursor: string, enabled: boolean) {
  return source.useQuery<HeldFiles, HeldFilesParams>('heldFiles', { ...subjectOf(c), item, cursor }, { enabled: enabled && placed(c) && !!item });
}
/** Downloads one held file (its bytes as the cache held them) and saves it under its own name. A read: nothing is
 *  changed. 'big' when it is over HELD_FILE_MAX (nothing is fetched), 'failed' when it did not come whole. */
export async function downloadHeld(c: Who, item: string, f: HeldFile): Promise<'saved' | 'big' | 'failed'> {
  if (f.size > HELD_FILE_MAX) return 'big';
  try {
    const got = await download(storageRoutes.heldFile, { target: targetOf(subjectOf(c)), params: { id: item }, query: { path_b64: f.key }, maxBytes: HELD_FILE_MAX });
    const name = f.name.split('/').pop() || 'file';
    return 'ok' in save(name, got.parts, { maxBytes: HELD_FILE_MAX }) ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}
export const useConnect = () => source.useMutation<unknown, ConnectVars>('connect');
export const useMount = () => source.useMutation<unknown, MountVars>('mount');
export const useUnmount = () => source.useMutation<unknown, UnmountVars>('unmount');
export const useRemove = () => source.useMutation<unknown, RemoveVars>('remove');
export const useDeliver = () => source.useMutation<unknown, HeldVars>('deliver');
export const useStopHeld = () => source.useMutation<unknown, HeldVars>('stop');
export const useDiscard = () => source.useMutation<unknown, HeldVars>('discard');
export const storageHeldBy = (key: string, h: HeldChange): 'self' | 'other' | undefined => source.heldBy(key, h);
