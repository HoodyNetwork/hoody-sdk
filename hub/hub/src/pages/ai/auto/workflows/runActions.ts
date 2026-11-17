// Cancel and Resume of a workflow run, and the run's detail read, on the computer's agent in
// the run's realm.
//   - cancelWorkflowRun stops further steps; steps already done stay done. resumeWorkflowRun {session_id} continues a
//     failed or cancelled run from its first unfinished step in a live, idle chat that matches the run (it spends): its
//     own chat, or (ResumeOpts.chat) a new chat newChat.ts made and proved for it. The agent resumes a run once: while a
//     resume of it runs or after one completed, another is refused.
//   - Every call is sent in the context it is given (a capture of the place the page showed when the action opened; null
//     sends and reads nothing), like runApi.ts.
//   - Each action is sent once. A lost answer is `unsure` and never resent by the page: Check again reads the listing:
//     for a Cancel the run's own state (cancelled = done; completed or failed = `ended`, never called cancelled). A lost
//     Resume is never settled from the listing: a run resumed from it, other
//     than those listed before the send or named by an earlier Resume here, is said as listed (`unclear`: it may be
//     another tab's), never as this one's. Stop tracking (a person's choice) forgets it.
//   - An accepted Cancel or Resume is not yet done (the agent acknowledges the request, not its effect: a resume is a
//     queued command the chat may still discard): the store reads the listing at once and says cancelled only when the
//     run reads cancelled.
//   - An accepted Resume names its new run (the agent mints the child run id when it queues the resume and answers
//     {run_id}): that run, and no other, settles it. Done unless it is `unstarted`, `claimOnly` or `cutShort` (runs.ts; cutShort stays unsure: `cut`); `dropped` when it
//     ended before any step started (runs.ts `unstarted`: the chat dropped or refused it, listed as failed with a finish
//     time and no step; a failed row with no finish time is a run whose daemon went away, which may have run steps):
//     nothing ran, the fence lifts and it may be sent again; running with no step yet (`starting`: the chat claims it
//     first and may still refuse it) or not listed yet, it stays unsure; not listed by a read made CHILD_MISSING_MS after
//     the answer, it is said as most likely never started (`missing`), still fenced. A run named by an earlier Resume of
//     this store never stands for a later one.
//   - Right before a Resume is sent the store reads the listing (a listing with an unreadable row that may be this run
//     or a resume of it counts as a failed read; other runs' unreadable rows do not): the runs already resumed from it are known and never taken for this one; when that read fails nothing is
//     sent (`unread`); when it lists a resume of it that is neither `unstarted` nor `claimOnly`, nothing is sent
//     (`resumed`: resume the newer run, since resuming this one again would run that resume's finished steps a second
//     time; the agent itself allows it once the resume ended). runs.ts `resumable` does not offer it either. The listing is the fence a reload or
//     another tab still has; the agent refuses a second Resume while one is queued (its reservation has no expiry: it
//     ends when the chat starts, refuses or drops it) or running, and after one completed.
//   - The agent keeps the fence the page cannot (its lineage is the whole chain of resumes, and it decides at the send):
//     it refuses, before anything starts, a Resume of a run that a newer run of the same original run supersedes
//     (409 resume_superseded; details.resume_run_id names the run to resume instead: `superseded`, never offered again
//     from here) and one whose history it could not read (503 resume_lineage_unknown: `lineage`, try again). Both are
//     taken as refusals only with core's proof that the agent changed nothing (notApplied); without it a 5xx stays unsure.
//     The page's own listing checks above (`resumed`, runs.ts `resumable`) look at direct resumes only and are a
//     courtesy that saves a refused send; no walk of the chain is made here, so the rule lives in one place.
//   - Once an action was accepted or may have run, the store keeps it fenced for the page's life: dismissing its message
//     does not offer it again (the listing may still show the old row). Only Stop tracking lifts the fence of an unsure one.
//   - core's outcomes (core/api.ts C9): a change whose answer is lost, late or arrives after its context died is
//     `pending` (unsure here); `not_sent` and `stale` are calls that were never sent.
import { api, defineRoute, type CallInput, type Ctx, type Route } from '@core';
import { refusalOf, type Refusal } from './sourceApi';
import { claimOnly, cutShort, parseRun, parseRunDetail, parseRuns, unstarted, type Run, type RunDetail } from './runs';
import { runRoutes } from './runsData';

