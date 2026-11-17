// The programs page's data: its routes, queries and mutations, declared in one place, on core
// (defineQuery / defineMutation): live in the Hub, core's fixture transport in dev, shots and tests.
import { aliasList, capture, computerRuntime, computerState, defineMutation, defineRoute, execIndex, execRoot, programProves, restartReceiptVerdict, temporaryStopProves, defineQuery, fixtureComputer, fixtureModeActive, heldChanges, programLock, programOp, programRoutes, useCore, useCurrentComputer, type HubError, type ProgramAct, type ProgramOp, type ProgramOverviewWire, type ProgramRestartReceipt, type HeldChange, type Target, type AliasRow } from '@core';
import { useShellData, type OutcomeKind } from '@kit';
import { useMemo } from 'react';
import type { Action, RawOverview } from './logic';

// ── Routes: core's daemon program routes (program index 1), shared with the Computers tab ──

export const routes = programRoutes;
type Receipt = ProgramRestartReceipt;

// ── The computer the page shows ──────────────────────────────────────────────────────

export interface Computer {
  name: string;
  /** How other pages address it in a URL: the name and the last four hex of the id (never the full id). */
  handle: string;
  running: boolean;
}

/** The shell's selected computer, the same one the top bar's switcher shows (null: none picked). With none shown,
 *  `read` carries the shell's computer list state ('loading' | 'unknown'; absent = known): until the list is known,
 *  no computer chosen is not yet "none" (C9). */
export function useComputer(): { data: Computer | null; read?: 'loading' | 'unknown' } {
  const target = useCurrentComputer();
  const shell = useShellData();
  if (!target) return shell.computersRead ? { data: null, read: shell.computersRead } : { data: null };
  const id = target.container.id;
  const row = shell.computers.find((c) => c.id === id);
  // No name yet (the computer list still loading): no handle, so no link is built with a bare '.abcd'.
  const handle = (name: string) => (name ? `${name}.${id.slice(-4)}` : '');
  if (row) return { data: { name: row.name, handle: handle(row.name), running: row.running ?? true } };
  // No shell provider (Vitest) or no list yet in fixtures: the fixture world, as the shell's own fallback does. Fixture
  // mode only (live-pages guard): a live page never reads the fixture world, in any build.
  const w = fixtureModeActive() ? fixtureComputer(id) : undefined;
  return { data: { name: w?.name ?? '', handle: handle(w?.name ?? ''), running: w ? computerState(w.status) === 'running' : true } };
}

// ── Reads ────────────────────────────────────────────────────────────────────────────

/** The daemon is program index 1 on every computer (the routes declare it; core checks the call matches). */
const IDX = 1;
// Core keeps the overview wire opaque; core's programModel (the view's model) parses it and tolerates any shape.
const overviewQ = defineQuery<ProgramOverviewWire, RawOverview, Target | undefined>(routes.overview, {
  input: (t) => ({ index: IDX, ...(t ? { target: t } : {}) }),
  select: (w) => w as RawOverview,
});

/** The daemon's programs overview, read again every 30 s while shown; with no computer shown, not read at all. */
export function useOverview() {
  const target = useCurrentComputer();
  const q = overviewQ.use(undefined, { refetchInterval: 30000, enabled: target !== null });
  // A refresh asked later (an action that settled, a Check) skips `enabled`, so it looks at core's computer when it
  // runs: none shown by then (All computers), it asks nothing.
  // A proxy, not a copy: a copy would read (and so subscribe to) every field of the result.
  return useMemo(() => {
    const refetch: typeof q.refetch = (o) => (capture().target ? q.refetch(o) : Promise.resolve(q));
    return new Proxy(q, { get: (r, k, rx) => (k === 'refetch' ? refetch : Reflect.get(r, k, rx)) });
  }, [q]);
}

