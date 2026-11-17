// The snapshots feature's reads and changes, a second core source of the computers page (its own keys, so it never
// shares a cache entry with data.ts). No change is ever resent: a lost answer is read back through `reads` and
// held under its lock until a fresh read proves it or the person dismisses it.
import { containersRoute, coreSource, type SourceTable } from '@core';
import { listMadeNew, sentServer } from '../data';
import { snapshotGoneProved, snapshotProved, snapshotRenamedProved, snapshotRestoredProved, snapshotsOf, type SnapshotList } from './logic';
import { snapshotRoutes } from './routes';

export const SNAP_LOCK = 'computer.snapshot';
export const COPY_FROM_LOCK = 'computer.copy_snapshot';
export const DROP_LOCK = 'computer.snapshot_delete';
export const RESTORE_LOCK = 'computer.snapshot_restore';
export const RENAME_LOCK = 'computer.snapshot_rename';

/** `expiry`: days to keep it (1 to 3650); absent sends none, and the server decides. */
/** `fresh` (never sent): a fresh, complete list read just before the send lacked the name (snapshotProved). */
export interface TakeVars { id: string; name: string; expiry?: number; fresh?: true }
export interface DropVars { id: string; name: string }
/** `before`: the snapshot's last_used_at as listed when the restore was sent; only a moved one proves it. */
export interface RestoreVars { id: string; name: string; before: string | null }
/** `alias`: the new label; null removes it. */
export interface RenameVars { id: string; name: string; alias: string | null }
/** A computer made from a snapshot: the source computer (`id`), the snapshot, the name, the target project and server,
 *  and, never sent, `before` (every id the page's list showed at the press: data.ts pressBefore) and `realm`
 *  (the realm it is sent under, 'all' for the base host), as the page's own copy (data.ts CopyVars). */
export interface CopyFromVars { id: string; snapshot: string; name: string; project: string; server: string; before?: readonly string[]; realm?: string }

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);

export const snapshotsTable: SourceTable = {
  reads: {
    snapshots: {
      route: snapshotRoutes.list,
      input: (p: { id: string }) => ({ params: { id: p.id } }),
      select: (raw, p: { id: string }) => snapshotsOf(raw, p.id),
    },
    // The computers list under this source's own key: only a fresh one proves a computer made from a snapshot.
    snapRows: { route: containersRoute, input: () => ({ query: { limit: 100 } }), select: (raw) => arr(obj(obj(raw)?.data)?.computers) },
  },
  changes: {
    take: {
      route: snapshotRoutes.create,
      // The alias is the name: a valid name is kept whole by the API, so the list shows exactly what was sent.
      input: (v: TakeVars) => ({ params: { id: v.id }, body: v.expiry === undefined ? { alias: v.name } : { alias: v.name, expiry: v.expiry } }),
      reads: ['snapshots'],
      lock: SNAP_LOCK, lockKey: (v: TakeVars) => ({ computer: v.id, name: v.name }),
      identity: (v: TakeVars) => ({ computer: v.id, name: v.name, ...(v.fresh ? { fresh: true } : {}) }),
      // One computer's change in every realm view: a realm switch never hides the hold or offers a fresh send;
      // core still reads it back (and proves it) only in the realm it was sent in.
      acrossRealms: true,
      proves: snapshotProved,
    },
    drop: {
      route: snapshotRoutes.remove,
      input: (v: DropVars) => ({ params: { id: v.id, name: v.name } }),
      reads: ['snapshots'],
      lock: DROP_LOCK, lockKey: (v: DropVars) => ({ computer: v.id, name: v.name }),
      acrossRealms: true,
      proves: snapshotGoneProved,
    },
    restore: {
      route: snapshotRoutes.restore,
      input: (v: RestoreVars) => ({ params: { id: v.id, name: v.name }, body: {} }),
      reads: ['snapshots'],
      // One restore at a time per computer, in every tab: the lock is the computer; the identity (what the held change shows
      // and `proves` reads) keeps the snapshot and the timestamp read before the send.
      lock: RESTORE_LOCK, lockKey: (v: RestoreVars) => ({ computer: v.id }),
      identity: (v: RestoreVars) => ({ computer: v.id, name: v.name, before: v.before }),
      acrossRealms: true,
      proves: snapshotRestoredProved,
    },
    rename: {
      route: snapshotRoutes.rename,
      input: (v: RenameVars) => ({ params: { id: v.id, name: v.name }, body: { alias: v.alias } }),
      reads: ['snapshots'],
      // One rename at a time per snapshot, whatever label each tab typed.
      lock: RENAME_LOCK, lockKey: (v: RenameVars) => ({ computer: v.id, name: v.name }),
      identity: (v: RenameVars) => ({ computer: v.id, name: v.name, alias: v.alias }),
      acrossRealms: true,
      proves: snapshotRenamedProved,
    },
    copyFrom: {
      route: snapshotRoutes.copyFrom,
      input: (v: CopyFromVars) => ({
        params: { id: v.id }, body: { name: v.name, target_project_id: v.project, target_server_id: v.server, source_snapshot: v.snapshot },
      }),
      reads: ['snapRows'],
      lock: COPY_FROM_LOCK, lockKey: (v: CopyFromVars) => ({ computer: v.id, snapshot: v.snapshot, name: v.name, project: v.project }),
      // The identity adds `before` and `realm` (never sent) and `server` (the target server sent). It is the page's own
      // copy route, so the same proof: only a new computer of that name in that project, in that realm, on that server
      // (data.ts listMadeNew), never the row a copy to a taken name found there (the API answers that copy 409).
      identity: (v: CopyFromVars) => ({
        computer: v.id, snapshot: v.snapshot, name: v.name, project: v.project,
        ...(v.before ? { before: [...v.before] } : {}), ...(v.realm ? { realm: v.realm } : {}), ...sentServer(v.server),
      }),
      acrossRealms: true,
      proves: listMadeNew,
    },
  },
};

const source = coreSource('computers', snapshotsTable);

export function useSnapshots(id: string | undefined, enabled: boolean) {
  return source.useQuery<SnapshotList, { id: string }>('snapshots', { id: id ?? '' }, { enabled: enabled && !!id });
}
export const useTakeSnapshot = () => source.useMutation<unknown, TakeVars>('take');
export const useDropSnapshot = () => source.useMutation<unknown, DropVars>('drop');
export const useRestoreSnapshot = () => source.useMutation<unknown, RestoreVars>('restore');
export const useRenameSnapshot = () => source.useMutation<unknown, RenameVars>('rename');
export const useCopyFromSnapshot = () => source.useMutation<unknown, CopyFromVars>('copyFrom');
