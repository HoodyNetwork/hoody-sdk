// Open with's computer inventory: which reviewed programs a computer has, whether it
// can start a screen, and its bash launcher row. Only fixed paths of the template table and the two screen tools are
// asked (a `?stat` each), plus the run kit's system search for bash; never a listing, a desktop entry or the file.
//
// Answers live in core's query cache under ['ow-probe', gen, project, computer, path] (path 'launcher' for the
// launcher row): found 10 min, absent 2 min, and a failure is never stored as an answer; it only keeps the same
// path from being sent again for 30 s. At most 4 discovery requests are out at once, across every pass. A pass gives
// itself 12 s from when it first needs the network: what has not answered by then reads 'unchecked' (a template) or
// 'unconfirmed' / 'failed' (screen, launcher). A pass that stops waiting never cancels a request: each is bounded to
// 5 s (the stat route; the launcher search is cut at 5 s here), keeps its slot until it settles, and still fills the
// cache. Passes asking one path share its request. Refresh and reprobe retire the requests they invalidate: a
// retired request writes nothing.
//
// 'found' is a hint, never proof the program runs: the files program answers SymlinkFile for a dangling link too
// (hoody-files' own stat answer). The exec decides; an exit 127 calls reprobe().
import { api, capture, onBump, queryClient, useCore, type HubError, type Target } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchRoute } from '../../data';
import { argvProgramOf } from '../../logic';
import type { Launcher } from './plan';
import { SCREEN_PROBES, statCall } from './routes';
import { DEFAULT_ORDER, templateById, type FileKind, type TemplateId } from './templates';

export type ProbeState = 'found' | 'absent' | 'unchecked' | 'failed';
export interface ProbeRow {
  tpl: TemplateId;
  state: ProbeState;
  /** The absolute path that answered 'found' (what planFor gets as `exe`); absent otherwise. */
  exe?: string;
}
export interface Probes {
  /** DEFAULT_ORDER[kind], in that order, each with its probe state. 'unchecked' = past budget, or not asked. */
  rows: readonly ProbeRow[];
  /** 'unconfirmed' when a screen probe was absent or failed: rows stay enabled, one note. */
  screen: 'confirmed' | 'unconfirmed' | 'checking';
  /** The bash launcher row (StartOpts.launcher). null = a complete search found none (w.noBash). */
  launcher: Launcher | null | 'checking' | 'failed';
  /** True while any probe in budget is still in flight. */
  checking: boolean;
  /** Drop every cached probe for this computer and probe again (the chooser's Refresh). */
  refresh(): void;
  /** After a launch of `tpl` ended with 127: re-probe that template's paths. */
  reprobe(tpl: TemplateId): void;
  /** After a resolve refusal of the launcher: drop the launcher row (shown with Try again, never re-sent by itself). */
  dropLauncher(): void;
}

export const PROBE_TIMES = Object.freeze({ found: 10 * 60_000, absent: 2 * 60_000, retryFloor: 30_000, launcher: 10 * 60_000, pass: 12_000 });
export const PROBE_IN_FLIGHT = 4;
const PREFIX = 'ow-probe';
const LAUNCHER_KEY = 'launcher';

/** A stat path's answer, or the launcher search's. */
type PathAnswer = { state: 'found' | 'absent' } | { state: 'failed' };
type LauncherAnswer = { launcher: Launcher | null } | { failed: true };
type Stored = { v: 'found' | 'absent' } | { launcher: Launcher | null };

const keyOf = (gen: number, t: Target, path: string) => [PREFIX, gen, t.project.id, t.container.id, path] as const;
const hashOf = (k: readonly unknown[]) => JSON.stringify(k);
const ofComputer = (t: Target) => (k: readonly unknown[]) => k[0] === PREFIX && k[2] === t.project.id && k[3] === t.container.id;

// Unobserved entries must outlive their freshness (core's client default would drop them at 5 min).
queryClient.setQueryDefaults([PREFIX], { gcTime: PROBE_TIMES.found, retry: false });
/** When each path last failed (its key's hash): no new send for 30 s. Never an answer. */
const failedAt = new Map<string, number>();
/** Computers whose launcher row was dropped after a resolve refusal: not re-sent until refresh(). */
const launcherDropped = new Set<string>();
const computerId = (t: Target) => t.project.id + '/' + t.container.id;

