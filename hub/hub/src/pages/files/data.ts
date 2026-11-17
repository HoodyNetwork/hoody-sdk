// The Files page's data: the realm's computers and one folder listing per pane, all through core.
//
// Contract, in plain words:
//   - useFilesComputers() reads core's useComputersAll (every page of the realm's list, 100 rows each, up to ALL_PAGES_MAX;
//     page 1 is the shell's shared read) and keeps the selected realm's rows by core's one realm rule (pickComputer, as the
//     shell does). rows is null until the first answer. complete is true only when the rows are the whole list (it fit one page,
//     one read), so a handle missing from incomplete rows is unknown, never "not in this realm": more says later pages are
//     still being read, capped that the realm has more computers than Files reads, unproven that every page is in but a list
//     read in several pages can skip a computer (core). failed is the last read's, rows kept or not: a failed refresh
//     keeps the earlier rows (core) and the page says they may be out of date.
//   - useFolder(c, path, enabled) lists one folder of one computer through the per-depth routes. A folder blockedPath
//     refuses is never read. select turns a body that is not a listing into an error (never an empty folder).
//   - useFilesChange(kind) sends one change (new folder, rename, delete, copy or move of a file, move of a folder)
//     through core's C9 lock, keyed by the computer: one change at a time on a computer, across every tab, while one
//     is out or may have gone through (core refuses the press: BUSY, READ_BACK_FIRST, HELD_BY_OTHER). A hold an
//     earlier build filed per path holds it back too (not_sent HELD_OVERLAP). verdictOf(identity) says what this tab's
//     read-back proved for THAT send (its `op`, one per press), so the page can say it (not copied, another item
//     there, not moved); a send settled elsewhere has no verdict here and is never shown as done.
//   - An upload batch holds its computer (uploadLock, one per computer across tabs, uploadRun.ts) for as
//     long as a file of it is being sent or may have gone through. While it is there every Files change on that
//     computer is refused (HELD_OVERLAP), and an upload is refused while a Files change is held or out there.
//     Uploads do not pass core's change lock, so each side writes its own hold before it reads the other's: two
//     tabs can never both send (both may refuse).
import { api, can, onAuthPurge, outcomeOf, computerState, coreSource, heldAttempts, heldChanges, pickComputer, portAddress, queryClient, routingNode, readBackAll, sendingChanges, sourceReads, useAttemptsVersion, useCan, useChangesVersion, useComputersAll, useCore, useLockedChange, stringOrEmpty as str, type HeldAttempt, type HeldChange, type SourceTable } from '@core';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { blockedPath, folderOf, joinPath, nameIn, parentOf, partsOf, rootListingOf, type Folder, type FreshFolder, type Rules } from './logic';
import { copyDoneOf, copyJudge, deleteProved, mkdirProved, moveProved, presentAt, renameProved, transferDestOk, type CopyDone, type Listing, type Mounts } from './plan';
import { compareTrees, manifestOf, walkTree, type Compare, type Got, type Manifest, type Walk } from './tree';
import { metaOf as uploadMetaOf, type UploadMeta } from './upload';
import { archiveListRoute, copyRoute, deleteRoute, extractHistoryRoute, extractRoute, folderRoute, hashRoute, mkdirRoute, mountsRoute, moveRoute, putRoute, realpathRoute, renameRoute, rootRoute } from './routes';
import { doneFor, parseArchiveList, parseExtractFailed, type ArchiveList, type ExtractChanged, type ExtractDone } from './archive';

