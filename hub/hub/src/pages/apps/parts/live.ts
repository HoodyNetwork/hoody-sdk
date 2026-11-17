// Live Apps: Open, Stop, Check and Restart through core's run-open machine (useRunOpen), the same step machine
// the SDK and the CLI run. The page never builds a kit request itself.
//
// Contract (C9):
//   - The machine owns replays; this file never repeats a request. A result with state 'unknown' (or none, and
//     not provably unsent) is "may have gone through": the row says so and offers Check, never a second copy.
//   - A launch the core admitted joins the recent list (recent.ts: handle and names only) the moment its handle
//     is known, so a reload or another tab can still Stop or Check it.
//   - An access code is held in ops (memory) only; the machine's copy is blanked once read. Settings' values
//     ride only in the open request (blanked after it) and a source-warming rerun of it; nothing keeps them.
//   - Every write is fenced: an account or realm switch resets ops (a new epoch) and a request begun before it
//     writes nothing after. Reads of a row are fenced by a per-row counter: a Stop makes earlier reads stale,
//     and only the latest read writes.
//
// Files launches: a marked launch (Item.p, its row's p) is sent only as the request
// openWith's toLaunch built (sealLaunch), never re-run by itself, and relaunched only through recoveryFor. Every
// read, watch and Stop of it carries its own launch tag (expectTag), so a record of another launch at a reused
// number is never taken for it. The account's Open-with holds that carry a handle are listed as rows too, so a hold
// outlives the recent list (its cap, a refused save). A hold matches a row only by its whole identity (owKey: place,
// command and launch tag); the matching row takes the hold's marker, whatever the recent list says, and is read
// again with its tag (an earlier untagged read proves nothing). Every row a hold matches is linked to that hold by its
// id and follows it: a row of a handle the hold no longer names is off the list (a superseded command), and a row
// listed only for the hold goes once the hold is gone. A free started here keeps its rows until it answered (a
// pending free hides the hold from heldAttempts at once): every Open-with free goes through freeHold. A row listed
// only for a hold is dropped as an alias once this tab's own (shown) launch binds the same handle. A hold-backed row
// leaves the list on the person's Remove only once its free answered 'freed' (liveRemoveHold).
//
// Leftover terminals: a refusal after the create, or a confirmed stop, whose terminal the machine could not
// prove closed carries a leftover. Its row says so (terminal_left) and keeps it as a stored row with no command (left),
// so a reload or another tab lists it too; it is never read, watched or stopped, and leaves the list only on a Remove
// whose discard (that terminal's DELETE alone) proved it closed (liveRemove). A leftover is kept whatever happened while
// its Open or Stop was out: a Forget shows the row again; an account or realm switch stores it in the launch's own
// account's list (held in this tab's memory until that account is shown again when another one is shown now).
import {
  attemptFor, buildPortUrl, can, capture, heldAttempts, onAuthPurge, subscribeAttempts, useCore, useCurrentComputer, useRunOpen,
  type AttemptHold, type HeldAttempt, type OpenRequest, type RunHandle, type RunOpen, type RunProgress, type RunResult, type Target,
} from '@core';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { DIR_VAR, FILE_VAR, PRE_CMD_DIR, PRE_CMD_FILE, SCRIPT_DIR, SCRIPT_FILE, SCRIPT_HERE, SCRIPT_RUN } from '../launch/openWith/argv';
import { proves } from '../launch/openWith/facts';
import { FIND_SOURCES, type Item, type LaunchState, type OpenApp, type Opens, candidateOf, heldOpen, marked, sameApp, view } from '../logic';
import { arriving } from './arrival';
import { ops, type Patch } from './ops';
import { ackShares, addRecent, fromHandle, leftRow, loadRecent, OW_BY, owKey, owRunOf, recentFor, recentKey, removeRecent, saveRecent, toHandle, wireOpensIn, type StoredRow } from './recent';
import { listenStorage } from './live.web';

export const REFRESH_MS = 15000;
const WATCH_MS = 10 * 60000;
const WARM_MS = 10000;
const WARM_TRIES = 6;
const RETRY_AFTER_MAX_MS = 5 * 60000;

export interface LiveCtx {
  m: RunOpen | null;
  target: Target | null;
}
export interface OpenOpts {
  args?: string[];
  env?: Record<string, string>;
  opensIn?: Opens;
  /** The folder the program runs in (Launch an app here). */
  cwd?: string;
  /** The launch terminal's shell pinned to bash (Files script launches). */
  shell?: 'bash';
  /** Awaited before each new command id leaves (the Open-with ledger's barrier). */
  beforeExecute?: (h: RunHandle) => Promise<boolean>;
}

/** The exec permission: launches need it at the entry, Restart before its Stop. */
const EXEC = 'computers.actions.exec';
/** What a hold's free answers ('freed', 'refused' or 'unresolved'). */
export type AttemptFree = Awaited<ReturnType<AttemptHold['free']>>;

/** Where a recovery runs: the machine and Open of the place pressing Restart or Open again now (never the ones of
 *  the press that made the row: that place may be gone, its machine aborted, or showing another computer). */
export interface RecoverAt {
  live: LiveCtx;
  launch: (item: Item, o: OpenOpts) => void;
  /** That place is still there and still shows the computer it showed at the press (read again after each wait). */
  shows: () => boolean;
}
/** What a Restart of a marked row needs before anything is stopped: `prepare` checks and claims (a new hold
 *  for ledger purposes), and refuses unless `at` is on the row's own computer with a machine. Refused: nothing is
 *  stopped (`kept`: what it had claimed could not be cleared). Admitted: `go` starts the new launch through `at`;
 *  `unsent` is the unsent cleanup of whatever `prepare` claimed, for every exit before the new launch (its result is
 *  checked). */
export interface Recovery {
  prepare(at: RecoverAt): Promise<{ ok: true; go: () => void; unsent: () => Promise<AttemptFree | 'none'> } | { ok: false; kept?: boolean }>;
}
/** The computer a recovery was made for, as ids. */
export interface RecoverFor { project: string; computer: string }
/** `at` is on that computer, with a machine. */
export const recoverHere = (at: RecoverAt, on: RecoverFor): boolean =>
  at.shows() && !!at.live.m && at.live.target?.project.id === on.project && at.live.target?.container.id === on.computer;

/** The unsent cleanup of a hold whose launch never left: the sending stamp ends first (a free refuses while it
 *  is live), then the versioned free; anything but 'freed' leaves the hold (shown, never dropped silently). */
export async function unsentCleanup(hold: AttemptHold, ver: number): Promise<AttemptFree> {
  hold.sent();
  return hold.free('done', { metaVersion: ver });
}

