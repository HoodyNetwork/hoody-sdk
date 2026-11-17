// The scripts page's data: its queries and mutations, declared in one place.
// Live: each key goes through core (coreSource) over the routes in routes.ts, for the computer the shell has
// selected. Under the fixture transport (hub:dev, hub:shots, tests) the same keys answer from fixtures.ts.
// The pure rules are in logic.ts.
import { EXEC_DEFAULT, aliasLock, api, buildPortUrl, capture, computerHandle, coreSource, execOfParam, execRoot, heldChanges, mergeStoredChanges, useChangesVersion, useLockedChange, containersRoute, fixtureModeActive, refreshFresh, run as kitRun, versionRoute, sourceReads, useCore, useCurrentComputer, useRealms, stringOrEmpty as str, type HeldRow, type Target, pageFixtures } from '@core';

type ReadVerdict = 'applied' | 'not_applied' | undefined;
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useSearchParam } from '@kit';
import { agentRealmFor, aliasesOf, caps, execOf, extract, instanceOf, parseItemId, settleView, toItems, type SettleView } from './logic';
import { readDraftRecord } from './new/records';
import { routes as R } from './routes';
import { advance, agentCapsOf, asksVersion, attemptOf, attemptPath, cancelRun, cancelTurn, claimAnswer, closeAsk, joinedOf, markJoined, openRun, placeFits, projectOk, replyOf, restoreRun, resume, runOf, receiptOf, startRun, userPromptOf, storedAsk, subscribeAsks, valuesOf, type AiAnswer, type AiVars, type Place, type Receipt, type WriterRun } from './writer';
import type { CommentsDry, CommentsRead, CompScripts, CompState, DeletedEntry, EnvKeys, Failure, Instance, ResolveAnswer, ScriptFile, ScriptItem, ScriptRow, ScriptsOverview, Summary, TestsDoc, Usage, Validation, Version, WriteResult } from './types';
/** Core's read-back of one held send: readBackNow({ hold }) (core/source.ts) reads back only the change holding that token; the
 *  hook's published type names only the bare form, and core/storage/runner.ts calls it the same way. */
type ReadBackOne = (only: { hold: string }) => Promise<boolean>;

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const arr = (x: unknown, ...keys: string[]): unknown[] => {
  if (Array.isArray(x)) return x;
  const o = rec(x);
  for (const k of keys) if (Array.isArray(o[k])) return o[k] as unknown[];
  return [];
};
/** The kit's path of a script: root-relative (`default/<exec>/api/weather.ts`). */
const pathOfId = (id: string | undefined, exec: number): string | null => {
  const p = parseItemId(id, exec);
  return p ? p.rootRel : null;
};
/** A path's Exec folder as the kit call's index; a path in no folder names none, and the route refuses it. */
const at = (path: string): { index?: number } => { const n = execOf(path); return n === null ? {} : { index: n }; };

/**
 * The Exec folder the page shows (`?exec=`, 1..9999; absent = 1), read by the page (view.tsx) from its address. A value the Hub
 * cannot address shows folder 1, and `bad` keeps what was asked so the page can say so. Nothing is sent when it changes: every read
 * and change names its own folder.
 */
export function useExec(): { exec: number; bad: string | null } {
  const [raw] = useSearchParam('exec');
  const n = raw === undefined ? EXEC_DEFAULT : execOfParam(raw);
  return { exec: n ?? EXEC_DEFAULT, bad: raw !== undefined && n === null ? raw.slice(0, 64) : null };
}
/** The folder the page passes down to its parts (the per-script reads and New script); folder 1 outside the page. */
const ExecFolder = createContext<number>(EXEC_DEFAULT);
export const ExecFolderProvider = ExecFolder.Provider;
export const useFolder = (): number => useContext(ExecFolder);
type InFolder = { exec: number };
type Listed = { exec: number; rows: ScriptRow[] };
const listedRows = (x: unknown, exec?: number): ScriptRow[] | null => {
  const l = x as Partial<Listed> | null | undefined;
  return l && typeof l.exec === 'number' && Array.isArray(l.rows) && (exec === undefined || l.exec === exec) ? l.rows : null;
};
const one = <T,>(id: string | undefined, v: T) => (id ? { [id]: v } : {});

const reads = {
  containers: { route: containersRoute, input: () => ({ query: { page: 1, limit: 100 } }), staleTime: 15_000 },
  // A folder read without params is core's off-page read-back (source.ts offPage): it reads folder 1, and says so.
  health: { route: R.health, input: (p?: InFolder) => ({ index: p?.exec ?? EXEC_DEFAULT }) },
  // The folder read and its rows with root-relative paths (a change's read-back compares them with its own path,
  // only when the folder is the change's own).
  list: { route: R.list, input: (p?: InFolder) => ({ query: { recursive: true, metadata: true, include_comments: true }, index: p?.exec ?? EXEC_DEFAULT }), select: (raw: unknown, p?: InFolder): Listed => { const exec = p?.exec ?? EXEC_DEFAULT; return { exec, rows: rowsOf(raw, exec) }; } },
  summary: { route: R.summary, input: (p?: InFolder) => ({ index: p?.exec ?? EXEC_DEFAULT }) },
  instances: { route: R.instances, input: (p: { compId: string; realm?: string }) => ({ query: { computer_id: p.compId }, ...(p.realm ? { realm: p.realm } : {}) }) },
  // What the agent lists and whose it is: these two replace the old per-refresh read of the template list.
  version: { route: versionRoute },
  authStatus: { route: R.authStatus },
  aliases: { route: R.aliases, input: (p: { compId: string }) => ({ query: { computer_id: p.compId } }) },
  deleted: { route: R.deleted, input: (p?: InFolder) => ({ index: p?.exec ?? EXEC_DEFAULT }) },
  // The folder's `.exclusive` marker (hoody-exec serves only that folder's own scripts while it exists): read, never written here.
  exclusive: { route: R.read, input: (p: InFolder) => ({ query: { path: `${execRoot(p.exec)}.exclusive` }, index: p.exec }), select: () => true },
  files: {
    route: R.read,
    input: (p: { id: string; path: string }) => ({ query: { path: p.path }, ...at(p.path) }),
    select: (raw: unknown, p: { id: string }) => one<ScriptFile>(p.id, { revision: str(rec(raw).revision) || null, content: str(rec(raw).content), magicComments: rec(raw).magicComments as ScriptFile['magicComments'] }),
  },
  // The field list comes from the computer, never from this page: a new directive on the kit shows up here without a release.
  commentsSchema: { route: R.commentsSchema, input: (p: InFolder) => ({ index: p.exec }), staleTime: 5 * 60_000 },
  commentsRead: {
    route: R.commentsRead,
    input: (p: { id: string; path: string }) => ({ query: { path: p.path }, ...at(p.path) }),
    select: (raw: unknown, p: { id: string }) => one<CommentsRead>(p.id, { revision: str(rec(raw).revision) || null, comments: rec(rec(raw).comments), warnings: arr(rec(raw).warnings) as CommentsRead['warnings'] }),
  },
  usage: { route: R.usage, input: (p: { id: string; path: string }) => ({ query: { scriptPath: p.path }, ...at(p.path) }), select: (raw: unknown, p: { id: string }) => one(p.id, raw as Usage) },
  failures: {
    route: R.executions,
    input: (p: { id: string; path: string }) => ({ query: { scriptPath: p.path, status: 'failed', limit: 5 }, ...at(p.path) }),
    select: (raw: unknown, p: { id: string }) => one<Failure[]>(p.id, arr(raw, 'executions', 'items') as Failure[]),
  },
  versions: {
    route: R.history,
    input: (p: { id: string; path: string }) => ({ query: { path: p.path, limit: 30 }, ...at(p.path) }),
    select: (raw: unknown, p: { id: string }) => one<Version[]>(p.id, arr(rec(raw).versions) as Version[]),
  },
  env: { route: R.envKeys, input: (p: { id: string; path: string }) => ({ query: { scriptPath: p.path }, ...at(p.path) }), select: (raw: unknown, p: { id: string }) => one(p.id, raw as EnvKeys) },
  tests: { route: R.tests, input: (p: { id: string; path: string }) => ({ query: { scriptPath: p.path }, ...at(p.path) }), select: (raw: unknown, p: { id: string }) => one(p.id, raw as TestsDoc) },
  // One kept version of a script, read to show what a restore would bring back (never sent anywhere else).
  versionRead: {
    route: R.historyRead,
    input: (p: { id: string; path: string; version: string | number }) => ({ query: { path: p.path, version: p.version }, ...at(p.path) }),
    select: (raw: unknown, p: { id: string }) => one<ScriptFile>(p.id, { revision: str(rec(raw).revision) || null, content: str(rec(raw).content), magicComments: rec(raw).magicComments as ScriptFile['magicComments'] }),
  },
} as const;

// What a fresh read can prove about a change. A read that shows neither answers undefined: the change stays held until the
// person's warned Dismiss. Writes (write, restore, comments, env, saved tests) have no such read: only the kit's settle by opId
// (the Code tab's Check; for a held script save, also the Scripts page's Check, useHeldWrites) or a Dismiss frees them.
// The three alias changes share one lock, so a proof reads only the identity shape of its own change: a pending create
// must never read as a remove that happened.
const isCreateId = (id: unknown): id is { compId: string; target: string; name?: string; exec?: number } => !!id && typeof id === 'object' && typeof (id as Record<string, unknown>).compId === 'string' && typeof (id as Record<string, unknown>).target === 'string';
const isStateId = (id: unknown): id is { alias: string; enabled: boolean } => !!id && typeof id === 'object' && typeof (id as Record<string, unknown>).alias === 'string' && typeof (id as Record<string, unknown>).enabled === 'boolean';
const isRemoveId = (id: unknown): id is { alias: string } => !!id && typeof id === 'object' && typeof (id as Record<string, unknown>).alias === 'string' && !('enabled' in (id as object));
const NOTHING_CHANGED = (): ReadVerdict => 'not_applied';
// A New script send's condition (useBoundSends): core's api() asks it as the request goes out (`still`). Absent for every other caller.
const stillOf = (v: { still?: () => boolean }): { still?: () => boolean } => (typeof v.still === 'function' ? { still: v.still } : {});
const folderOfRel = (p: string): number => execOf(p) ?? EXEC_DEFAULT;
const underRoot = (p: string): string => (execOf(p) !== null ? p : execRoot(EXEC_DEFAULT) + p.replace(/^\/+/, ''));
const aliasRows = (answers: readonly (readonly unknown[])[]): Array<{ id?: string; target_path?: string; enabled?: boolean; computer_id?: string; alias?: string; index?: number }> => (answers[0] ?? []).flatMap((a) => aliasesOf(a) as Array<{ id?: string; target_path?: string; enabled?: boolean; computer_id?: string; alias?: string; index?: number }>);
// Only list answers of the change's own folder count: another folder's list (an off-page read-back reads folder 1) proves nothing.
const listPaths = (answers: readonly (readonly unknown[])[], exec: number): string[] | null => {
  const ls = (answers[0] ?? []).map((a) => listedRows(a, exec)).filter((x): x is ScriptRow[] => x !== null);
  return ls.length > 0 ? ls.flatMap((rows) => rows.map((x) => x.path)) : null;
};
const inList = (id: unknown, answers: readonly (readonly unknown[])[]): boolean => { const p = underRoot((id as { path: string }).path); const ps = listPaths(answers, folderOfRel(p)); return !!ps && ps.includes(p); };
const goneFromList = (id: unknown, answers: readonly (readonly unknown[])[]): ReadVerdict => { const p = underRoot((id as { path: string }).path); const ps = listPaths(answers, folderOfRel(p)); return ps && !ps.includes(p) ? 'applied' : undefined; };