export interface FilesComputer {
  readonly id: string;
  readonly name: string;
  readonly project_id: string;
  readonly server_name: string;
  readonly status: string;
  readonly realm_ids?: readonly string[];
  /** Where it runs, for the computer picker: its server's city and two-letter country, when the API says. */
  readonly city?: string;
  readonly country?: string;
  /** The computer's colour as the API keeps it: drawn only through the kit's ComputerMark, which normalises it. */
  readonly color?: string;
  /** Its proxy access rules: set, open (none), or not known (the API could not check, or did not say). Only 'set'
   *  lets a 403 be read as the rules keeping the Hub out. */
  readonly rules: Rules;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function computerOf(raw: unknown): FilesComputer | null {
  const c = obj(raw);
  const id = str(c.id);
  if (!id) return null;
  const realms = Array.isArray(c.realm_ids) ? c.realm_ids.filter((x): x is string => typeof x === 'string') : undefined;
  const scope = c.proxy_permissions_scope;
  // The same reading as the computers page's access(): a known scope wins; 'unknown', a null flag or no field at all
  // is not known; then the flag alone.
  const has = c.has_proxy_permissions;
  const server = obj(c.server);
  const city = str(server.city);
  const country = str(server.country);
  const rules: Rules = scope === 'computer' || scope === 'project' || scope === 'both' ? 'set' : scope === 'none' ? 'open' : scope === 'unknown' || typeof has !== 'boolean' ? 'unknown' : has ? 'set' : 'open';
  return {
    id, name: str(c.name) || id.slice(-4), project_id: str(c.project_id), server_name: routingNode(c), status: str(c.status),
    ...(realms ? { realm_ids: realms } : {}), rules, ...(typeof c.color === 'string' ? { color: c.color } : {}),
    ...(city ? { city } : {}), ...(country ? { country } : {}),
  };
}

export interface FilesComputers {
  readonly rows: readonly FilesComputer[] | null;
  /** The last read of the list failed, whether or not rows from an earlier read are kept. */
  readonly failed: boolean;
  readonly error: unknown;
  readonly complete: boolean;
  /** Later pages of the list are still being read. */
  readonly more: boolean;
  /** The realm has more computers than Files reads (ALL_PAGES_MAX pages). */
  readonly capped: boolean;
  /** Every page is in, but a list read in several pages never proves a computer is gone. */
  readonly unproven: boolean;
  readonly loading: boolean;
  retry(): void;
}

export function useFilesComputers(): FilesComputers {
  const q = useComputersAll();
  const realm = useCore().realm;
  return useMemo(() => {
    const all = q.rows ? q.rows.map(computerOf).filter((c): c is FilesComputer => c !== null) : null;
    const rows = all ? all.filter((c) => pickComputer([c], { realm, remembered: c.id }) === c) : null;
    return { rows, failed: q.failed, error: q.error, complete: q.complete, more: q.more, capped: q.capped, unproven: q.unproven, loading: q.loading, retry: q.retry };
  }, [q.rows, q.failed, q.error, q.complete, q.more, q.capped, q.unproven, q.loading, q.retry, realm]);
}

/** running | stopped (paused too) | starting | attention: core's four buckets. */
export const stateOf = (c: FilesComputer) => computerState(c.status);

/** The computer's files address (core portAddress, as Connect builds it), or '' while its server is unknown. */
export const filesAddress = (c: FilesComputer): string => portAddress({ id: c.project_id }, { id: c.id, server_name: c.server_name }, 1, 'files');
/** The computer's files program has an address (its server and the proxy domain are known). */
export const hasAddress = (c: FilesComputer): boolean => !!filesAddress(c);

interface FolderParams { id: string; project: string; server: string; path: string }
const target = (p: FolderParams) => ({ project: { id: p.project }, container: { id: p.id, server_name: p.server } });
// The item as core's `*parts`: one route at every depth; core writes and checks each part.
const params = (p: FolderParams): Readonly<Record<string, readonly string[]>> => (partsOf(p.path).length ? { parts: partsOf(p.path) } : {});
// Core builds a read's key from its input even while the read is off: no target without a placed computer.
const where = (p: FolderParams) => (p.id && p.project && p.server ? { target: target(p), params: params(p) } : { params: params(p) });
// A listing names its computer and folder, so a change's read-back can tell which folder it saw (plan.ts proves).
const selectWith = (read: (raw: unknown) => Folder | null) => (raw: unknown, p: FolderParams): Listing => {
  const rows = read(raw);
  if (!rows) throw new Error('NOT_A_LISTING');
  return { computer: p.id, path: p.path, entries: rows.entries, hidden: rows.hidden, whole: rows.whole };
};
/** GET /api/v1/mounts → the open storages' paths and labels; complete only when every row was read. */
function mountsListOf(raw: unknown): Mounts {
  const rows = obj(raw).mounts;
  if (!Array.isArray(rows)) throw new Error('NOT_A_LIST');
  const items = rows.flatMap((r) => {
    const x = obj(r);
    return typeof x.mount_path === 'string' && x.mount_path.startsWith('/') ? [{ path: x.mount_path.replace(/\/+$/, '') || '/', label: typeof x.label === 'string' ? x.label : '' }] : [];
  });
  return { complete: items.length === rows.length, items };
}

const reads: Record<string, NonNullable<SourceTable['reads']>[string]> = {
  folder0: { route: rootRoute, input: (p: FolderParams) => ({ ...where(p), query: { json: '' } }), select: selectWith(rootListingOf), staleTime: 15_000 },
};
reads.folder = { route: folderRoute, input: (p: FolderParams) => where(p), select: selectWith(folderOf), staleTime: 15_000 };
// What the delete planner reads fresh each time it opens: never a cached answer.
reads.real = {
  route: realpathRoute, input: (p: FolderParams) => where(p), staleTime: 0,
  select: (raw: unknown) => { const r = obj(raw).real_path; if (typeof r !== 'string' || !r.startsWith('/')) throw new Error('NOT_A_PATH'); return r; },
};
// A file's SHA-256, read fresh: what proves a copy whose answer was lost. It names its computer and file.
reads.hash = {
  route: hashRoute, input: (p: FolderParams) => ({ ...where(p), query: { hash: '' } }), staleTime: 0,
    select: (raw: unknown, p: FolderParams) => { const h = obj(raw).hash; if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) throw new Error('NOT_A_HASH'); return { computer: p.id, path: p.path, hash: h }; },
};
// A folder listing with each entry's own type: what a folder copy walks and compares, read fresh. It names
// its computer and folder; an older files program's listing (no types, no skipped list) is no listing.
reads.tree = {
  route: folderRoute, input: (p: FolderParams) => where(p), staleTime: 0,
    select: (raw: unknown, p: FolderParams) => { const m = manifestOf(raw); if (!m) throw new Error('NOT_A_LISTING'); return { computer: p.id, path: p.path, tree: m }; },
};
// An archive's listing (Look inside), and the computer's extraction history, read only for whether
// extract is on there (403 where it is off). The history never settles an extract: it names no client attempt.
reads.arch = {
  route: archiveListRoute, input: (p: FolderParams) => ({ ...where(p), query: { preview: '' } }), staleTime: 15_000,
    select: (raw: unknown) => { const l = parseArchiveList(raw); if (!l) throw new Error('NOT_A_LISTING'); return l; },
};
const onComputer = (p: FolderParams) => (p.id && p.project && p.server ? { target: target(p) } : {});
reads.xhist = {
  route: extractHistoryRoute, input: (p: FolderParams) => ({ ...onComputer(p), query: { extraction_history: '' } }), staleTime: 0,
  select: (_raw: unknown, p: FolderParams) => ({ computer: p.id }),
};
reads.mounts = { route: mountsRoute, input: (p: FolderParams) => (p.id && p.project && p.server ? { target: target(p) } : {}), select: mountsListOf, staleTime: 0 };
const FOLDER_KEYS = ['folder0', 'folder'];

// The SHA-256 and tree reads a copy's read-back re-reads: only those a mounted hook holds enabled now (the held
// band's, or an open dialog's), by computer and path. A cached read nothing holds (a closed dialog's walk) is never
// re-read, so a folder deleted since cannot fail the check of another copy.
const heldReads = new Map<string, number>();
const heldReadKey = (prefix: string, computer: string, path: string) => `${prefix}\n${computer}\n${path}`;
function useHeldReads(prefix: 'tree' | 'hash', c: FilesComputer | undefined, paths: readonly string[], enabled: boolean): void {
  const id = c?.id ?? '';
  const sig = paths.join('\n');
  useEffect(() => {
    if (!enabled || !id) return undefined;
    const ks = (sig ? sig.split('\n') : []).map((p) => heldReadKey(prefix, id, p));
    for (const k of ks) heldReads.set(k, (heldReads.get(k) ?? 0) + 1);
    return () => { for (const k of ks) { const n = (heldReads.get(k) ?? 1) - 1; if (n > 0) heldReads.set(k, n); else heldReads.delete(k); } };
  }, [prefix, id, sig, enabled]);
}
const folderReads = sourceReads('files', FOLDER_KEYS);
const heldKinds = sourceReads('files', ['hash', 'tree']);
const copyReads = (k: readonly unknown[]): boolean => {
  if (folderReads(k)) return true;
  if (!heldKinds(k)) return false;
  const p = k[7] as Partial<FolderParams> | null;
  return !!p && typeof p.id === 'string' && typeof p.path === 'string' && heldReads.has(heldReadKey(String(k[6]), p.id, p.path));
};

