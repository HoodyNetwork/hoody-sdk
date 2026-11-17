// Workflow runs: a run row from the agent's snapshot (GET /workflows/runs,
// its run record plus the realm the gateway stamps), and which running runs this page keeps open. Pure: no
// React, no requests.
//
// One parser per wire shape: everything the page reads of a run passes through parseRun, which
// returns a typed Run or null. A row that is malformed, or that contradicts itself, is not shown as a state: it is
// counted (`skipped`) and the list says some runs could not be read. The listing itself must agree with its envelope
// ({items, meta: {total}}, read whole with limit 0), else it is unreadable and the read fails.
//
// What the agent's row does not say: `current_idx` counts the steps the run has started (a loop or a retry counts a step
// again), so it is not a position in the workflow and no "step N of M" is made from it. Only the step's name is shown.
import { cleanAlertText } from '@core';

export type RunState = 'running' | 'completed' | 'failed' | 'cancelled';
export const RUN_STATES: readonly RunState[] = ['running', 'completed', 'failed', 'cancelled'];

export interface Run {
  readonly id: string;
  readonly workflow: string;
  /** The chat the run belongs to. */
  readonly sid: string;
  /** 'global' or a 24-hex realm: the run's own. */
  readonly realm: string;
  readonly state: RunState;
  /** The step the run is on, or was last on; null when none has started. */
  readonly step: string | null;
  readonly startedAt: number;
  /** Null while running (a finished run the agent gave no time for is also null). */
  readonly finishedAt: number | null;
  /** US dollars; null when the agent reports none. */
  readonly cost: number | null;
  /** A failed run's error preview, one line, bounded. */
  readonly error: string | null;
  /** The last step recorded before the run ended. */
  readonly lastStep: string | null;
  /** The run this one resumed. */
  readonly resumedFrom: string | null;
  /** The folder for display: cleaned and cut to one bounded line. */
  readonly cwd: string | null;
  /** The folder exactly as the agent recorded it (an absolute path), for a new chat the run resumes in; absent otherwise. */
  readonly folder?: string;
  /** The computer the run's chat was bound to (computer_binding); absent for a run local to the agent. */
  readonly binding?: string;
}

export interface RunList {
  /** Newest first. */
  readonly runs: readonly Run[];
  /** Rows the page could not read (malformed, contradictory, or sharing a run id). */
  readonly skipped: number;
}

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : null);
const REALM = /^(global|[0-9a-f]{24})$/;
const ID_MAX = 128;
const NAME_MAX = 120;
const PATH_MAX = 200;
export const ERROR_MAX = 300;

/** An optional field: absent → undefined; present and valid → the value; present and not valid → BAD. */
const BAD = Symbol('bad');
function field<T>(o: Rec, k: string, ok: (v: unknown) => v is T): T | undefined | typeof BAD {
  if (!(k in o)) return undefined;
  return ok(o[k]) ? (o[k] as T) : BAD;
}
const isStr = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= ID_MAX && v.trim() === v;
/** An absolute folder as a create may name it: starts with '/', bounded, no control character, no `..` segment. */
const isFolder = (v: string): boolean => v.length <= 4096 && v.startsWith('/') && !/[\u0000-\u001f\u007f]/.test(v) && !v.split('/').includes('..');
const one = (s: string | undefined | typeof BAD, max: number): string | null | typeof BAD => {
  if (s === BAD) return BAD;
  if (s === undefined) return null;
  const t = cleanAlertText(s, max);
  return t === '' ? null : t;
};

/** A run from one row of the listing; null when any field it reads is malformed or the row contradicts itself:
 *  a state outside the vocabulary, a finish time on a running run or before its start, an unreadable time, a realm
 *  the row's own realm_id disagrees with, a run that resumed itself. */