// Module state, like ops: a remount keeps following the same launches.
const watches = new Map<string, AbortController>();
const reads = new Map<string, number>();
/** The item each launch was opened from, so Retry opens the same app the same way. Settings' values are not
 *  kept (a Retry opens without them; Options asks again). */
const items = new Map<string, { item: Item; o: OpenOpts; reopen: boolean }>();
/** The plans of this session's marked rows (openWith registers them), by row key: memory only, dropped on an account
 *  or realm switch. */
const recoveries = new Map<string, Recovery>();
/** Every row an Open-with hold matches: row key → the hold's id, the identity it matched (owKey) and whether the row
 *  is listed only for the hold (no recent row, not this tab's launch). */
const holdRows = new Map<string, { id: string; ow: string; ledger: boolean }>();
/** The Open-with frees started here and not answered yet: hold id → the hold as it was and its run. */
const pendingFree = new Map<string, { h: HeldAttempt; run: StoredRow | null }>();
type FreeKind = Parameters<AttemptHold['free']>[0];
/** Frees an Open-with hold (every free of one goes through here, openWith's included): until it answers, its rows keep
 *  holding as if the hold were still listed. */
export async function freeHold(h: HeldAttempt, run: StoredRow | null, kind: FreeKind, metaVersion: number): Promise<AttemptFree> {
  const hold = attemptFor(h.id, OW_BY);
  if (!hold) return 'refused';
  pendingFree.set(h.id, { h, run });
  try {
    return await hold.free(kind, { metaVersion });
  } catch {
    return 'unresolved';
  } finally {
    pendingFree.delete(h.id);
  }
}
/** The requests openWith's toLaunch built, as they were when built: only these marked items are ever sent, and only
 *  with that request (the dispatch guard). A copy is kept, so a change to the item or its options afterwards
 *  changes nothing that is sent. */
interface Sealed { o: OpenOpts; req: OpenRequest; candidate?: string; recovery?: Recovery }
const sealed = new WeakMap<Item, Sealed>();
const copyOpts = (o: OpenOpts): OpenOpts => ({
  ...(o.args ? { args: [...o.args] } : {}), ...(o.env ? { env: { ...o.env } } : {}), ...(o.opensIn ? { opensIn: o.opensIn } : {}),
  ...(o.cwd ? { cwd: o.cwd } : {}), ...(o.shell ? { shell: o.shell } : {}), ...(o.beforeExecute ? { beforeExecute: o.beforeExecute } : {}),
});
const copyReq = (r: OpenRequest): OpenRequest => structuredClone(r);
/** Seals a marked item and its options as built by toLaunch (openWith/plan.ts only). `candidate`: a Files script
 *  launch's own identity (owCandidate), which its row holds by. `recovery`: its plan, registered for the row it opens
 *  into (Restart and Open again). */
export function sealLaunch(item: Item, o: OpenOpts = {}, extra: { candidate?: string; recovery?: Recovery } = {}): Item {
  const snap = copyOpts(o);
  sealed.set(item, { o: snap, req: copyReq(openRequest({ ...item }, snap)), ...(extra.candidate ? { candidate: extra.candidate } : {}), ...(extra.recovery ? { recovery: extra.recovery } : {}) });
  return item;
}
const FILES_VARS = ['HUB_OPEN_FILE', 'HUB_OPEN_DIR'];
/** Each script purpose's fixed scripts (or, for an Other command, preambles), each with the one staged variable it reads. */
const PURPOSE_SCRIPTS: Record<string, readonly (readonly [string, string, boolean])[]> = {
  tpl: [[SCRIPT_FILE, FILE_VAR, false], [SCRIPT_DIR, DIR_VAR, false]],
  run: [[SCRIPT_RUN, FILE_VAR, false]],
  here: [[SCRIPT_HERE, DIR_VAR, false]],
  cmd: [[PRE_CMD_FILE, FILE_VAR, true], [PRE_CMD_DIR, DIR_VAR, true]],
};
/** A marked launch's sealed options and request, when they are a launch toLaunch can build: a script purpose runs its
 *  own fixed script (or an Other command's preamble) with the one staged path that script reads, in bash, behind the
 *  ledger's barrier; `apphere` carries its folder. Null: refused. */
function sealedOpts(item: Item): { o: OpenOpts; req: OpenRequest } | null {
  const s = sealed.get(item);
  if (!s) return null;
  const o = s.o;
  const out = { o, req: copyReq(s.req) };
  if (item.p === 'apphere') return o.cwd && s.req.cwd === o.cwd ? out : null;
  const script = o.args?.[0] === '-c' ? o.args[1] : undefined;
  const pair = script !== undefined ? (PURPOSE_SCRIPTS[item.p ?? ''] ?? []).find(([x, , pre]) => (pre ? script.startsWith(x) : script === x)) : undefined;
  const keys = Object.keys(o.env ?? {});
  const staged = !!pair && keys.length === 1 && keys[0] === pair[1] && !!o.env?.[pair[1]] && FILES_VARS.includes(pair[1]);
  return staged && o.shell === 'bash' && !!o.beforeExecute ? out : null;
}
/** Keeps a marked row's plan for Restart and Open again (openWith only). */
export function registerRecovery(key: string, r: Recovery): void {
  recoveries.set(key, r);
  ops.patch(key, { planned: true });
}
/** How a row is started again: unmarked rows as before; a marked row only through its plan, and without one
 *  (after a reload) only from Files: nothing is stopped or sent. */
export function recoveryFor(r: Pick<OpenApp, 'key' | 'p'>): { kind: 'plain' } | { kind: 'plan'; rec: Recovery } | { kind: 'files' } {
  if (!marked(r)) return { kind: 'plain' };
  const rec = recoveries.get(r.key);
  return rec ? { kind: 'plan', rec } : { kind: 'files' };
}
const tagOf = (key: string): string | undefined => {
  const l = rowOf(key);
  const run = ops.get().runs.get(key);
  return l && marked(l) && run ? run.launch_tag : undefined;
};
/** The machine's read options for a row: a marked row's reads act only on a record naming its own tag. */
const tagged = <T extends object>(key: string, o: T): T & { expectTag?: string } => {
  const tag = tagOf(key);
  return tag ? { ...o, expectTag: tag } : o;
};
let notBefore = 0;
let scope: string | null = null;

const ENDED: ReadonlySet<string> = new Set(['stopped', 'exited', 'not_started']);
// Codes that only repeat a state: the row keeps no reason for them.
const STATE_CODES: ReadonlySet<string> = new Set(['started', 'running', 'running_plain', 'ready', 'done', 'exited_error', 'not_started', 'stopped', 'unknown']);
const ended = (r: RunResult | null | undefined): boolean => !!r && ((!!r.state && ENDED.has(r.state)) || r.code === 'terminal_replaced');

