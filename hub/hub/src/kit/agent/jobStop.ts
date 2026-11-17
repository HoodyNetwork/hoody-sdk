// jobStop: a chat's shell jobs from the per-session list, and what a per-job stop's
// answer proves. Pure and engine-free. Answers are parsed at the boundary: one parser per wire shape checks the
// discriminator, the identity (against the target captured at send) and every field the agent's schema
// defines, required or optional, and returns a typed value or 'unknown'. A contradictory payload is 'unknown'. The classifier
// takes only the parsed type.
//
// Wire shapes (the agent's bash-job routes and its daemon's job handlers, local and remote):
//   - GET /sessions/{id}/bash-jobs -> {items: [{job_id, command, started_ms, state, last_line, remote}]}, every field required.
//     It lists the PATH SESSION's own jobs (the stream's event.bash_job_list lists every session's, so it never names a row).
//   - POST /sessions/{id}/bash-jobs/{job_id}/stop (Idempotency-Key) -> 200 {job_id, outcome, reason?, already_ended, remote,
//     duplicate}, or 404 bash_job_not_found, 422 idempotency_key_reused, 503 service_unavailable (nothing stopped), 400.
//     The pairs the agent sends: stopped has no reason (already_ended either way); failed has still_running or unsafe_record
//     (a container job, already_ended false); unknown has unconfirmed (container or a panic), end_not_seen (this machine), or
//     no reason (a reply the gateway could not read), already_ended false.
//
// Only positive evidence settles anything:
//   - stopped: a 200 for our job with outcome stopped, the job running when our stop came.
//   - not_running: a 200 stopped with already_ended (the job had ended before: our stop did not do it), or a read of the
//     per-session list that names the job as ended. Never "stopped".
//   - running: a 200 for our job with outcome failed: the job is still running (or was not signalled); nothing was stopped.
//   - not_sent: a refusal made before anything was claimed: 503 service_unavailable (too many stops remembered), 400.
//   - gone: 404 bash_job_not_found: the agent holds no such job of this chat. It does not say the job was stopped.
//   - unknown: everything else: outcome unknown, a lost answer, any shape this page cannot read whole, and 422
//     idempotency_key_reused (one key per attempt with a constant body, so a 422 means our own contract broke and an
//     earlier send under that key may have acted).

export type JobState = 'running' | 'ended' | 'unknown';

/** One row of the per-session list, parsed. */
export interface JobRow {
  jobId: string;
  command: string;
  startedMs: number;
  state: JobState;
  lastLine: string;
  remote: boolean;
}

/** The job a stop was sent for, captured at send. */
export interface JobTarget { jobId: string }

/** A stop's settled reply, as the host's transport reports it: `ok` is the boolean discriminator; a success carries its HTTP
 *  status (core's readsStatus route, core/agent/bashJobs.ts) and its body and no refusal metadata, a refusal is `ok: false`
 *  with its status, code and details. Only a 200 proves what the body says: any other success status, or none, is unknown.
 *  (The agent answers success with 200 alone; jobStop.wire.test.ts keeps that as a contract fixture from its Go source.) */
export type JobStopReply = { ok: true; status: number; body: unknown } | { ok: false; status?: number; code?: string; details?: unknown };

export type StopReason = 'still_running' | 'unsafe_record' | 'unconfirmed' | 'end_not_seen';

/** A parsed stop reply. */
export type ParsedStop =
  | { kind: 'answer'; outcome: 'stopped'; alreadyEnded: boolean; remote: boolean; duplicate: boolean }
  | { kind: 'answer'; outcome: 'failed'; reason: 'still_running' | 'unsafe_record'; remote: true; duplicate: boolean }
  | { kind: 'answer'; outcome: 'unknown'; reason?: 'unconfirmed' | 'end_not_seen'; remote: boolean; duplicate: boolean }
  | { kind: 'refused'; code: 'idempotency_key_reused' | 'service_unavailable' | 'bad_request' | 'bash_job_not_found' }
  | { kind: 'unknown' };

export type StopEvidence = 'stopped' | 'not_running' | 'running' | 'not_sent' | 'gone' | 'unknown';

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: Rec, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const STATES: ReadonlySet<string> = new Set(['running', 'ended', 'unknown']);
const ANSWER_KEYS: ReadonlySet<string> = new Set(['job_id', 'outcome', 'reason', 'already_ended', 'remote', 'duplicate']);