export const actionRoutes = {
  cancel: defineRoute({ method: 'POST', path: '/workflows/runs/:runId/cancel', scope: 'agent', realm: 'realm', refuses: ['not_found'] }),
  resume: defineRoute<unknown, { session_id: string }>({
    method: 'POST', path: '/workflows/runs/:runId/resume', scope: 'agent', realm: 'realm', body: ['session_id'],
    refuses: ['session_busy', 'approval_policy_unsatisfiable', 'spend_cap', 'not_found', 'bad_request', 'resume_superseded', 'resume_lineage_unknown'],
  }),
  get: defineRoute({ method: 'GET', path: '/workflows/runs/:runId', scope: 'agent', realm: 'realm' }),
} as const;

/** A call that did not succeed. `notApplied`: core's proof that the agent refused before changing anything (a code the
 *  route declares). `instead`: the run a resume_superseded refusal names to resume instead. */
export type ActionErr = Pick<Refusal, 'kind' | 'code' | 'status'> & { notApplied?: true; instead?: string };
export type ActionSettled = { ok: true; body: unknown } | { ok: false; err: ActionErr };

export interface ActionApi {
  cancel(runId: string, ctx: Ctx | null): Promise<ActionSettled>;
  resume(runId: string, sessionId: string, ctx: Ctx | null): Promise<ActionSettled>;
  /** The realm's runs; null when the read failed or nothing could be read here, or when a row that
   *  could not be read may be run `about` or a run resumed from it (every unreadable row counts when `about` is absent). */
  list(ctx: Ctx | null, about?: string): Promise<Run[] | null>;
  /** One run with its steps: the detail, 'gone' (404: no longer kept, or not this realm/account), or null (failed). */
  get(runId: string, ctx: Ctx | null): Promise<RunDetail | 'gone' | null>;
}

const NOT_SENT: ActionSettled = { ok: false, err: { kind: 'not_sent', code: '', status: 0 } };
const RUN_ID = /^[\w.:-]{1,128}$/;

/** A thrown call as the action's error: the refusal's kind, code and status, the agent's "nothing changed" proof, and for
 *  a resume_superseded refusal of run `runId` the other run its details name (a plain id only). */
function errOf(e: unknown, runId: string): ActionErr {
  const r = refusalOf(e, true);
  const d = e && typeof e === 'object' ? (e as { details?: unknown }).details : undefined;
  const named = d && typeof d === 'object' && !Array.isArray(d) ? (d as { resume_run_id?: unknown }).resume_run_id : undefined;
  const instead = r.notApplied && r.code === 'resume_superseded' && typeof named === 'string' && RUN_ID.test(named) && named !== runId ? named : null;
  return { kind: r.kind, code: r.code, status: r.status, ...(r.notApplied ? { notApplied: true as const } : {}), ...(instead ? { instead } : {}) };
}

/** The calls in `realm`, each in the context it is given. */
export function runActionApi(realm: string): ActionApi {
  const send = async (route: Route, runId: string, input: CallInput, ctx: Ctx | null): Promise<ActionSettled> => {
    if (!ctx) return NOT_SENT;
    try {
      return { ok: true, body: (await api(route, { ...input, params: { runId }, realm, ctx } as CallInput)) ?? {} };
    } catch (e) {
      return { ok: false, err: errOf(e, runId) };
    }
  };
  return {
    cancel: (runId, ctx) => send(actionRoutes.cancel as Route, runId, {} as CallInput, ctx),
    resume: (runId, session_id, ctx) => send(actionRoutes.resume as Route, runId, { body: { session_id } } as CallInput, ctx),
    get: async (runId, ctx) => {
      if (!ctx) return null;
      try {
        return parseRunDetail(await api(actionRoutes.get as Route, { params: { runId }, realm, ctx } as CallInput));
      } catch (e) {
        return refusalOf(e, false).status === 404 ? 'gone' : null;
      }
    },
    list: async (ctx, about) => {
      if (!ctx) return null;
      try {
        const raw = await api(runRoutes.list as Route, { query: { limit: 0 }, realm, ctx } as CallInput);
        const l = parseRuns(raw);
        if (l.skipped === 0) return l.runs.slice();
        // A row that could not be read is no evidence of which resumes exist: when it may be this run or one resumed from
        // it, the read counts as failed. Other runs' unreadable rows (another workflow's long name) block nothing.
        if (about === undefined) return null;
        const kept = new Set(l.runs.map((r) => r.id));
        const items = (raw as { items: unknown[] }).items;
        return items.some((x) => mayBeAbout(x, about, kept)) ? null : l.runs.slice();
      } catch {
        return null;
      }
    },
  };
}

