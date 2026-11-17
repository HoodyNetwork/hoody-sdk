// A TODO's actions (C9 outcomes), declared once and sent through core's api(), settled (never
// rejects), in the TODO's realm.
//   - Run (runTodo) and Approve (approveTodoProposal) each start an unattended worker: the request is the person's
//     approval, the worker asks nobody (its questions and approvals are denied), so both are confirmed first. Deny
//     (denyTodoProposal) starts nothing.
//   - Claim and release are not offered: a lease needs an owner session that renews it every
//     2 minutes (the agent's rule), and a Hub tab is not one. A TODO a worker holds reads "Claimed by a worker",
//     read only, and offers Cancel run instead of Run.
//   - Cancel run (cancelTodoRun) releases the lease as cancelled, which writes a run_end entry ("run cancelled by user",
//     outcome cancelled) before the worker stops. The run it is about is bound at the send: the store reads the TODO
//     first and takes the lease's worker session (no lease: nothing is sent). Its outcome is THAT run's run_end (the
//     first run_end after the run_start the worker wrote, meta.session): "Run cancelled" only on
//     a read of it ending cancelled; until that entry is read it stays unknown, and a refusal shows how that run ended,
//     if it did. The release writes no session on its run_end, and a worker takes the lease before
//     it writes its run_start, so an end that names no session may be a later run's (A's lease lapses, B takes it, B is
//     cancelled before B's start is written). Such an end never settles a cancel, answered or not;
//     only an end that names its session does.
//   - Every send is bound to the attempt it was confirmed for: the confirm
//     captured identOf() at its open (confirm.ts), and the store reads the TODO again just before the send and sends
//     nothing ('changed') when that identity moved: Run needs the same content revision and state and no lease; a
//     proposal the same proposal, still pending by the closed-set parser and before its expires_at; Cancel run the same
//     lease session (its run). The agent takes no expected session on cancel-run, so a run that ends and is replaced
//     between that read and the send can still be the one cancelled (a known residual).
//   - None of these is keyed: a lost answer is never sent again. A lost deny settles when the proposal reads denied;
//     a lost approve is never settled done from a read: 'approved' is provisional (the agent puts a proposal back to
//     pending when its worker fails to start), so it is shown as what the TODO reads
//     now. A proposal read denied or expired (both final) rules the other out; missing or unrecognised proves nothing.
//     A lost cancel settles when its run's run_end reads cancelled. A lost Run is never settled from a read: the answer
//     is the only thing naming its worker, and a run_start since cannot say which request started it. Check again shows
//     what the TODO reads, and the attempt stays unknown until the person stops tracking it.
import { alive, api, capture, defineRoute, errorInfo, outcomeOf, stringOrEmpty as str, type CallInput, type Ctx, type Route } from '@core';
import { todoRoutes } from './data';

export const actionRoutes = {
  run: defineRoute({ method: 'POST', path: '/todos/:id/run', scope: 'agent', realm: 'realm' }),
  cancelRun: defineRoute({ method: 'POST', path: '/todos/:id/cancel-run', scope: 'agent', realm: 'realm' }),
  approve: defineRoute({ method: 'POST', path: '/todos/:id/proposals/:pid/approve', scope: 'agent', realm: 'realm' }),
  deny: defineRoute({ method: 'POST', path: '/todos/:id/proposals/:pid/deny', scope: 'agent', realm: 'realm' }),
} as const;

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : null);
const num = (x: unknown): string => (typeof x === 'number' && Number.isFinite(x) ? String(x) : '');

export interface Refusal {
  kind: 'pending' | 'failed' | 'not_sent' | 'stale';
  code: string;
  status: number;
  /** The rejection itself, for the outcome's details. */
  error?: unknown;
}
export type Settled = { ok: true; body: unknown } | { ok: false; err: Refusal };