export function parseRun(x: unknown): Run | null {
  const o = rec(x);
  if (!o) return null;
  const id = o.run_id, workflow = o.workflow_name, sid = o.session_id, realm = o.realm, status = o.status;
  if (!isId(id) || !isId(sid) || typeof workflow !== 'string' || workflow === '' || workflow.length > NAME_MAX) return null;
  if (typeof realm !== 'string' || !REALM.test(realm)) return null;
  if (typeof status !== 'string' || !(RUN_STATES as readonly string[]).includes(status)) return null;
  const state = status as RunState;
  // The row's own realm_id (the agent omits it for the global realm) must say the realm the gateway stamped.
  const rid = field(o, 'realm_id', isStr);
  if (rid === BAD || (rid === undefined ? realm !== 'global' : rid !== realm)) return null;
  if (typeof o.started_at !== 'string') return null;
  const startedAt = Date.parse(o.started_at);
  if (!Number.isFinite(startedAt)) return null;
  const fin = field(o, 'finished_at', isStr);
  if (fin === BAD) return null;
  let finishedAt: number | null = null;
  if (fin !== undefined) {
    finishedAt = Date.parse(fin);
    if (!Number.isFinite(finishedAt) || finishedAt < startedAt || state === 'running') return null;
  }
  // The counters are read for their type only: current_idx and total_steps are not a position (see the header).
  if (!isCount(o.current_idx) || !isCount(o.total_steps)) return null;
  const inTok = field(o, 'input_tokens', isCount), outTok = field(o, 'output_tokens', isCount);
  if (inTok === BAD || outTok === BAD) return null;
  const cost = field(o, 'cost', isMoney);
  if (cost === BAD) return null;
  const step = one(field(o, 'current_step', isStr), NAME_MAX);
  const lastStep = one(field(o, 'last_step', isStr), NAME_MAX);
  const error = one(field(o, 'error', isStr), ERROR_MAX);
  const cwd = one(field(o, 'cwd', isStr), PATH_MAX);
  const from = field(o, 'resumed_from', isId);
  if (step === BAD || lastStep === BAD || error === BAD || cwd === BAD || from === BAD || from === id) return null;
  // computer_binding: '' or absent is a run local to the agent; anything else must be a plain id.
  const bind = field(o, 'computer_binding', isStr);
  if (bind === BAD || (bind !== undefined && bind !== '' && !isId(bind))) return null;
  const raw = typeof o.cwd === 'string' && isFolder(o.cwd) ? o.cwd : undefined;
  return {
    id, workflow, sid, realm, state,
    step, startedAt, finishedAt,
    cost: cost === undefined || cost === 0 ? null : cost,
    error, lastStep, resumedFrom: from ?? null, cwd,
    ...(raw !== undefined ? { folder: raw } : {}),
    ...(bind ? { binding: bind } : {}),
  };
}

/** The listing as runs, newest first. The envelope must agree with itself (items an array, meta.total its length, no page
 *  window); else it throws: an answer that is not the whole listing never reads as "no runs". A run id that two rows
 *  share is not trusted: neither row is kept. */