/** Whether a listing row that was not kept (unreadable, or sharing its id) may be run `id` or a run resumed from it. */
function mayBeAbout(x: unknown, id: string, kept: ReadonlySet<string>): boolean {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  if (!o) return true;
  const parsed = parseRun(o);
  if (parsed && kept.has(parsed.id)) return false;
  const rid = o.run_id, from = o.resumed_from;
  if (typeof rid !== 'string' || rid === id) return true;
  return from !== undefined && from !== null && (typeof from !== 'string' || from === id);
}

/** How long an accepted Resume's named run may go unlisted before the page says it most likely never started. */
export const CHILD_MISSING_MS = 10 * 60_000;

/** The newest listed run resumed from `id`, or null. */
export function resumeOf(runs: readonly Run[], id: string): Run | null {
  let best: Run | null = null;
  for (const r of runs) if (r.resumedFrom === id && (!best || r.startedAt > best.startedAt)) best = r;
  return best;
}

export type ActionKind = 'cancel' | 'resume';
export type RefusedWhy = 'busy' | 'gone' | 'spendCap' | 'policy' | 'notSent' | 'refused' | 'unheld' | 'unread' | 'resumed' | 'dropped' | 'superseded' | 'lineage';
export type ActionView =
  | { phase: 'idle' }
  | { phase: 'running'; kind: ActionKind }
  /** `chat`: the new chat a Resume went to (absent: the run's own). */
  | { phase: 'done'; kind: ActionKind; found: string | null; chat?: string }
  /** A Cancel whose answer was lost, and the run is no longer running but did not end cancelled: it finished as `state`. */
  | { phase: 'ended'; kind: 'cancel'; state: 'completed' | 'failed' }
  /** `instead` (why `superseded` only): the run the agent named to resume instead. */
  | { phase: 'refused'; kind: ActionKind; why: RefusedWhy; instead?: string }
  /** Not known yet: the answer was lost, or (`accepted`) the agent took a Cancel and the run's final state is unread. */
  | { phase: 'unsure'; kind: ActionKind; runId: string; accepted: boolean; observed: 'unchecked' | 'checking' | 'none' | 'running' | 'failed' | 'unclear' | 'starting' | 'cut' | 'missing'; chat?: string };

/** A context, or a reader of it called right before the send (after any wait): null sends nothing. */
export type CtxIn = Ctx | null | (() => Ctx | null);
const ctxOf = (c: CtxIn): Ctx | null => (typeof c === 'function' ? c() : c);
export interface ResumeOpts {
  /** First holds the run's chat open: 'held' sends; 'gone' (closed) and 'failed' (not held) send nothing and say so. */
  ready?: () => Promise<'held' | 'gone' | 'failed'>;
  /** Called once right before this Resume is sent, with the runs resumed from it that never stand for it (known()):
   *  this attempt's own snapshot, taken before its answer can name its run. */
  sending?: (known: readonly string[]) => void;
  /** The chat to resume in, when not the run's own: a new chat whose create was proven (newChat.ts). */
  chat?: string;
}

export interface ActionStore {
  view(): ActionView;
  subscribe(fn: () => void): () => void;
  cancel(run: Run, ctx: CtxIn): Promise<void>;
  /** Resumes `run` in its own chat, or in `opts.chat`. */
  resume(run: Run, ctx: CtxIn, opts?: ResumeOpts): Promise<void>;
  check(ctx: CtxIn): Promise<void>;
  /** The action was accepted or may have run, or the agent said the run is superseded: it is not offered again (until
   *  Stop tracking of an unsure one). */
  fenced(kind: ActionKind): boolean;
  /** The runs resumed from this store's run that never stand for its current Resume: those its read right before the send
   *  listed, and those earlier Resumes of this store named. Moves with later Resumes and Stop tracking, so it is read
   *  only by tests: an attempt takes its own copy from ResumeOpts.sending, never from here at handoff. */
  known(): readonly string[];
  forget(): void;
  clear(): void;
}