const source = coreSource('files', { reads });

/** One folder of one computer, read while `enabled` (the pane shows it and core can open it). */
export function useFolder(c: FilesComputer | undefined, path: string, enabled: boolean) {
  const n = partsOf(path).length;
  const ok = !!c && !blockedPath(path) && !!c.project_id && !!c.server_name;
  const p: FolderParams = { id: c?.id ?? '', project: c?.project_id ?? '', server: c?.server_name ?? '', path };
  return source.useQuery<Listing, FolderParams>(ok && n > 0 ? 'folder' : 'folder0', p, { enabled: enabled && ok });
}

const paramsOf = (c: FilesComputer | undefined, path: string): FolderParams => ({ id: c?.id ?? '', project: c?.project_id ?? '', server: c?.server_name ?? '', path });

/** A file's SHA-256 on one computer, read while `enabled`: { computer, path, hash }. */
interface FileHash { readonly computer: string; readonly path: string; readonly hash: string }
export function useFileHash(c: FilesComputer | undefined, path: string, enabled: boolean) {
  const n = partsOf(path).length;
  const ok = !!c && n > 0 && !blockedPath(path) && !!c.project_id && !!c.server_name;
  useHeldReads('hash', c, useMemo(() => [path], [path]), enabled && ok);
  return source.useQuery<FileHash, FolderParams>('hash', paramsOf(c, path), { enabled: enabled && ok });
}

/** Where each item resolves (realpath) and the computer's open storages, read fresh while `enabled` (the delete
 *  dialog is open). real is null until every item answered; a failed read fails the whole plan. Only an answer
 *  fetched since this dialog opened counts (isFetchedAfterMount), a failure too: a cached answer from an earlier
 *  opening, shown while the fresh read runs, never arms a change or refuses one. */
export function usePlanReads(c: FilesComputer | undefined, paths: readonly string[], enabled: boolean) {
  const ps = paths.map((path) => paramsOf(c, path));
  const okAll = !!c && paths.every((p) => partsOf(p).length > 0 && !blockedPath(p));
  // One route at every depth (`*parts`), so one useQueries in the paths' order.
  const reals = source.useQueries<string, FolderParams>('real', ps, { enabled: enabled && okAll });
  const mounts = source.useQuery<Mounts, FolderParams>('mounts', paramsOf(c, '/'), { enabled: enabled && !!c });
  const failed = !okAll || reals.some((q) => !q || (q.isError && q.isFetchedAfterMount));
  const real = !failed && reals.every((q) => q?.isFetchedAfterMount && typeof q.data === 'string') ? new Map(paths.map((p, i) => [p, reals[i]!.data as string])) : null;
  const freshMounts = !mounts.isFetchedAfterMount ? undefined : mounts.isError ? null : (mounts.data ?? undefined);
  return { real, failed, mounts: freshMounts, retry: () => { reals.forEach((q) => void q?.refetch()); void mounts.refetch(); } };
}

/** Where each of `paths` resolves on `c`, read fresh while `enabled`, or a failed read with a retry (reads only).
 *  A path that is gone (404) has nothing under it, so it is left out and a caller judges it by its own spelling; '/'
 *  is its own resolution. Any other failure fails the whole read: the path may be a link to a folder only its
 *  resolution would name. That includes a path the Hub cannot address (logic.ts blockedPath): it is never read, and
 *  fails the read at once. undefined until every read answered. */
export type RealPaths = { readonly real: ReadonlyMap<string, string> } | { readonly failed: true; readonly error: unknown; readonly retry: () => void };
export function useRealPaths(c: FilesComputer | undefined, paths: readonly string[], enabled: boolean): RealPaths | undefined {
  const named = paths.filter((p) => partsOf(p).length > 0);
  const readable = named.filter((p) => !blockedPath(p));
  const unaddressable = readable.length < named.length;
  const reals = source.useQueries<string, FolderParams>('real', readable.map((p) => paramsOf(c, p)), { enabled: enabled && !!c && !unaddressable });
  if (!enabled || !c) return undefined;
  if (unaddressable) return { failed: true, error: undefined, retry: () => undefined };
  if (reals.some((q) => !q?.isFetchedAfterMount)) return undefined;
  const gone = (q: (typeof reals)[number]) => q!.isError && obj(q!.error).status === 404;
  const bad = reals.find((q) => !gone(q) && (q!.isError || typeof q!.data !== 'string'));
  if (bad) return { failed: true, error: bad.isError ? bad.error : undefined, retry: () => { reals.forEach((q) => void q?.refetch()); } };
  return { real: new Map(readable.flatMap((p, i) => (gone(reals[i]!) ? [] : [[p, reals[i]!.data as string] as const]))) };
}

// ── Changes: new folder, rename, delete ─────────────────────────────────────────────────────────────
// One lock for every change on a computer (filesLockKey): while one is being sent, in any tab, or may have gone
// through, no other change on that computer is sent (core BUSY / READ_BACK_FIRST / HELD_BY_OTHER). Core admits a
// press under its cross-tab lock, reading the stored sends and holds then, so two tabs pressing at once can never
// both send: the paths two changes touch (a parent, a destination) need no comparing. Its identity is ids and names
// only (shown in held changes, never an address).
export const FILES_LOCK = 'files-path';
export type ChangeKind = 'mkdir' | 'rename' | 'delete' | 'copy' | 'move' | 'extract';
export interface ChangeVars {
  readonly c: FilesComputer;
  readonly path: string;
  /** rename: the new name. extract: the new folder's name, beside the archive. */
  readonly to?: string;
  /** copy, move: the whole destination path, on the same computer. */
  readonly dest?: string;
  /** copy, move, extract: this press's own id (a fresh one per press), so a verdict or a result names this very send. */
  readonly op?: string;
  /** rename, delete: the version the person approved (from the listing they saw). */
  readonly dir?: boolean;
  readonly size?: number | null;
  readonly modified?: number | null;
}
export interface ChangeIdentity { readonly kind: ChangeKind; readonly computer: string; readonly name: string; readonly path: string; readonly to?: string; readonly dest?: string; readonly op?: string; readonly dir?: boolean; readonly size?: number | null; readonly modified?: number | null }