const changes = {
  // validate, resolve and settle send nothing that changes the script; a lost answer must not jam them, so each has a recovery read.
  validate: { route: R.validate, input: (v: { code: string; exec: number; target?: Target; still?: () => boolean }) => ({ body: { code: v.code, language: 'typescript' }, index: v.exec, ...(v.target ? { target: v.target } : {}), ...stillOf(v) }), lockKey: () => 'validate', reads: ['health'], proves: NOTHING_CHANGED },
  resolve: { route: R.resolve, input: (v: { path: string; omit?: string; exec: number; target?: Target; still?: () => boolean }) => ({ body: { path: v.path, omit: v.omit }, index: v.exec, ...(v.target ? { target: v.target } : {}), ...stillOf(v) }), reads: ['health'], proves: NOTHING_CHANGED },
  write: { route: R.write, input: (v: { path: string; content: string; ifRevision: string | null; opId: string; expectRoute?: unknown; target?: Target; still?: () => boolean }) => ({ body: { path: v.path, content: v.content, ifRevision: v.ifRevision, opId: v.opId, expectRoute: v.expectRoute }, ...at(v.path), ...(v.target ? { target: v.target } : {}), ...stillOf(v) }), lockKey: (v: { path: string }) => ({ path: v.path }),
    // The held write names its op id beside its path (shown, never hashed: the lock stays {path}), so a New script deploy's
    // Check frees only its own send (deploy.ts confirmDeployed, BoundSends.heldOf).
    identity: (v: { path: string; opId: string }) => ({ path: v.path, opId: v.opId }), reads: ['files', 'list', 'versions'] },
  restore: { route: R.restore, input: (v: { path: string; version: string | number; ifRevision: string | null; opId: string }) => ({ body: { path: v.path, version: v.version, ifRevision: v.ifRevision, opId: v.opId }, ...at(v.path) }), lockKey: (v: { path: string }) => ({ path: v.path }),
    // Like write: the held restore names its op id beside its path (shown, never hashed), so Check again after a remount asks that op.
    identity: (v: { path: string; opId: string }) => ({ path: v.path, opId: v.opId }), reads: ['files', 'list', 'versions', 'deleted'] },
  comments: { route: R.comments, input: (v: { path: string; ifRevision: string; opId: string; comments: Record<string, unknown> }) => ({ body: { path: v.path, ifRevision: v.ifRevision, opId: v.opId, comments: v.comments }, ...at(v.path) }), lockKey: (v: { path: string }) => ({ path: v.path }), reads: ['files', 'list', 'commentsRead'] },
  // A dry run writes nothing, so a lost answer must not jam it: a health read frees it (the person can always run it again).
  commentsCheck: { route: R.commentsDry, input: (v: { path: string; ifRevision: string | null; comments: Record<string, unknown> }) => ({ body: { path: v.path, ifRevision: v.ifRevision ?? undefined, comments: v.comments, dry_run: true }, ...at(v.path) }), lockKey: (v: { path: string }) => ({ path: v.path }), reads: ['health'], proves: NOTHING_CHANGED },
  // parse and print over code the page holds change nothing anywhere: a lost answer is freed by a health read, like validate.
  commentsParse: { route: R.commentsParse, input: (v: { text: string; exec: number }) => ({ body: { text: v.text }, index: v.exec }), lockKey: () => 'commentsParse', reads: ['health'], proves: NOTHING_CHANGED },
  commentsPrint: { route: R.commentsPrint, input: (v: { text: string; set: Record<string, unknown>; exec: number }) => ({ body: { text: v.text, set: v.set }, index: v.exec }), lockKey: () => 'commentsPrint', reads: ['health'], proves: NOTHING_CHANGED },
  remove: { route: R.remove, input: (v: { path: string; ifRevision: string; opId: string; keepCopy: boolean; target?: Target }) => ({ query: { path: v.path, confirm: true, ifRevision: v.ifRevision, opId: v.opId, keepCopy: v.keepCopy }, ...at(v.path), ...(v.target ? { target: v.target } : {}) }), lockKey: (v: { path: string }) => ({ path: v.path }), reads: ['list', 'deleted'], proves: goneFromList },
  instantiate: {
    route: R.instantiate,
    // `idem`: a New script deploy names its request's Idempotency-Key itself (stored in the draft record before the send);
    // absent, core mints one (and replays it for a held change).
    input: (v: { compId: string; realm?: string; name: string; path: string; vars: Record<string, string>; callerKey?: string; target?: Target; still?: () => boolean; idem?: string }) => ({ params: { name: v.name }, body: { computer_id: v.compId, script_path: v.path, vars: v.vars, caller_key: v.callerKey }, ...(v.realm ? { realm: v.realm } : {}), ...(v.target ? { target: v.target } : {}), ...stillOf(v), ...(typeof v.idem === 'string' && v.idem ? { idem: v.idem } : {}) }),
    lockKey: (v: { compId: string; path: string }) => ({ compId: v.compId, path: v.path }),
    // A deploy's named Idempotency-Key rides the shown identity (never the lock's hash), so its Check frees only its own send.
    identity: (v: { compId: string; path: string; idem?: string }) => ({ compId: v.compId, path: v.path, ...(typeof v.idem === 'string' && v.idem ? { idem: v.idem } : {}) }),
    reads: ['list', 'instances'],
    proves: (id: unknown, answers: readonly (readonly unknown[])[]): ReadVerdict => (inList(id, answers) ? 'applied' : undefined),
  },
  // The guarded delete of a script the agent manages (idea-made): never the kit's plain delete.
  removeManaged: {
    route: R.instanceDelete,
    input: (v: { compId: string; realm?: string; path: string; ifRevision: string; opId: string; keepCopy: boolean; target?: Target }) => ({ body: { computer_id: v.compId, path: v.path, if_revision: v.ifRevision, op_id: v.opId, keep_copy: v.keepCopy }, ...(v.realm ? { realm: v.realm } : {}), ...(v.target ? { target: v.target } : {}) }),
    lockKey: (v: { path: string }) => ({ path: v.path }), reads: ['list', 'deleted', 'instances'], proves: goneFromList,
  },
  envUpdate: { route: R.envUpdate, input: (v: { path: string; scope: string; set?: Record<string, string>; unset?: string[]; ifRevision: string | null; opId: string }) => ({ body: { scriptPath: v.path, scope: v.scope, set: v.set, unset: v.unset, ifRevision: v.ifRevision, opId: v.opId }, ...at(v.path) }), lockKey: (v: { path: string; scope: string }) => ({ path: v.path, scope: v.scope }), reads: ['env'] },
  // A script's saved tests go when the script is proven gone, or when the last case is removed; one lock per script like testsPut.
  testsDelete: { route: R.testsDelete, input: (v: { compId: string; path: string; ifRevision: string; opId: string; target?: Target }) => ({ query: { scriptPath: v.path, ifRevision: v.ifRevision, opId: v.opId }, ...at(v.path), ...(v.target ? { target: v.target } : {}) }), lockKey: (v: { path: string }) => ({ path: v.path }), reads: ['tests'] },
  testsPut: { route: R.testsPut, input: (v: { path: string; ifRevision: string | null; opId: string; cases: unknown[] }) => ({ body: { scriptPath: v.path, cases: v.cases, ifRevision: v.ifRevision, opId: v.opId }, ...at(v.path) }), lockKey: (v: { path: string }) => ({ path: v.path }), reads: ['tests'] },
  // One lock with Schedules' run: a run pending there holds this one (no blind second press). A run has nothing to read
  // back: no read frees the lock (a health read proves nothing about a run). Only the person's warned Dismiss does (settle); its runs are where to look (runsHref).
  // `target` binds the run to the computer it was pressed for: a Try again after a computer switch still runs there.
  trigger: { route: R.trigger, input: (v: { path: string; target?: Target }) => ({ body: { scriptPath: v.path }, ...at(v.path), ...(v.target ? { target: v.target } : {}) }), lock: 'exec.script.run', lockKey: (v: { path: string }) => ({ path: v.path }) },
  aliasCreate: { route: R.aliasCreate, lock: aliasLock.lock, input: (v: { compId: string; target: string; alias?: string; exec: number }) => ({ body: { computer_id: v.compId, program: 'exec', index: v.exec, target_path: v.target, allow_path_override: false, ...(v.alias ? { alias: v.alias } : {}) } }),
    // The lock is the computer and the script's address, never the name: a second name cannot be sent while the first is out (or may have gone
    // through), in this mount, another mount or another tab. The name is what the held change shows and the proof reads, as `name` (never
    // `alias`: that key is an alias id's, read by the state and remove proofs and the held-elsewhere check). A folder other than 1 is part of
    // the lock and the proof (`exec`); folder 1 keeps the shape every page shares, so a create sent before folders still holds its lock.
    lockKey: (v: { compId: string; target: string; alias?: string; exec: number }) => ({ compId: v.compId, target: v.target, ...(v.exec !== EXEC_DEFAULT ? { exec: v.exec } : {}) }),
    identity: (v: { compId: string; target: string; alias?: string; exec: number }) => ({ compId: v.compId, target: v.target, ...(v.exec !== EXEC_DEFAULT ? { exec: v.exec } : {}), ...(v.alias ? { name: v.alias } : {}) }), reads: ['aliases'], proves: (id: unknown, a: readonly (readonly unknown[])[]): ReadVerdict => (isCreateId(id) && aliasRows(a).some((x) => x.target_path === id.target && x.computer_id === id.compId && (x.index ?? EXEC_DEFAULT) === (id.exec ?? EXEC_DEFAULT) && (id.name === undefined || x.alias === id.name)) ? 'applied' : undefined) },
  aliasState: { route: R.aliasState, lock: aliasLock.lock, input: (v: { id: string; enabled: boolean }) => ({ params: { id: v.id }, body: { enabled: v.enabled } }), lockKey: (v: { id: string; enabled: boolean }) => aliasLock.key(v.id), identity: (v: { id: string; enabled: boolean }) => ({ alias: v.id, enabled: v.enabled }), reads: ['aliases'], proves: (id: unknown, a: readonly (readonly unknown[])[]): ReadVerdict => { if (!isStateId(id)) return undefined; const k = id; return aliasRows(a).some((x) => x.id === k.alias && (x.enabled !== false) === k.enabled) ? 'applied' : undefined; } },
  aliasRemove: { route: R.aliasRemove, lock: aliasLock.lock, input: (v: { id: string }) => ({ params: { id: v.id } }), lockKey: (v: { id: string }) => aliasLock.key(v.id), reads: ['aliases'], proves: (id: unknown, a: readonly (readonly unknown[])[]): ReadVerdict => (isRemoveId(id) && aliasRows(a).length > 0 && !aliasRows(a).some((x) => x.id === id.alias) ? 'applied' : undefined) },
  settle: { route: R.settle, input: (v: { opId: string; sentAfter: number; target?: Target; exec: number; still?: () => boolean }) => ({ body: { opId: v.opId, sentAfter: v.sentAfter }, index: v.exec, ...(v.target ? { target: v.target } : {}), ...stillOf(v) }), reads: ['health'], proves: NOTHING_CHANGED },
} as const;