export function refusalOf(e: unknown, change: boolean): Refusal {
  const x = rec(e) ?? {};
  return { kind: outcomeOf(e, change), code: (errorInfo(e).code ?? '').toLowerCase(), status: typeof x.status === 'number' ? x.status : 0, error: e };
}

async function call(route: Route, input: CallInput, change: boolean): Promise<Settled> {
  try {
    return { ok: true, body: (await api(route, input)) ?? {} };
  } catch (e) {
    return { ok: false, err: refusalOf(e, change) };
  }
}

/** A proposal's status: the agent's closed set (protocol PendingProposal.Status); anything else, missing included,
 *  is 'unknown', which never rules anything out. */
export type PState = 'pending' | 'approved' | 'denied' | 'expired' | 'unknown';
const PSTATES: readonly string[] = ['pending', 'approved', 'denied', 'expired'];
export const proposalState = (x: unknown): PState => (typeof x === 'string' && PSTATES.includes(x) ? (x as PState) : 'unknown');

/** What a read of the TODO shows that the actions' evidence needs. */
export interface Seen {
  lease: { acquiredAt: string; expiresAt: string; session: string } | null;
  /** The TODO's state and content revision (content_rev: field and state edits, not timeline, lease or proposals). */
  state: string;
  contentRev: string;
  proposals: Record<string, { status: PState; expiresAt: string; rev: string }>;
  /** run_start / run_end entries, oldest first. */
  runs: Array<{ kind: 'run_start' | 'run_end'; ts: string; outcome: string; body: string; session: string }>;
}

/** getTodo's answer for TODO `id`, reduced to what the evidence reads; anything that is not an ok answer carrying that TODO is
 *  null (proves nothing): another TODO's record, or an answer without the agent's `status: "ok"`, is not this one's evidence. */
export function seenOf(raw: unknown, id: string): Seen | null {
  if (rec(raw)?.status !== 'ok') return null;
  const t = rec(rec(raw)?.todo);
  if (!t || !str(t.id) || str(t.id) !== id) return null;
  const l = rec(t.lease);
  const proposals: Seen['proposals'] = {};
  for (const p of Array.isArray(t.proposals) ? t.proposals : []) {
    const r = rec(p);
    if (r && str(r.id)) proposals[str(r.id)] = { status: proposalState(r.status), expiresAt: str(r.expires_at), rev: num(r.todo_revision) };
  }
  const runs: Seen['runs'] = [];
  for (const e of Array.isArray(t.timeline) ? t.timeline : []) {
    const r = rec(e);
    const kind = str(r?.kind);
    if (r && (kind === 'run_start' || kind === 'run_end')) runs.push({ kind, ts: str(r.ts), outcome: str(rec(r.meta)?.outcome), body: str(r.body), session: str(rec(r.meta)?.session) });
  }
  return {
    lease: l ? { acquiredAt: str(l.acquired_at), expiresAt: str(l.expires_at), session: str(l.session_id) } : null,
    state: str(t.state),
    contentRev: num(t.content_rev),
    proposals,
    runs,
  };
}

export interface TodoApi {
  read(): Promise<Seen | null>;
  run(): Promise<Settled>;
  cancelRun(): Promise<Settled>;
  approve(pid: string): Promise<Settled>;
  deny(pid: string): Promise<Settled>;
}

/** The calls for TODO `id` in `realm`, all under `ctx` (the context the action was taken in). */
export function todoApi(id: string, realm: string, ctx: Ctx): TodoApi {
  const at = (params: Record<string, string>): CallInput => ({ params, ctx, recovers: true, ...(realm ? { realm } : {}) });
  return {
    read: async () => {
      const r = await call(todoRoutes.todo as Route, at({ id }), false);
      return r.ok ? seenOf(r.body, id) : null;
    },
    run: () => call(actionRoutes.run as Route, at({ id }), true),
    cancelRun: () => call(actionRoutes.cancelRun as Route, at({ id }), true),
    approve: (pid) => call(actionRoutes.approve as Route, at({ id, pid }), true),
    deny: (pid) => call(actionRoutes.deny as Route, at({ id, pid }), true),
  };
}