function fresh(k: readonly unknown[], now: number): Stored | undefined {
  const st = queryClient.getQueryState<Stored>(k as unknown[]);
  const d = st?.data;
  if (!st || !d) return undefined;
  const ttl = 'launcher' in d ? PROBE_TIMES.launcher : d.v === 'found' ? PROBE_TIMES.found : PROBE_TIMES.absent;
  return now - st.dataUpdatedAt < ttl ? d : undefined;
}

/** The files program's plain not-found: 404 with its `{success:false, error}` body and no code of its own. A coded
 *  404, or one from anything in front of the program, says nothing about the path. */
function plainNotFound(e: unknown): boolean {
  const x = e as HubError | null;
  if (!x || x.status !== 404) return false;
  const d = x.data as Record<string, unknown> | undefined;
  return !!d && d.success === false && typeof d.error === 'string' && d.code === undefined;
}

/** One stat answer read: File or SymlinkFile found; any other type, or the plain 404, absent. */
function statState(raw: unknown): 'found' | 'absent' | null {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).path_type : undefined;
  if (t === 'File' || t === 'SymlinkFile') return 'found';
  if (t === 'Dir' || t === 'SymlinkDir' || t === 'Fifo' || t === 'Socket' || t === 'CharDevice' || t === 'BlockDevice') return 'absent';
  return null;
}

/** The bash a search row runs: its argv plan's program (argvProgramOf, the rule the search rows read too), only when
 *  the plan gives it no arguments (with arguments it already runs something else) and its last part is exactly `bash`.
 *  The Hub's launch resolves the candidate id, so that plan is what runs. */
function bashPathOf(c: Record<string, unknown>): string | null {
  const p = argvProgramOf(c);
  return p && p.args === 0 && p.path.slice(p.path.lastIndexOf('/') + 1) === 'bash' ? p.path : null;
}

/** A warning that the system source did not answer whole: the kit's SOURCE_WARMING, SOURCE_BACKOFF, SOURCE_TIMEOUT,
 *  SOURCE_FAILED, and the older words. Case-insensitive. */
const INCOMPLETE = /partial|warm|fail|unavailable|timeout|backoff/i;

/** The launcher row in a system search answer: provider system, title bash, an id and an absolute bash path. A search
 *  that says it is partial, warming, backing off, timed out or failed and has no such row proves nothing: failed,
 *  never "no bash". */
export function launcherOf(raw: unknown): LauncherAnswer {
  const a = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (!Array.isArray(a.candidates) || typeof a.set_id !== 'string') return { failed: true };
  for (const c0 of a.candidates.slice(0, 50)) {
    const c = c0 && typeof c0 === 'object' ? (c0 as Record<string, unknown>) : {};
    const id = c.candidate_id;
    if (c.provider !== 'system' || c.title !== 'bash') continue;
    if (typeof id !== 'string' || !id || id.length > 200) continue;
    const path = bashPathOf(c);
    if (!path) continue;
    return { launcher: { candidateId: id, setId: a.set_id, path } };
  }
  const warnings = Array.isArray(a.warnings) ? a.warnings.map((w) => String(w && typeof w === 'object' ? (w as Record<string, unknown>).code : w)) : [];
  return warnings.some((w) => INCOMPLETE.test(w)) ? { failed: true } : { launcher: null };
}

// ── Requests: one gate for all of discovery, shared and retirable requests ───────────────────────────────────────
// At most 4 discovery requests are out at once, across every pass and computer. A slot is taken before a new send
// and held until that request settles: a pass that stops waiting never frees it early. Joining a request already
// out takes no slot. drop() and a context change retire requests: a retired request still answers whoever joined it,
// but writes no answer and no failure mark, and nothing new joins it.

type Waiter = { grant: () => void; cancel: () => void };
const slots = { used: 0, queue: [] as Waiter[] };

/** Waits for a slot. false: `onCancel`'s function was called first (the pass ended), no slot is held. */
function takeSlot(onCancel: (cancel: () => void) => void): Promise<boolean> {
  if (slots.used < PROBE_IN_FLIGHT) { slots.used++; return Promise.resolve(true); }
  return new Promise<boolean>((resolve) => {
    const w: Waiter = {
      grant: () => resolve(true),
      cancel: () => { const i = slots.queue.indexOf(w); if (i >= 0) { slots.queue.splice(i, 1); resolve(false); } },
    };
    slots.queue.push(w);
    onCancel(w.cancel);
  });
}
/** Hands the slot to the next waiter, or frees it. */
function giveSlot(): void {
  const next = slots.queue.shift();
  if (next) next.grant(); else slots.used = Math.max(0, slots.used - 1);
}