// aiTurn is not wired live yet (NOT_WIRED) and the assistant stays hidden. A live test send is sent through core's locked change (useLiveRunTest), a fixture one through the source's runTest.
/** The page's live table, for the test that every locked change can be released. */
export const sourceTable = { reads, changes };
const source = coreSource('scripts', sourceTable as never, pageFixtures('scripts'));
/** The containers answer as read: Being built binds each stored build to its own computer's row (bindingOfRecord). Not read
 *  while the section is not shown (New script): that view reads only its own computer's answers. */
export const useContainersRead = (enabled: boolean) => source.useQuery<unknown, void>('containers', undefined, { enabled });
// Being built: the fixture state's builds (fixtures.ts `builds`). Called only under the fixture transport.
const buildsFx = __HUB_FIXTURES__ ? pageFixtures('scripts')! : null;
export const useBuildsFixture = <T,>(): T | undefined => (buildsFx as NonNullable<typeof buildsFx>).useQuery<T>('builds').data;

/**
 * An alias change of another page (Computers) that still holds the shared lock, for the aliases this script shows or the
 * address it would make. Read-only for Scripts: the page that sent it frees it. `from` is the sender's page (null = unknown).
 */
export function useAliasHeldElsewhere(scope: AliasHoldScope): { from: AliasHeldFrom } | null {
  useChangesVersion();
  return aliasHeldElsewhere(heldChanges(aliasLock.lock), (key, h) => source.heldBy(key, h), scope);
}

export type AliasHeldFrom = { page: string; path: string } | null;
export interface AliasHoldScope {
  ids: readonly string[];
  compId: string;
  target: string;
  /** The script's Exec folder: a link made for the same address in another folder is another script's. */
  exec: number;
}

/**
 * The sender is recorded per change key, so a hold is another page's only when NO alias key of this page owns it:
 * 'self' for aliasCreate, aliasState or aliasRemove means Scripts sent it (its own Check/Dismiss apply, never "held by another page").
 */
export function aliasHeldElsewhere(
  holds: ReadonlyArray<Parameters<typeof source.heldBy>[1]>,
  heldBy: (key: string, h: Parameters<typeof source.heldBy>[1]) => 'self' | 'other' | undefined,
  scope: AliasHoldScope,
): { from: AliasHeldFrom } | null {
  for (const h of holds) {
    if (['aliasCreate', 'aliasState', 'aliasRemove'].some((k) => heldBy(k, h) === 'self')) continue;
    if (!['aliasCreate', 'aliasState', 'aliasRemove'].some((k) => heldBy(k, h) === 'other')) continue;
    const id = h.identity as Record<string, unknown> | null;
    // A create names its folder as `exec`; one without it (folder 1, and every older record) is folder 1's.
    const mine = !!id && ((typeof id.alias === 'string' && scope.ids.includes(id.alias)) || (id.compId === scope.compId && id.target === scope.target && (id.exec ?? EXEC_DEFAULT) === scope.exec));
    if (mine) return { from: (h as { from?: AliasHeldFrom }).from ?? null };
  }
  return null;
}

/** The kit's list answer as rows with root-relative paths: `scripts` (metadata) or `entries` (plain, paths under the scripts directory). */
function rowsOf(raw: unknown, exec: number = EXEC_DEFAULT): ScriptRow[] {
  const out: ScriptRow[] = [];
  for (const r of arr(raw, 'scripts', 'entries', 'files', 'items').map(rec)) {
    const p = str(r.path);
    if (!p || r.isDirectory === true || (typeof r.type === 'string' && r.type !== 'file')) continue;
    out.push({ ...(r as unknown as ScriptRow), path: execOf(p) !== null ? p : execRoot(exec) + p.replace(/^\/+/, '') });
  }
  return out;
}

const NO_AGENT = { templates: false, writer: false, guardedDelete: false };

function stateOf(status: unknown): CompState {
  const v = String(status ?? '').toLowerCase();
  if (v === 'running') return 'on';
  if (v === 'stopped' || v === 'paused') return 'off';
  return 'starting';
}

/** The computer the shell shows now: a multi-step change binds it when it starts, so a later step never follows a switch. */
export const useScriptsTarget = (): Target | null => useCurrentComputer();

/** The script paths a fresh list answered, by computer handle. A script on one computer proves nothing about another. */
export type ScriptPaths = Record<string, string[]>;

/** The live overview: the computer the shell has selected, read through its Exec kit (folder `exec`) and the agent. */
function useLiveOverview(exec: number) {
  const target: Target | null = useCurrentComputer();
  const cid = target?.container.id ?? '';
  const containers = source.useQuery<unknown>('containers');
  const selectedRealm = useRealms().selected;
  const body = rec(containers.data).data ? rec(rec(containers.data).data) : containers.data;
  const row = arr(body, 'computers').map(rec).find((c) => str(c.id) === cid);
  // A computer missing from this page proves nothing unless the page is the whole list: a body without a list, or a first page
  // of a longer list, is a read error (the page offers Try again), never "no computer selected".
  const pages = rec(rec(body).pagination).totalPages;
  const whole = Array.isArray(rec(body).computers) && (typeof pages === 'number' ? pages <= 1 : (rec(body).computers as unknown[]).length < 100);
  const running = !!row && String(row.status).toLowerCase() === 'running';
  const on = { enabled: running };
  const folder = useMemo(() => ({ exec }), [exec]);
  const health = source.useQuery<unknown, InFolder>('health', folder, on);
  const list = source.useQuery<Listed, InFolder>('list', folder, on);
  const summary = source.useQuery<unknown, InFolder>('summary', folder, on);
  // The agent's script routes name one realm. "All realms" has none, so the computer's only realm is used; a computer in
  // several realms waits for the user to pick one (agentRealm null).
  const compRealms = arr(row?.realm_ids).map(str);
  const agentRealm = agentRealmFor(selectedRealm, compRealms);
  // Who owns a script is read in any realm of the computer: the agent lists every realm's ledger from the realm asked (a row of
  // another realm is only managed_elsewhere), so "All realms" on a multi-realm computer no longer leaves ownership unknown.
  const ownerRealm = agentRealm ?? compRealms[0] ?? 'global';
  const instances = source.useQuery<unknown, { compId: string; realm?: string }>('instances', { compId: cid, realm: ownerRealm }, { enabled: running });
  const version = source.useQuery<unknown>('version', undefined, on);
  const authStatus = source.useQuery<unknown>('authStatus', undefined, on);
  const account = useCore().account;
  const aliases = source.useQuery<unknown, { compId: string }>('aliases', { compId: cid }, on);
  const deleted = source.useQuery<unknown, InFolder>('deleted', folder, on);

  const data = useMemo<ScriptsOverview | undefined>(() => {
    if (!row) return containers.isSuccess && (whole || !cid) ? { computers: [] } : undefined;
    const name = str(row.name);
    const handle = computerHandle({ name, id: cid });
    const state = stateOf(row.status);
    const origin = target ? buildPortUrl(target.project, target.container, 'exec', exec) : '';
    const base = { id: cid, name, handle, state, serverName: str(row.server_name), realmIds: arr(row.realm_ids).map(str), origin, ...(typeof row.color === 'string' ? { color: row.color } : {}) };
    if (state !== 'on') return { computers: [{ ...base, err: null, caps: null, agent: NO_AGENT, rows: [], summary: {}, instances: {}, aliases: [], deleted: null }] };
    if (health.isPending || list.isPending) return undefined;
    if (list.isError) {
      const forbidden = (list.error as { kind?: string } | null)?.kind === 'forbidden';
      return { computers: [{ ...base, err: forbidden ? 'private' : 'unreachable', caps: null, agent: NO_AGENT, rows: [], summary: {}, instances: {}, aliases: [], deleted: null }] };
    }
    const rows = listedRows(list.data, exec) ?? [];
    const sums: Record<string, Summary> = {};
    for (const x of arr(summary.data, 'scripts').map(rec)) if (str(x.scriptPath)) sums[str(x.scriptPath)] = x as unknown as Summary;
    let inst: Record<string, Instance> | null = null;
    if (instances.isSuccess) {
      inst = {};
      for (const x of arr(instances.data, 'instances').map(rec)) {
        const i = instanceOf(x);
        if (i) inst[i.path] = i;
      }
    }
    const dl = deleted.isSuccess ? (arr(deleted.data, 'entries', 'deleted', 'items') as DeletedEntry[]) : null;
    const c: CompScripts = {
      ...base,
      err: null,
      caps: caps(health.data),
      agent: agentCapsOf({ version: version.isSuccess ? version.data : undefined, status: authStatus.isSuccess ? authStatus.data : undefined, loading: version.isPending || authStatus.isPending, account, realm: agentRealm, guardedDelete: instances.isSuccess }),
      agentRealm,
      ownerRealm,
      rows,
      summary: sums,
      instances: inst,
      // Why ownership is unknown, for the reason a blocked action shows: still reading, or the agent's read failed (and how).
      ...(inst ? {} : { ownerRead: instances.isError ? { k: 'failed' as const, kind: String((instances.error as { kind?: unknown } | null)?.kind ?? 'server'), error: instances.error } : { k: 'reading' as const } }),
      // A failed refetch keeps the links an earlier read showed; with none ever read the links are UNKNOWN, never "no links".
      aliases: aliases.data !== undefined ? aliasesOf(aliases.data) : [],
      aliasesRead: aliases.data !== undefined,
      deleted: dl,
    };
    return { computers: [c] };
  }, [exec, row, cid, target, agentRealm, ownerRealm, containers.isSuccess, whole, health.isPending, health.data, list.isPending, list.isError, list.error, list.data, summary.data, instances.isSuccess, instances.isError, instances.error, instances.data, version.isSuccess, version.isPending, version.data, authStatus.isSuccess, authStatus.isPending, authStatus.data, account, aliases.data, deleted.isSuccess, deleted.data]);

  const failedAll = containers.isError ? containers.error : containers.isSuccess && !row && cid && !whole ? { kind: 'unavailable', status: 0, code: 'BAD_LIST' } : null;
  return { data, isPending: data === undefined && !failedAll, isError: !!failedAll, error: failedAll, refetch: async (): Promise<ScriptPaths | null> => {
      // The list of THIS computer, read now by its own key (not through the observer, which follows whatever computer the shell
      // shows by the time the read answers): core counts only a fetch's own success sent after this call. The other reads
      // only refresh what the page shows.
      const [f] = await Promise.all([refreshFresh(sourceReads('scripts', 'list', { computer: cid })), containers.refetch(), summary.refetch(), version.refetch(), authStatus.refetch(), instances.refetch(), aliases.refetch(), deleted.refetch(), health.refetch()]);
      // Only this folder's list answers; none of them means nothing was read for it (absent proves nothing).
      const mine = f.state === 'fresh' ? f.answers.map((a) => listedRows(a.data, exec)).filter((x): x is ScriptRow[] => x !== null) : [];
      return mine.length > 0 && row ? { [computerHandle({ name: str(row.name), id: cid })]: mine.flatMap((rows) => rows.map((x) => x.path)) } : null;
    } };
}