/** The row as shown: its launch with this session's patches applied (state and code live in the patches). */
const rowOf = (key: string): OpenApp | undefined => {
  const l = ops.get().launches.find((x) => x.key === key);
  if (!l) return undefined;
  const { busy: _b, accessCode: _a, note: _n, ...p } = ops.get().patches.get(key) ?? {};
  return { ...l, ...p };
};
/** The account and realm shown now (a computer switch keeps them: its launches stay this account's). */
const scopeNow = (): string => {
  const c = capture();
  return `${c.account ?? ''}|${c.realm}`;
};
/** A request's write fence: same epoch (no reset while mounted) and same account and realm (a switch while the
 *  page was unmounted resets nothing), and the row still listed. */
const fence = (key: string): (() => boolean) => {
  const ep = ops.get().epoch;
  const sc = scopeNow();
  return () => ops.get().epoch === ep && scopeNow() === sc && !!rowOf(key) && !ops.get().forgotten.has(key);
};
/** An Open's fence: as `fence`, but a Forget does not stop it. A launch forgotten while in flight still records
 *  its handle and outcome on the hidden row, so an Undo brings back a row that can be read and stopped, never
 *  one stuck at starting. */
const openFence = (key: string): (() => boolean) => {
  const ep = ops.get().epoch;
  const sc = scopeNow();
  return () => ops.get().epoch === ep && scopeNow() === sc && !!rowOf(key);
};
/** Another row of the same app on the same computer that replaces this one: one not over (in
 *  flight, running or unknown), or one opened after it, even if that one has ended since (an Open
 *  the person made and stopped meanwhile is dealt with; the waiting one never starts a copy after it). */
function sibling(key: string, item: Item, reopen: boolean): boolean {
  const s = ops.get();
  const mine = rowOf(key);
  const ident = { ...(item.type === 'starter' ? { catalogId: item.id } : {}), app: item.app || item.name, ...(!reopen && candidateOf(item) ? { candidate: candidateOf(item) } : {}) };
  return s.launches.some((l) => {
    if (l.key === key || l.computer !== mine?.computer || !sameApp(l, ident)) return false;
    const r = rowOf(l.key);
    if (!r) return false;
    if (r.startedAt > (mine?.startedAt ?? 0)) return true;
    return !s.forgotten.has(l.key) && !ENDED.has(r.state);
  });
}
const bump = (key: string): number => {
  const n = (reads.get(key) ?? 0) + 1;
  reads.set(key, n);
  return n;
};
const held = (): number => Math.max(0, notBefore - Date.now());
const afterHold = (): Promise<void> => new Promise((res) => setTimeout(res, held()));

/** Where a row opens, built by core (https only). */
export function urlsFor(target: Target, r: StoredRow): OpenApp['urls'] {
  const n = r.terminal_id;
  const terminal = buildPortUrl(target.project, target.container, 'terminal', n);
  const screen = buildPortUrl(target.project, target.container, 'display', n);
  const web = r.web ? buildPortUrl(target.project, target.container, 'http', r.web.port) : '';
  return { ...(terminal ? { terminal } : {}), ...(screen ? { screen } : {}), ...(web && r.web ? { web: web + (r.web.path || '/') } : {}) };
}

/** The machine's request for an item: a starter opens only as that starter; a search row as its candidate. */
export function openRequest(item: Item, o: OpenOpts, reopen = false): OpenRequest {
  const opensIn = o.opensIn ?? (item.opensIn === 'unknown' ? undefined : item.opensIn);
  const extra = {
    ...(o.args?.length ? { args: [...o.args] } : {}), ...(o.env && Object.keys(o.env).length ? { env: { ...o.env } } : {}),
    ...(o.cwd ? { cwd: o.cwd } : {}), ...(o.shell ? { shell: o.shell } : {}),
  };
  if (item.type === 'starter') return { app: item.id, catalog: true, ...extra };
  // A plain app opened again by name keeps the opening mode chosen in Options (core honours it).
  if (reopen) return { app: item.app || item.name, ...(opensIn && opensIn !== 'web' ? { opensIn: wireOpensIn(opensIn) as 'window' | 'terminal' } : {}), ...extra };
  return {
    app: item.app || item.name,
    pick: { candidate_id: item.id, ...(item.setId ? { set_id: item.setId } : {}) },
    // The resolver opens a web app in its own tab: only a window or a terminal is asked for.
    ...(opensIn && opensIn !== 'web' ? { opensIn: wireOpensIn(opensIn) as 'window' | 'terminal' } : {}),
    ...(item.provider && (FIND_SOURCES as readonly string[]).includes(item.provider) ? { selector: { source: [item.provider] } } : {}),
    ...extra,
  };
}

function facts(r: RunResult): Patch {
  return { ...(typeof r.exit_code === 'number' ? { exitCode: r.exit_code } : {}), ...(r.signal ? { signal: r.signal } : {}), ...(r.ipv6_only ? { ipv6Only: true } : {}) };
}
function stated(state: LaunchState, code: string | undefined): Patch {
  return { state, code: code && !STATE_CODES.has(code) ? code : '' };
}
/** A result's code as a row keeps it: a record that does not name the launch's tag says so. */
const codeOf = (r: RunResult): string | undefined => (r.reason === 'foreign_record' ? 'foreign_record' : r.code);
/** An Open's result: definite only with a state, or provably unsent; anything else may have gone through. */
export function openPatch(r: RunResult): Patch {
  if (r.state) return { ...stated(r.state, r.code), ...facts(r) };
  if (r.notSent) return { state: 'not_started', code: r.leftover ? 'terminal_left' : r.code || 'couldnt_start' };
  return { state: 'unknown', code: r.code && !STATE_CODES.has(r.code) && r.code !== 'couldnt_start' ? r.code : 'start_unconfirmed' };
}
/** A Stop's result: unsent changes nothing; no state means the stop is unconfirmed. */
export function closePatch(r: RunResult): Patch | null {
  if (r.state) return { ...stated(r.state, r.leftover ? 'terminal_left' : codeOf(r)), ...facts(r) };
  if (r.notSent) return null;
  return { state: 'unknown', code: 'stop_unconfirmed' };
}
/** A status read: a transient answer (no answer) changes a known row nothing unless asked to show it. */
export function statusPatch(r: RunResult, prev: OpenApp | undefined, showNoAnswer: boolean): Patch | null {
  if (r.transient || !r.state) {
    const unread = !prev || (prev.state === 'unknown' && prev.code === 'checking');
    return unread || showNoAnswer ? { state: 'unknown', code: r.code === 'access_refused' ? 'access_refused' : 'unreachable' } : null;
  }
  return { ...stated(r.state, codeOf(r)), ...facts(r) };
}