interface Out { p: Promise<unknown>; live: boolean }
/** Requests out now, by key hash. */
const inFlight = new Map<string, Out>();

/** Sends `ask` for `k` on a slot the caller holds; the slot is given back when the request settles. */
function send<T>(k: readonly unknown[], ask: (live: () => boolean) => Promise<T>): Promise<T> {
  const h = hashOf(k);
  const out: Out = { p: Promise.resolve(), live: true };
  const p = ask(() => out.live).finally(() => { if (inFlight.get(h) === out) inFlight.delete(h); giveSlot(); });
  out.p = p;
  inFlight.set(h, out);
  return p;
}
/** Retires the requests whose key `match` names. */
function retire(match: (k: readonly unknown[]) => boolean): void {
  for (const [h, out] of [...inFlight]) if (match(JSON.parse(h) as unknown[])) { out.live = false; inFlight.delete(h); }
}

// A context change (account, realm, sign-out) makes every older answer unreachable; drop them now.
onBump(() => {
  const gen = capture().gen;
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === PREFIX && q.queryKey[1] !== gen });
  failedAt.clear();
  retire(() => true);
});

/** Records a settled answer for `k`: a failure mark or the stored answer, only while the request is live and the
 *  context is the one it was sent under. */
function settle(k: readonly unknown[], gen: number, live: () => boolean, stored: Stored | null): void {
  if (!live() || capture().gen !== gen) return;
  const h = hashOf(k);
  if (stored === null) { failedAt.set(h, Date.now()); return; }
  failedAt.delete(h);
  queryClient.setQueryData([...k], (): Stored => stored);
}

function askPath(gen: number, t: Target, path: string) {
  const k = keyOf(gen, t, path);
  return async (live: () => boolean): Promise<PathAnswer> => {
    const call = statCall(path);
    const ctx = capture(t);
    if (!call || ctx.gen !== gen) return { state: 'failed' };
    let state: 'found' | 'absent' | null;
    try {
      state = statState(await api(call.route, { target: t, params: call.params, query: call.query, ctx }));
    } catch (e) {
      state = plainNotFound(e) ? 'absent' : null;
    }
    settle(k, gen, live, state === null ? null : { v: state });
    return state === null ? { state: 'failed' } : { state };
  };
}

/** The run search for bash, bounded to 5 s here (the Apps page's own search route keeps its longer limit). */
export const LAUNCHER_TIMEOUT_MS = 5000;
function askLauncher(gen: number, t: Target) {
  const k = keyOf(gen, t, LAUNCHER_KEY);
  return async (live: () => boolean): Promise<LauncherAnswer> => {
    const ctx = capture(t);
    if (ctx.gen !== gen) return { failed: true };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LAUNCHER_TIMEOUT_MS);
    let got: LauncherAnswer;
    try {
      got = launcherOf(await api(searchRoute, { target: t, query: { app: 'bash', source: 'system', limit: 20 }, ctx, signal: ac.signal }));
    } catch {
      got = { failed: true };
    } finally {
      clearTimeout(timer);
    }
    settle(k, gen, live, 'failed' in got ? null : { launcher: got.launcher });
    return got;
  };
}

/** What one pass has learned so far. */
export interface PassState {
  rows: ProbeRow[];
  screen: Probes['screen'];
  launcher: Probes['launcher'];
  checking: boolean;
}

/**
 * One probe pass for `kind` on `t`: reports every change through `report` and returns stop(). Cached answers are
 * used as they are. The rest join a request already out or send one through the shared gate, all under one 12 s
 * budget that starts when the pass first needs the network. After stop() or the budget nothing more is sent.
 */