/** The agent's lineage refusals of a Resume, each made before anything started. */
const LINEAGE: Readonly<Record<string, RefusedWhy>> = { resume_superseded: 'superseded', resume_lineage_unknown: 'lineage' };
function mayHaveRun(err: ActionErr): boolean {
  if (err.kind === 'not_sent' || err.kind === 'stale') return false;
  if (err.kind === 'pending') return true;
  // A lineage refusal the agent proved changed nothing is definite whatever its status (one is a 503).
  if (err.notApplied === true && err.code in LINEAGE) return false;
  return err.status === 0 || err.status >= 500;
}
function whyOf(err: ActionErr): RefusedWhy {
  if (err.kind === 'not_sent' || err.kind === 'stale') return 'notSent';
  if (err.notApplied === true && err.code in LINEAGE) return LINEAGE[err.code]!;
  if (err.code === 'session_busy') return 'busy';
  if (err.code === 'not_found') return 'gone';
  if (err.code === 'spend_cap') return 'spendCap';
  if (err.code === 'approval_policy_unsatisfiable') return 'policy';
  return 'refused';
}

/** The new run an accepted Resume's answer names ({run_id}), or null: none, not a plain id, the run itself, or a run
 *  already known (listed before the send, or named by an earlier Resume). */
function childOf(body: unknown, runId: string, before: readonly string[], earlier: ReadonlySet<string>): string | null {
  const id = body && typeof body === 'object' ? (body as { run_id?: unknown }).run_id : undefined;
  if (typeof id !== 'string' || !/^[\w.:-]{1,128}$/.test(id) || id === runId || before.includes(id) || earlier.has(id)) return null;
  return id;
}