const sameRun = (a: StoredRow, b: StoredRow): boolean => a.terminal_id === b.terminal_id && a.incarnation === b.incarnation && a.command_id === b.command_id;

/** Records an admitted launch's handle on its row and in the recent list (not while the row is forgotten). A
 *  later handle for another run replaces it: the machine's COMMAND_ID_EXISTS retry announces a new command id,
 *  and the last one announced is the one that runs. */
function adopt(c: LiveCtx, key: string, h: RunHandle, more: { name: string; catalogId?: string; app?: string; candidate?: string; asksCode?: boolean; p?: string }): void {
  if (!c.target) return;
  const row = fromHandle(h, more, Date.now());
  if (!row || row.computer.computer_id !== c.target.container.id) return;
  const had = ops.get().runs.get(key);
  if (had && sameRun(had, row)) return;
  const shown = !ops.get().forgotten.has(key);
  if (had) {
    // A read or watch of the old command must never write over the new one's outcome.
    watches.get(key)?.abort();
    watches.delete(key);
    bump(key);
  }
  if (had && shown) saveRecent(removeRecent(loadRecent(), recentKey(had)));
  const kept: StoredRow = had?.asks_code && !row.asks_code ? { ...row, asks_code: true } : row;
  ops.bind(key, kept);
  dropAliases(key, kept);
  if (shown) saveRecent(addRecent(loadRecent(), kept));
  ops.patch(key, { terminal: kept.terminal_id, handle: kept.launch_tag, opensIn: kept.opens_in, urls: urlsFor(c.target, kept), ...(kept.asks_code ? { asksCode: true } : {}) });
}

/** Follows an admitted launch until the core settles it; a Stop aborts it. */
function follow(c: LiveCtx, key: string): void {
  const row = ops.get().runs.get(key);
  if (!row || row.left || !c.m) return;
  watches.get(key)?.abort();
  const ac = new AbortController();
  watches.set(key, ac);
  const ok = fence(key);
  const mine = bump(key);
  const write = (r: RunResult | undefined) => {
    if (!r || ac.signal.aborted || !ok() || reads.get(key) !== mine) return;
    const p = statusPatch(r, rowOf(key), false);
    if (p) ops.patch(key, p);
    releaseOnProof(key, r);
  };
  c.m.watch(toHandle(row), tagged(key, { signal: ac.signal, timeoutMs: WATCH_MS, onProgress: write })).then(
    (r) => {
      write(r);
      if (watches.get(key) === ac) watches.delete(key);
    },
    () => {
      if (watches.get(key) === ac) watches.delete(key);
    },
  );
}

/** A Files script launch (Open with, Run, Other command, terminal here): the launcher is bash, the row is the file's. */
const scriptLaunch = (item: Item): boolean => marked(item) && item.p !== 'apphere';
/** The identity a row holds by: a Files script launch by its own subject (`other:ow-<program>-<subject>`), so it
 *  never holds (or is held by) a plain bash launch; anything else by its candidate. */
export { owCandidate } from './recent';
function rowCandidate(item: Item): string | undefined {
  return scriptLaunch(item) ? sealed.get(item)?.candidate : candidateOf(item);
}

type Leftover = NonNullable<RunResult['leftover']>;
/** Where a request began: the page's epoch, its account and realm, and the account whose stored list is its own. */
type Origin = { ep: number; sc: string; acct: string };
const accountNow = (): string => capture().account ?? '';
const originNow = (): Origin => ({ ep: ops.get().epoch, sc: scopeNow(), acct: accountNow() });
/** Leftovers of an account not shown when they came (storage writes only the shown account's list), by account. */
const leftWaiting = new Map<string, { row: StoredRow; base?: StoredRow }[]>();
const sameTerminal = (a: StoredRow, b: StoredRow): boolean =>
  a.computer.computer_id === b.computer.computer_id && a.terminal_id === b.terminal_id && a.incarnation === b.incarnation;
/** Stores a leftover in account `acct`'s list in place of its launch's own row (`base`: that launch never ran there,
 *  or ended) and of an older leftover of that terminal; any other command's row stays. Kept in memory while another
 *  account is shown (stored once `acct` is shown again: loadStored). */
function storeLeft(row: StoredRow, acct: string, base?: StoredRow): void {
  if (accountNow() !== acct) {
    // Every one waits (each with its own launch's row to replace); storing them in order keeps the newest leftover.
    leftWaiting.set(acct, [{ row, ...(base ? { base } : {}) }, ...(leftWaiting.get(acct) ?? [])]);
    return;
  }
  const d = loadRecent();
  const gone = (x: StoredRow): boolean => (!!base && recentKey(x) === recentKey(base)) || (!!x.left && sameTerminal(x, row));
  saveRecent(addRecent({ ...d, rows: d.rows.filter((x) => !gone(x)) }, row));
}
/** The shown account's waiting leftovers go to its stored list. */
function storeWaiting(): void {
  const acct = accountNow();
  const w = leftWaiting.get(acct);
  if (!w) return;
  leftWaiting.delete(acct);
  for (const x of [...w].reverse()) storeLeft(x.row, acct, x.base);
}
/** Keeps a leftover terminal (C9). While the page still shows the request's account and realm and its row is listed,
 *  the row keeps it: bound in place of the launch's own row, its terminal and address shown, and shown again if it
 *  was hidden (a Forget while the request was out: nothing else would list it). In any case it is stored in the
 *  request's account's list. True when the row shows it. `base`: the launch's row, when it had one. */
function leave(c: LiveCtx, key: string, lo: Leftover, base: StoredRow | undefined, more: Parameters<typeof leftRow>[2], at: Origin): boolean {
  const row = leftRow(lo, base, more, Date.now());
  if (!row) return false;
  storeLeft(row, at.acct, base);
  if (ops.get().epoch !== at.ep || scopeNow() !== at.sc || !rowOf(key) || !c.target || row.computer.computer_id !== c.target.container.id) return false;
  ops.bind(key, row);
  ops.unforget(key);
  ops.patch(key, { terminal: row.terminal_id, handle: row.launch_tag, urls: urlsFor(c.target, row) });
  return true;
}

/** The rows whose Open is in flight: its handle may be known, but no answer came yet (a Board tile is placed
 *  only once one did). */
const opening = new Set<string>();
export const isOpening = (key: string): boolean => opening.has(key);

/** Opens item into row `key` (already listed as starting). Resolves to the Open's answer: null when nothing was sent
 *  for a reason of this page (no permission, the dispatch guard, no machine). */
export async function liveOpen(c: LiveCtx, key: string, item: Item, o: OpenOpts, reopen = false, tries = 0): Promise<RunResult | null> {
  // The Board tile's launch card counts from here (a retry inside the same Open keeps the first time).
  if (tries === 0) arriving(key);
  opening.add(key);
  try {
    return await openOnce(c, key, item, o, reopen, tries);
  } finally {
    opening.delete(key);
  }
}

