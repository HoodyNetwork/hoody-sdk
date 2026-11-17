// shellJobStop: a chat's shell jobs from the agent's
// PER-SESSION list, and a Stop of one of them. Engine-free: the host supplies the two reads/sends, the key minter and
// the activation gate; nothing here knows a route.
//
// What this module guarantees, whatever the host's operations do:
//   - Rows come only from the per-session list (GET /sessions/{id}/bash-jobs), parsed whole (jobStop.ts). The stream's
//     event.bash_job_list names every session's jobs, so a Stop is never offered on a row this list did not name.
//   - One key per attempt, minted on a press; the body is constant. A new Stop is always a new key, on a press; nothing here
//     resends a request (page memory only, no journal: a reload forgets the attempt and the list shows the job's state).
//   - Every attempt is bound to its target captured at send {computer, realm, sid, jobId}: its answer, and
//     a Check again of it, settle only that attempt.
//   - Only positive evidence settles (jobStop.ts): stopped, not running now (never "stopped" when it had ended before),
//     still running, not sent, gone. A lost answer, a thrown operation, outcome unknown, 422 and anything unreadable are
//     unknown. Check again is a READ (the list) and settles only "not running now"; it never sends the stop again.
//   - A press is checked against the activation gate (capability 'stopJob') at the moment it is made.
//   - Check again settles only from the newest read: a read a newer one overtook is discarded for the attempt as for the rows.
//   - Each attempt keeps the row it was pressed on, so an attempt still open (sending, or unknown) stays visible with its Check
//     again when a newer list no longer names the job; such a row is never offered a new Stop (canStop reads the list).
import type { Capability } from './capability';
import { evidenceOfRead, evidenceOfStop, parseJobList, parseJobStopReply, type JobRow, type StopReason } from './jobStop';

export interface ChatRef { computer: string; realm: string; sid: string }
export interface JobStopTarget extends ChatRef { jobId: string }

export interface ShellJobStopDeps {
  /** The chat this store reads; every attempt captures it with its job. */
  chat: ChatRef;
  /** GET the chat's per-session list: `{ok: true, body}` with the raw body, or `{ok: false}`. A throw is unreadable. */
  list(chat: ChatRef): Promise<{ ok: true; body: unknown } | { ok: false }>;
  /** POST the stop under `key`, answering the settled reply as jobStop.ts's JobStopReply. A throw is a lost answer. */
  stop(target: JobStopTarget, key: string): Promise<unknown>;
  /** A fresh idempotency key. */
  newKey(): string;
  /** The activation gate for 'stopJob', read at the moment of a press. */
  can(): Capability;
  /** A debug note (never the key). */
  debug?(message: string, attrs: Readonly<Record<string, string>>): void;
}

export type StopSettled = 'stopped' | 'not_running' | 'running' | 'not_sent' | 'gone';
export type JobAttemptView =
  | { phase: 'sending' }
  | { phase: 'settled'; evidence: StopSettled; reason?: StopReason }
  | { phase: 'unknown'; checking: boolean };

export interface ShellJobStopsSnapshot {
  /** The per-session list as last read whole; null before the first readable read. */
  rows: readonly JobRow[] | null;
  /** The last read could not be read whole (the rows shown, if any, are from an earlier read). */
  listUnreadable: boolean;
  /** One attempt per job id, the newest press only. */
  attempts: ReadonlyMap<string, JobAttemptView>;
  /** The row each attempt was pressed on, as the list named it then. */
  attemptRows: ReadonlyMap<string, JobRow>;
}

export type StopRefusal = 'not_listed' | 'not_running' | 'busy' | 'capability';
export type StopResult = { k: 'sent'; view: JobAttemptView } | { k: 'refused'; why: StopRefusal; capability?: Capability };

export interface ShellJobStops {
  snapshot(): ShellJobStopsSnapshot;
  subscribe(fn: () => void): () => void;
  /** Reads the per-session list again. */
  refresh(): Promise<void>;
  /** May `jobId` be stopped now? Only a row of the last list that is running or unknown, with no stop or check of it on its way. */
  canStop(jobId: string): StopResult | { k: 'ok' };
  /** A press: a new key, one request, its answer read whole. */
  stop(jobId: string): Promise<StopResult>;
  /** Check again on an unknown attempt: reads the list, never sends. */
  check(jobId: string): Promise<void>;
}

interface Attempt { target: JobStopTarget; row: JobRow; view: JobAttemptView }