// The computer's proxy aliases: core's alias list (the read Computers' alias create and remove read again once proved).
/** The shown computer's alias read: `data` undefined while it loads or with no computer shown; `error` when the last
 *  read failed (`data` may still hold an earlier answer, kept, then shown with the failure line); `loading` only while
 *  the first read is out (no answer and no failure yet; a read again over an answer, or a retry after a failure, is
 *  not); `retry` reads again. */
export interface AliasRead {
  data: readonly AliasRow[] | undefined;
  error: unknown;
  loading: boolean;
  retry: () => void;
}
export function useAliases(enabled = true): AliasRead {
  // Not enabled (a token without the alias permission): nothing is read, as with no computer shown.
  const shown = useCurrentComputer()?.container.id ?? '';
  const id = enabled ? shown : '';
  const q = aliasList.use(id, { enabled: id !== '' });
  const { data, error, isError, isLoading, refetch } = q;
  return useMemo(() => ({
    data: id ? data : undefined,
    error: id && isError ? error : undefined,
    // TanStack's isLoading: pending (never answered, never failed) and fetching now.
    loading: id !== '' && isLoading,
    retry: () => void (id ? refetch() : undefined),
  }), [id, data, error, isError, isLoading, refetch]);
}

// A script folder's list on the computer's Exec program: the read the Scripts page lists a folder by (same route and
// query), here only to name the script a public link (an exec alias) opens. Rows keep root-relative paths
// (`default/<n>/api/x.ts`) and their magic comments (a script's own label).
export const scriptListRoute = defineRoute({ method: 'GET', path: '/api/v1/exec/scripts/list', scope: 'kit', kit: 'exec', index: execIndex, query: ['recursive', 'metadata', 'include_comments'], maxBytes: 4 * 1024 * 1024 });
export interface FolderScript { path: string; magicComments?: { label?: string } }
const recOf = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
/** The files of a folder list answer (an array, or under scripts / entries / files / items), as root-relative paths. */
export function folderScriptsOf(raw: unknown, exec: number): FolderScript[] {
  const o = recOf(raw);
  const list = Array.isArray(raw) ? raw : (['scripts', 'entries', 'files', 'items'].map((k) => o[k]).find(Array.isArray) as unknown[] | undefined) ?? [];
  const out: FolderScript[] = [];
  for (const r of list.map(recOf)) {
    const p = typeof r.path === 'string' ? r.path : '';
    if (!p || r.isDirectory === true || (typeof r.type === 'string' && r.type !== 'file')) continue;
    const mc = recOf(r.magicComments);
    out.push({ path: /^default\/[1-9][0-9]{0,3}\//.test(p) ? p : execRoot(exec) + p.replace(/^\/+/, ''), ...(typeof mc.label === 'string' ? { magicComments: { label: mc.label } } : {}) });
  }
  return out;
}
const folderQ = defineQuery<unknown, unknown, number>(scriptListRoute, {
  input: (exec) => ({ index: exec, query: { recursive: true, metadata: true, include_comments: true } }),
  staleTime: 30_000,
});
/** One Exec folder's scripts on the shown computer (`exec` 1..9999), read while `enabled`: `data` once read, `failed` when
 *  the last read failed. Every cell naming a script of the same folder shares the one read. */
export function useFolderScripts(exec: number, enabled: boolean): { data: FolderScript[] | undefined; failed: boolean } {
  const shown = useCurrentComputer() !== null;
  const ok = enabled && shown && execIndex(exec);
  const q = folderQ.use(ok ? exec : 1, { enabled: ok });
  const raw = ok && q.isSuccess ? q.data : undefined;
  return useMemo(() => ({ data: raw === undefined ? undefined : folderScriptsOf(raw, exec), failed: ok && q.isError }), [raw, exec, ok, q.isError]);
}

/** The shown computer's listeners (core computerRuntime, the read Computers' Ports tab uses too), read only while
 *  `enabled` (the Ports & aliases tab shows); with no computer shown, not read. */
export function useRuntime(enabled: boolean) {
  const id = useCurrentComputer()?.container.id ?? '';
  return computerRuntime.use(id, { enabled: enabled && id !== '' });
}

/** Reads the overview of one computer afresh (a read-back after an unknown outcome uses the op's own computer):
 * only a network answer that landed after this call began, never the cache, so a check judges a read taken
 * after the send. Throws when no fresh answer came. */
export async function readOverview(target: Target): Promise<RawOverview> {
  const got = await overviewQ.readFresh(target);
  if (!got) throw new Error('READ_FAILED');
  return got.data;
}

/** The context an operation belongs to: account, realm and computer. Ops, receipts, read-backs and
 * confirmations are bound to it, so a computer, realm or account switch never mixes them up. */
export interface OpScope {
  part: string;
  target: Target | null;
}

export function useOpScope(): OpScope {
  const c = useCore();
  const t = c.target;
  return { part: `${c.account ?? '-'}|${c.realm}|${t ? `${t.project.id}/${t.container.id}` : '-'}`, target: t };
}

/** 'private' (403), 'old' (the kit has no overview route: 404) or 'failed'. */
export function errorKind(err: unknown): 'private' | 'old' | 'failed' {
  const e = err as HubError | null | undefined;
  if (e?.status === 403 || e?.kind === 'forbidden') return 'private';
  if (e?.status === 404 || e?.kind === 'not_found') return 'old';
  return 'failed';
}

// ── Changes (C9: one request per press, never resent) ────────────────────────────────

export interface PressArgs {
  kind: 'prog' | 'temp';
  id: string;
  action: Action;
  port: number | null;
  /** A port-range program: a whole stop or restart covers every part (links.ts programOp decides). */
  range?: boolean;
  boot?: boolean;
  /** The computer the press was made for (captured when the user pressed). */
  target: Target;
}

export interface PressResult {
  outcome: OutcomeKind;
  code?: string;
  /** The idempotency key of a restart, for reading its receipt. */
  key?: string;
  /** Pending: the hold this send left in core (its token): a Check or a Dismiss names it, so it never frees a later
   *  send of the same change (another tab's). */
  hold?: string;
}

type Vars = { id: string; port: number | null; range?: boolean; boot?: boolean; target: Target };
const reads = [overviewQ];
// Every program change is built by links.ts programOp, the one builder Computers' Programs tab uses too: the
// same press is the same body under the same shared lock on both pages.
const opOf = (act: ProgramAct) => (v: Vars) => programOp({ id: v.id, act, port: v.port, range: !!v.range, ...(v.boot !== undefined ? { boot: v.boot } : {}) });
const change = (act: ProgramAct) => {
  const op = opOf(act);
  return {
    input: (v: Vars) => ({ index: IDX, recovers: true, target: v.target, params: { id: v.id }, body: op(v).body }),
    lock: programLock[act],
    lockKey: (v: Vars) => op(v).identity,
  };
};
// A start, stop or boot is freed only by a fresh overview showing its effect: core's programProves, the one
// verdict the Computers Programs tab uses too.
// Every change this page sends is page 'programs'' own (core's sender): another page sharing the lock sees it
// as this page's, with a link here, and only this page can check or dismiss it.
const PAGE = 'programs';
const startM = defineMutation<Vars>(routes.start, { ...change('start'), reads, proves: programProves('start'), page: PAGE });
const stopM = defineMutation<Vars>(routes.stop, { ...change('stop'), reads, proves: programProves('stop'), page: PAGE });
// A restart is proved only by its receipt (view.tsx's Check completes or discards it): a program that kept
// running proves nothing, so the overview is not its read-back and a fresh overview never frees it (no
// declared reads; the page refetches the overview after every press itself).
const restartM = defineMutation<Vars>(routes.restart, { ...change('restart'), page: PAGE });
const bootM = defineMutation<Vars>(routes.boot, { ...change('boot'), reads, proves: programProves('boot'), page: PAGE });
// A temporary program's stop: its own lock (no other page sends it), one per program, freed only by a fresh
// read that proves it (core temporaryStopProves: gone from an answer that carries the temporary list, or
// stopped) or the person's Dismiss. The route takes no idempotency key: a second press is a second stop.
const TEMP_STOP_LOCK = 'daemon.temporary.stop';
const tempStopM = defineMutation<Vars>(routes.tempStop, { input: (v) => ({ index: IDX, recovers: true, target: v.target, params: { id: v.id } }), reads, lock: TEMP_STOP_LOCK, lockKey: (v) => ({ id: v.id }), proves: temporaryStopProves, page: PAGE });

const pressVars = (a: PressArgs): Vars => ({ id: a.id, port: a.port, target: a.target, ...(a.range ? { range: true } : {}), ...(a.boot !== undefined ? { boot: a.boot } : {}) });

/** The change a press sends (lock, identity, body), from the shared builder. */
export function pressChange(a: PressArgs): ProgramOp {
  return opOf(a.action)(pressVars(a));
}
const progDef = (action: Action) => (action === 'start' ? startM : action === 'stop' ? stopM : action === 'restart' ? restartM : bootM);
const pressDef = (a: PressArgs) => (a.kind === 'temp' ? tempStopM : progDef(a.action));

// Each of these names the hold the row showed (its token): core frees that one send only, never a later send of
// the same change (another tab may have dismissed it and sent it again meanwhile), and answers true only when it
// freed it. No token names nothing, so nothing is freed (false): the row shows core's hold again, with its token.

/** The page's own fresh read (or the restart's receipt) PROVED this press applied: core drops its lock and its
 * key, so the next press is a new request with a new key (a replay of the spent key would show done and do
 * nothing). */
export function completePress(a: PressArgs, hold: string | undefined): Promise<boolean> {
  return hold === undefined ? Promise.resolve(false) : pressDef(a).complete(pressVars(a), hold);
}

/** The restart's receipt proved this press did not apply: core drops its lock and its key, so the next
 * press is sent with a fresh key (never the spent one). */
export function discardPress(a: PressArgs, hold: string | undefined): Promise<boolean> {
  return hold === undefined ? Promise.resolve(false) : pressDef(a).discard(pressVars(a), hold);
}

/** The person dismissed a "may have gone through" press: core frees its lock and keeps its key (C9 Dismiss),
 * on the computer it was sent to. */
export function dismissPress(a: PressArgs, hold: string | undefined): Promise<boolean> {
  return hold === undefined ? Promise.resolve(false) : pressDef(a).dismiss(pressVars(a), hold);
}

/** Sends one action, once. Resolves with the C9 outcome; never throws. */
export function usePress(): (args: PressArgs) => Promise<PressResult> {
  return async (a) => {
    const res = await pressDef(a).run(pressVars(a));
    const code = res.error?.code ?? undefined;
    return { outcome: res.outcome, ...(code ? { code } : {}), ...(res.idem ? { key: res.idem } : {}), ...(res.hold ? { hold: res.hold } : {}) };
  };
}

const receiptQ = defineQuery<Receipt, Receipt, { id: string; key: string; target: Target }>(routes.restartReceipt, {
  input: (p) => ({ index: IDX, target: p.target, params: { id: p.id }, query: { key: p.key } }),
});

/** Reads a restart's receipt (reads only, never resends): 'completed' | 'failed' | 'unknown'. */
export function useReceipt(): (id: string, key: string, target: Target) => Promise<'completed' | 'failed' | 'unknown'> {
  return async (id, key, target) => {
    try {
      return restartReceiptVerdict(await receiptQ.fetch({ id, key, target }));
    } catch {
      return 'unknown';
    }
  };
}

const lockOf = (a: PressArgs) => (a.kind === 'temp' ? TEMP_STOP_LOCK : programLock[a.action]);
const sameTarget = (h: HeldChange, t: Target) => h.target?.container.id === t.container.id && h.target?.project.id === t.project.id;

/** The change core holds under this press's lock for its program and computer (any realm, any sender), or
 * undefined: its sender (heldBy), its key and its hold token. */
export function heldOf(a: PressArgs): { by: 'self' | 'other' | undefined; key: string | null; hold: string | undefined } | undefined {
  const all = matching(a).map((h) => ({ by: pressDef(a).heldBy(h), key: h.key, hold: h.hold }));
  // Another page's hold wins: it is the one that blocks a press, and only its sender can free it.
  return all.find((h) => h.by === 'other') ?? all[0];
}
function matching(a: PressArgs): HeldChange[] {
  const want = JSON.stringify(a.kind === 'temp' ? { id: a.id } : pressChange(a).identity);
  return heldChanges(lockOf(a)).filter((c) => JSON.stringify(c.identity) === want && sameTarget(c, a.target));
}

/** A program change core holds on this computer, in any realm (a kit lock is realm-free, so a realm switch leaves
 * it the same change). `own`: this page sent it, so the row offers Check again and the warned Dismiss, naming
 * `hold`, after a realm switch or a reload too. Otherwise another page sent it (Computers, say): Programs shows it
 * read-only and every action of that program waits, since core frees it only for its sender. */
export interface CoreHold {
  rowKey: string;
  press: PressArgs;
  own: boolean;
  /** Its token in core: a Check or a Dismiss of this page names it. */
  hold: string | undefined;
  /** Its idempotency key (a restart's receipt is read with it); null when it has none. */
  key: string | null;
  /** The page that sent it (core's HeldChange.from), for the link; undefined when its sender named none. */
  fromPage?: string;
}
const ACTIONS: readonly Action[] = ['start', 'stop', 'restart', 'boot'];
export function coreHolds(target: Target | null): CoreHold[] {
  if (!target) return [];
  const out: CoreHold[] = [];
  const add = (h: HeldChange, press: PressArgs) => {
    // A hold that names no sender is nobody's to prove here (core: only a warned Dismiss of a page declaring the
    // lock frees it); it is left to core's refusals, as before.
    const by = pressDef(press).heldBy(h);
    if (by === undefined) return;
    out.push({ rowKey: `${press.kind}:${press.id}`, press, own: by === 'self', hold: h.hold, key: h.key, ...(h.from ? { fromPage: h.from.page } : {}) });
  };
  for (const action of ACTIONS) {
    for (const h of heldChanges(programLock[action])) {
      if (!sameTarget(h, target)) continue;
      const idn = (h.identity ?? {}) as { id?: unknown; port?: unknown; all?: unknown; boot?: unknown };
      if (typeof idn.id !== 'string' && typeof idn.id !== 'number') continue;
      const id = String(idn.id);
      const port = typeof idn.port === 'number' ? idn.port : null;
      add(h, { kind: 'prog', id, action, port, target, ...(idn.all === true ? { range: true } : {}), ...(action === 'boot' && typeof idn.boot === 'boolean' ? { boot: idn.boot } : {}) });
    }
  }
  for (const h of heldChanges(TEMP_STOP_LOCK)) {
    const idn = (h.identity ?? {}) as { id?: unknown };
    if (!sameTarget(h, target) || typeof idn.id !== 'string') continue;
    add(h, { kind: 'temp', id: idn.id, action: 'stop', port: null, target });
  }
  return out;
}

/** The send `hold` names for this press, while core still holds it (any sender); undefined once it was proved,
 * dismissed or sent again (a new token), here or in another tab. */
export function liveHold(a: PressArgs, hold: string | undefined): HeldChange | undefined {
  return hold === undefined ? undefined : matching(a).find((h) => h.hold === hold);
}