// ---- evidence ----

export type Action = 'run' | 'cancelRun' | 'approve' | 'deny';

/** How the agent's run_start names a run a person asked for (todos.run). */
export const RUN_TRIGGER = '(todos.run RPC)';

/** Skew allowed between this browser's clock and the agent's. */
export const SKEW_MS = 120_000;

type RunEntry = Seen['runs'][number];
/** The run of worker session `session`: its newest run_start, and its run_end once written: the first run_end after
 *  it naming that session or none (the lease release writes none), and never one past the next
 *  run_start of any session (a lease that expired and was taken over writes no end for the old run; an unlabelled end
 *  after another start is that run's). `named`: the end names this session (an unnamed one may be a later run's, whose
 *  start is not written yet). Null when the read shows no run_start of that session. */
export function runOf(seen: Seen, session: string): { start: RunEntry; end: RunEntry | null; named: boolean } | null {
  if (!session) return null;
  for (let i = seen.runs.length - 1; i >= 0; i--) {
    const r = seen.runs[i]!;
    if (r.kind !== 'run_start' || r.session !== session) continue;
    let end: RunEntry | null = null;
    for (const e of seen.runs.slice(i + 1)) {
      if (e.kind === 'run_start') break;
      if (!e.session || e.session === session) {
        end = e;
        break;
      }
    }
    return { start: r, end, named: !!end && end.session === session };
  }
  return null;
}

/** True when `at` (an RFC 3339 time) parses and is not after `now`. Unparseable: not known to be past. */
export const past = (at: string, now: number): boolean => {
  const ms = Date.parse(at);
  return Number.isFinite(ms) && ms <= now;
};

const CLOSED = ['done', 'dropped'];

/** What action `a` would act on in this read, or null when the TODO does not offer it now. A confirm captures it at
 *  its open and the store compares it again just before the send: Run, the content revision and state of a TODO no
 *  worker holds; a proposal, its id and the revision it was made against while it is pending and before its
 *  expires_at on a TODO no worker holds; Cancel run, the lease's worker session. */
export function identOf(a: Action, pid: string, seen: Seen, now: number): string | null {
  if (CLOSED.includes(seen.state)) return null;
  switch (a) {
    case 'run':
      return seen.lease ? null : `run\n${seen.contentRev}\n${seen.state}`;
    case 'cancelRun':
      return seen.lease?.session ? `cancel\n${seen.lease.session}` : null;
    case 'approve':
    case 'deny': {
      const p = seen.proposals[pid];
      if (!pid || seen.lease || !p || p.status !== 'pending' || past(p.expiresAt, now)) return null;
      return `proposal\n${pid}\n${p.rev}`;
    }
  }
}

/** A Run's lost answer, observed: the newest run_start for a person's run request since the send (less skew). Shown
 *  for what it is; it never settles the Run. */
export function runSeenSince(seen: Seen, sentAt: number): RunEntry | null {
  for (let i = seen.runs.length - 1; i >= 0; i--) {
    const r = seen.runs[i]!;
    const ms = Date.parse(r.ts);
    if (r.kind === 'run_start' && r.body.endsWith(RUN_TRIGGER) && Number.isFinite(ms) && ms >= sentAt - SKEW_MS) return r;
  }
  return null;
}

/** What a read of the TODO says about an action: made, ruled out, or nothing either way. `run` is the run a cancel
 *  is about (its worker session, captured at the send). */