function parseRow(v: unknown): JobRow | null {
  if (!isObj(v)) return null;
  const { job_id: id, command, started_ms: ms, state, last_line: line, remote } = v;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof command !== 'string' || typeof line !== 'string') return null;
  if (typeof ms !== 'number' || !Number.isSafeInteger(ms) || ms < 0) return null;
  if (typeof state !== 'string' || !STATES.has(state)) return null;
  if (typeof remote !== 'boolean') return null;
  return { jobId: id, command, startedMs: ms, state: state as JobState, lastLine: line, remote };
}

/** The list answer, whole, or 'unknown' (one unreadable row, or two rows with one id, and nothing in it is trusted). */
export function parseJobList(body: unknown): readonly JobRow[] | 'unknown' {
  if (!isObj(body) || !Array.isArray(body.items)) return 'unknown';
  const out: JobRow[] = [];
  const seen = new Set<string>();
  for (const x of body.items) {
    const r = parseRow(x);
    if (r === null || seen.has(r.jobId)) return 'unknown';
    seen.add(r.jobId);
    out.push(r);
  }
  return out;
}

function parseAnswer(target: JobTarget, b: unknown): ParsedStop {
  const no: ParsedStop = { kind: 'unknown' };
  if (!isObj(b)) return no;
  for (const k of Object.keys(b)) if (!ANSWER_KEYS.has(k)) return no;
  const { job_id: id, outcome, already_ended: ended, remote, duplicate } = b;
  if (id !== target.jobId) return no;
  if (typeof ended !== 'boolean' || typeof remote !== 'boolean' || typeof duplicate !== 'boolean') return no;
  const hasReason = has(b, 'reason');
  const reason = b.reason;
  if (hasReason && typeof reason !== 'string') return no;
  if (outcome === 'stopped') {
    if (hasReason) return no;
    return { kind: 'answer', outcome, alreadyEnded: ended, remote, duplicate };
  }
  // Only a stopped job can have ended before the stop (the gateway clears it otherwise).
  if (ended) return no;
  if (outcome === 'failed') {
    // A failed stop is a container job's (the job still runs, or its record is not safe to act on).
    if ((reason !== 'still_running' && reason !== 'unsafe_record') || !remote) return no;
    return { kind: 'answer', outcome, reason, remote: true, duplicate };
  }
  if (outcome === 'unknown') {
    if (!hasReason) return { kind: 'answer', outcome, remote, duplicate };
    // end_not_seen is this machine's (a signalled job that did not exit in time); unconfirmed either.
    if (reason === 'end_not_seen' && !remote) return { kind: 'answer', outcome, reason, remote, duplicate };
    if (reason === 'unconfirmed') return { kind: 'answer', outcome, reason, remote, duplicate };
    return no;
  }
  return no;
}

const REFUSALS: Readonly<Record<string, number>> = {
  bash_job_not_found: 404, idempotency_key_reused: 422, service_unavailable: 503, bad_request: 400,
};

/** A stop's reply, read whole against the job it was sent for. */
export function parseJobStopReply(target: JobTarget, r: unknown): ParsedStop {
  const no: ParsedStop = { kind: 'unknown' };
  if (!isObj(r) || typeof r.ok !== 'boolean') return no;
  if (r.ok === true) {
    if (has(r, 'code') || has(r, 'details')) return no;
    if (r.status !== 200) return no;
    return parseAnswer(target, r.body);
  }
  if (has(r, 'body')) return no;
  const code = r.code;
  if (typeof code !== 'string' || !has(REFUSALS, code) || r.status !== REFUSALS[code]) return no;
  return { kind: 'refused', code: code as Extract<ParsedStop, { kind: 'refused' }>['code'] };
}

/** What the parsed reply proves about our stop. */
export function evidenceOfStop(p: ParsedStop): StopEvidence {
  if (p.kind === 'answer') {
    if (p.outcome === 'stopped') return p.alreadyEnded ? 'not_running' : 'stopped';
    return p.outcome === 'failed' ? 'running' : 'unknown';
  }
  if (p.kind === 'refused') {
    if (p.code === 'bash_job_not_found') return 'gone';
    return p.code === 'idempotency_key_reused' ? 'unknown' : 'not_sent';
  }
  return 'unknown';
}

/** What a read of the per-session list proves about a stop of `target` whose answer is not known (Check again, read only):
 *  the job listed as ended is not running now; running, unknown, absent from the list or an unreadable list prove nothing. */
export function evidenceOfRead(rows: readonly JobRow[] | 'unknown', target: JobTarget): 'not_running' | 'unknown' {
  if (rows === 'unknown') return 'unknown';
  return rows.find((r) => r.jobId === target.jobId)?.state === 'ended' ? 'not_running' : 'unknown';
}