export function startPass(t: Target, kind: FileKind, gen: number, report: (s: PassState) => void): () => void {
  const order = DEFAULT_ORDER[kind] ?? [];
  const tpls = order.map((id) => templateById(id)).filter((x) => !!x);
  const wantsScreen = tpls.some((x) => x.opens === 'screen');
  const s: PassState = { rows: order.map((tpl) => ({ tpl, state: 'unchecked' })), screen: wantsScreen ? 'checking' : 'unconfirmed', launcher: 'checking', checking: true };
  let stopped = false, over = false, timer: ReturnType<typeof setTimeout> | null = null, open = 0;
  const cancels = new Set<() => void>();
  const OVER = Symbol('over');
  let endBudget: (v: typeof OVER) => void = () => {};
  // Resolves when the pass stops waiting (12 s, or stop()): every wait still open reads as out of budget.
  const budgetOver = new Promise<typeof OVER>((r) => { endBudget = r; });
  const done = () => over || stopped;
  const emit = () => { if (!stopped) report({ ...s, rows: s.rows.map((r) => ({ ...r })), checking: !over && open > 0 }); };
  const end = () => { endBudget(OVER); for (const c of [...cancels]) c(); cancels.clear(); };
  const startClock = () => { if (!timer && !over) timer = setTimeout(() => finish(), PROBE_TIMES.pass); };
  const onCancel = (c: () => void) => { if (done()) c(); else cancels.add(c); };
  const wait = async <T>(p: Promise<T>): Promise<T | undefined> => { const r = await Promise.race([p, budgetOver]); return r === OVER ? undefined : (r as T); };

  /**
   * `k`'s answer: the cache's (`cached`), a request already out, or a new one on a slot. 'floor': the key failed
   * within 30 s and is not sent. undefined: out of budget or stopped (nothing was sent by this call after that).
   */
  async function obtain<T>(k: readonly unknown[], cached: () => T | undefined, ask: (live: () => boolean) => Promise<T>): Promise<T | 'floor' | undefined> {
    const h = hashOf(k);
    for (;;) {
      const c = cached();
      if (c !== undefined) return c;
      if (done()) return undefined;
      startClock();
      const out = inFlight.get(h);
      if (out) return wait(out.p as Promise<T>);
      const at = failedAt.get(h);
      if (at !== undefined && Date.now() - at < PROBE_TIMES.retryFloor) return 'floor';
      if (!(await takeSlot(onCancel))) return undefined;
      // The pass may have ended, or another pass sent, answered or failed this key, while this one waited.
      const failed = failedAt.get(h);
      if (done() || inFlight.has(h) || cached() !== undefined || (failed !== undefined && Date.now() - failed < PROBE_TIMES.retryFloor)) { giveSlot(); continue; }
      return wait(send(k, ask));
    }
  }

  async function read(path: string): Promise<'found' | 'absent' | 'failed' | undefined> {
    const k = keyOf(gen, t, path);
    const r = await obtain(k, () => { const c = fresh(k, Date.now()); return c && 'v' in c ? { state: c.v } : undefined; }, askPath(gen, t, path));
    return r === undefined ? undefined : r === 'floor' ? 'failed' : r.state;
  }

  async function row(i: number) {
    const tpl = templateById(order[i]!);
    if (!tpl) return;
    for (const path of tpl.probe) {
      const r = await read(path);
      if (r === undefined) return; // past budget: stays unchecked
      if (r === 'found') { s.rows[i] = { tpl: tpl.id, state: 'found', exe: path }; emit(); return; }
      if (r === 'failed') { s.rows[i] = { tpl: tpl.id, state: 'failed' }; emit(); return; }
    }
    s.rows[i] = { tpl: tpl.id, state: 'absent' };
    emit();
  }

  async function launcher() {
    if (launcherDropped.has(computerId(t))) { s.launcher = 'failed'; emit(); return; }
    const k = keyOf(gen, t, LAUNCHER_KEY);
    const r = await obtain<LauncherAnswer>(k, () => { const c = fresh(k, Date.now()); return c && 'launcher' in c ? { launcher: c.launcher } : undefined; }, askLauncher(gen, t));
    if (r === undefined) return; // finish() says failed
    s.launcher = r === 'floor' || 'failed' in r ? 'failed' : r.launcher;
    emit();
  }

  async function screen() {
    const got = await Promise.all(SCREEN_PROBES.map((p) => read(p)));
    if (got.some((r) => r === undefined)) return; // past budget: finish() says unconfirmed
    s.screen = got.every((r) => r === 'found') ? 'confirmed' : 'unconfirmed';
    emit();
  }

  function finish() {
    if (stopped) return;
    if (timer) { clearTimeout(timer); timer = null; }
    over = true;
    end();
    if (s.screen === 'checking') s.screen = 'unconfirmed';
    if (s.launcher === 'checking') s.launcher = 'failed';
    emit();
  }

  const jobs = [launcher(), ...order.map((_, i) => row(i)), ...(wantsScreen ? [screen()] : [])];
  open = jobs.length;
  for (const j of jobs) void j.catch(() => undefined).finally(() => { open--; if (open === 0) finish(); else emit(); });
  emit();
  return () => { stopped = true; if (timer) clearTimeout(timer); end(); };
}