export function verdict(a: Action, pid: string, seen: Seen, run: string): 'made' | 'not' | 'unknown' {
  switch (a) {
    case 'run':
      return 'unknown';
    // Denied and expired are final. Approved is provisional (a worker that fails to start puts it back to pending), so
    // it settles nothing either way; pending, unknown or missing prove nothing.
    case 'approve': {
      const st = seen.proposals[pid]?.status;
      return st === 'denied' || st === 'expired' ? 'not' : 'unknown';
    }
    case 'deny': {
      const st = seen.proposals[pid]?.status;
      return st === 'denied' ? 'made' : st === 'expired' ? 'not' : 'unknown';
    }
    // Its run ended cancelled: made only when the end names its session (an unnamed end may be a
    // takeover's, written before that run's start, so it never settles, answered or not). Ended another way: shown, but
    // not ruled out (the request may have reached a run that started after the read at the send).
    case 'cancelRun': {
      const r = runOf(seen, run);
      return r?.end?.outcome === 'cancelled' && r.named ? 'made' : 'unknown';
    }
  }
}

// ---- one TODO's action ----

export type Phase = 'idle' | 'running' | 'done' | 'refused' | 'unsure';
export interface ActionView {
  phase: Phase;
  action: Action | null;
  /** The proposal an approve or deny is about. */
  pid: string;
  refusal: Refusal | null;
  /** Nothing was sent: the read before the send failed ('readFailed'), showed no run to cancel ('noRun'), or showed
   *  the TODO no longer as it was when the action was confirmed ('changed'). */
  notSent: 'readFailed' | 'noRun' | 'changed' | null;
  /** Approve/deny, unknown: the proposal's status in the last read. */
  proposalNow: PState | null;
  /** A read ruled the action out (the proposal was decided the other way meanwhile). */
  ruledOut: boolean;
  /** After a check that settled nothing: what the read saw. */
  observed: 'same' | 'failed' | null;
  reading: boolean;
  /** Cancel run: the agent answered, and the run's end is not read yet (or not written yet). */
  answered: boolean;
  /** Cancel run: how ITS run ended, from that run's run_end (null: not read, or not ended). `named`: the end names the
   *  run's session; an unnamed one may be another lease's, so it is never told as this run's. */
  ended: { outcome: string; body: string; named: boolean } | null;
  /** A lost Run, observed: a run_start for a run request around the send (this one or another). */
  runSeen: { ts: string } | null;
  /** Settled from a read, not an answer: told as what the TODO shows, never as this request's answer. */
  fromRead: boolean;
}
const IDLE: ActionView = { phase: 'idle', action: null, pid: '', refusal: null, notSent: null, proposalNow: null, ruledOut: false, observed: null, reading: false, answered: false, ended: null, runSeen: null, fromRead: false };

export interface ActionStore {
  view(): ActionView;
  subscribe(fn: () => void): () => void;
  /** Sends one action; refused while another is out or unsure. Reads the TODO first and sends nothing unless it
   *  still offers the action with identity `expect` (identOf at the confirm's open; null: whatever it offers now, for
   *  an unconfirmed Deny). A cancel binds its run from that read. */
  run(a: Action, pid: string, expect: string | null): Promise<void>;
  /** Reads the TODO (the store's own, never another); settles an unsure action only on a sight bound to it. Never
   *  sends it again. */
  check(): Promise<void>;
  /** A confirm's open: reads the TODO and says what `a` would act on now (identOf), or null (not offered, or the read
   *  failed). Sends nothing. */
  identify(a: Action, pid: string): Promise<string | null>;
  /** The person stops tracking an unsure action: nothing is sent, nothing is claimed. */
  forget(): void;
  /** Back to idle after done or refused. */
  clear(): void;
  /** Something is out or unknown: the store is kept while it is. */
  holds(): boolean;
  readonly ctx: Ctx;
}