function useFixtureOverview(exec: number) {
  const q = source.useQuery<ScriptsOverview>('overview');
  // The fixture computers name folder 1's address; another folder shows its own (the rows are filtered by folder in toItems).
  const data = useMemo(() => (q.data && exec !== EXEC_DEFAULT ? { computers: q.data.computers.map((c) => ({ ...c, origin: c.origin.replace(/-exec-1\./, `-exec-${exec}.`) })) } : q.data), [q.data, exec]);
  return { data, isPending: q.isPending, isError: q.isError, error: q.error, refetch: async (): Promise<ScriptPaths | null> => {
      const r = await q.refetch();
      // A computer whose list was not read has no entry: absent proves nothing.
      return r.data ? Object.fromEntries(r.data.computers.filter((c) => c.state === 'on' && !c.err).map((c) => [c.handle, c.rows.map((x) => x.path)])) : null;
    } };
}

/** The overview of folder `execArg` (the page passes the one it shows), else of the folder its parts were given. */
export function useOverview(execArg?: number) {
  const given = useFolder();
  const exec = execArg ?? given;
  // The mode is fixed at boot, so every render runs the same hooks.
  const useBase = fixtureModeActive() ? useFixtureOverview : useLiveOverview;
  const q = useBase(exec);
  const items = useMemo<ScriptItem[] | undefined>(() => (q.data ? toItems(q.data.computers, exec) : undefined), [q.data, exec]);
  return { ...q, items, exec };
}

/** The selected script's read parameters: its id and its path in the page's folder. */
function useParams(id: string | undefined) {
  const exec = useFolder();
  const path = pathOfId(id, exec);
  return id && path ? { id, path } : undefined;
}

/** The script file as the kit holds it now. Read only for the selected script. */
export function useFile(id: string | undefined) {
  const q = source.useQuery<Record<string, ScriptFile>, { id: string; path: string } | undefined>('files', useParams(id), { enabled: !!id });
  return { ...q, data: id ? q.data?.[id] : undefined };
}

export function useUsage(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, Usage>, { id: string; path: string } | undefined>('usage', useParams(id), { enabled: enabled && !!id });
  return { ...q, data: enabled && id ? (q.data?.[id] ?? null) : undefined };
}

export function useFailures(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, Failure[]>, { id: string; path: string } | undefined>('failures', useParams(id), { enabled: enabled && !!id });
  return { ...q, data: enabled && id ? (q.data?.[id] ?? []) : undefined };
}

export function useVersions(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, Version[]>, { id: string; path: string } | undefined>('versions', useParams(id), { enabled: enabled && !!id });
  return { ...q, data: enabled && id ? (q.data?.[id] ?? []) : undefined };
}

export function useEnv(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, EnvKeys>, { id: string; path: string } | undefined>('env', useParams(id), { enabled: enabled && !!id });
  return { ...q, data: enabled && id ? q.data?.[id] : undefined };
}

/**
 * Whether folder `exec` of the shown computer serves only its own scripts: true when its `.exclusive` marker reads, false when the
 * computer says it is not there, null while unread or when the read failed any other way (nothing is said then).
 */
export function useExclusive(exec: number, enabled: boolean): boolean | null {
  const folder = useMemo(() => ({ exec }), [exec]);
  const q = source.useQuery<boolean, InFolder>('exclusive', folder, { enabled });
  if (!enabled) return null;
  if (q.data === true) return true;
  return q.isError && (q.error as { kind?: string } | null)?.kind === 'not_found' ? false : null;
}

/** The computer's own list of magic-comment fields (read once per computer; the panel is drawn from it). */
export function useCommentsSchema(enabled: boolean, exec: number) {
  const folder = useMemo(() => ({ exec }), [exec]);
  return source.useQuery<unknown, InFolder>('commentsSchema', folder, { enabled });
}

/** The stored magic comments of the script (secrets read as `[REDACTED]`) and the revision they were read at. */
export function useCommentsRead(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, CommentsRead>, { id: string; path: string } | undefined>('commentsRead', useParams(id), { enabled: enabled && !!id });
  return { ...q, data: enabled && id ? q.data?.[id] : undefined };
}

/** One kept version of the script, read when the person asks to see it. */
export function useVersionRead(id: string | undefined, version: string | number | null) {
  const p = useParams(id);
  const q = source.useQuery<Record<string, ScriptFile>, { id: string; path: string; version: string | number } | undefined>('versionRead', p && version !== null ? { ...p, version } : undefined, { enabled: !!id && version !== null });
  return { ...q, data: id ? q.data?.[id] : undefined };
}

export function useTests(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, TestsDoc>, { id: string; path: string } | undefined>('tests', useParams(id), { enabled: enabled && !!id });
  return { ...q, data: enabled && id ? q.data?.[id] : undefined };
}

// ── changes: each resolves with a C9 outcome, never retries, never resends ──────────────