const ROUTES = { mkdir: mkdirRoute, rename: renameRoute, delete: deleteRoute, copy: copyRoute, move: moveRoute, extract: extractRoute } as const;
const transfer = (k: ChangeKind): k is 'copy' | 'move' => k === 'copy' || k === 'move';

/** What the last read-back of a held change proved, and for a copy whether something is at its destination. */
export interface Verdict { readonly verdict: 'applied' | 'not_applied'; readonly there?: boolean }
const verdicts = new Map<string, Verdict>();
// Keyed by the send's own op (one per press), so an earlier attempt's verdict is never shown for a later one.
export const verdictKey = (identity: unknown): string | null => { const id = obj(identity); return typeof id.op === 'string' && id.op ? id.op : null; };
/** The verdict of this tab's read-back that settled this very send (undefined: none here). */
export const verdictOf = (identity: unknown): Verdict | undefined => { const k = verdictKey(identity); return k ? verdicts.get(k) : undefined; };
// A held folder copy found part made: how many items were missing or different when last checked, by op. It stays
// held (the copy may still be running); a later read that proves nothing keeps the last count.
const partials = new Map<string, number>();
const partialSubs = new Set<() => void>();
const subscribePartial = (f: () => void) => { partialSubs.add(f); return () => { partialSubs.delete(f); }; };
/** The last count of a held folder copy found part made (undefined: none seen in this tab). */
export function usePartial(identity: unknown): number | undefined {
  const k = verdictKey(identity);
  return useSyncExternalStore(subscribePartial, () => (k ? partials.get(k) : undefined));
}
const recorded = (judge: typeof copyJudge) => (identity: unknown, answers: readonly (readonly unknown[])[]) => {
  const { verdict: v, missing } = judge(identity, answers);
  const k = verdictKey(identity);
  if (v && k) {
    const id = obj(identity);
    const there = id.kind === 'copy' ? presentAt(identity, String(id.dest ?? ''), answers) : undefined;
    verdicts.set(k, { verdict: v, ...(there !== undefined ? { there } : {}) });
  }
  if (k && !v && missing !== undefined && partials.get(k) !== missing) { partials.set(k, missing); partialSubs.forEach((f) => f()); }
  return v;
};
const PROVES = { mkdir: mkdirProved, rename: renameProved, delete: deleteProved, copy: recorded(copyJudge), move: recorded((id, a) => ({ verdict: moveProved(id, a) })) } as const;
/** Tests only: which cached reads a copy's read-back re-reads, and the hook that holds them. */
export const copyReadsForTest = { copyReads, useHeldReads };
/** Copy the rest: every copy read held open now (folders, trees, SHA-256) re-read now, reads only,
 *  whether or not a change is held (core's readBack() reads nothing while nothing is pending). True when none failed
 *  and one answered. */
export function rereadCopy(): Promise<boolean> { return readBackAll([copyReads]); }
/** A Check again on the held changes one control shows: each shown send judged on its own (core's readBack({ hold }),
 *  query.ts readBackHold), so a press never settles a hold the control does not show; true only when every one was
 *  proved. Nothing shown, or a shown hold with no send token (an older build's), falls back to the whole read-back.
 *  `out.notApplied`: true only when this read proved EVERY shown send not made and stored its release (core's
 *  readBack proof slot, query.ts readBackProof). A false answer alone never says so (a read that proved nothing, a
 *  hold another tab settled, a Dismiss, an account change); a bare read-back never does. */
export async function readBackShown(readBack: (only?: { hold: string; proof?: { notApplied: boolean } }) => Promise<boolean>, holds: readonly (string | undefined)[], out?: { notApplied: boolean }): Promise<boolean> {
  if (out) out.notApplied = false;
  if (!holds.length || holds.some((h) => h === undefined)) return readBack();
  let ok = true, none = true;
  for (const hold of new Set(holds as readonly string[])) {
    const proof = { notApplied: false };
    if (!(await readBack({ hold, proof }))) ok = false;
    if (!proof.notApplied) none = false;
  }
  if (out) out.notApplied = !ok && none;
  return ok;
}
/** Tests only: the copy's proof as core calls it (records its verdict, or a part-made count). */
export const copyProvesForTest = PROVES.copy;

/** The lock key of every Files change: the computer alone (see FILES_LOCK). */
export const filesLockKey = (v: Pick<ChangeVars, 'c'>): { computer: string } => ({ computer: v.c.id });
/** A hold on this computer that core's lock does not refuse: one an earlier build filed under its per-path key. */
const heldOn = (computer: string) => heldChanges(FILES_LOCK).some((h) => obj(h.identity).computer === computer);
const refuse = (code: string) => Promise.reject(Object.assign(new Error(code), { kind: 'not_sent', code }));
export const identityOf = (kind: ChangeKind, v: ChangeVars): ChangeIdentity => ({
  kind, computer: v.c.id, name: v.c.name, path: v.path,
  ...(kind === 'rename' ? { to: v.to ?? '' } : {}),
  ...(transfer(kind) ? { dest: v.dest ?? '', ...(v.op ? { op: v.op } : {}) } : {}),
  ...(kind === 'extract' ? { to: v.to ?? '', dest: joinPath(parentOf(v.path), v.to ?? ''), ...(v.op ? { op: v.op } : {}) } : {}),
  ...(kind !== 'mkdir' && kind !== 'extract' ? { dir: v.dir === true, size: v.size ?? null, modified: v.modified ?? null } : {}),
});

// ── An upload batch's own hold (upload.ts, uploadRun.ts) ───────────────────────────────────────────
export const UPLOAD_BY = 'files:upload';
export const uploadLock = (computer: string) => `files.upload:${computer}`;
/** The upload batches held on a computer: the hold and its meta (null when it does not read back whole: it still
 *  holds the computer, and only its warned Stop tracking frees it). */