/** One run's Cancel/Resume state: one action at a time, each sent once. */
export function createActionStore(a: ActionApi, clock: () => number = Date.now): ActionStore {
  let v: ActionView = { phase: 'idle' };
  // When the agent took the current Resume (its named run is waited for from then).
  let acceptedAt = 0;
  let checks = 0;
  let before: readonly string[] = [];
  // The new run an accepted Resume named; null when its answer named none (lost, or an agent that sends no id).
  let child: string | null = null;
  // Runs named by earlier Resumes of this store: never this Resume's run.
  const earlier = new Set<string>();
  const fence = new Set<ActionKind>();
  const subs = new Set<() => void>();
  const set = (n: ActionView) => { v = n; for (const f of [...subs]) f(); };
  const read = async (ctx: CtxIn) => {
    if (v.phase !== 'unsure') return;
    const at = v;
    const mine = ++checks;
    set({ ...at, observed: 'checking' });
    const runs = await a.list(ctxOf(ctx), at.runId);
    if (mine !== checks || v.phase !== 'unsure' || v.runId !== at.runId) return;
    if (!runs) { set({ ...at, observed: 'failed' }); return; }
    if (at.kind === 'resume') {
      if (child === null) {
        // No named run (a lost answer): a listed resume may be another tab's or an earlier Resume's, so it is never taken
        // for this one; it is said as listed, and the Resume stays unsure.
        const listed = resumeOf(runs.filter((r) => !before.includes(r.id) && !earlier.has(r.id)), at.runId);
        set({ ...at, observed: listed ? 'unclear' : 'none' });
        return;
      }
      const found = runs.find((r) => r.id === child && r.resumedFrom === at.runId) ?? null;
      // Not listed: "check again" until CHILD_MISSING_MS, then said as most likely never started (still fenced).
      if (!found) set({ ...at, observed: clock() - acceptedAt > CHILD_MISSING_MS ? 'missing' : 'none' });
      else if (unstarted(found)) {
        // Nothing of it ran: the fence lifts, and its run is known so it never stands for a later Resume.
        earlier.add(found.id); child = null; fence.delete('resume');
        set({ phase: 'refused', kind: 'resume', why: 'dropped' });
      } else if (claimOnly(found)) set({ ...at, observed: 'starting' });
      // Its daemon went away before a step was recorded: it may or may not have run steps. Still fenced.
      else if (cutShort(found)) set({ ...at, observed: 'cut' });
      else set({ phase: 'done', kind: 'resume', found: found.id, ...(at.chat ? { chat: at.chat } : {}) });
      return;
    }
    // "Cancelled" only when the run itself reads cancelled; a run that finished another way is said as that.
    const now = runs.find((r) => r.id === at.runId);
    if (!now) set({ ...at, observed: 'none' });
    else if (now.state === 'cancelled') set({ phase: 'done', kind: 'cancel', found: null });
    else if (now.state === 'running') set({ ...at, observed: 'running' });
    else set({ phase: 'ended', kind: 'cancel', state: now.state });
  };
  const act = async (kind: ActionKind, run: Run, ctx: CtxIn, send: (c: Ctx | null) => Promise<ActionSettled>, ready?: () => Promise<'held' | 'gone' | 'failed'>, sending?: (known: readonly string[]) => void, chat?: string) => {
    const where = chat ? { chat } : {};
    if (v.phase === 'running' || v.phase === 'unsure' || fence.has(kind)) return;
    set({ phase: 'running', kind });
    if (ready) {
      const r = await ready();
      if (r !== 'held') { set({ phase: 'refused', kind, why: r === 'gone' ? 'gone' : 'unheld' }); return; }
    }
    if (kind === 'resume') {
      // The runs already resumed from it, read now: Check again never takes one of them for this resume.
      const listed = await a.list(ctxOf(ctx), run.id);
      if (!listed) { set({ phase: 'refused', kind, why: ctxOf(ctx) ? 'unread' : 'notSent' }); return; }
      before = listed.filter((x) => x.resumedFrom === run.id).map((x) => x.id);
      child = null;
      // A resume of it that may have run steps carries the work on (another tab, or before a reload): never again from here.
      // A claim only (running, no step) is left to the agent, which refuses a second resume while it holds one.
      if (listed.some((x) => x.resumedFrom === run.id && !unstarted(x) && !claimOnly(x))) { set({ phase: 'refused', kind, why: 'resumed' }); return; }
    }
    if (kind === 'resume') sending?.([...before, ...earlier]);
    // The place is read now, after any wait: a page that moved or closed meanwhile sends nothing.
    const r = await send(ctxOf(ctx));
    if (r.ok) {
      if (kind === 'resume') { child = childOf(r.body, run.id, before, earlier); acceptedAt = clock(); }
      fence.add(kind);
      set({ phase: 'unsure', kind, runId: run.id, accepted: true, observed: 'unchecked', ...where });
      await read(ctx);
    } else if (mayHaveRun(r.err)) {
      fence.add(kind);
      set({ phase: 'unsure', kind, runId: run.id, accepted: false, observed: 'unchecked', ...where });
    } else {
      const why = whyOf(r.err);
      // Superseded for good (a newer run of its lineage started a step): this run is never offered again from here.
      if (why === 'superseded') fence.add(kind);
      set({ phase: 'refused', kind, why, ...(why === 'superseded' && r.err.instead ? { instead: r.err.instead } : {}) });
    }
  };
  return {
    view: () => v,
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    cancel: (run, ctx) => act('cancel', run, ctx, (c) => a.cancel(run.id, c)),
    resume: (run, ctx, opts = {}) => act('resume', run, ctx, (c) => a.resume(run.id, opts.chat ?? run.sid, c), opts.ready, opts.sending, opts.chat),
    check: read,
    fenced: (kind) => fence.has(kind),
    known: () => [...before, ...earlier],
    forget() {
      if (v.phase !== 'unsure') return;
      if (v.kind === 'resume' && child !== null) earlier.add(child);
      fence.delete(v.kind); checks++; set({ phase: 'idle' });
    },
    clear() { if (v.phase === 'done' || v.phase === 'refused' || v.phase === 'ended') set({ phase: 'idle' }); },
  };
}

/** Whether a run's store still lets `kind` be offered: nothing is out or unsure, that action has not settled, and it is
 *  not fenced. A run with no store yet (`undefined`) has done nothing. The Runs list's row menu and the run's detail
 *  both ask this. */
export function storeOffers(s: Pick<ActionStore, 'view' | 'fenced'> | undefined, kind: ActionKind): boolean {
  if (!s) return true;
  const v = s.view();
  if (v.phase === 'running' || v.phase === 'unsure') return false;
  if ((v.phase === 'done' || v.phase === 'ended') && v.kind === kind) return false;
  return !s.fenced(kind);
}