// `target` (New script): the request goes to the draft's bound computer, never to whichever one the shell shows by then.
export const useValidate = () => source.useMutation<Validation, { code: string; exec: number; target?: Target; still?: () => boolean }>('validate');
export const useResolve = () => source.useMutation<ResolveAnswer, { path: string; omit?: string; exec: number; target?: Target; still?: () => boolean }>('resolve');
export const useWrite = () => source.useMutation<WriteResult, { compId: string; path: string; content: string; ifRevision: string | null; opId: string; expectRoute?: { route: string | null; answeredBy: string | null }; target?: Target; still?: () => boolean }>('write');
export const useCommentsCheck = () => source.useMutation<CommentsDry, { path: string; ifRevision: string | null; comments: Record<string, unknown> }>('commentsCheck');
export const useCommentsParse = () => source.useMutation<unknown, { text: string; exec: number }>('commentsParse');
export const useCommentsPrint = () => source.useMutation<unknown, { text: string; set: Record<string, unknown>; exec: number }>('commentsPrint');
export const useRestore = () => source.useMutation<WriteResult, { compId: string; path: string; version: string | number; ifRevision: string | null; opId: string }>('restore');
export const useSetComments = () => source.useMutation<WriteResult, { compId: string; path: string; ifRevision: string; opId: string; comments: Record<string, unknown> }>('comments');
export const useRemoveManaged = () => source.useMutation<unknown, { compId: string; realm?: string; path: string; ifRevision: string; opId: string; keepCopy: boolean }>('removeManaged');
export const useRemove = () => source.useMutation<unknown, { compId: string; path: string; ifRevision: string; opId: string; keepCopy: boolean }>('remove');
export const useInstantiate = () => source.useMutation<{ path: string }, { compId: string; realm?: string; name: string; path: string; vars: Record<string, string>; callerKey?: string; target?: Target; still?: () => boolean; idem?: string }>('instantiate');
export const useEnvUpdate = () => source.useMutation<unknown, { compId: string; path: string; scope: string; set?: Record<string, string>; unset?: string[]; ifRevision: string | null; opId: string }>('envUpdate');
export const useTestsDelete = () => source.useMutation<unknown, { compId: string; path: string; ifRevision: string; opId: string }>('testsDelete');
export const useTestsPut = () => source.useMutation<{ revision: string }, { compId: string; path: string; ifRevision: string | null; opId: string; cases: unknown[] }>('testsPut');
type RunVars = { compId: string; exec: number; method: string; route: string; body?: string };
/** `headers` and `size` come from core's run answer (RunAnswer); the Answer panel leaves out what an answer lacks. */
type RunData = { status: number; ms: number; body: string; headers?: ReadonlyArray<readonly [string, string]>; size?: number };
type RunResult = { outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale'; data?: RunData; code?: string };

/** The lock a test send holds. No read frees it: a health read proves nothing about a request. Only the person's Dismiss does. */
export const RUN_LOCK = 'scripts.runTest';
/** Reads that could free a held test send: none. */
export const runReads: readonly never[] = [];
// Dismiss moves a request to a new generation: the held one stays in core (it is dropped on an account change), but a new press is a new change.
const runGen = new Map<string, number>();
const runId = (v: { compId: string; exec: number; method: string; route: string }): string => `${v.compId}\n${v.exec}\n${v.method}\n${v.route}`;
/** The address without its query or fragment: a lock key never carries a typed token. */
const bareRoute = (r: string): string => r.split(/[?#]/)[0] ?? r;
export const dismissRun = (v: RunHeld): void => { const k = runId({ ...v, route: bareRoute(v.route) }); runGen.set(k, (runGen.get(k) ?? 0) + 1); };
/**
 * One lock per request (computer, folder, method, address without query, generation); never the body, which may hold a secret. Folder 1
 * records no folder, so a request held before folders existed still holds the same lock.
 */
export const runLockOptions = { lockKey: (v: RunVars): Omit<RunHeld, 'exec'> & { exec?: number; gen: number } => { const route = bareRoute(v.route); return { compId: v.compId, ...(v.exec !== EXEC_DEFAULT ? { exec: v.exec } : {}), method: v.method, route, gen: runGen.get(runId({ compId: v.compId, exec: v.exec, method: v.method, route })) ?? 0 }; }, lock: RUN_LOCK };
export interface RunHeld { compId: string; exec: number; method: string; route: string }
export interface RunTestApi {
  mutateAsync: (v: RunVars) => Promise<RunResult>;
  /** The request that may have gone through, from core's lock (survives the tab and the component), or null. */
  held: RunHeld | null;
}

/** Live: one request to the script's own address through core's locked change (never retried; a lost answer stays held in core, and the page does not resend). */
function useLiveRunTest(compId: string, exec: number): RunTestApi {
  const target = useCurrentComputer();
  const shown = useRef<RunData | undefined>(undefined);
  const change = useLockedChange<RunVars, RunData>(
    async (v) => {
      if (!target || target.container.id !== v.compId || v.exec !== exec || (v.method !== 'GET' && v.method !== 'POST')) throw { kind: 'not_sent', notSent: true, code: 'NOT_WIRED' };
      let body: unknown;
      if (v.method === 'POST' && v.body) {
        try { body = JSON.parse(v.body); } catch { body = v.body; }
      }
      const t0 = Date.now();
      let a: Awaited<ReturnType<typeof kitRun>>;
      try {
        a = await kitRun(v.method === 'GET' ? R.runGet : R.runPost, target, v.route, { method: v.method, index: v.exec, ...(body === undefined ? {} : { body }) });
      } catch (e) {
        // A request that went out and did not come back as a usable answer is an unknown outcome (C9): no answer (dropped, timed out, aborted or
        // stale after the send), the kit's preflight guess, a redirect, and an answer it could not use (too large) with a 2xx, 3xx or 5xx status.
        // Only a refusal before any send (notSent) and a 4xx are definite; the script may have run in every other case, so it locks as pending.
        const x = e as { kind?: unknown; status?: unknown; code?: unknown; notSent?: unknown } | null;
        if (x && typeof x === 'object' && typeof x.kind === 'string' && x.notSent !== true && x.kind !== 'not_sent') {
          const st = typeof x.status === 'number' ? x.status : 0;
          if (!(st >= 400 && st < 500)) throw { kind: 'pending', code: st >= 500 ? `HTTP_${st}` : typeof x.code === 'string' ? x.code : 'NETWORK' };
        }
        throw e;
      }
      const data: RunData = { status: a.status, ms: Date.now() - t0, body: a.body, headers: a.headers, size: a.size };
      // A 5xx may be the script's own answer or a proxy's: it is shown, but the request may not have run once, so it locks like a lost answer.
      if (a.status >= 500) {
        shown.current = data;
        throw { kind: 'pending', code: `HTTP_${a.status}` };
      }
      return data;
    },
    runReads as never,
    RUN_LOCK,
    runLockOptions,
  );
  useChangesVersion();
  // A held request without a folder is folder 1's.
  const h = heldChanges(RUN_LOCK).map((x) => x.identity as Omit<RunHeld, 'exec'> & { exec?: number; gen?: number }).find((i) => i && i.compId === compId && (i.exec ?? EXEC_DEFAULT) === exec && (i.gen ?? 0) === (runGen.get(runId({ ...i, exec: i.exec ?? EXEC_DEFAULT })) ?? 0));
  const held: RunHeld | null = h ? { ...h, exec: h.exec ?? EXEC_DEFAULT } : null;
  const mutateAsync = useCallback(
    async (v: RunVars): Promise<RunResult> => {
      shown.current = undefined;
      const r = await change.run(v);
      const data = r.outcome === 'pending' ? shown.current : r.data;
      return { outcome: r.outcome, ...(data ? { data } : {}), ...(r.code ? { code: r.code } : {}) };
    },
    [change],
  );
  return { mutateAsync, held };
}
const useFixtureRunTest = (_compId: string, _exec: number): RunTestApi => {
  const m = source.useMutation<RunData, RunVars>('runTest');
  return { mutateAsync: m.mutateAsync as unknown as (v: RunVars) => Promise<RunResult>, held: null };
};
export function useRunTest(compId: string, exec: number): RunTestApi {
  // The mode is fixed at boot, so every render runs the same hook.
  const use = fixtureModeActive() ? useFixtureRunTest : useLiveRunTest;
  return use(compId, exec);
}
export const useTrigger = () => source.useMutation<unknown, { compId: string; path: string; target?: Target }>('trigger');
/** One ask of the writing assistant. `stop` ends a wait (the view went away); `check` continues an ask that stopped pending. */
export interface AiTurnApi {
  mutateAsync: (v: AiVars) => Promise<AiAnswer>;
  /** Read the pending ask of this place again (its turn is never sent again); null when there is none. */
  check: (p: Place) => Promise<AiAnswer | null>;
  /** Stop the turn of the ask that is running at this place (false: nothing to stop yet). */
  cancel: (p: Place) => Promise<boolean>;
  /** Whether an ask of this place is stored: it may be out, its outcome unknown, or its answer not yet taken. A new press continues it, never sends again. 'unreadable': the store cannot say. */
  open: (p: Place) => boolean | 'unreadable';
  /**
   * A view that shows the place takes the final answer it was handed: true for the one view that wins the claim, false for any other (it shows nothing).
   * `eligible` is asked once the claim holds the store: a view that left meanwhile leaves the ask stored for the next view and wins nothing.
   */
  claim: (a: AiAnswer, eligible?: () => boolean) => Promise<boolean>;
  /**
   * What the press hid from an ask's text (AiVars.values), as this tab holds it for the ask the answer came from: undefined when it holds
   * none (an ask of another tab, or one from before a reload). Read before the claim, which ends the ask and deletes it.
   */
  valuesOf: (a: AiAnswer) => unknown;
  /** The answer is of an ask that was already out at the place (this press's own prompt was not sent): see AskResult.joined. */
  joined: (a: AiAnswer) => boolean;
  /** The warned close of an ask whose outcome is unknown: the stored ask is ended and its turn is not read again. */
  discard: (p: Place) => Promise<void>;
}

/**
 * Live: a session of the agent's script-writer, one turn, its answer read from the session's record (writer.ts). The realm and the
 * owner come from the computer's row (the agent's own report); an ask whose computer is not the shown one is not sent.
 */
// One ask's send, read and stop on the computer `t` (the caller decided `t` may be asked: the shown computer, or a draft's bound
// computer while the Hub shows it). Shared by the shown-computer API (useAiTurn) and the New script build API (useBuildApi).
async function sendAsk(t: Target, v: AiVars, signal: { stop: boolean }, still?: () => boolean): Promise<AiAnswer> {
  if (t.container.id !== v.compId || !v.owner) return { outcome: 'not_sent', code: 'NOT_WIRED' };
  if (!v.realm || !(/^[0-9a-f]{24}$/.test(v.realm) || v.realm === 'global')) return { outcome: 'not_sent', code: 'NO_REALM' };
  // An ask stored at this place (an earlier view's, another tab's, one from before a reload) is continued, never sent again: its turn may be out already.
  const at = { compId: v.compId, path: v.path, realm: v.realm, owner: v.owner };
  const stored = storedAsk(at);
  // Storage that cannot be read cannot show whether an earlier ask is out: nothing is sent.
  if (stored === 'unreadable') return { outcome: 'not_sent', code: 'NO_RECORD' };
  const open = runOf(at);
  // An ask of another computer at this place (another project's container of the same id) is never continued for this one.
  if (open && !placeFits(v.path, t, open)) return { outcome: 'not_sent', code: 'OTHER_COMPUTER' };
  if (open) return markJoined(await advance(resume(open, t, still), signal));
  if (stored) {
    if (!placeFits(stored.path, t)) return { outcome: 'not_sent', code: 'OTHER_COMPUTER' };
    const back = restoreRun(stored, { target: t, still });
    return back ? markJoined(await advance(back, signal)) : { outcome: 'pending', code: 'EARLIER_ASK' };
  }
  return advance(startRun(v, { target: t, realm: v.realm, owner: v.owner, still }), signal);
}
async function checkAsk(t: Target, p: Place, signal: { stop: boolean }, still?: () => boolean): Promise<AiAnswer | null> {
  let rec: WriterRun | null | undefined = runOf(p);
  if (rec && !placeFits(p.path, t, rec)) return null;
  if (!rec) {
    const stored = storedAsk(p);
    if (!stored || stored === 'unreadable' || !placeFits(stored.path, t)) return null;
    rec = restoreRun(stored, { target: t, still });
    if (!rec) return { outcome: 'pending', code: 'EARLIER_ASK' };
  }
  return advance(resume(rec, t, still), signal);
}
function runAt(t: Target | null, p: Place): WriterRun | null {
  const open = runOf(p);
  if (open) return t && placeFits(p.path, t, open) ? open : null;
  const stored = storedAsk(p);
  return t && stored && stored !== 'unreadable' && placeFits(stored.path, t) ? restoreRun(stored, { target: t }) : null;
}
/** A view that goes away ends its wait: nothing is sent after it, and the answer it never took stays at its place. */
function useViewSignal(): { stop: boolean } {
  const live = useRef({ stop: false });
  useEffect(() => {
    const l = live.current;
    l.stop = false;
    return () => { l.stop = true; };
  }, []);
  return live.current;
}

function useLiveAiTurn(): AiTurnApi {
  const target = useCurrentComputer();
  const signal = useViewSignal();
  const targetRef = useRef(target);
  targetRef.current = target;
  const mutateAsync = useCallback(async (v: AiVars): Promise<AiAnswer> => {
    const t = targetRef.current;
    return t ? sendAsk(t, v, signal) : { outcome: 'not_sent', code: 'NOT_WIRED' };
  }, [signal]);
  const check = useCallback(async (p: Place): Promise<AiAnswer | null> => {
    const t = targetRef.current;
    // The computer shown is not the one the ask was made on: it is read when that one is shown again.
    if (!t || t.container.id !== p.compId) return null;
    return checkAsk(t, p, signal);
  }, [signal]);
  const cancel = useCallback(async (p: Place): Promise<boolean> => {
    const rec = runAt(targetRef.current, p);
    return rec ? cancelRun(rec) : false;
  }, []);
  const open = useCallback((p: Place): boolean | 'unreadable' => openRun(p), []);
  const claim = useCallback((a: AiAnswer, eligible?: () => boolean): Promise<boolean> => claimAnswer(a, eligible), []);
  const discard = useCallback(async (p: Place): Promise<void> => { await closeAsk(p); }, []);
  return { mutateAsync, check, cancel, open, claim, valuesOf, joined: joinedOf, discard };
}

/** The fixture twin has no store: an answer carries what its press hid. */
const fixtureValues = new WeakMap<object, unknown>();

function useFixtureAiTurn(): AiTurnApi {
  const m = source.useMutation<{ reply: string }, AiVars>('aiTurn');
  const mutateAsync = async (v: AiVars): Promise<AiAnswer> => {
    const a = (await m.mutateAsync(v)) as unknown as AiAnswer;
    if (v.values !== undefined && typeof a === 'object' && a !== null) fixtureValues.set(a, v.values);
    return a;
  };
  return {
    mutateAsync,
    check: async () => null,
    cancel: async () => false,
    open: () => false,
    claim: async () => true,
    valuesOf: (a) => fixtureValues.get(a),
    joined: () => false,
    discard: async () => {},
  };
}

/** Re-renders a view when the stored asks change (this tab's own writes, other tabs'): whether an ask is open at its place is read from the store at render. */
export function useAskStore(): number {
  return useSyncExternalStore(fixtureModeActive() ? noopSubscribe : subscribeAsks, fixtureModeActive() ? zeroVersion : asksVersion);
}
const noopSubscribe = (): (() => void) => () => {};
const zeroVersion = (): number => 0;

export function useAiTurn(): AiTurnApi {
  // The mode is fixed at boot, so every render runs the same hooks.
  const use = fixtureModeActive() ? useFixtureAiTurn : useLiveAiTurn;
  return use();
}
// ── New script: the draft's bound computer ─────────────────────────────────────────────────────────────────────

/**
 * What a New script draft is bound to when it is made: the computer the Hub showed, its agent realm, the agent's owner and the
 * Exec folder. Captured once and never read again from the shell: every send of the draft names `target` explicitly.
 */
export interface Binding {
  readonly target: Target;
  readonly realm: string;
  readonly owner: string;
  readonly exec: number;
}
export const compIdOf = (b: Binding): string => b.target.container.id;
/** The same computer: the same project and container (a container id alone is not unique across projects). */
export const sameComputer = (a: Target | null | undefined, b: Target | null | undefined): boolean => !!a && !!b && a.container.id === b.container.id && a.project.id === b.project.id;

/** Whether the Hub shows the bound computer now. A wizard send is made only while it does (else not sent, 'NOT_SHOWN'). */
export function useBoundShown(b: Binding | null): boolean {
  const shown = useCurrentComputer();
  return !!b && sameComputer(shown, b.target);
}

/** Core refusing a send because an earlier send of the change is held (pending, or being sent): that send may have gone
 *  through. A switch of the shown computer never hides this code (it is what keeps a reservation, C9). */
export const HELD_CODES: readonly string[] = ['READ_BACK_FIRST', 'BUSY', 'HELD_BY_OTHER'];

/** Why a fresh read of a computer said nothing: no answer in time, no connection, or an error answer (5xx). */
export type NoAnswer = 'timeout' | 'unreachable' | 'server';

/**
 * hoody-exec's own answer that no script is at `path`: its scripts read's 404 `{error: 'Script not found', code: 'ERROR_404',
 * details: {path}}` (its usual error shape), for exactly the path
 * asked. Nothing else shows a script absent: a 404 of the proxy or of a program not running (`{code: 'not_found'}`), the same
 * words for another path, a 5xx or no answer at all.
 */
export function execSaysAbsent(e: unknown, path: string): boolean {
  if (!isPlain(e) || e.status !== 404 || !isPlain(e.data)) return false;
  const d = e.data;
  return d.code === 'ERROR_404' && d.error === 'Script not found' && isPlain(d.details) && d.details.path === path;
}

/** Why a read failed without an answer that says anything: core's TIMEOUT, no connection (status 0), a 5xx; null for anything
 *  else (refused before sending, a cancel, another 4xx). */
export function noAnswerOf(e: unknown): NoAnswer | null {
  const x = isPlain(e) ? e : {};
  if (x.notSent === true || x.stale === true || x.kind === 'not_sent' || x.kind === 'stale' || x.kind === 'aborted') return null;
  if (x.code === 'TIMEOUT') return 'timeout';
  if (x.status === 0 || x.kind === 'unreachable') return 'unreachable';
  return typeof x.status === 'number' && x.status >= 500 ? 'server' : null;
}

/** One fresh read of the script at `path` on `b`'s computer and folder (never a cached list): true when it is there, false only
 *  on hoody-exec's own "Script not found" for that path (execSaysAbsent), else not known: why when the failure says (noAnswerOf),
 *  or null. `still`: the send condition core asks before the request goes out. */
export async function readScriptAt(b: Binding, path: string, still?: () => boolean): Promise<boolean | null | NoAnswer> {
  if (execOf(path) !== b.exec) return null;
  try {
    await api(R.read, { ctx: capture(b.target), target: b.target, index: b.exec, query: { path }, ...(still ? { still } : {}) } as never);
    return true;
  } catch (e) {
    return execSaysAbsent(e, path) ? false : noAnswerOf(e);
  }
}
type Sent<T> = { outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale'; data?: T; code?: string; hold?: string };
/**
 * The draft's exec and agent sends, each made to the bound computer and folder, and only while the Hub shows that computer: the
 * shown computer is read when the send is made (a switch after the press leaves it not sent, 'NOT_SHOWN'). Sign-in follows the
 * same rule through `shown` (the sign-in drawer acts on the shown computer, which is then the bound one).
 */
export interface BoundSends {
  shown: boolean;
  validate: (code: string) => Promise<Sent<Validation>>;
  resolve: (path: string, omit?: string) => Promise<Sent<ResolveAnswer>>;
  write: (v: { path: string; content: string; ifRevision: string | null; opId: string; expectRoute?: { route: string | null; answeredBy: string | null } }) => Promise<Sent<WriteResult>>;
  instantiate: (v: { name: string; path: string; vars: Record<string, string>; callerKey?: string; idem?: string }) => Promise<Sent<{ path: string }>>;
  /** A fresh read of the script at `path` on the bound computer (readScriptAt): true when it is there, false only on hoody-exec's
   *  own "Script not found" for that path, else not known: why (NoAnswer) when the failure says, or null (not shown included). */
  exists: (path: string) => Promise<boolean | null | NoAnswer>;
  /** Core's hold of a deploy's own send on the bound computer: the held write at `path` under op id `opId`, or the held
   *  instantiate there under Idempotency-Key `opId` (its shown identity names them), read before a Check's read: the one send that
   *  read can prove. undefined when core holds no send of that op (another send of the path, an earlier write, is never it). */
  heldOf: (kind: 'write' | 'instantiate', path: string, opId: string) => Promise<HeldRow | undefined>;
  /** Every send core holds of the change at `path` on the bound computer (the write's lock {path}, the instantiate's {compId,
   *  path}), read after a Check's read: what a Deploy again would be refused behind. null when core's list can't be read. */
  heldAt: (kind: 'write' | 'instantiate', path: string) => Promise<readonly HeldRow[] | null>;
  /** Frees exactly that send (core's settleHeld: "frees exactly that send of this key … keys stay"; changes.ts release(): "a
   *  retry of the same change replays it"), so the next send of it goes under the same op id or Idempotency-Key. Called only
   *  after hoody-exec's own "Script not found" for the path, or, for a write only, the script found there with the op
   *  settled by hoody-exec's journal (deploy.ts confirmDeployed: the write creates and
   *  never replaces), the one exception to "no answer frees a reservation"). True when it freed that send. */
  release: (kind: 'write' | 'instantiate', hold: HeldRow) => Promise<boolean>;
  /** The computer's own clock (health.now, ms) on the bound computer and folder, read before a deploy: settle's sentAfter. */
  clock: () => Promise<number | null>;
  /** hoody-exec's journal for a write's op id on the bound computer and folder (ops/settle: answers from the journal, never from the
   *  file; an op it never saw is fenced: refused if it comes while the journal keeps it, 8 days). null when not shown, no answer,
   *  or an answer that does not name this op with a state hoody-exec answers. */
  settle: (opId: string, sentAfter: number) => Promise<SettleView | null>;
}
/** A script save core holds (a write sent whose answer was lost, its outcome not known), as the Scripts page shows it: the
 *  write source's held row, the path it saved, its op id (null: a save sent before saves named one) and the computer it went
 *  to. It stays held until a Check proves it, whoever sent it (the New script flow, an editor, a Discarded draft). */
export interface HeldWrite {
  readonly row: HeldRow;
  readonly path: string;
  readonly opId: string | null;
  readonly target: Target;
}
/** What a Check of a held save found, the hold freed: `saved` (the kit's op journal: committed), `not_sent` (fenced: never
 *  admitted, and now never can be) or `refused` (the kit refused it, its code). Or `kept`: IN_PROGRESS (the kit is still on
 *  it), NOT_RECORDED (forgotten: the kit cannot tell, for an op it evicted or, once it has evicted, one it never saw), NO_OP (a save sent before saves named an op: nothing can
 *  be asked), NOT_KNOWN (no answer, or one that proves nothing) or KEPT (core would not free it now, or its list could not
 *  be read). A Check never frees on the file: a script there, or none, proves nothing about whether this save may still
 *  arrive (the revision guard hashes content, so A, B, A lets it land); NOT_RECORDED and NO_OP leave the
 *  person's warned Stop tracking. */
export type HeldWriteCheck =
  | { outcome: 'saved' }
  | { outcome: 'not_sent' }
  | { outcome: 'refused'; code: string }
  | { outcome: 'kept'; code: 'NOT_KNOWN' | 'IN_PROGRESS' | 'NOT_RECORDED' | 'NO_OP' | 'KEPT' };

const heldWriteOf = (row: HeldRow): HeldWrite | null => {
  const id = (row.identity && typeof row.identity === 'object' ? row.identity : {}) as Record<string, unknown>;
  const t = row.target as Target | null;
  return typeof id.path === 'string' && execOf(id.path) !== null && t?.container?.id && t.project?.id
    ? { row, path: id.path, opId: typeof id.opId === 'string' && id.opId ? id.opId : null, target: t }
    : null;
};

/**
 * The person's Check of one held save: the kit's own answer for the save's op, on the save's own computer (ops/settle,
 * sentAfter 0, as the editor's Check asks it). It answers from the op journal, never from the file, so it proves this op
 * alone whatever else is held of the path. Committed, fenced or refused free it, by its own token (settleHeld: that send
 * only, key kept), after a clean read of the shared store. Anything else keeps it and reads nothing: in progress, forgotten
 * (no fence, so it may still arrive), no op to ask, or an answer that proves nothing. Nothing is ever sent again.
 */
export async function checkHeldWrite(
  deps: {
    settle: (target: Target, path: string, opId: string) => Promise<SettleView>;
    heldAt: (target: Target, path: string) => readonly HeldRow[] | null;
    free: (row: HeldRow) => Promise<boolean>;
  },
  h: HeldWrite,
): Promise<HeldWriteCheck> {
  if (h.opId === null) return { outcome: 'kept', code: 'NO_OP' };
  const v = await deps.settle(h.target, h.path, h.opId);
  if (v.state === 'checking') return { outcome: 'kept', code: 'IN_PROGRESS' };
  if (v.state === 'done' || v.state === 'not_sent' || v.state === 'failed') {
    if (deps.heldAt(h.target, h.path) === null || !(await deps.free(h.row))) return { outcome: 'kept', code: 'KEPT' };
    return v.state === 'done' ? { outcome: 'saved' } : v.state === 'not_sent' ? { outcome: 'not_sent' } : { outcome: 'refused', code: v.code };
  }
  return { outcome: 'kept', code: v.state === 'unknown' && v.forgotten ? 'NOT_RECORDED' : 'NOT_KNOWN' };
}

/** One ops/settle answer for exactly the op asked: the kit's reply names its opId, one state
 *  (`state`, or `outcome` naming the same one: conflicting fields prove nothing) and, per state, what it must carry: a
 *  freeing answer its time (`at`), committed a revision (string or null), refused its code. Only the checked fields are
 *  passed on (settleView reads `outcome` first). Anything else, a mismatched or truncated reply included, proves nothing
 *  (unknown, not forgotten), so it frees nothing and reads no file. */
export function settleAnswerFor(raw: unknown, opId: string): SettleView {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const nothing: SettleView = { state: 'unknown', forgotten: false };
  if (!r || r.opId !== opId) return nothing;
  if (r.state !== undefined && r.outcome !== undefined && r.state !== r.outcome) return nothing;
  const state = r.state ?? r.outcome;
  if (typeof state !== 'string' || !['committed', 'refused', 'in_progress', 'fenced', 'forgotten', 'unknown'].includes(state)) return nothing;
  const frees = state === 'committed' || state === 'refused' || state === 'fenced';
  if (frees && !(typeof r.at === 'string' && r.at)) return nothing;
  if (state === 'committed' && !(typeof r.revision === 'string' || r.revision === null)) return nothing;
  if (state === 'refused' && !(typeof r.code === 'string' && r.code)) return nothing;
  return settleView({ state, ...(state === 'committed' ? { revision: r.revision as string } : {}), ...(state === 'refused' ? { code: r.code as string } : {}) });
}

/** Every script save core holds, of every computer this view shows (core's realm filter), oldest first, and their Check. The
 *  page shows them wherever the person comes from: Home's Needs you, or /scripts on their own. `unnamed`: held saves that
 *  name no script (an older build's record, converted without its identity): no read can prove them, so the person's warned
 *  Stop tracking (core's dismissHeld) is their only way out. */
export function useHeldWrites(): { rows: HeldWrite[]; unnamed: HeldRow[]; check: (h: HeldWrite) => Promise<HeldWriteCheck>; dismiss: (row: HeldRow) => Promise<boolean> } {
  useChangesVersion();
  const writeM = useWrite();
  const settleM = useSettle();
  let all: readonly HeldRow[] = [];
  try { all = writeM.held(); } catch { all = []; }
  const rows = all.map(heldWriteOf).filter((x): x is HeldWrite => x !== null);
  const unnamed = all.filter((r) => heldWriteOf(r) === null);
  const check = (h: HeldWrite): Promise<HeldWriteCheck> => checkHeldWrite({
    // The op's answer from the computer the save went to (its target), never the one the shell shows now: another computer
    // would fence an op it was never sent. A lost, refused or malformed settle proves nothing (settleAnswerFor: unknown).
    settle: async (target, path, opId) => {
      try {
        // A settle is itself a guarded send: one whose answer was lost (a computer that did not answer) stays held, and core
        // refuses the next one (READ_BACK_FIRST) until a read-back proves it changed nothing (proves NOTHING_CHANGED). This
        // settle's own held send, if any, is read back first (only it, as the page's own settle: none held reads
        // nothing, another settle's read-back is never waited for), so a Check after the computer is back asks again
        // instead of answering "not known" for good.
        const vars = { compId: target.container.id, opId, sentAfter: 0, target, exec: execOf(path) ?? EXEC_DEFAULT };
        const own = await settleM.holdOf(vars).catch(() => undefined);
        if (own) await (settleM.readBack as ReadBackOne)({ hold: own }).catch(() => false);
        const r = await settleM.mutateAsync(vars);
        return settleAnswerFor(r?.data ?? null, opId);
      } catch { return settleAnswerFor(null, opId); }
    },
    // A clean read of the shared store before the free (another tab's holds merged first; unreadable: kept).
    heldAt: (target, path) => {
      try {
        if (!mergeStoredChanges()) return null;
        return writeM.held().filter((r) => { const w = heldWriteOf(r); return !!w && w.path === path && sameComputer(w.target, target); });
      } catch { return null; }
    },
    free: async (row) => { try { return await writeM.settleHeld(row); } catch { return false; } },
  }, h);
  const dismiss = async (row: HeldRow): Promise<boolean> => { try { return await writeM.dismissHeld(row); } catch { return false; } };
  return { rows, unnamed, check, dismiss };
}
const NO_BINDING = { outcome: 'not_sent', code: 'NOT_SHOWN' } as const;
/** The ops/settle states hoody-exec answers. */
const SETTLED: readonly string[] = ['committed', 'refused', 'in_progress', 'unknown', 'fenced', 'forgotten'];
export function useBoundSends(b: Binding | null): BoundSends {
  const shown = useCurrentComputer();
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const writeM = useWrite(), instM = useInstantiate(), settleM = useSettle();
  const validate = useValidate().mutateAsync, resolve = useResolve().mutateAsync, write = writeM.mutateAsync, instantiate = instM.mutateAsync;
  // Every send goes to core, which first refuses one whose change is held (READ_BACK_FIRST, BUSY, HELD_BY_OTHER) and then checks
  // `still` at the moment the request would go out (after the change lock's wait and anything else before it): a computer not
  // shown, at the call or at any point after, leaves it not sent. The page never answers for core (only with no binding at
  // all). A held refusal keeps its code; any other not_sent across a switch reads NOT_SHOWN. One already sent keeps its own
  // outcome. No not_sent frees a draft's deploy reservation (deploy.ts): it is shown with Try again or Discard.
  const gate = useCallback(<T,>(send: (bb: Binding, still: () => boolean) => Promise<unknown>): Promise<Sent<T>> => {
    if (!b) return Promise.resolve(NO_BINDING);
    const still = (): boolean => sameComputer(shownRef.current, b.target);
    return (send(b, still) as Promise<Sent<T>>).then((r) => (r?.outcome === 'not_sent' && !still() && !HELD_CODES.includes(r.code ?? '') ? { ...r, code: 'NOT_SHOWN' } : r));
  }, [b]);
  return {
    shown: !!b && sameComputer(shown, b.target),
    validate: (code) => gate((bb, still) => validate({ code, exec: bb.exec, target: bb.target, still })),
    resolve: (path, omit) => gate((bb, still) => resolve({ path, ...(omit === undefined ? {} : { omit }), exec: bb.exec, target: bb.target, still })),
    write: (v) => gate((bb, still) => write({ ...v, compId: compIdOf(bb), target: bb.target, still })),
    instantiate: (v) => gate((bb, still) => instantiate({ ...v, compId: compIdOf(bb), realm: bb.realm, target: bb.target, still })),
    exists: async (path) => {
      if (!b || !sameComputer(shownRef.current, b.target)) return null;
      return readScriptAt(b, path, () => sameComputer(shownRef.current, b.target));
    },
    // The deploy's own held send, by the op id or Idempotency-Key its shown identity names, on this computer.
    heldOf: async (kind, path, opId) => {
      if (!b || !sameComputer(shownRef.current, b.target)) return undefined;
      try {
        return (kind === 'write' ? writeM : instM).held().find((h) => {
          const id = (h.identity && typeof h.identity === 'object' ? h.identity : {}) as Record<string, unknown>;
          return id.path === path && (kind === 'write' ? id.opId : id.idem) === opId && !!h.target && sameComputer(h.target as Target, b.target);
        });
      } catch { return undefined; }
    },
    heldAt: async (kind, path) => {
      if (!b || !sameComputer(shownRef.current, b.target)) return null;
      try {
        return (kind === 'write' ? writeM : instM).held().filter((h) => {
          const id = (h.identity && typeof h.identity === 'object' ? h.identity : {}) as Record<string, unknown>;
          return id.path === path && !!h.target && sameComputer(h.target as Target, b.target);
        });
      } catch { return null; }
    },
    release: async (kind, hold) => {
      if (!b || !sameComputer(shownRef.current, b.target)) return false;
      try { return await (kind === 'write' ? writeM : instM).settleHeld(hold); } catch { return false; }
    },
    clock: async () => {
      if (!b || !sameComputer(shownRef.current, b.target)) return null;
      try { return caps(await api(R.health, { ctx: capture(b.target), target: b.target, index: b.exec, still: () => sameComputer(shownRef.current, b.target) } as never)).now; } catch { return null; }
    },
    settle: async (opId, sentAfter) => {
      if (!b || !sameComputer(shownRef.current, b.target)) return null;
      try {
        // A settle is itself a guarded send: one whose own answer was lost stays held, and core refuses the next (READ_BACK_FIRST)
        // until a read-back proves it changed nothing. So this settle's own held send, if any, is read back
        // first (only it: none held reads nothing, and another settle's read-back is never waited for), then the
        // op is asked again.
        const vars = { compId: compIdOf(b), opId, sentAfter, target: b.target, exec: b.exec, still: () => sameComputer(shownRef.current, b.target) };
        const own = await settleM.holdOf(vars).catch(() => undefined);
        if (own) await (settleM.readBack as ReadBackOne)({ hold: own }).catch(() => false);
        const r = await settleM.mutateAsync(vars);
        // Only an answer about this op proves anything: its own opId and a known state, a committed one naming
        // its path; a truncated, wrong-op or malformed answer is no answer.
        const a = r?.data as { opId?: unknown; state?: unknown; path?: unknown; revision?: unknown; code?: unknown } | null | undefined;
        if (!a || a.opId !== opId || typeof a.state !== 'string' || !SETTLED.includes(a.state) || (a.state === 'committed' && typeof a.path !== 'string')) return null;
        // Only the checked state is mapped (settleView reads `outcome` first, which ops/settle never sends).
        return settleView({ state: a.state, ...(typeof a.revision === 'string' ? { revision: a.revision } : {}), ...(typeof a.code === 'string' ? { code: a.code } : {}) });
      } catch { return null; }
    },
  };
}

/**
 * The New script build API: each attempt of a draft is its own ask, at place `new:<draftId>.<n>` on the bound computer, so
 * Build again never continues the attempt before it. Every call goes to the binding's computer, and only while the Hub shows it:
 * the shown computer is read at the moment of the call, so a switch between the press and the send leaves it not sent.
 * No claim on delivery: a build's record stays stored until a deploy, Discard or a replacing attempt closes it.
 */
export interface BuildApi {
  start: (b: Binding, draftId: string, n: number, text: string, values?: unknown) => Promise<AiAnswer>;
  /** Read the attempt again (its turn is never sent again); null when no ask of it is stored. */
  check: (b: Binding, draftId: string, n: number) => Promise<AiAnswer | null>;
  /** Stop the attempt's running turn. false: nothing to stop or refused; 'unknown': the stop may have been taken (C9). */
  cancel: (b: Binding, draftId: string, n: number) => Promise<boolean | 'unknown'>;
  /** The knowing close of the attempt: 'unknown' when the store could not show it removed. */
  discard: (b: Binding, draftId: string, n: number) => Promise<'ok' | 'unknown'>;
}
const NOT_SHOWN: AiAnswer = { outcome: 'not_sent', code: 'NOT_SHOWN' };
export const placeOfAttempt = (b: Binding, draftId: string, n: number): Place => ({ compId: compIdOf(b), path: attemptPath(b.target.project.id, draftId, n), realm: b.realm, owner: b.owner });
const BAD_PROJECT: AiAnswer = { outcome: 'not_sent', code: 'BAD_PROJECT' };
const NOT_CURRENT: AiAnswer = { outcome: 'not_sent', code: 'NOT_CURRENT' };
/** Attempt n is still its draft's current attempt: the draft open, nothing reserved after it (an unreadable store shows neither). */
const attemptCurrent = (draftId: string, n: number): boolean => { const r = readDraftRecord(draftId); return r !== null && r !== 'unreadable' && r.state === 'open' && r.current === n; };

function useLiveBuildApi(): BuildApi {
  const shown = useCurrentComputer();
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const signal = useViewSignal();
  // The binding's send condition, read live: core asks it before each request of the ask goes out (create, turn, every read).
  const stillOf = (b: Binding) => (): boolean => sameComputer(shownRef.current, b.target);
  return useMemo<BuildApi>(() => ({
    start: async (b, draftId, n, text, values) => {
      if (!projectOk(b.target.project.id)) return BAD_PROJECT;
      // Also only while the attempt is its draft's current one: a Discard or Build again from another tab after this tab reserved
      // it leaves the create and the turn unsent, whenever it lands before them.
      const shownStill = stillOf(b);
      if (!shownStill()) return NOT_SHOWN;
      if (!attemptCurrent(draftId, n)) return NOT_CURRENT;
      const still = (): boolean => shownStill() && attemptCurrent(draftId, n);
      return sendAsk(b.target, { compId: compIdOf(b), path: attemptPath(b.target.project.id, draftId, n), text, realm: b.realm, owner: b.owner, ...(values === undefined ? {} : { values }) }, signal, still);
    },
    check: async (b, draftId, n) => {
      if (!projectOk(b.target.project.id)) return BAD_PROJECT;
      const still = stillOf(b);
      return still() ? checkAsk(b.target, placeOfAttempt(b, draftId, n), signal, still) : NOT_SHOWN;
    },
    cancel: async (b, draftId, n) => {
      const still = stillOf(b);
      if (!projectOk(b.target.project.id) || !still()) return false;
      const rec = runAt(b.target, placeOfAttempt(b, draftId, n));
      return rec?.sid && rec.turnId ? cancelTurn({ ctx: rec.ctx, target: b.target, realm: b.realm, still }, rec.sid, rec.turnId) : false;
    },
    discard: (b, draftId, n) => closeAsk(placeOfAttempt(b, draftId, n)),
  }), [signal]);
}

/** The fixture twin: the fixture assistant answers each start; nothing is stored, so check/cancel find nothing. */
function useFixtureBuildApi(): BuildApi {
  const shown = useCurrentComputer();
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const m = source.useMutation<{ reply: string }, AiVars>('aiTurn');
  const mutate = m.mutateAsync;
  return useMemo<BuildApi>(() => ({
    start: async (b, draftId, n, text) => (!projectOk(b.target.project.id) ? BAD_PROJECT : sameComputer(shownRef.current, b.target) ? ((await mutate({ compId: compIdOf(b), path: attemptPath(b.target.project.id, draftId, n), text, realm: b.realm, owner: b.owner })) as unknown as AiAnswer) : NOT_SHOWN),
    check: async () => null,
    cancel: async () => false,
    discard: async () => 'ok',
  }), [mutate]);
}

export function useBuildApi(): BuildApi {
  // The mode is fixed at boot, so every render runs the same hooks.
  const use = fixtureModeActive() ? useFixtureBuildApi : useLiveBuildApi;
  return use();
}

/** The gateway's buffered event window of a live session (GET /sessions/:sid/replay): resume a stream from maxSeq in incarnation. */
export interface ReplayWindow { events: unknown[]; minSeq: number; maxSeq: number; incarnation: string; pendingGate: unknown }

/**
 * A stored build's reads, on the computer of its record (an explicit target built from the containers row): they work for any
 * computer, shown or not, and are never gated on the shown one (Being built lists every computer's builds). 'unreadable': the
 * read failed or its answer is not the shape asked for; it proves nothing.
 */
export interface StoredBuildReads {
  receipt: (b: Binding, sid: string, turnId: string) => Promise<Receipt | null | 'unreadable'>;
  session: (b: Binding, sid: string) => Promise<Record<string, unknown> | 'unreadable'>;
  state: (b: Binding, sid: string) => Promise<Record<string, unknown> | 'unreadable'>;
  transcript: (b: Binding, sid: string) => Promise<unknown>;
  replay: (b: Binding, sid: string) => Promise<ReplayWindow | 'unreadable'>;
  /** A held deploy's fresh read of its script on the row's own computer (readScriptAt); absent: not read (not known). */
  script?: (b: Binding, path: string) => Promise<boolean | null | NoAnswer>;
}
const SID = /^[A-Za-z0-9._~-]{1,128}$/;
async function readAt(b: Binding, route: Parameters<typeof api>[0], params: Record<string, string>): Promise<unknown> {
  if (!Object.values(params).every((v) => SID.test(v))) throw { kind: 'not_sent', notSent: true, code: 'BAD_ID' };
  return api(route, { ctx: capture(b.target), target: b.target, realm: b.realm, params } as never);
}
const isPlain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const int = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null);
/** GET /sessions/:sid: the gateway's read, whose `session` object names the session asked for. */
export function sessionReadOf(x: unknown, sid: string): Record<string, unknown> | 'unreadable' {
  return isPlain(x) && isPlain(x.session) && x.session.id === sid ? x : 'unreadable';
}
/** GET /sessions/:sid/state: the snapshot of the session asked for, with its coarse state. */
export function sessionStateOf(x: unknown, sid: string): Record<string, unknown> | 'unreadable' {
  return isPlain(x) && x.session_id === sid && typeof x.state === 'string' && typeof x.live === 'boolean' ? x : 'unreadable';
}
/** A turn receipt of exactly the turn asked for; null when it is not a receipt (as receiptOf), 'unreadable' for another turn's. */
export function receiptFor(x: unknown, turnId: string): Receipt | null | 'unreadable' {
  const r = receiptOf(x);
  return r && r.turnId !== turnId ? 'unreadable' : r;
}
/**
 * GET /sessions/:sid/replay: the session asked for, a non-empty incarnation, and a consistent window. The gateway's empty ring is
 * min_seq = max_seq + 1 with no events (a fresh one is 1 and 0). A non-empty ring is the gateway's contiguous buffer: every
 * entry an object with an integer seq, each the one before plus 1 (no gap), the first at min_seq and the last at max_seq, its incarnation (when it names
 * one) the window's, and its event an object (as the agent's gateway sends it). Anything else cannot be replayed from.
 */
export function replayWindowOf(x: unknown, sid?: string): ReplayWindow | 'unreadable' {
  const o = rec(x);
  const minSeq = int(o.min_seq), maxSeq = int(o.max_seq);
  if (sid !== undefined && o.session_id !== sid) return 'unreadable';
  if (!Array.isArray(o.events) || minSeq === null || maxSeq === null || typeof o.incarnation !== 'string' || !o.incarnation) return 'unreadable';
  const empty = maxSeq + 1 === minSeq;
  if (empty ? o.events.length !== 0 : maxSeq < minSeq || o.events.length > maxSeq - minSeq + 1) return 'unreadable';
  let last = minSeq - 1;
  for (const e of o.events as unknown[]) {
    const seq = isPlain(e) ? int(e.seq) : null;
    if (!isPlain(e) || seq === null || seq !== last + 1 || seq > maxSeq || !isPlain(e.event) || (e.incarnation !== undefined && e.incarnation !== o.incarnation)) return 'unreadable';
    last = seq;
  }
  const first = (o.events as Array<Record<string, unknown>>)[0];
  if (!empty && (!first || first.seq !== minSeq || last !== maxSeq)) return 'unreadable';
  if (o.pending_gate !== undefined && o.pending_gate !== null && !isPlain(o.pending_gate)) return 'unreadable';
  return { events: o.events, minSeq, maxSeq, incarnation: o.incarnation, pendingGate: o.pending_gate ?? null };
}
export const storedBuildReads: StoredBuildReads = {
  receipt: async (b, sid, turnId) => { try { return receiptFor(await readAt(b, R.turnRead, { sid, tid: turnId }), turnId); } catch { return 'unreadable'; } },
  session: async (b, sid) => { try { return sessionReadOf(await readAt(b, R.session, { sid }), sid); } catch { return 'unreadable'; } },
  state: async (b, sid) => { try { return sessionStateOf(await readAt(b, R.sessionState, { sid }), sid); } catch { return 'unreadable'; } },
  transcript: async (b, sid) => { try { return await readAt(b, R.transcript, { sid }); } catch { return 'unreadable'; } },
  replay: async (b, sid) => { try { return replayWindowOf(await readAt(b, R.replay, { sid }), sid); } catch { return 'unreadable'; } },
  script: (b, path) => readScriptAt(b, path),
};

/**
 * Where one attempt stands, read from its stored record and its session on the record's computer (read-only: nothing is sent,
 * claimed or closed). 'unknown' (C9) whenever a read cannot say: the store unreadable, no turn yet (it may be out), a receipt
 * or a transcript that cannot be read. A completed turn whose answer holds no usable script is 'no_script', never ready. There is
 * no time limit: a long build stays running for as long as its receipt says so (the caller keeps reading).
 */
export type BuildStatus =
  | { kind: 'none' }
  | { kind: 'running' }
  | { kind: 'ready'; reply: string; prompt: string | null }
  | { kind: 'no_script'; prompt: string | null }
  | { kind: 'failed'; code: string }
  | { kind: 'unknown'; why: 'store' | 'not_started' | 'receipt' | 'reply' };
const RUNNING = ['accepted', 'dispatched'];
export async function buildStatus(b: Binding, draftId: string, n: number): Promise<BuildStatus> {
  const stored = storedAsk(placeOfAttempt(b, draftId, n));
  if (stored === 'unreadable') return { kind: 'unknown', why: 'store' };
  if (stored === null) return { kind: 'none' };
  if (!stored.sessionId || !stored.turnId) return { kind: 'unknown', why: 'not_started' };
  const r = await storedBuildReads.receipt(b, stored.sessionId, stored.turnId);
  if (r === 'unreadable' || r === null) return { kind: 'unknown', why: 'receipt' };
  // Only the ledger's own open states are running; a state this page does not know is not taken for running (C9).
  if (!r.ended) return RUNNING.includes(r.state) ? { kind: 'running' } : { kind: 'unknown', why: 'receipt' };
  if (r.state !== 'completed') return { kind: 'failed', code: r.code };
  const tr = await storedBuildReads.transcript(b, stored.sessionId);
  const reply = replyOf(tr);
  if (reply.kind === 'unreadable') return { kind: 'unknown', why: 'reply' };
  const prompt = userPromptOf(tr);
  if (reply.kind === 'none' || 'error' in extract(reply.text, true)) return { kind: 'no_script', prompt };
  return { kind: 'ready', reply: reply.text, prompt };
}

/**
 * The stored user prompt of one attempt, whatever its turn's state (running, failed or completed): a reload restores the draft's
 * inputs from it (recover.ts) without waiting for the turn to end. 'none': no stored ask names that attempt; 'unreadable'
 * (C9) when the store, the session or its transcript cannot say yet, or the turn has not been sent (its prompt may be out).
 */
export async function attemptPrompt(b: Binding, draftId: string, n: number): Promise<{ text: string } | 'none' | 'unreadable'> {
  const stored = storedAsk(placeOfAttempt(b, draftId, n));
  if (stored === 'unreadable') return 'unreadable';
  if (stored === null) return 'none';
  if (!stored.sessionId) return 'unreadable';
  const text = userPromptOf(await storedBuildReads.transcript(b, stored.sessionId));
  return text === null ? 'unreadable' : { text };
}

/** A Being built row's Stop: the row's captured computer, realm and turn, whatever the Hub shows; no pause rule applies. */
export const stopStoredBuild = (b: Binding, sid: string, turnId: string): Promise<boolean | 'unknown'> => cancelTurn({ target: b.target, realm: b.realm }, sid, turnId);

/**
 * The binding of a stored build from its record and the account's containers read. null: the computer is missing from a WHOLE
 * list (it is gone); 'unknown': the read is missing, failed or not the whole list, so a missing computer proves nothing yet, or
 * the record itself cannot name its computer (no realm or owner, an attempt path that does not read back): it is never taken
 * for gone. The record's realm and owner are used exactly as stored. An attempt record names its project in its path: only the
 * row of that project and container is its computer (another project's container of the same id is not).
 */
export function bindingOfRecord(r: { compId: string; path?: string | null; realm: string | null; owner: string | null; exec?: number }, computers: unknown): Binding | null | 'unknown' {
  if (!r.realm || !r.owner) return 'unknown';
  const att = typeof r.path === 'string' && r.path.startsWith('new:') ? attemptOf(r.path) : undefined;
  if (att === null) return 'unknown';
  const body = rec(computers).data ? rec(rec(computers).data) : rec(computers);
  if (!Array.isArray(body.computers)) return 'unknown';
  const rows = (body.computers as unknown[]).map(rec);
  // An attempt record whose container id is listed without a project cannot be told apart from another project's: can't tell yet.
  if (att && rows.some((c) => str(c.id) === r.compId && !str(c.project_id))) return 'unknown';
  // A record with no attempt path names no project: the same container id listed more than once (two projects) cannot be told
  // apart, so nothing is addressed to either (can't tell yet, never the first row).
  if (!att && rows.filter((c) => str(c.id) === r.compId).length > 1) return 'unknown';
  const row = rows.find((c) => str(c.id) === r.compId && (!att || str(c.project_id) === att.project));
  if (!row) {
    const pages = rec(body.pagination).totalPages;
    const whole = typeof pages === 'number' ? pages <= 1 : (body.computers as unknown[]).length < 100;
    return whole ? null : 'unknown';
  }
  const project = str(row.project_id);
  if (!project) return 'unknown';
  return { target: { project: { id: project }, container: { id: r.compId, ...(str(row.server_name) ? { server_name: str(row.server_name) } : {}) } }, realm: r.realm, owner: r.owner, exec: r.exec ?? EXEC_DEFAULT };
}

export const useAliasCreate = () => source.useMutation<unknown, { compId: string; target: string; alias?: string; exec: number }>('aliasCreate');
export const useAliasState = () => source.useMutation<unknown, { id: string; enabled: boolean }>('aliasState');
export const useAliasRemove = () => source.useMutation<unknown, { id: string }>('aliasRemove');
export const useSettle = () => source.useMutation<{ outcome: string; revision?: string }, { compId: string; opId: string; sentAfter: number; target?: Target; exec: number; still?: () => boolean }>('settle');