export interface HeldUpload { readonly hold: HeldAttempt; readonly meta: UploadMeta | null }
export const uploadsOn = (computer: string): HeldUpload[] => heldAttempts(uploadLock(computer)).map((hold) => ({ hold, meta: uploadMetaOf(hold.meta) }));
export function useUploadsOn(computer: string | undefined): readonly HeldUpload[] {
  useAttemptsVersion();
  return computer ? uploadsOn(computer) : [];
}
/** An upload batch that holds back every other Files change on its computer: one with a send out (any tab), one
 *  whose outcome is unknown, or one that can't be read. A batch that only remembers files it never sent ("pick them
 *  again") holds nothing back. */
export const uploadBlocks = (u: HeldUpload): boolean => !u.meta || !!u.hold.inFlight || u.meta.files.length > 0;
export const blockingUploadsOn = (computer: string): HeldUpload[] => uploadsOn(computer).filter(uploadBlocks);
/** What refuses an upload on `computer` now: changes off for this session (CHANGES_OFF, read live), or a Files
 *  change held or out on it (HELD_OVERLAP). Null: it may go. */
export const uploadGate = (computer: string): string | null =>
  !can('computers.actions.exec') ? 'CHANGES_OFF' : (heldOn(computer) || sendingChanges(FILES_LOCK).some((x) => !x.attributed || (x.identity as { computer?: unknown } | null)?.computer === computer) ? 'HELD_OVERLAP' : null);
/** The PUT for a file at `path` (core sendFile's route, target and params), or null when core cannot address it. */
export function uploadCall(c: FilesComputer, path: string): { route: typeof putRoute; target: ReturnType<typeof target>; params: ReturnType<typeof params> } | null {
  if (partsOf(path).length === 0 || blockedPath(path)) return null;
  const p = paramsOf(c, path);
  return { route: putRoute, target: target(p), params: params(p) };
}

/** Mark every folder listing kept for a computer as old (shown or not), re-reading none now: a later view of one reads
 *  it again whatever its age. */
function staleFolders(computer: string): void {
  const reads = sourceReads('files', FOLDER_KEYS, { computer });
  void queryClient.invalidateQueries({ predicate: (q) => reads(q.queryKey), refetchType: 'none' });
}

/** Re-read the folder listings shown for a computer (an upload has no change lock, so no read-back does it). */
export function refreshFolders(computer: string): void {
  const reads = sourceReads('files', FOLDER_KEYS, { computer });
  void queryClient.invalidateQueries({ predicate: (q) => reads(q.queryKey) });
}

// ── extract ────────────────────────────────────────────────────────────────────
// Only the send's own answer settles an extract. The files program takes no request key, and its running and finished
// lists name no client attempt (and drop a run from the one before the other has it), so no read proves which run
// was this one: a lost or unreadable answer stays held, "may or may not have run", until the person stops tracking
// it (core dismissOne): the program records and echoes no request key.
// The success answers sendExtract read whole, for this archive into this very folder: only these show as done.
const doneAnswers = new WeakSet<object>();
/** A done extract's answer as sendExtract read it, or undefined for anything else. */
export const extractDoneOf = (data: unknown): ExtractDone | undefined => (data && typeof data === 'object' && doneAnswers.has(data) ? (data as ExtractDone) : undefined);
/** What a failed extract's answer said it changed in the folder: a count, 'none' (no lists: a refusal before it ran),
 *  'unknown' (lists that did not read), or undefined for any other result. */
export function extractChangedOf(details: unknown): ExtractChanged | 'unknown' | undefined {
  const x = obj(details).extract;
  if (x === 'none' || x === 'unknown') return x;
  const o = obj(x);
  return typeof o.replaced === 'number' && typeof o.created === 'number' ? { replaced: o.replaced, created: o.created } : undefined;
}
const unread = () => Object.assign(new Error('ANSWER_UNREAD'), { kind: 'pending', pending: true, code: 'ANSWER_UNREAD' });
/** A copy's own send, after useFilesChange's refusals: done only on an answer that names this source and this
 *  destination with a well-formed skipped list (plan.ts copyDoneOf); any other success answer leaves it held
 *  (ANSWER_UNREAD: it may have gone through), for the read-back to judge. */
async function sendCopy(v: ChangeVars, route: typeof copyRoute, p: ReturnType<typeof paramsOf>, ctx: NonNullable<Parameters<typeof api>[1]>['ctx']): Promise<CopyDone> {
  const raw: unknown = await api(route as never, { target: target(p), params: params(p), ctx, query: { copy_to: v.dest } });
  const d = copyDoneOf(raw, v.path, v.dest ?? '');
  if (!d) throw unread();
  return d;
}
/** The extract's own send, after useFilesChange's refusals: the archive's folder read fresh first. The files program
 *  merges into a folder that exists and replaces its files, so the new folder must be absent in a read made
 *  now, never the cached listing: present → DEST_TAKEN; unreadable, or not shown by a listing that is not whole (the
 *  top folder's included) → DEST_UNREAD; nothing sent. A folder made between
 *  this read and the program's start still merges: the answer's replaced[] says so (Extract.tsx words).
 *  The answer is read here, before the attempt settles: done only for a whole answer of the whole archive into this
 *  very folder; any other success answer leaves it held (ANSWER_UNREAD), as a lost one does. A failure keeps what its
 *  answer says it changed in the folder (details.extract). */
async function sendExtract(v: ChangeVars, route: typeof extractRoute, ctx: NonNullable<Parameters<typeof api>[1]>['ctx']): Promise<ExtractDone> {
  const name = v.to ?? '';
  const folder = parentOf(v.path);
  if (!name || blockedPath(joinPath(folder, name))) return refuse('NOT_ADDRESSABLE');
  const now = await freshListing(v.c, folder);
  const at = now === 'failed' ? 'unknown' : nameIn(now, name);
  if (at === 'unknown') return refuse('DEST_UNREAD');
  if (at !== 'absent') return refuse('DEST_TAKEN');
  const p = paramsOf(v.c, v.path);
  let raw: unknown;
  try {
    raw = await api(route as never, { target: target(p), params: params(p), ctx, query: { extract: '', dest: name } });
  } catch (e) {
    if (outcomeOf(e, true) !== 'failed') throw e;
    const changed = parseExtractFailed(obj(e).data);
    throw Object.assign(new Error(e instanceof Error ? e.message : 'FAILED'), e, { details: { extract: changed ?? 'unknown' } });
  }
  const d = doneFor(raw, joinPath(folder, name));
  if (!d) throw unread();
  doneAnswers.add(d);
  return d;
}