export function createActionStore(o: { api: TodoApi; ctx?: Ctx; now?: () => number }): ActionStore {
  const ctx = o.ctx ?? capture();
  const now = o.now ?? Date.now;
  let v: ActionView = IDLE;
  let sentAt = 0;
  /** Cancel run: the worker session whose run it cancels, read just before the send. */
  let runId = '';
  /** Each operation's number: a result that comes back after the person moved on is dropped. */
  let gen = 0;
  const subs = new Set<() => void>();
  const set = (p: Partial<ActionView>) => {
    v = { ...v, ...p };
    for (const f of [...subs]) f();
  };
  const busy = () => v.phase === 'running' || v.phase === 'unsure';
  /** What a read says about the action out: settles it when bound evidence shows, else keeps it unknown with what
   *  the read saw. */
  const judge = (seen: Seen) => {
    const a = v.action!;
    const run = a === 'cancelRun' ? runOf(seen, runId) : null;
    const ended = run?.end ? { outcome: run.end.outcome, body: run.end.body, named: run.named } : null;
    const said = verdict(a, v.pid, seen, runId);
    const proposalNow = a === 'approve' || a === 'deny' ? (seen.proposals[v.pid]?.status ?? null) : null;
    if (said === 'unknown') {
      const r = a === 'run' ? runSeenSince(seen, sentAt) : null;
      return set({ reading: false, observed: 'same', ended, runSeen: r ? { ts: r.ts } : null, proposalNow });
    }
    // An answered cancel read back cancelled is the answer's own outcome; anything else settled by a read is told as
    // what the TODO shows.
    set({ phase: said === 'made' ? 'done' : 'refused', ruledOut: said === 'not', fromRead: !v.answered, reading: false, observed: null, refusal: null, ended, runSeen: null });
  };
  return {
    ctx,
    view: () => v,
    subscribe: (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    holds: () => busy(),
    identify: async (a, pid) => {
      const seen = await o.api.read();
      return seen ? identOf(a, pid, seen, now()) : null;
    },
    run: async (a, pid, expect) => {
      if (busy() || ((a === 'approve' || a === 'deny') && !pid)) return;
      const g = ++gen;
      set({ ...IDLE, phase: 'running', action: a, pid });
      const before = await o.api.read();
      if (g !== gen) return;
      if (!before) return set({ phase: 'refused', notSent: 'readFailed' });
      if (a === 'cancelRun' && !before.lease?.session) return set({ phase: 'refused', notSent: 'noRun' });
      const id = identOf(a, pid, before, now());
      if (id === null || (expect !== null && id !== expect)) return set({ phase: 'refused', notSent: 'changed' });
      runId = before.lease?.session ?? '';
      sentAt = now();
      const r = a === 'run' ? await o.api.run() : a === 'cancelRun' ? await o.api.cancelRun() : a === 'approve' ? await o.api.approve(pid) : await o.api.deny(pid);
      if (g !== gen) return;
      if (!r.ok && r.err.kind === 'pending') return set({ phase: 'unsure', refusal: r.err });
      if (a !== 'cancelRun') return r.ok ? set({ phase: 'done', refusal: null }) : set({ phase: 'refused', refusal: r.err });
      // Cancel run: its outcome is its run's run_end. Answered, it stays unknown until that entry reads cancelled;
      // refused, that run's end (if it ended) shows how it had ended.
      if (r.ok) set({ phase: 'unsure', answered: true, refusal: null });
      else set({ phase: 'refused', refusal: r.err });
      if (!alive(ctx)) return;
      set({ reading: true });
      const seen = await o.api.read();
      if (g !== gen) return;
      if (!r.ok) {
        const run = seen ? runOf(seen, runId) : null;
        return set({ reading: false, ended: run?.end ? { outcome: run.end.outcome, body: run.end.body, named: run.named } : null });
      }
      if (!seen) return set({ reading: false, observed: 'failed' });
      judge(seen);
    },
    check: async () => {
      if (v.phase !== 'unsure' || v.reading || !alive(ctx) || !v.action) return;
      const g = gen;
      set({ reading: true });
      const seen = await o.api.read();
      if (g !== gen) return;
      if (!seen) return set({ reading: false, observed: 'failed' });
      judge(seen);
    },
    forget: () => {
      if (v.phase !== 'unsure') return;
      gen++;
      set(IDLE);
    },
    clear: () => {
      if (v.phase !== 'done' && v.phase !== 'refused') return;
      gen++;
      set(IDLE);
    },
  };
}