async function openOnce(c: LiveCtx, key: string, item: Item, given: OpenOpts, reopen: boolean, tries: number): Promise<RunResult | null> {
  // A launch this key may not start sends nothing and claims nothing; the transport refuses it too.
  if (!can(EXEC)) return void ops.patch(key, { state: 'not_started', code: 'exec_off' }), null;
  // A marked launch leaves only as toLaunch built it, with the options sealed with it; anything else is refused unsent
  // (the dispatch guard).
  const seal = marked(item) ? sealedOpts(item) : null;
  const o = marked(item) ? seal?.o : given;
  if (!o) return void ops.patch(key, { state: 'not_started', code: 'invalid_options' }), null;
  // Its plan stays with the row it opens into, for this session only.
  const rec = marked(item) ? sealed.get(item)?.recovery : undefined;
  if (rec) registerRecovery(key, rec);
  // A marked launch is never opened again by name: Retry and Options go through recoveryFor.
  if (!marked(item)) items.set(key, { item, o: { ...(o.args ? { args: o.args } : {}), ...(o.opensIn ? { opensIn: o.opensIn } : {}) }, reopen });
  const m = c.m;
  if (!m || !c.target) {
    // Nothing was sent: definite.
    ops.patch(key, { state: 'not_started', code: 'unreachable' });
    return null;
  }
  const ok = openFence(key);
  const at = originNow();
  // The page's codes were wiped while this Open ran (it was left): its code is dropped too, never shown on return.
  const gen = ops.codeGen;
  // The candidate identity goes into the recent list too, so the hold reaches other tabs and reloads (C9).
  const candidate = reopen ? undefined : rowCandidate(item);
  // A Files script launch stores its row name as its app ("Nano · a b.txt"), never bash: an earlier release's Open again by
  // name then finds nothing.
  const app = scriptLaunch(item) ? item.name : item.app || item.name;
  const more = { name: item.name, ...(item.type === 'starter' ? { catalogId: item.id } : {}), app, ...(candidate ? { candidate } : {}), ...(marked(item) ? { p: item.p } : {}) };
  const req = seal ? seal.req : openRequest(item, o, reopen);
  let r: RunResult;
  // The last handle adopted (stored) on this row: a leftover replaces that row even when the page moved on meanwhile.
  let seen: RunHandle | undefined;
  try {
    r = await m.open(req, {
      onProgress: (e: RunProgress) => {
        if (!ok()) return;
        if (e.handle) adopt(c, key, (seen = e.handle), more);
        if (e.state) ops.patch(key, { ...stated(e.state, e.code), ...(e.phase ? { phase: e.phase } : {}) });
      },
      ...(o.beforeExecute ? { beforeExecute: o.beforeExecute } : {}),
    });
  } catch {
    r = { ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' };
  }
  if (req.env) for (const k of Object.keys(req.env)) req.env[k] = '';
  const raw = r.access?.value;
  if (r.access) r.access.value = '';
  const code = ops.codeGen === gen ? raw : undefined;
  if (!ok()) {
    // A switch while it was out: a terminal it left is still kept, in the launch's account's list, in place of the
    // row its progress stored there.
    const base = seen ? fromHandle(seen, more, Date.now()) ?? undefined : undefined;
    if (r.notSent && !r.handle && r.leftover) leave(c, key, r.leftover, base, more, at);
    return r;
  }
  if (r.handle) adopt(c, key, r.handle, { ...more, asksCode: !!raw });
  if (raw) {
    ops.patch(key, { ...(code ? { accessCode: code } : {}), asksCode: true });
    // The handle may have come by progress first (adopted without asks_code): the stored row says so now.
    const b = ops.get().runs.get(key);
    if (b && !b.asks_code) {
      const nb: StoredRow = { ...b, asks_code: true };
      ops.bind(key, nb);
      if (!ops.get().forgotten.has(key)) saveRecent(addRecent(loadRecent(), nb));
    }
  }
  // Definitely not started although a handle came by progress (the machine took its terminal back): the stored
  // row would reload as "Check" forever, so it leaves the recent list and the row keeps no handle.
  const early = ops.get().runs.get(key);
  if (r.notSent && !r.handle && early) {
    saveRecent(removeRecent(loadRecent(), recentKey(early)));
    ops.unbind(key);
    // Nor a terminal, an address or a handle the progress gave it.
    ops.patch(key, { terminal: null, handle: '', urls: {} });
  }
  // Its terminal left open (the machine could not prove it closed): the row keeps it, with Remove (C9).
  if (r.notSent && !r.handle && r.leftover) leave(c, key, r.leftover, early, more, at);
  // Answered: no longer in flight when the row shows its outcome (a render after this patch must see that).
  opening.delete(key);
  ops.patch(key, openPatch(r));
  // A Files launch is never re-run by itself (its hold is claimed per press): Try again is the person's.
  if (marked(item) && !r.handle && r.code === 'source_warming' && r.notSent) return void ops.patch(key, { code: 'warming_manual' }), r;
  // A source still getting ready and nothing sent: the same Open runs again after a while, by itself.
  if (!r.handle && r.code === 'source_warming' && r.notSent && tries < WARM_TRIES) {
    setTimeout(() => {
      // A forgotten row's queued Open never runs: it would start an app nobody sees.
      if (!ok() || ops.get().forgotten.has(key) || rowOf(key)?.code !== 'source_warming') return;
      // Another Open of the same app began meanwhile: this one is over, never a second copy.
      if (sibling(key, item, reopen)) return void ops.patch(key, { state: 'not_started', code: 'replaced' });
      ops.patch(key, { state: 'starting', code: '' });
      void liveOpen(c, key, item, o, reopen, tries + 1);
    }, Math.max(WARM_MS, held()));
    return r;
  }
  if (r.handle && r.state !== 'unknown' && !ops.get().forgotten.has(key)) follow(c, key);
  return r;
}

/** The item a row was opened from (Retry, Open again), or a plain request for its app. */
export function itemFor(key: string): { item: Item; o: OpenOpts; reopen: boolean } | undefined {
  return items.get(key);
}

/** Check: one read once any server ask to wait has passed; the row's latest read wins. */
export async function liveCheck(c: LiveCtx, key: string, show = true): Promise<void> {
  const row = ops.get().runs.get(key);
  if (!row || row.left || !c.m) return;
  const ok = fence(key);
  // The row's read generation before the wait: a Stop or Restart that begins while this read sleeps out a
  // server hold bumps it, and its outcome is newer than anything this read could bring.
  const before = reads.get(key) ?? 0;
  await afterHold();
  if ((reads.get(key) ?? 0) !== before) return;
  // Another action began on the row while this read waited (a Stop or Restart): it owns the row.
  const other = (): boolean => {
    const b = ops.get().patches.get(key)?.busy;
    return b !== undefined && b !== 'check';
  };
  if (!ok() || other()) return;
  const n = bump(key);
  let r: RunResult | null = null;
  try {
    r = await c.m.status(toHandle(row), tagged(key, {}));
  } catch {
    r = null;
  }
  // The row's command must be the one read: a rebind (COMMAND_ID_EXISTS retry) makes this read stale.
  const now = ops.get().runs.get(key);
  if (!ok() || reads.get(key) !== n || other() || !now || !sameRun(now, row)) return;
  const p = r ? statusPatch(r, rowOf(key), show) : show ? { state: 'unknown' as const, code: 'unreachable' } : null;
  if (p) ops.patch(key, p);
  if (r) releaseOnProof(key, r);
}

/** Stop: one close; earlier reads of the row are stale from here. Resolves to the close's result. */
export async function liveStop(c: LiveCtx, key: string): Promise<RunResult | null> {
  const row = ops.get().runs.get(key);
  if (!row || row.left || !c.m) return null;
  const ok = fence(key);
  const at = originNow();
  watches.get(key)?.abort();
  watches.delete(key);
  bump(key);
  let r: RunResult | null;
  try {
    r = await c.m.close(toHandle(row), tagged(key, {}));
  } catch {
    r = null;
  }
  bump(key);
  const lo = r?.state === 'stopped' ? r.leftover : undefined;
  if (!ok()) {
    // A Forget or a switch while it stopped: a terminal it left is still kept (the row shown again when it can be).
    if (r && lo && leave(c, key, lo, row, { name: row.name }, at)) {
      const lp = closePatch(r);
      if (lp) ops.patch(key, lp);
      ops.unset(key, 'accessCode');
    }
    return r;
  }
  const p = r ? closePatch(r) : { state: 'unknown' as const, code: 'stop_unconfirmed' };
  if (p) ops.patch(key, p);
  if (r && (r.state === 'stopped' || r.code === 'terminal_replaced')) ops.unset(key, 'accessCode');
  if (r) releaseOnProof(key, r);
  // The app ended, its terminal not proven closed: the row keeps that terminal (after the proof freed its hold).
  if (lo) leave(c, key, lo, row, { name: row.name }, at);
  return r;
}

/**
 * Restart: the new copy starts only once the old one is known to have ended; anything else starts nothing.
 * 'failed' = the stop was not sent or the old copy answered still running; 'unconfirmed' = the stop's outcome is unknown.
 */
export async function liveRestart(c: LiveCtx, key: string, relaunch: () => void): Promise<'done' | 'failed' | 'unconfirmed' | 'gone'> {
  if (!ops.get().runs.get(key) || !c.m) return 'failed';
  const ok = fence(key);
  const r = await liveStop(c, key);
  // An account or realm switch (or a Forget) while it stopped: nothing more happens here, and nothing starts
  // in the new context.
  if (!ok()) return 'gone';
  if (!ended(r)) return r && (r.notSent || r.state === 'running') ? 'failed' : 'unconfirmed';
  // A stop that left its terminal keeps the row (with its Remove); any other ended row goes.
  if (!r?.leftover) liveForget(key);
  relaunch();
  return 'done';
}

/** Whether a Forget of the row can be undone: not once it freed an Open-with hold (liveForget). */
export function liveUndoable(key: string): boolean {
  const row = ops.get().runs.get(key);
  return !row || !holdOfRun(row);
}

/** Forget: off this list and the recent list (nothing is sent). Returns the undo. */
export function liveForget(key: string, c?: LiveCtx): () => void {
  const row = ops.get().runs.get(key);
  // A row an Open-with hold keeps reaches here only from liveRestart, once a read proved it ended: the hold is freed
  // as proved (a refused free keeps it, and the row lists again). The person's Remove is liveRemoveHold.
  const h = row ? holdOfRun(row) : undefined;
  if (h) {
    void freeHold(h, row!, 'proved', h.metaVersion);
    watches.get(key)?.abort();
    watches.delete(key);
    ops.forget(key);
    saveRecent(removeRecent(loadRecent(), recentKey(row!)));
    return () => undefined;
  }
  // A launch waiting for its source to warm up is cancelled: its queued Open never runs.
  if (rowOf(key)?.code === 'source_warming') ops.patch(key, { state: 'not_started', code: 'cancelled' });
  watches.get(key)?.abort();
  watches.delete(key);
  ops.forget(key);
  if (row) saveRecent(removeRecent(loadRecent(), recentKey(row)));
  const ep = ops.get().epoch;
  const sc = scopeNow();
  return () => {
    // An Undo after an account or realm switch brings nothing back into the new one's list.
    if (ops.get().epoch !== ep || scopeNow() !== sc) return;
    ops.unforget(key);
    // The handle as it is now: a launch forgotten in flight may have been admitted since.
    const now = ops.get().runs.get(key);
    if (!now) return;
    dropAliases(key, now);
    saveRecent(addRecent(loadRecent(), now));
    // Read it back: its outcome may have changed while it was hidden.
    if (c && rowOf(key)?.state !== 'starting') void liveCheck(c, key, false);
  };
}

/** The person's warned Remove of a hold-backed row (it may open twice): the hold is freed at the version the
 *  person was shown, and the row leaves the list only once that answered 'freed'. Anything else keeps the row and its
 *  Check and Remove ('kept'); nothing is hidden on a hope. */
export async function liveRemoveHold(key: string): Promise<'freed' | 'kept'> {
  const row = ops.get().runs.get(key);
  const h = row ? holdOfRun(row) : undefined;
  if (!row || !h || pendingFree.has(h.id)) return 'kept';
  const at = originNow();
  if ((await freeHold(h, row, 'dismissed', h.metaVersion)) !== 'freed') return 'kept';
  // The row, its watch and its listing are this session's: after a reset (the session's end, an account or realm
  // switch) they are gone, and the same key may name a row of the next one. The stored row goes from the pressing
  // account's own list only (storage writes the list of the account shown).
  if (ops.get().epoch === at.ep && scopeNow() === at.sc) {
    watches.get(key)?.abort();
    watches.delete(key);
    holdRows.delete(key);
    ops.forget(key);
  }
  if (accountNow() === at.acct) saveRecent(removeRecent(loadRecent(), recentKey(row)));
  return 'freed';
}

/** Remove of a leftover terminal's row: only the machine's discard (that terminal's DELETE). The row and its stored row
 *  go only once the delete is proven ('removed'); anything else, a throw included, keeps both ('kept', C9). */
export async function liveRemove(c: LiveCtx, key: string): Promise<'removed' | 'kept'> {
  const row = ops.get().runs.get(key);
  if (!row?.left || !c.m) return 'kept';
  const ok = fence(key);
  let r: RunResult | null;
  try {
    r = await c.m.discard({ terminal_id: row.terminal_id, incarnation: row.incarnation, computer: { ...row.computer } });
  } catch {
    r = null;
  }
  if (!r?.ok) return 'kept';
  // Proven closed: the stored row names a terminal that is gone, whatever this page shows now.
  saveRecent(removeRecent(loadRecent(), recentKey(row)));
  if (ok()) {
    ops.unbind(key);
    ops.forget(key);
  }
  return 'removed';
}

/** Whether the row is held now (unknown, starting or started; or gone): Restart rechecks it right before its Stop. */
export function liveHeld(key: string): boolean {
  const r = rowOf(key);
  return !r || ops.get().forgotten.has(key) || heldOpen(r);
}

export function liveAck(catalogId: string): void {
  saveRecent(ackShares(loadRecent(), catalogId));
}
export const liveAcked = (catalogId: string): boolean => loadRecent().ack.includes(catalogId);

/** Reads every admitted row of the computer shown (liveOnly: only those still changing). */
export function refresh(c: LiveCtx, liveOnly: boolean): void {
  if (!c.target || held()) return;
  const s = ops.get();
  for (const l of s.launches) {
    if (l.computer !== c.target.container.id || s.forgotten.has(l.key) || !s.runs.has(l.key) || s.runs.get(l.key)?.left || watches.has(l.key) || s.patches.get(l.key)?.busy) continue;
    const merged = { ...l, ...s.patches.get(l.key) };
    if (liveOnly && !view({ state: merged.state, ...(merged.code ? { code: merged.code } : {}), opensIn: merged.opensIn }).live) continue;
    void liveCheck(c, l.key, false);
  }
}

/** The recent list's rows of this computer, listed once (newest first) and read back. */
// The source words of stored rows, kept from the last load so a launch can list the stored rows again.
let storedSrc = { catalogue: '', other: '', files: '' };

function loadStored(c: LiveCtx, src: { catalogue: string; other: string; files: string }): number {
  storedSrc = src;
  storeWaiting();
  if (!c.target) return 0;
  const project = c.target.project.id;
  const cid = c.target.container.id;
  const known = new Set([...ops.get().runs.values()].map(recentKey));
  const stored = recentFor(loadRecent(), project, cid);
  const inRecent = new Set(stored.map(owKey));
  const rows = stored.filter((r) => !known.has(recentKey(r)));
  for (const row of rows) add(c.target, row, row.catalog_id ? src.catalogue : src.other);
  // The account's Open-with holds on this computer that carry a handle, each matched by its whole identity.
  const holds = owHoldsOn(project, cid);
  const byId = new Map(holds.map((x) => [x.h.id, x.run]));
  // The rows linked to a hold follow it.
  for (const [key, link] of holdRows) {
    if (ops.get().launches.find((l) => l.key === key)?.computer !== cid) continue;
    const now = byId.get(link.id);
    // A free started here and not answered yet: its rows keep holding (it may be refused).
    if (!now && pendingFree.has(link.id)) continue;
    if (now && owKey(now) === link.ow) continue;
    holdRows.delete(key);
    // Gone (freed in another tab, or here once it answered): a row listed only for it goes; a stored row stays and is
    // read with its tag. Superseded (the hold names its next command: this one never ran as its launch): a stored row
    // is off the list and off the recent list; this tab's own launch row follows its launch's progress instead.
    if (now ? key.startsWith('r-') : link.ledger) hide(key, !!now);
  }
  let added = rows.length;
  for (const { h, run } of holds) {
    const ow = owKey(run);
    const at = rowFor(run);
    if (at) {
      const was = holdRows.get(at);
      holdRows.set(at, { id: h.id, ow, ledger: was?.ledger ?? (at.startsWith('r-') && !inRecent.has(ow)) });
      // The hold's marker wins over what the recent list says (an earlier release in another tab may rewrite it without one). Whatever was
      // read before it, untagged, proves nothing: earlier reads are dropped and the row is read again with its tag.
      if (!marked({ ...(rowOf(at) ?? {}) })) {
        watches.get(at)?.abort();
        watches.delete(at);
        bump(at);
        ops.patch(at, { p: run.p ?? '?', state: 'unknown', code: 'checking' });
        added++;
      }
      // A hidden row of a hold still kept is shown again.
      if (ops.get().forgotten.has(at)) {
        ops.unforget(at);
        added++;
      }
      continue;
    }
    holdRows.set(add(c.target, run, src.files), { id: h.id, ow, ledger: true });
    added++;
  }
  return added;
}

/** Lists one stored run as a row (state unknown until read back) and returns its key. */
function add(t: Target, row: StoredRow, source: string): string {
  const key = `r-${row.launch_tag}-${row.command_id}`;
  if (!ops.get().launches.some((l) => l.key === key)) {
    ops.addLaunch(
      {
        key, name: row.name, ...(row.catalog_id ? { catalogId: row.catalog_id } : {}), ...(row.candidate ? { candidate: row.candidate } : {}), app: row.app ?? row.catalog_id ?? row.name, opensIn: row.opens_in,
        // A leftover terminal is never read: its row says so at once.
        ...(row.left ? { state: 'not_started' as const, code: 'terminal_left' } : { state: 'unknown' as const, code: 'checking' }),
        terminal: row.terminal_id, handle: row.launch_tag, source, command: '', settings: [], urls: urlsFor(t, row), ...(row.asks_code ? { asksCode: true } : {}),
        startedAt: row.started_at, computer: row.computer.computer_id, ...(row.p !== undefined ? { p: row.p } : {}),
      },
      'end',
    );
  } else {
    ops.unforget(key);
  }
  ops.bind(key, row);
  return key;
}

/** The listed row of a run's whole identity: a shown one first, else a hidden one. */
function rowFor(run: StoredRow): string | undefined {
  const ow = owKey(run);
  let hidden: string | undefined;
  for (const [key, r] of ops.get().runs) {
    if (owKey(r) !== ow) continue;
    if (!ops.get().forgotten.has(key)) return key;
    hidden ??= key;
  }
  return hidden;
}

/** The account's Open-with holds on one computer that carry a handle, with their runs. */
function owHoldsOn(project: string, cid: string): { h: HeldAttempt; run: StoredRow }[] {
  const out: { h: HeldAttempt; run: StoredRow }[] = [];
  for (const h of heldAttempts()) {
    const run = owRunOf(h, project, cid);
    if (run) out.push({ h, run });
  }
  return out;
}

/** Takes a row off the list (its reads end); `stored`: off the recent list too. */
function hide(key: string, stored: boolean): void {
  watches.get(key)?.abort();
  watches.delete(key);
  bump(key);
  const run = ops.get().runs.get(key);
  ops.forget(key);
  if (stored && run) saveRecent(removeRecent(loadRecent(), recentKey(run)));
}

/** This tab's launch bound a handle a row listed only for its hold already shows: that row is an alias, dropped,
 *  but only while this tab's row is shown (a hidden one would leave the launch with no row; its Undo drops it). */
function dropAliases(key: string, run: StoredRow): void {
  if (ops.get().forgotten.has(key)) return;
  const ow = owKey(run);
  for (const [k, link] of holdRows) {
    if (k === key || !link.ledger || link.ow !== ow) continue;
    holdRows.delete(k);
    holdRows.set(key, { ...link, ledger: false });
    watches.get(k)?.abort();
    watches.delete(k);
    bump(k);
    ops.unbind(k);
    ops.forget(k);
  }
}

/** A read or Stop that proves its own launch (a record naming the row's tag: running, ready, ended, never started, or
 *  its terminal replaced) frees that launch's Open-with hold as proved; anything else keeps it. A row listed
 *  only for the hold joins the recent list first, so it stays listed (and can be stopped) once the hold is gone. */
function releaseOnProof(key: string, r: RunResult): void {
  const run = ops.get().runs.get(key);
  const h = run ? holdOfRun(run) : undefined;
  if (!run || !h || pendingFree.has(h.id) || !proves(r, run.launch_tag)) return;
  const link = holdRows.get(key);
  if (link?.ledger) {
    holdRows.set(key, { ...link, ledger: false });
    saveRecent(addRecent(loadRecent(), run));
  }
  void freeHold(h, run, 'proved', h.metaVersion);
}

/** The Open-with hold whose handle is this run, if any (by its whole identity); one being freed here counts. */
function holdOfRun(run: StoredRow): HeldAttempt | undefined {
  const same = (h: HeldAttempt) => {
    const r = owRunOf(h, run.computer.project, run.computer.computer_id);
    return !!r && owKey(r) === owKey(run);
  };
  return heldAttempts().find(same) ?? [...pendingFree.values()].map((x) => x.h).find(same);
}

/** Lists again the stored rows of the computer shown that this tab doesn't have: a copy another tab opened (and
 *  stored) holds this tab's Open of the same app too. New rows are read back at once (C9). */
export function relistStored(c: LiveCtx): void {
  if (c.m && c.target && loadStored(c, storedSrc) > 0) refresh(c, false);
}

/** The computers a mounted launcher follows now, with how many mounts follow each (the Programs Apps tab and a
 *  Board tile can follow two computers at once). A watch runs only while its computer is followed. */
const followed = new Map<string, number>();
const follows = (cid: string | null): (() => void) => {
  if (!cid) return () => undefined;
  followed.set(cid, (followed.get(cid) ?? 0) + 1);
  return () => {
    const n = (followed.get(cid) ?? 1) - 1;
    if (n > 0) followed.set(cid, n);
    else followed.delete(cid);
    // The last mount of this computer left: its watches stop (they would poll a machine nobody shows, and the
    // rows they hold back from refresh() would go stale). Its rows are read again when it is shown
    // again. Another computer's watches, followed by another mount, keep running.
    const s = ops.get();
    for (const [key, a] of watches) {
      const comp = s.launches.find((l) => l.key === key)?.computer;
      if (comp !== undefined && followed.has(comp)) continue;
      a.abort();
      watches.delete(key);
      bump(key);
    }
  };
};

/** Nothing of the account and realm shown stays (rows' handles, reads, items, plans, holds, codes): an account or realm
 *  switch, and the end of the session. */
function endScope(): void {
  for (const a of watches.values()) a.abort();
  watches.clear();
  reads.clear();
  items.clear();
  recoveries.clear();
  holdRows.clear();
  notBefore = 0;
  ops.reset();
}
// The session's end (core's auth purge: a sign-out, the next account) ends the scope too, so signing in again to the
// same account and realm starts empty, as a page load does on the web; a terminal process goes on to the next session.
// Hooked at the first live mount.
let endHooked = false;
function hookSessionEnd(): void {
  if (endHooked) return;
  endHooked = true;
  try {
    onAuthPurge(() => {
      if (scope === null) return;
      endScope();
      scope = null;
    });
  } catch {
    /* a unit test's partial @core mock has no purge; the app's core always does */
  }
}

/** The live machine for one computer (`given`, or the current one when undefined), its stored rows listed and
 *  read back, live rows re-read. */
export function useLiveApps(on: boolean, catalogue: string, other: string, given?: Target | null, files = other): LiveCtx {
  const current = useCurrentComputer();
  const target = given === undefined ? current : given;
  const m = useRunOpen({ onRetryAfter: (ms) => void (notBefore = Math.max(notBefore, Date.now() + Math.min(ms, RETRY_AFTER_MAX_MS))), ...(given !== undefined ? { target: given } : {}) });
  const core = useCore();
  // An account or realm switch: nothing of the old one stays (rows, handles, codes).
  const sc = `${core.account ?? ''}|${core.realm}`;
  useLayoutEffect(() => {
    if (!on || scope === sc) return;
    hookSessionEnd();
    if (scope !== null) endScope();
    scope = sc;
  }, [on, sc]);
  // The machine is made for the computer this render names (useRunOpen keys it by ids): a fresh Target object for
  // the same computer keeps the context, so its in-flight requests keep their fences.
  const cidNow = target?.container.id ?? null;
  const c = useMemo<LiveCtx>(() => ({ m: on ? m : null, target: on ? target : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the target by its ids, not its object
    [on, m, cidNow, target?.project.id, target?.container.server_name]);
  // A computer switch (or the last mount of a computer leaving): that computer's watches stop.
  const shownId = on ? cidNow : null;
  useEffect(() => follows(shownId), [shownId]);
  useEffect(() => {
    if (!c.m || !c.target) return;
    // Another tab stored a launch: it lists here at once, and holds an Open of its app.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === 'hub_apps_recent_v2') relistStored(c);
    };
    const offStorage = listenStorage(onStorage);
    // An Open-with hold another tab stored (or a hold read back after a reload) lists here too.
    const offHolds = subscribeAttempts(() => relistStored(c));
    loadStored(c, { catalogue, other, files });
    refresh(c, false);
    const id = setInterval(() => refresh(c, true), REFRESH_MS);
    return () => {
      clearInterval(id);
      offStorage();
      offHolds();
    };
  // sc: an account or realm switch empties the store (above), so the stored rows are listed again even when the
  // machine stays the same.
  }, [c, catalogue, other, files, sc]);
  return c;
}