// What each extract's own answer said, kept by realm and computer until the person closes it (the dialog's Close, or
// the band's), so leaving Browse, switching computer or closing the dialog's page mid-send never loses a result: the
// send writes it here whether or not anything still shows it. A dialog showing its own result keeps it out of the
// band. Session only; signing out clears it.
export type ExtractWords = { readonly tone: 'ok' | 'warn'; readonly words: string };
interface ExtractResult { readonly op: string; readonly words: ExtractWords }
const extractResults = new Map<string, readonly ExtractResult[]>();
const inDialog = new Set<string>();
const resultSubs = new Set<() => void>();
let resultsVersion = 0;
const resultsChanged = () => { resultsVersion++; resultSubs.forEach((f) => f()); };
const resultsAt = (realm: string, computer: string) => `${realm}\u0000${computer}`;
const clearResults = () => { extractResults.clear(); inDialog.clear(); resultsChanged(); };
onAuthPurge(clearResults);
/** Tests only: a fresh tab's results (none). */
export const clearExtractResultsForTest = clearResults;
/** Keep an extract's result: `op` is its press's own id. */
export function keepExtractResult(realm: string, computer: string, op: string, words: ExtractWords): void {
  const k = resultsAt(realm, computer);
  extractResults.set(k, [...(extractResults.get(k) ?? []).filter((r) => r.op !== op), { op, words }]);
  resultsChanged();
}
/** The person closed this result: it goes. */
export function dropExtractResult(realm: string, computer: string, op: string): void {
  const k = resultsAt(realm, computer);
  const left = (extractResults.get(k) ?? []).filter((r) => r.op !== op);
  if (left.length) extractResults.set(k, left); else extractResults.delete(k);
  resultsChanged();
}
/** While a dialog shows its own result, the band leaves it out; shown again in the band once the dialog is gone. */
export function showingInDialog(op: string, on: boolean): void {
  if (on === inDialog.has(op)) return;
  if (on) inDialog.add(op); else inDialog.delete(op);
  resultsChanged();
}
const subscribeResults = (f: () => void) => { resultSubs.add(f); return () => { resultSubs.delete(f); }; };
/** The kept results on one computer, oldest first; `band`: only those no dialog shows. */
export function useExtractResults(realm: string, computer: string, band: boolean): readonly ExtractResult[] {
  const v = useSyncExternalStore(subscribeResults, () => resultsVersion);
  return useMemo(() => (extractResults.get(resultsAt(realm, computer)) ?? []).filter((r) => !band || !inDialog.has(r.op)), [realm, computer, band, v]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Whether extract is on for a computer's files program: its history read answers (true), 403s (false: off there),
 *  or has not answered yet (undefined: the dialog says it is checking and sends nothing). */
export function useExtractAllowed(c: FilesComputer | undefined, enabled: boolean): boolean | undefined {
  const ok = !!c && !!c.project_id && !!c.server_name;
  const q = source.useQuery<{ computer: unknown }, FolderParams>('xhist', paramsOf(c, '/'), { enabled: enabled && ok });
  if (q.data && !q.isError) return true;
  if (q.isError) return obj(q.error).status === 403 ? false : true;  // another failure proves nothing: the program still refuses a send where extract is off (403, nothing written)
  return undefined;
}
/** An archive's listing (Look inside), read while `enabled`. */
export function useArchiveList(c: FilesComputer | undefined, path: string, enabled: boolean) {
  const n = partsOf(path).length;
  const ok = !!c && n > 0 && !blockedPath(path) && !!c.project_id && !!c.server_name;
  return source.useQuery<ArchiveList, FolderParams>('arch', paramsOf(c, path), { enabled: enabled && ok });
}
/** One change kind, through core's C9 lock: never sent twice; a lost answer is read back from the parent folder. */
export function useFilesChange(kind: ChangeKind) {
  return useLockedChange<ChangeVars, unknown>(
    (v, _idem, ctx) => {
      // One route at every depth (`*parts`); a change is never at the top folder.
      const route = partsOf(v.path).length > 0 ? ROUTES[kind] : null;
      // Checked again at send: the session's capabilities may have changed since the button showed.
      if (!can('computers.actions.exec')) return refuse('CHANGES_OFF');
      // An upload batch sending a file on this computer, or holding files that may have gone through, holds every
      // Files change there (read after core stored this change's own hold).
      if (blockingUploadsOn(v.c.id).length) return refuse('HELD_OVERLAP');
      if (!route || blockedPath(v.path)) return refuse('NOT_ADDRESSABLE');
      // A rename's new name rides the body, not the path parts, so only the length bound applies to it ('%' or an
      // alias name stays fine there): a new path over MAX_PATH_BYTES can never be named on the computer.
      if (kind === 'rename' && blockedPath(joinPath(parentOf(v.path), v.to ?? '')) === 'long') return refuse('NOT_ADDRESSABLE');
      // A copy or move goes to a whole path on the same computer, never to the item itself or inside it.
      if (transfer(kind) && !transferDestOk(v.path, v.dest)) return refuse('NOT_ADDRESSABLE');
      // Core's lock refused every change on this computer that is out or held under this build's key; a hold filed
      // by an earlier build (per path) is not under it, and holds this send back too.
      if (heldOn(v.c.id)) return refuse('HELD_OVERLAP');
      // Once a change is answered done, every folder listing kept for this computer is old news, the ones no pane
      // shows too (a folder a copy landed in, read by its dialog a moment ago): marked, never re-read here, so the
      // next view of one reads it again. The listings shown are re-read by the change's own read-back, as before. A
      // send that did not end done (refused, or an answer lost) marks nothing: its reads stay the read-back's alone.
      const sent = <T,>(run: Promise<T>): Promise<T> => run.then((r) => { staleFolders(v.c.id); return r; });
      if (kind === 'extract') return sent(sendExtract(v, route as typeof extractRoute, ctx));
      const p = paramsOf(v.c, v.path);
      if (kind === 'copy') return sent(sendCopy(v, route as typeof copyRoute, p, ctx));
      const query = kind === 'mkdir' ? { mkdir: '' } : kind === 'move' ? { move_to: v.dest } : null;
      return sent(api(route as never, { target: target(p), params: params(p), ctx, ...(query ? { query } : {}), ...(kind === 'rename' ? { body: { name: v.to } as never } : {}) }));
    },
    // A copy's read-back also re-reads the SHA-256 reads and the folder trees held open for it now (copyReads); no
    // other change waits on them.
    [kind === 'copy' ? copyReads : sourceReads('files', FOLDER_KEYS)],
    `files.${kind}`,
    { lock: FILES_LOCK, lockKey: filesLockKey, identity: (v) => identityOf(kind, v), ...(kind === 'extract' ? {} : { proves: PROVES[kind] }), page: 'files' },
  );
}

/** A destination a copy or move may be sent to (plan.ts transferDestOk). */
export { transferDestOk };

/** A folder's entries read now, straight from the files program (Check again for an upload, an extract's free name and
 *  a link download decide on these), and whether the listing is whole: the program's `skipped` list present and empty
 *  (logic.ts folderOf). What it shows proves presence; only a whole one proves a name absent (nameIn). The top folder,
 *  read through GET /?json, drops an entry it cannot read without a word, so it is never whole.
 *  'failed': no readable listing (an older program has no skipped list). */
export async function freshListing(c: FilesComputer, path: string): Promise<FreshFolder | 'failed'> {
  const n = partsOf(path).length;
  const p = paramsOf(c, path);
  try {
    if (n === 0) { const f = rootListingOf(await api(rootRoute as never, { target: target(p), query: { json: '' } })); return f ? { entries: f.entries, whole: false } : 'failed'; }
    if (blockedPath(path)) return 'failed';
    const f = folderOf(await api(folderRoute as never, { target: target(p), params: params(p) }));
    return f ? { entries: f.entries, whole: f.whole } : 'failed';
  } catch { return 'failed'; }
}
/** A file's SHA-256 read now, or 'failed'. */
export async function freshHash(c: FilesComputer, path: string): Promise<string | 'failed'> {
  if (partsOf(path).length === 0 || blockedPath(path)) return 'failed';
  const p = paramsOf(c, path);
  try {
    const h = obj(await api(hashRoute as never, { target: target(p), params: params(p), query: { hash: '' } })).hash;
    return typeof h === 'string' && /^[0-9a-f]{64}$/.test(h) ? h : 'failed';
  } catch { return 'failed'; }
}

/** Changes on this computer that may have gone through (any mount, any kind), newest first. */
export function useHeldOn(computerId: string | undefined): readonly (HeldChange & { identity: ChangeIdentity })[] {
  useChangesVersion();
  if (!computerId) return [];
  return heldChanges(FILES_LOCK)
    .filter((h): h is HeldChange & { identity: ChangeIdentity } => obj(h.identity).computer === computerId && typeof obj(h.identity).kind === 'string')
    .sort((a, b) => b.at - a.at);
}

/** Changes need an account session or a token with computers.actions.exec; read live. */
export const useCanChange = (): boolean => useCan('computers.actions.exec');

/** The parent folder of a change, to say where it was. */
export const whereOf = (id: ChangeIdentity) => parentOf(id.path);

// ── A folder copy's tree walk and tree compare, read through core (tree.ts judges) ────────────────
// Reads grow as the walk finds folders: one useQueries over every path (one `*parts` route at every depth). Only an answer fetched since this mount counts (isFetchedAfterMount), a failure too: a cached tree
// from an earlier opening never arms a copy or proves one.
type TreeAnswer = { readonly computer: string; readonly path: string; readonly tree: Manifest };
function useByPath<T>(prefix: 'tree' | 'hash', c: FilesComputer | undefined, paths: readonly string[], enabled: boolean): (path: string) => Got<T> {
  const ps = paths.map((path) => paramsOf(c, path));
  const ok = !!c && !!c.project_id && !!c.server_name;
  const readable = ps.filter((p) => partsOf(p.path).length > 0 && !blockedPath(p.path));
  const qs = source.useQueries<T, FolderParams>(prefix, readable, { enabled: enabled && ok });
  useHeldReads(prefix, c, paths, enabled && ok);
  return (path) => {
    const i = readable.findIndex((p) => p.path === path);
    const q = i < 0 ? undefined : qs[i];
    if (!q || !q.isFetchedAfterMount) return undefined;
    return q.isError ? 'failed' : (q.data ?? undefined);
  };
}
const treeAt = (get: (path: string) => Got<TreeAnswer>) => (path: string): Got<Manifest> => {
  const a = get(path);
  return a === undefined || a === 'failed' ? a : a.tree;
};
/** Paths asked for so far, starting again whenever `key` (computer and ends) changes, a return to an earlier key
 *  included (A, then B, then A starts A again from `first`: its old list is never restored at once). `more` carries the
 *  key it was worked out for: paths still pending from another generation are never added to this one. */
function useGrowing(key: string, first: readonly string[], more: { readonly key: string; readonly paths: readonly string[] }): readonly string[] {
  const [asked, setAsked] = useState<{ key: string; paths: readonly string[] }>({ key, paths: first });
  if (asked.key !== key) setAsked({ key, paths: first });
  const paths = asked.key === key ? asked.paths : first;
  const add = more.key === key ? more.paths.filter((p) => !paths.includes(p)) : [];
  const sig = add.join('\n');
  useEffect(() => { if (sig) setAsked({ key, paths: [...paths, ...sig.split('\n')] }); }, [key, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return paths;
}

/** The tree of a folder being copied from `src` to `dest`, read fresh while `enabled` (tree.ts walkTree). */
export function useTreeWalk(c: FilesComputer | undefined, src: string, dest: string, enabled: boolean): Walk {
  // JSON, not a separator: a path may hold any character ('|' too), so distinct ends always give distinct keys.
  const key = JSON.stringify([c?.id ?? '', src, dest, enabled]);
  const [next, setNext] = useState<{ key: string; paths: readonly string[] }>({ key, paths: [] });
  const paths = useGrowing(key, [src], next);
  const at = treeAt(useByPath<TreeAnswer>('tree', c, paths, enabled));
  const walk = walkTree(src, dest, at);
  const need = walk.state === 'reading' ? walk.need.join('\n') : '';
  useEffect(() => { setNext({ key, paths: need ? need.split('\n') : [] }); }, [key, need]);
  return walk;
}

/** The SHA-256 reads a held folder copy's check keeps open at once: each makes the files program hash a
 *  whole file, and a check can ask for two per file of up to WALK_MAX_ENTRIES files. */
export const HASH_BATCH = 8;
/** How long one of those reads may stay unanswered before it counts as unknown (the READ_MS pattern of a page
 *  timer): its slot goes to the next path, so reads that never answer cannot hold back the rest (a later failure still
 *  shows), and the compare ends unchecked, never equal. The request itself is not cut (its route keeps its own
 *  timeout), and an answer that comes later still counts. */
export const HASH_READ_MS = 60_000;
/** The most SHA-256 reads a check keeps out at once, unknown ones included (a read past HASH_READ_MS is still out:
 *  its request is not cut). Once that many are unknown and unanswered, nothing more is asked and the compare is
 *  unchecked; an answer that comes later frees its place. */
export const HASH_CAP = 2 * HASH_BATCH;
const NONE: ReadonlySet<string> = new Set();

/** The paths among `waiting` (asked, no answer yet) that have waited HASH_READ_MS without a break. Each new `key` is a
 *  new check generation (A, then B, then A again is three): its late paths and timers start empty. A path's timer runs
 *  only while it waits: an answer clears it and drops the path from late, and a path that waits again (its answer
 *  gone, as in a refetch) gets a fresh timer. */
function useLate(key: string, waiting: readonly string[]): ReadonlySet<string> {
  const [gen, setGen] = useState({ key, n: 0 });
  if (gen.key !== key) setGen({ key, n: gen.n + 1 });
  const n = gen.key === key ? gen.n : gen.n + 1;
  const [late, setLate] = useState<{ n: number; paths: ReadonlySet<string> }>({ n, paths: NONE });
  const timers = useRef<{ n: number; byPath: Map<string, ReturnType<typeof setTimeout>> }>({ n, byPath: new Map() });
  const sig = waiting.join('\n');
  useEffect(() => {
    const t = timers.current;
    if (t.n !== n) { for (const id of t.byPath.values()) clearTimeout(id); t.byPath.clear(); t.n = n; }
    const now = new Set(sig ? sig.split('\n') : []);
    const answered: string[] = [];
    for (const [p, id] of t.byPath) if (!now.has(p)) { clearTimeout(id); t.byPath.delete(p); answered.push(p); }
    if (answered.length) setLate((l) => (l.n === n && answered.some((p) => l.paths.has(p)) ? { n, paths: new Set([...l.paths].filter((p) => !answered.includes(p))) } : l));
    for (const p of now) {
      if (t.byPath.has(p)) continue;
      t.byPath.set(p, setTimeout(() => { setLate((l) => ({ n, paths: new Set([...(l.n === n ? l.paths : []), p]) })); }, HASH_READ_MS));
    }
  }, [n, sig]);
  useEffect(() => () => { const t = timers.current; for (const id of t.byPath.values()) clearTimeout(id); t.byPath.clear(); }, []);
  return late.n === n ? late.paths : NONE;
}

/** A held folder copy's check: the source walked, then the destination's folders and SHA-256 reads that compare
 *  both trees (tree.ts compareTrees), all held open while `enabled`, so core's read-back re-reads each one. Enable it
 *  only while both ends list as folders: a read of a folder that is not there would fail every read-back. */
export function useCopyCheck(c: FilesComputer | undefined, src: string, dest: string, enabled: boolean): { readonly walk: Walk; readonly compare: Compare | null } {
  const walk = useTreeWalk(c, src, dest, enabled);
  const done = enabled && walk.state === 'done';
  const key = JSON.stringify([c?.id ?? '', src, dest, done]);
  const [want, setWant] = useState<{ key: string; folders: readonly string[]; hashes: readonly string[] }>({ key, folders: [], hashes: [] });
  const folders = useGrowing(key + '|f', [dest], { key: want.key + '|f', paths: want.folders });
  const hashes = useGrowing(key + '|h', [], { key: want.key + '|h', paths: want.hashes });
  const at = treeAt(useByPath<TreeAnswer>('tree', c, folders, done));
  const hashOf = useByPath<FileHash>('hash', c, hashes, done);
  const late = useLate(key, done ? hashes.filter((p) => hashOf(p) === undefined) : []);
  // Reads still out past HASH_READ_MS: they keep their place under HASH_CAP until they answer.
  const stalled = done ? hashes.filter((p) => late.has(p) && hashOf(p) === undefined).length : 0;
  const full = stalled >= HASH_CAP;
  // An answer always wins; a read past HASH_READ_MS is unknown, and so is every read not answered while the cap is full
  // of those (tree.ts compareTrees: unchecked, never equal; a failed read still wins).
  const hashAt = (p: string) => { const h = hashOf(p); return h !== undefined ? (h === 'failed' ? h : h.hash) : late.has(p) || full ? 'unknown' as const : undefined; };
  const compare = walk.state === 'done' && done ? compareTrees(src, dest, walk, at, hashAt) : null;
  const wantF = compare?.state === 'reading' ? compare.folders.join('\n') : '';
  // Asked in order, at most HASH_BATCH waiting for an answer and at most HASH_CAP out with the unknown ones: the first
  // paths with no answer that are not unknown (those already out come first, as asking goes in order), then new ones.
  // An asked path stays asked (useGrowing), so the reads, their order and the verdict are the same as asking for all,
  // except that a read past HASH_READ_MS leaves the compare unchecked instead of reading.
  const room = Math.max(0, Math.min(HASH_BATCH, HASH_CAP - stalled));
  const wantH = compare?.state === 'reading' ? compare.hashes.filter((p) => hashAt(p) === undefined).slice(0, room).join('\n') : '';
  useEffect(() => { setWant({ key, folders: wantF ? wantF.split('\n') : [], hashes: wantH ? wantH.split('\n') : [] }); }, [key, wantF, wantH]);
  return { walk, compare };
}