export function parseRuns(raw: unknown): RunList {
  const b = rec(raw);
  const meta = rec(b?.meta);
  if (!b || !Array.isArray(b.items) || !meta || meta.total !== b.items.length || 'page' in meta || 'limit' in meta) throw new Error('not a run listing');
  const seen = new Map<string, number>();
  for (const it of b.items) {
    const id = rec(it)?.run_id;
    if (typeof id === 'string') seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const runs: Run[] = [];
  let skipped = 0;
  for (const it of b.items) {
    const r = parseRun(it);
    if (r && seen.get(r.id) === 1) runs.push(r);
    else skipped++;
  }
  // The agent lists oldest first; equal start times keep that order reversed.
  const order = new Map(runs.map((r, i) => [r.id, i]));
  runs.sort((a, c) => c.startedAt - a.startedAt || (order.get(c.id) ?? 0) - (order.get(a.id) ?? 0));
  return { runs, skipped };
}

/** How often the snapshot is read while the page is shown: quickly while a run is going, slowly otherwise. */
export const RUNS_FAST_MS = 5_000;
export const RUNS_SLOW_MS = 30_000;
export const anyRunning = (runs: readonly Run[] | undefined): boolean => !!runs && runs.some((r) => r.state === 'running');

/** At most this many running runs keep their chat open from this page (the lease manager asks the agent once for each). */
export const PIN_CAP = 8;

export interface Pins {
  /** The running runs kept open, newest first, one per chat. */
  readonly pinned: readonly Run[];
  /** Running runs past the cap or sharing a chat's lease already counted: not kept open from here. */
  readonly beyond: number;
}

/** Which of these runs this page keeps open: the running ones, newest first, at most PIN_CAP chats (a chat that two running
 *  rows share counts once, and the second row is not "beyond"). */
export function pinsOf(runs: readonly Run[] | undefined): Pins {
  const pinned: Run[] = [];
  const chats = new Set<string>();
  let beyond = 0;
  for (const r of runs ?? []) {
    if (r.state !== 'running') continue;
    const key = `${r.realm}|${r.sid}`;
    if (chats.has(key)) continue;
    chats.add(key); // a chat past the cap is counted once too
    if (pinned.length >= PIN_CAP) { beyond++; continue; }
    pinned.push(r);
  }
  return { pinned, beyond };
}

/** The runs of one workflow, in the realm it was listed in (the name is the identity only within a realm); a null realm
 *  (the listing did not say) matches the name in any realm. */
export function runsOf(runs: readonly Run[], workflow: string, realm: string | null): Run[] {
  return runs.filter((r) => r.workflow === workflow && (realm === null || r.realm === realm));
}

// ── One run with its steps (getWorkflowRun), and which runs can be resumed ──

/** One top-level step's recorded result. Times and tokens the agent omits (0) are null. */
export interface RunStep {
  readonly id: string;
  readonly ok: boolean;
  readonly timedOut: boolean;
  readonly ms: number | null;
  readonly inTok: number | null;
  readonly outTok: number | null;
  /** A failed step's error preview, one line, bounded like the run's. */
  readonly error: string | null;
}
export interface RunDetail {
  readonly run: Run;
  readonly steps: readonly RunStep[];
}

const nz = (n: number | undefined): number | null => (n === undefined || n === 0 ? null : n);

/** The single-run answer `{run: row + steps}` read through parseRun; null when the run or any step is malformed (a
 *  detail that cannot be read whole is not shown in part). */
export function parseRunDetail(raw: unknown): RunDetail | null {
  const o = rec(rec(raw)?.run);
  if (!o) return null;
  const run = parseRun(o);
  if (!run) return null;
  const list = field(o, 'steps', Array.isArray);
  if (list === BAD) return null;
  const steps: RunStep[] = [];
  for (const x of (list as unknown[] | undefined) ?? []) {
    const s = rec(x);
    if (!s || !isId(s.step_id) || s.step_id.length > NAME_MAX || typeof s.success !== 'boolean') return null;
    const timed = field(s, 'timed_out', (v): v is boolean => typeof v === 'boolean');
    const ms = field(s, 'duration_ms', isCount), inTok = field(s, 'input_tokens', isCount), outTok = field(s, 'output_tokens', isCount);
    const error = one(field(s, 'error', isStr), ERROR_MAX);
    if (timed === BAD || ms === BAD || inTok === BAD || outTok === BAD || error === BAD) return null;
    steps.push({ id: s.step_id, ok: s.success, timedOut: timed === true, ms: nz(ms), inTok: nz(inTok), outTok: nz(outTok), error });
  }
  return { run, steps };
}

/** A failed or cancelled run the agent will resume: no resume of it is running or completed (the agent's own rule; a
 *  failed or cancelled resume leaves it resumable). `runs`: the listing the page holds. */
export function resumable(run: Run, runs: readonly Run[]): boolean {
  if (run.state !== 'failed' && run.state !== 'cancelled') return false;
  return !runs.some((r) => r.resumedFrom === run.id && !unstarted(r));
}

/** A resume that is only the agent's claim so far: running with no step yet; its chat can still refuse it before its
 *  first step (the agent then records it failed with no step). */
export function claimOnly(r: Run): boolean {
  return r.state === 'running' && r.step === null && r.lastStep === null;
}

/** A run whose daemon went away with no step recorded: listed failed with no finish time and no step. It may have run
 *  steps that were never saved, or none (the claim is saved before the chat's last checks). */
export function cutShort(r: Run): boolean {
  return (r.state === 'failed' || r.state === 'cancelled') && r.finishedAt === null && r.step === null && r.lastStep === null;
}

/** A run resumed from another that ended before any step started: its chat dropped or refused the queued resume (the
 *  agent records it failed with a finish time and no step), so nothing of it ran. A row with no finish time is not one:
 *  the agent shows a run whose daemon went away as failed with no finish time, and its last steps may not have been
 *  saved. Any other resume of a run (running, completed, or ended after a step
 *  started) carries the work on: the run it resumed is not offered again, since resuming that one would run the resume's
 *  finished steps a second time (the agent itself allows it once the resume ended). */
export function unstarted(r: Run): boolean {
  return (r.state === 'failed' || r.state === 'cancelled') && r.finishedAt !== null && r.step === null && r.lastStep === null;
}