/** Drops this computer's answers (every generation), failure marks and requests out; `paths` narrows it. */
function drop(t: Target, paths?: readonly string[]): void {
  const mine = ofComputer(t);
  const hit = (k: readonly unknown[]) => mine(k) && (!paths || paths.includes(String(k[4])));
  queryClient.removeQueries({ predicate: (q) => hit(q.queryKey) });
  for (const h of [...failedAt.keys()]) if (hit(JSON.parse(h) as unknown[])) failedAt.delete(h);
  retire(hit);
}

/** Mounted passes by computer: told to start again when an invalidation below drops their answers. */
const restarts = new Set<{ id: string; go: () => void }>();
const restartOn = (t: Target) => { const id = computerId(t); for (const r of restarts) if (r.id === id) r.go(); };

/** After a launch of `tpl` on `t` ended with 127: drop that template's paths, whether or not a chooser is open
 *  (an open one checks them again; nothing else is sent). */
export function reprobeOn(t: Target, tpl: TemplateId): void {
  const row = templateById(tpl);
  if (!row) return;
  drop(t, row.probe);
  restartOn(t);
}
/** After a resolve refusal of the launcher on `t`: drop its launcher row; not asked again until refresh(). */
export function dropLauncherOn(t: Target): void {
  drop(t, [LAUNCHER_KEY]);
  launcherDropped.add(computerId(t));
  restartOn(t);
}

/** Tests: forget the gate, requests, failure marks and dropped launchers (module memory outlives a test). */
export function resetProbesForTests(): void {
  slots.used = 0;
  slots.queue.length = 0;
  retire(() => true);
  failedAt.clear();
  launcherDropped.clear();
}

const IDLE: Omit<Probes, 'refresh' | 'reprobe' | 'dropLauncher' | 'rows'> = { screen: 'checking', launcher: 'checking', checking: false };

/** React Query key ['ow-probe', ctxGen, project, computer, path]. Found 10 min, absent 2 min, failure not cached
 *  (retry floor 30 s), launcher 10 min. ≤ 4 in flight, 5 s each, 12 s for the whole call. `enabled:false` sends nothing. */
export function useProbes(o: { computer: Target | null; kind: FileKind; enabled: boolean }): Probes {
  const { gen } = useCore();
  const t = o.computer;
  const on = o.enabled && !!t && !!t.project.id && !!t.container.id;
  const [epoch, setEpoch] = useState(0);
  const tRef = useRef(t);
  tRef.current = t;
  const pid = t?.project.id ?? '', cid = t?.container.id ?? '', server = t?.container.server_name ?? '';
  // The pass a state belongs to: a state of any other pass (another computer, kind, context or refresh) is never shown.
  const id = on ? JSON.stringify([pid, cid, server, o.kind, gen, epoch]) : '';
  const [st, setSt] = useState<{ id: string; s: PassState } | null>(null);

  useEffect(() => {
    const c = tRef.current;
    if (!id || !c) return undefined;
    const stop = startPass(c, o.kind, gen, (s) => setSt({ id, s }));
    // A pass's state never outlives it: re-enabling with the same inputs starts from nothing, never an old answer.
    return () => { stop(); setSt(null); };
    // `id` names every input of the pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const refresh = useCallback(() => {
    const c = tRef.current;
    if (!c) return;
    drop(c);
    launcherDropped.delete(computerId(c));
    setEpoch((e) => e + 1);
  }, []);
  const reprobe = useCallback((tpl: TemplateId) => { const c = tRef.current; if (c) reprobeOn(c, tpl); }, []);
  const dropLauncher = useCallback(() => { const c = tRef.current; if (c) dropLauncherOn(c); }, []);
  // An invalidation of this computer (from this hook or a launch's end watched elsewhere) starts the pass again.
  const cidKey = t ? computerId(t) : '';
  useEffect(() => {
    if (!cidKey) return undefined;
    const r = { id: cidKey, go: () => setEpoch((e) => e + 1) };
    restarts.add(r);
    return () => { restarts.delete(r); };
  }, [cidKey]);

  return useMemo(() => {
    const cur = id && st?.id === id ? st.s : null;
    const rows = cur?.rows ?? (DEFAULT_ORDER[o.kind] ?? []).map((tpl): ProbeRow => ({ tpl, state: 'unchecked' }));
    const base = cur ? { screen: cur.screen, launcher: cur.launcher, checking: cur.checking } : { ...IDLE, checking: !!id };
    return { rows, ...base, refresh, reprobe, dropLauncher };
  }, [st, id, o.kind, refresh, reprobe, dropLauncher]);
}