export function createShellJobStops(deps: ShellJobStopDeps): ShellJobStops {
  const chat: ChatRef = { computer: deps.chat.computer, realm: deps.chat.realm, sid: deps.chat.sid };
  let rows: readonly JobRow[] | null = null;
  let listUnreadable = false;
  const attempts = new Map<string, Attempt>();
  let readSeq = 0;
  let readApplied = 0;
  let snap: ShellJobStopsSnapshot | null = null;
  const subs = new Set<() => void>();

  const changed = () => {
    snap = null;
    for (const fn of [...subs]) fn();
  };
  const snapshot = (): ShellJobStopsSnapshot => {
    if (!snap) {
      snap = {
        rows, listUnreadable,
        attempts: new Map([...attempts].map(([k, a]) => [k, a.view])),
        attemptRows: new Map([...attempts].map(([k, a]) => [k, a.row])),
      };
    }
    return snap;
  };

  /** One read of the list; only the newest read's answer replaces the rows. `seq` lets a caller judge, when it acts on the
   *  answer, whether a newer read has been applied since (then this answer is stale for it too). */
  const read = async (): Promise<{ seq: number; parsed: readonly JobRow[] | 'unknown' }> => {
    const seq = ++readSeq;
    let parsed: readonly JobRow[] | 'unknown' = 'unknown';
    try {
      const r = await deps.list(chat);
      parsed = r && r.ok === true ? parseJobList(r.body) : 'unknown';
    } catch {
      parsed = 'unknown';
    }
    if (seq > readApplied) {
      readApplied = seq;
      if (parsed === 'unknown') listUnreadable = true;
      else { rows = parsed; listUnreadable = false; }
      changed();
    }
    return { seq, parsed };
  };

  const busy = (a: Attempt | undefined) => !!a && (a.view.phase === 'sending' || (a.view.phase === 'unknown' && a.view.checking));

  const judge = (jobId: string): StopResult | { k: 'ok'; row: JobRow } => {
    const row = rows?.find((r) => r.jobId === jobId);
    if (!row) return { k: 'refused', why: 'not_listed' };
    if (row.state === 'ended') return { k: 'refused', why: 'not_running' };
    if (busy(attempts.get(jobId))) return { k: 'refused', why: 'busy' };
    const c = deps.can();
    if (!c.ok) return { k: 'refused', why: 'capability', capability: c };
    return { k: 'ok', row };
  };
  const canStop = (jobId: string): StopResult | { k: 'ok' } => {
    const j = judge(jobId);
    return j.k === 'ok' ? { k: 'ok' } : j;
  };

  // An attempt's answer settles that attempt object only; a newer press for the job is a new object (and a press is refused
  // while one is sending or checking), so an answer can never land on another attempt.
  const settle = (a: Attempt, view: JobAttemptView) => {
    a.view = view;
    changed();
  };

  return {
    snapshot,
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
    async refresh() {
      await read();
    },
    canStop,
    async stop(jobId) {
      const ok = judge(jobId);
      if (ok.k !== 'ok') return ok;
      const { row } = ok;
      const target: JobStopTarget = { ...chat, jobId };
      const key = deps.newKey();
      const a: Attempt = { target, row, view: { phase: 'sending' } };
      attempts.set(jobId, a);
      changed();
      let reply: unknown;
      try {
        reply = await deps.stop(target, key);
      } catch {
        reply = undefined;
      }
      const p = parseJobStopReply({ jobId }, reply);
      if (p.kind === 'refused' && p.code === 'idempotency_key_reused') deps.debug?.('shell job stop answered idempotency_key_reused', { job_id: jobId });
      const ev = evidenceOfStop(p);
      const view: JobAttemptView = ev === 'unknown'
        ? { phase: 'unknown', checking: false }
        : { phase: 'settled', evidence: ev, ...(p.kind === 'answer' && p.outcome === 'failed' ? { reason: p.reason } : {}) };
      settle(a, view);
      return { k: 'sent', view };
    },
    async check(jobId) {
      const a = attempts.get(jobId);
      if (!a || a.view.phase !== 'unknown' || a.view.checking) return;
      settle(a, { phase: 'unknown', checking: true });
      const got = await read();
      // A read a newer one overtook proves nothing now (the rows already show the newer answer). A current read is judged
      // against the attempt's own captured target, and settles only that attempt.
      const ev = got.seq === readApplied ? evidenceOfRead(got.parsed, a.target) : 'unknown';
      settle(a, ev === 'not_running' ? { phase: 'settled', evidence: 'not_running' } : { phase: 'unknown', checking: false });
    },
  };
}
