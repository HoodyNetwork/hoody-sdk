// The loop changes, declared once and sent through core's api(),
// settled (never rejects). A loop belongs to one chat, so every request is a session route in the chat's realm.
//   - createLoop is not keyed and never resent. Its answer lost, the store reads the chat's loops (listLoops) and offers
//     the loops with the same prompt and timing made since it sent as "may be yours": never claimed by itself, never sent
//     again; it stays unknown until the person picks one or dismisses it.
//   - updateLoop carries exactly ONE intent per request (the agent refuses a body with two):
//     pause / resume ({paused}), the end time ({expires_in}, which also revives an expired loop), or start again
//     ({max_cost_usd, max_wall_ms}): the agent's loops.update, the one path that revives a loop its stop
//     condition, a limit or failed runs stopped. It sets both limits from the body (an absent one is no limit), so a
//     start again sends both, as the row listed them, and is bound to them: a limit changed meanwhile sends nothing. Its answer names no state, so it is told only from a read
//     showing the loop running with those limits (as read: the agent cannot say whether this request started it).
//   - Every change is bound to the loop it was confirmed for: the store reads the
//     chat's loops just before the send and sends nothing ('changed') unless that loop is still listed and its state
//     still offers the change; the confirm itself was opened on that loop and is discarded when it no longer offers it
//     (confirm.ts).
//   - Timing or prompt cannot be changed in place: "Replace" deletes the loop and, only once the delete is proven, creates
//     the new one in its chat; each step is reported, and a delete whose outcome is unknown starts nothing new.
//   - With the agent's loop_preconditions capability (the caller reads it and passes `guarded` per send) every PATCH also
//     names the loop as the read just before the send showed it (guardOf): its state and its limits. The agent then
//     changes nothing unless that still holds when the change lands, and answers 409 loop_changed (told as refused:
//     nothing changed). The state is always named: a loop that expired or was stopped after the read must not be started
//     by an end time or told resumed, so a harmless move (a fire beginning) refusing now and then is the price. A start again sent with if_state stopped that the agent answers ok was started by this request
//     (the agent revives a loop it reads stopped), so it is told from the answer. Without the capability nothing of this
//     is sent (an older agent would ignore it) and the read-backed rules above hold.
//   - deleteLoop sends its JSON body ({}; core declares the route's DELETE body).
//   - A lost answer to a pause, resume, start again or delete is unknown until a read of the chat's loops shows the loop in that state
//     (paused, running, running again, gone); it is then told as what the list shows,
//     never as this request's answer. A lost run now or end time is never settled from a read (a run count or an end
//     time cannot say which request moved it): Check again shows the loop as it is now, and it stays
//     unknown until the person stops tracking it.
import { agent, alive, api, capture, defineRoute, errorInfo, outcomeOf, stringOrEmpty as str, type CallInput, type Ctx, type Route } from '@core';

// The chat's own listing is core's (agent.sessionRoutes.loops, read whole with limit 0); the changes are this page's.
export const editRoutes = {
  create: defineRoute<unknown, NewLoopBody>({
    method: 'POST', path: '/sessions/:id/loops', scope: 'agent', realm: 'realm',
    body: ['prompt', 'interval', 'max_runs', 'expires_in', 'fire_now', 'max_cost_usd', 'max_wall_ms'],
  }),
  update: defineRoute<unknown, Record<string, unknown>>({
    method: 'PATCH', path: '/sessions/:id/loops/:loopId', scope: 'agent', realm: 'realm',
    body: ['paused', 'expires_in', 'max_cost_usd', 'max_wall_ms', 'if_state', 'if_max_cost_usd', 'if_max_wall_ms'],
    // loop_changed: a guard (if_*) no longer held, so the agent changed nothing. Kept through the answer's scrub and
    // told as that refusal (o.refused.changed), never as a generic one.
    codes: ['loop_changed'], refuses: ['loop_changed'],
  }),
  runNow: defineRoute({ method: 'POST', path: '/sessions/:id/loops/:loopId/run-now', scope: 'agent', realm: 'realm' }),
  remove: defineRoute<unknown, Record<string, never>>({ method: 'DELETE', path: '/sessions/:id/loops/:loopId', scope: 'agent', realm: 'realm', body: [], deleteBody: true }),
} as const;

export interface NewLoopBody {
  prompt: string;
  /** A duration token ("30m", "2h"); the agent refuses one under 60 s. */
  interval: string;
  max_runs?: number;
  /** A duration from now ("2h", "3d"); absent: no end time. */
  expires_in?: string;
  fire_now?: boolean;
  /** A spending limit in US dollars; absent: none (the agent reads 0 as none too). */
  max_cost_usd?: number;
  /** A running-time limit in ms, all its runs together; absent: none. */
  max_wall_ms?: number;
}

export type Intent =
  | { k: 'pause' }
  | { k: 'resume' }
  /** A new end time from now ('' clears it). */
  | { k: 'extend'; expiresIn: string; ms: number }
  /** Start a stopped loop again with the limits it has (0: none): its spending and running time count from zero. */
  | { k: 'restart'; maxCostUsd: number; maxWallMs: number };

/** The agent capability under which a PATCH carries its precondition (`Guard`). */
export const LOOP_PRECOND_CAP = 'loop_preconditions';

/** A PATCH's precondition: the loop as the read before the send showed it (`state`: absent only when the read named
 *  none the agent knows). The agent changes nothing unless each still holds (409 loop_changed). */
export interface Guard {
  state?: string;
  maxCostUsd: number;
  maxWallMs: number;
}

/** The one-intent PATCH body, with its precondition when `g` is given. */
export function intentBody(i: Intent, g?: Guard): Record<string, unknown> {
  const pre = g ? { ...(g.state ? { if_state: g.state } : {}), if_max_cost_usd: g.maxCostUsd, if_max_wall_ms: g.maxWallMs } : {};
  switch (i.k) {
    case 'pause':
      return { paused: true, ...pre };
    case 'resume':
      return { paused: false, ...pre };
    case 'extend':
      return { expires_in: i.expiresIn, ...pre };
    case 'restart':
      return { max_cost_usd: i.maxCostUsd, max_wall_ms: i.maxWallMs, ...pre };
  }
}

/** The agent's loop states: the only values if_state may name. */
const LOOP_STATES: ReadonlySet<string> = new Set(['running', 'firing', 'paused', 'error', 'expired', 'stopped', 'ended']);

/** The precondition of change `i` on `loop` as just read: its state and its limits as listed (0: none). Every change names
 *  the state: a paused loop that expired after the read would otherwise be started by an end time, and
 *  a resume of one that stopped would be told resumed. A start again is sent only on a loop read stopped. */
export function guardOf(i: Intent, loop: Rec): Guard {
  const state = i.k === 'restart' ? 'stopped' : str(loop.state);
  return { ...(LOOP_STATES.has(state) ? { state } : {}), maxCostUsd: num(loop.max_cost_usd), maxWallMs: num(loop.max_wall_ms) };
}

export interface Refusal {
  kind: 'pending' | 'failed' | 'not_sent' | 'stale';
  code: string;
  status: number;
  /** The rejection itself, for the outcome's details. */
  error?: unknown;
}
export type Settled = { ok: true; body: unknown } | { ok: false; err: Refusal };

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : null);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);

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

export interface LoopsApi {
  /** The chat's loops (listLoops) through parseLoops; any failure, a 404 included, or a contradictory listing is not ok. */
  list(): Promise<{ ok: true; items: Rec[] } | { ok: false }>;
  create(body: NewLoopBody): Promise<Settled>;
  /** One intent; with `g`, its precondition (only for an agent with LOOP_PRECOND_CAP). */
  update(loopId: string, i: Intent, g?: Guard): Promise<Settled>;
  runNow(loopId: string): Promise<Settled>;
  remove(loopId: string): Promise<Settled>;
}

/** The one reader of the chat's listing (the kit list envelope {items, meta: {total}}, read whole with limit 0): the
 *  items when every part agrees, else null (unreadable). It agrees when meta.total is the item count and no page window
 *  is set, and every item is an object with a unique non-empty id, this chat's session_id and a string state. A
 *  malformed row makes the whole listing unreadable: dropping it would read a listed loop as gone. */
export function parseLoops(body: unknown, sid: string): Rec[] | null {
  const b = rec(body);
  const meta = rec(b?.meta);
  if (!b || !Array.isArray(b.items) || !meta || meta.total !== b.items.length || 'page' in meta || 'limit' in meta) return null;
  const ids = new Set<string>();
  const out: Rec[] = [];
  for (const x of b.items) {
    const l = rec(x);
    const id = str(l?.id);
    if (!l || !id || ids.has(id) || l.session_id !== sid || typeof l.state !== 'string') return null;
    ids.add(id);
    out.push(l);
  }
  return out;
}

/** The calls for the chat `sid` in `realm`, all under `ctx` (the context the change was made in). */
export function loopsApi(sid: string, realm: string, ctx: Ctx): LoopsApi {
  const at = (input: CallInput): CallInput => ({ ...input, ctx, recovers: true, ...(realm ? { realm } : {}) });
  return {
    list: async () => {
      const r = await call(agent.sessionRoutes.loops as Route, at({ params: { id: sid }, query: { limit: 0 } } as CallInput), false);
      // A 404 is not "no loops": the agent answers it for another owner's or realm's chat too, so it proves nothing.
      const items = r.ok ? parseLoops(r.body, sid) : null;
      return items ? { ok: true, items } : { ok: false };
    },
    create: (body) => call(editRoutes.create as Route, at({ params: { id: sid }, body } as CallInput), true),
    update: (loopId, i, g) => call(editRoutes.update as Route, at({ params: { id: sid, loopId }, body: intentBody(i, g) } as CallInput), true),
    runNow: (loopId) => call(editRoutes.runNow as Route, at({ params: { id: sid, loopId } }), true),
    remove: (loopId) => call(editRoutes.remove as Route, at({ params: { id: sid, loopId }, body: {} } as CallInput), true),
  };
}

// ---- what a loop offers ----

export type Action = 'pause' | 'resume' | 'runNow' | 'extend' | 'restart' | 'replace' | 'delete';

/** The actions a loop in this state offers:
 *  running → pause, run now, end time; firing → pause, end time (run now is refused while firing); paused or paused after
 *  errors → resume, run now (a user pause fires once and stays paused; after errors it is the retry), end time;
 *  expired → a new end time revives it; stopped (its stop condition, a spending or running-time limit, failed runs) →
 *  start again; finished (its run limit) → only replace: nothing starts it again.
 *  Every loop: replace (delete + new) and delete. */
export function actionsFor(state: string): Action[] {
  switch (state) {
    case 'running':
      return ['pause', 'runNow', 'extend', 'replace', 'delete'];
    case 'firing':
      return ['pause', 'extend', 'replace', 'delete'];
    case 'paused':
    case 'error':
      return ['resume', 'runNow', 'extend', 'replace', 'delete'];
    case 'expired':
      return ['extend', 'replace', 'delete'];
    case 'stopped':
      return ['restart', 'replace', 'delete'];
    default:
      return ['replace', 'delete'];
  }
}

// ---- evidence ----

/** Skew allowed between this browser's clock and the agent's. */
export const SKEW_MS = 120_000;

/** What a read of the chat's loops proves about one change: 'done' only when the loop reads in the state the change
 *  asked for; a state the loop reaches on its own (expiring, ending, a limit or a breaker also set paused) proves
 *  nothing. A run now or an end time is never proved: a count or a deadline cannot say which request moved it. A list
 *  never rules a lost change out (the request may still reach the agent after the read), so the change otherwise stays
 *  unknown. The store drops a read whose change was replaced or dismissed meanwhile (its generation). */
export type Proof = 'done' | 'unknown';
export function proofOf(a: Exclude<Action, 'replace'> | 'create', i: Intent | null, loop: Rec | undefined): Proof {
  return reads(a, i, loop) ? 'done' : 'unknown';
}
function reads(a: Exclude<Action, 'replace'> | 'create', i: Intent | null, loop: Rec | undefined): boolean {
  if (a === 'delete') return loop === undefined;
  if (!loop) return false;
  const state = str(loop.state);
  switch (a) {
    case 'pause':
      return loop.paused === true && state === 'paused';
    case 'resume':
      return loop.paused === false && (state === 'running' || state === 'firing');
    // Only loops.update revives a stopped loop: a stopped loop read running again, with the limits this start again sent, was
    // started again with them (by this request or another one with the same limits: the list cannot tell, so it is told as read).
    case 'restart':
      return i?.k === 'restart' && loop.paused === false && (state === 'running' || state === 'firing') && num(loop.max_cost_usd) === i.maxCostUsd && num(loop.max_wall_ms) === i.maxWallMs;
    default:
      return false;
  }
}

/** The loop as a read shows it now, for an unknown change Check again cannot settle. */
export interface LoopNow {
  state: string;
  runCount: number;
  expiresAt: string;
}

/** What change `a` would act on in this read of the chat's loops: loop `loopId` while it is listed and its state offers
 *  `a`, with what the change means there, or null. A new end time on an expired loop starts it again (SetExpiry), so
 *  that meaning is part of it; a start again keeps the limits the loop has, so they are part of it (limitsOf); states that keep the meaning (running and firing for a pause) are not, so a loop firing
 *  meanwhile does not refuse it. A confirm captures it at its open (confirm.ts) and the store compares it again just
 *  before the send. */
export function identOf(a: Action, loopId: string | null, items: readonly Rec[]): string | null {
  const loop = loopId ? items.find((l) => str(l.id) === loopId) : undefined;
  const state = str(loop?.state);
  if (!loop || !actionsFor(state).includes(a)) return null;
  // Replace too: its new loop starts from the limits the row showed, so a limit set or changed
  // meanwhile must not be deleted with the old loop and silently dropped from the new one.
  if (a === 'restart' || a === 'replace') return `loop\n${loopId}\n${a}\n${limitsOf(loop)}`;
  return `loop\n${loopId}\n${a}${a === 'extend' && state === 'expired' ? '\nstarts' : ''}`;
}

/** A loop's limits as one key (spending in dollars, running time in ms; 0: none): what a start again keeps. */
export function limitsOf(l: { max_cost_usd?: unknown; max_wall_ms?: unknown }): string {
  return `${num(l.max_cost_usd)}\n${num(l.max_wall_ms)}`;
}

/** Whether a read identity means what the confirm was opened for: `pid` is the meaning taken from the row the person
 *  saw ('starts' for an end time on an expired loop, the limits for a start again (limitsOf), else ''). A read that
 *  disagrees is never adopted. */
export function agrees(a: Action, pid: string, ident: string): boolean {
  if (a === 'restart' || a === 'replace') return ident.endsWith(`\n${a}\n${pid}`);
  return ident.endsWith('\nstarts') === (a === 'extend' && pid === 'starts');
}

/** The chat's loops a lost create may have made: the same prompt and interval, made since it was sent. Newest first. */
export function candidates(items: readonly Rec[], body: NewLoopBody, intervalMs: number, sentAt: number): Rec[] {
  return items
    .filter((l) => str(l.prompt).trim() === body.prompt.trim() && num(l.interval_ms) === intervalMs && (Date.parse(str(l.created_at)) || 0) >= sentAt - SKEW_MS)
    .sort((a, b) => (Date.parse(str(b.created_at)) || 0) - (Date.parse(str(a.created_at)) || 0));
}

// ---- the form ----

export type Unit = 'min' | 'h' | 'd';
const UNIT_MS: Record<Unit, number> = { min: 60_000, h: 3_600_000, d: 86_400_000 };
/** End-time choices, as tokens the agent reads, with their length. */
export const ENDS = { never: 0, '1h': 3_600_000, '1d': 86_400_000, '3d': 259_200_000, '7d': 604_800_000 } as const;
export type End = keyof typeof ENDS;

export interface Draft {
  prompt: string;
  every: string;
  unit: Unit;
  maxRuns: string;
  ends: End;
  fireNow: boolean;
  /** The spending limit in US dollars ('': none). */
  maxCost: string;
  /** The running-time limit in `wallUnit`s ('': none). */
  maxWall: string;
  wallUnit: Unit;
}
export const EMPTY_DRAFT: Draft = { prompt: '', every: '30', unit: 'min', maxRuns: '50', ends: 'never', fireNow: false, maxCost: '', maxWall: '', wallUnit: 'h' };

export type DraftProblem = 'prompt' | 'every' | 'maxRuns' | 'endsShort' | 'maxCost' | 'maxWall' | 'maxCostBig' | 'maxWallBig';

/** Dollars and cents: what a spending limit may be written as. */
const USD = /^\d{1,15}(?:\.\d{1,2})?$/;

/** The body for a draft, or what is wrong with it (the agent's own rules: a prompt, an interval of at least 60 s (a whole minute or more here), a whole
 *  run limit of 1 or more, and without "run first now" an end time at least one interval away). The limits are optional: empty
 *  sends none; written, a spending limit is an amount above 0 (at most cents) and a running-time limit a whole number of
 *  minutes, hours or days above 0. The agent reads 0 as no limit, so 0 is refused here rather than sent as one. */
export function bodyOf(d: Draft): { body: NewLoopBody; intervalMs: number } | { problem: DraftProblem } {
  const prompt = d.prompt.trim();
  if (!prompt) return { problem: 'prompt' };
  const n = Number(d.every.trim());
  if (!d.every.trim() || !Number.isInteger(n) || n <= 0) return { problem: 'every' };
  const intervalMs = n * UNIT_MS[d.unit];
  const runs = Number(d.maxRuns.trim());
  if (!d.maxRuns.trim() || !Number.isInteger(runs) || runs < 1) return { problem: 'maxRuns' };
  const endMs = ENDS[d.ends];
  if (endMs > 0 && !d.fireNow && endMs < intervalMs) return { problem: 'endsShort' };
  const cost = d.maxCost.trim();
  if (cost && /^\d{16,}(?:\.\d{1,2})?$/.test(cost)) return { problem: 'maxCostBig' };
  if (cost && (!USD.test(cost) || !(Number(cost) > 0))) return { problem: 'maxCost' };
  const wall = d.maxWall.trim();
  const wallN = Number(wall);
  if (wall && (!/^\d+$/.test(wall) || !(wallN > 0))) return { problem: 'maxWall' };
  // A whole number the agent cannot hold as ms (an old loop's limit near 2^53 ms): said as too large, never written lower.
  if (wall && (wall.length > 15 || !Number.isSafeInteger(wallN * UNIT_MS[d.wallUnit]))) return { problem: 'maxWallBig' };
  const body: NewLoopBody = { prompt, interval: `${n}${d.unit === 'min' ? 'm' : d.unit}`, max_runs: runs };
  if (endMs > 0) body.expires_in = d.ends;
  if (d.fireNow) body.fire_now = true;
  if (cost) body.max_cost_usd = Number(cost);
  if (wall) body.max_wall_ms = wallN * UNIT_MS[d.wallUnit];
  return { body, intervalMs };
}

/** The largest whole unit of `ms` (minutes at least; a part minute rounds up, never to a shorter limit). A limit too large to
 *  round within whole ms stays rounded up; the form then refuses it, shown at its open, rather than lowering it. */
function unitOf(ms: number): { n: number; unit: Unit } {
  const unit: Unit = ms > 0 && ms % UNIT_MS.d === 0 ? 'd' : ms > 0 && ms % UNIT_MS.h === 0 ? 'h' : 'min';
  return { n: Math.max(1, Math.ceil(ms / UNIT_MS[unit])), unit };
}

/** `usd` as the form writes it, in cents, rounded up when it has finer parts, never to a lower limit: where the cents cannot
 *  be counted exactly (past 2^53 cents), or the rounded value would read lower, the exact value is written instead, and the
 *  form says when it cannot take it. */
function centsUp(usd: number): string {
  // No tolerance: a whole-cent value reads back as the same double, anything finer rounds up.
  const c = Math.round(usd * 100);
  const up = (c / 100 < usd ? c + 1 : c) / 100;
  return Number.isSafeInteger(c + 1) && up >= usd ? String(up) : String(usd);
}

/** A draft from a listed loop (Replace starts from it), its limits kept: the new loop must not lose the old one's caps. */
export function draftOf(l: { promptFull: string; intervalMs: number; runs: { max: number }; maxCostUsd?: number; maxWallMs?: number }): Draft {
  const ms = l.intervalMs;
  const unit: Unit = ms > 0 && ms % UNIT_MS.d === 0 ? 'd' : ms > 0 && ms % UNIT_MS.h === 0 ? 'h' : 'min';
  const wall = (l.maxWallMs ?? 0) > 0 ? unitOf(l.maxWallMs as number) : null;
  return {
    ...EMPTY_DRAFT,
    prompt: l.promptFull,
    every: String(Math.max(1, Math.round(ms / UNIT_MS[unit]))),
    unit,
    maxRuns: String(l.runs.max > 0 ? l.runs.max : 50),
    maxCost: (l.maxCostUsd ?? 0) > 0 ? centsUp(l.maxCostUsd as number) : '',
    ...(wall ? { maxWall: String(wall.n), wallUnit: wall.unit } : {}),
  };
}

// ---- one loop's change ----

export type Phase = 'idle' | 'running' | 'done' | 'refused' | 'unsure';
export interface ChangeView {
  phase: Phase;
  action: Action | null;
  /** Replace: which step the phase is about ('delete' first, then 'create'). */
  step: 'delete' | 'create' | null;
  refusal: Refusal | null;
  /** After a check that proved nothing: what the read saw. */
  observed: 'same' | 'failed' | null;
  /** After such a check: the loop as the read showed it (null: not listed, or not read). */
  now: LoopNow | null;
  /** Nothing was sent: the read before the send failed ('readFailed'), or the loop was no longer listed or no longer
   *  offered the change ('changed'). */
  notSent: 'readFailed' | 'changed' | null;
  /** Settled by a read, not an answer: told as what the list shows. */
  fromRead: boolean;
  reading: boolean;
  /** Replace's new loop, once it was made (its id). */
  newId: string | null;
  /** A lost create's look-alikes from the last check. */
  candidates: Rec[];
  /** Replace whose delete was proven by a check: the new loop waits for the person's press (startNew). */
  awaitingCreate: boolean;
  /** Replace stopped an old loop first (false: a new loop with none before it). */
  hadOld: boolean;
}
const IDLE: ChangeView = { phase: 'idle', action: null, step: null, refusal: null, observed: null, now: null, notSent: null, fromRead: false, reading: false, newId: null, candidates: [], awaitingCreate: false, hadOld: false };

export interface ChangeStore {
  view(): ChangeView;
  subscribe(fn: () => void): () => void;
  /** Sends one change; refused while another is out or unsure. Reads the chat's loops first and sends nothing unless
   *  the loop still offers it with identity `expect` (identOf at the confirm's open; null: whatever it offers now, for
   *  an unconfirmed resume or run now). `guarded`: the agent has LOOP_PRECOND_CAP, so a PATCH carries guardOf the loop as
   *  that read showed it. */
  run(a: Exclude<Action, 'replace'>, i: Intent | undefined, expect: string | null, guarded?: boolean): Promise<void>;
  /** Delete, then (only once the delete is proven) create `draft` in the same chat. With an old loop, its delete is
   *  bound like run's (`expect`); a brand-new loop has none. */
  replace(body: NewLoopBody, intervalMs: number, expect?: string | null): Promise<void>;
  /** A confirm's open: reads the chat's loops and says what `a` would act on now (identOf), or null when that cannot
   *  be read or does not mean `pid` (the meaning shown when the confirm opened: agrees). Sends nothing. */
  identify(a: Action, pid: string): Promise<string | null>;
  /** Reads the chat's loops; settles an unsure change only on a sight that proves it. A replace whose delete a check
   *  proves does not go on by itself: the new loop waits for startNew. */
  check(): Promise<void>;
  /** Replace, after a check proved the delete: creates the new loop (the person pressed for it). */
  startNew(): Promise<void>;
  /** A lost create: the person says this listed loop is the one they made. */
  pick(id: string): void;
  /** The person stops tracking an unsure change: nothing is sent, nothing is claimed. */
  forget(): void;
  /** Back to idle after done or refused. */
  clear(): void;
  /** Something is out or unknown: the store is kept while it is. */
  holds(): boolean;
  readonly ctx: Ctx;
}

/** The change store of loop `loopId` (null: a new loop) in chat `sid`. */
export function createChangeStore(o: { api: LoopsApi; loopId: string | null; ctx?: Ctx; now?: () => number }): ChangeStore {
  const ctx = o.ctx ?? capture();
  const now = o.now ?? Date.now;
  let v: ChangeView = IDLE;
  let loopId = o.loopId;
  let intent: Intent | null = null;
  let pendingNew: { body: NewLoopBody; intervalMs: number } | null = null;
  let sentAt = 0;
  /** Each operation's number: a result that comes back after the person moved on (dismissed it, or started another)
   *  is dropped. */
  let gen = 0;
  const subs = new Set<() => void>();
  const set = (p: Partial<ChangeView>) => {
    v = { ...v, ...p };
    for (const f of [...subs]) f();
  };
  const busy = () => v.phase === 'running' || v.phase === 'unsure';
  /** The read before a send: the loop as read when it still offers `a` as `expect` (null: as anything); else null and the
   *  change is refused unsent. */
  const still = async (a: Action, expect: string | null, g: number): Promise<Rec | null> => {
    const r = await o.api.list();
    if (g !== gen) return null;
    if (!r.ok) return set({ phase: 'refused', notSent: 'readFailed' }), null;
    const id = identOf(a, loopId, r.items);
    // Clearing the end (Never) is not offered on an expired loop: it would start it again with no end.
    const neverStarts = a === 'extend' && intent?.k === 'extend' && intent.expiresIn === '' && id?.endsWith('\nstarts');
    if (id === null || (expect !== null && id !== expect) || neverStarts) return set({ phase: 'refused', notSent: 'changed' }), null;
    return r.items.find((l) => str(l.id) === loopId) ?? null;
  };
  const settle = (r: Settled, done: Partial<ChangeView> = {}) => {
    if (r.ok) set({ phase: 'done', refusal: null, ...done });
    else if (r.err.kind === 'pending') set({ phase: 'unsure', refusal: r.err });
    else set({ phase: 'refused', refusal: r.err });
  };
  const readBack = async (g: number) => {
    const l = await o.api.list();
    if (g !== gen) return;
    const loop = l.ok ? l.items.find((x) => str(x.id) === loopId) : undefined;
    if (l.ok && v.action && v.action !== 'replace' && proofOf(v.action, intent, loop) === 'done') return set({ phase: 'done', fromRead: true, refusal: null });
    set({ phase: 'unsure', refusal: null, observed: l.ok ? 'same' : 'failed', now: loop ? { state: str(loop.state), runCount: num(loop.run_count), expiresAt: str(loop.expires_at) } : null });
  };
  const createNew = async () => {
    if (!pendingNew) return;
    const g = ++gen;
    set({ phase: 'running', step: 'create', refusal: null, observed: null, candidates: [], awaitingCreate: false });
    sentAt = now();
    const r = await o.api.create(pendingNew.body);
    if (g !== gen) return;
    const id = r.ok ? str(rec(rec(r.body)?.loop)?.id) : '';
    // A 2xx the Hub cannot read names no loop: it may have been made, so it is checked like a lost answer.
    if (r.ok && !id) return set({ phase: 'unsure', refusal: null });
    settle(r, { newId: id || null });
  };
  return {
    ctx,
    view: () => v,
    subscribe: (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    holds: () => busy() || v.awaitingCreate,
    identify: async (a, pid) => {
      const r = await o.api.list();
      const id = r.ok ? identOf(a, loopId, r.items) : null;
      return id !== null && agrees(a, pid, id) ? id : null;
    },
    run: async (a, i, expect, guarded = false) => {
      if (busy() || (a !== 'delete' && a !== 'pause' && a !== 'resume' && a !== 'runNow' && !i)) return;
      if (!loopId) return;
      intent = i ?? (a === 'pause' ? { k: 'pause' } : a === 'resume' ? { k: 'resume' } : null);
      const g = ++gen;
      set({ ...IDLE, phase: 'running', action: a });
      const read = await still(a, expect, g);
      if (!read) return;
      sentAt = now();
      const guard = guarded && intent ? guardOf(intent, read) : undefined;
      const r = a === 'delete' ? await o.api.remove(loopId) : a === 'runNow' ? await o.api.runNow(loopId) : await o.api.update(loopId, intent!, guard);
      if (g !== gen) return;
      if (a === 'delete' && r.ok) loopId = null;
      // The agent answers a start again with no state ({status: ok}, also when the loop was no longer stopped and only its
      // limits were set), so its answer proves nothing: only a read showing it running with the sent limits is told, as
      // read; anything else stays unknown (Check again reads; nothing is sent again).
      // With the guard (if_state stopped) the agent's ok says this request started it: told from the answer.
      if (a === 'restart' && r.ok && !guard) return readBack(g);
      settle(r);
    },
    replace: async (body, intervalMs, expect = null) => {
      if (busy()) return;
      pendingNew = { body, intervalMs };
      if (!loopId) {
        set({ ...IDLE, action: 'replace' });
        return createNew();
      }
      const g = ++gen;
      set({ ...IDLE, phase: 'running', action: 'replace', step: 'delete', hadOld: true });
      if (!(await still('replace', expect, g))) return;
      sentAt = now();
      const r = await o.api.remove(loopId);
      if (g !== gen) return;
      // Only an answered delete goes on. A 404 proves nothing about this chat (the agent answers it for another owner's
      // or realm's chat too), so nothing new is started.
      if (r.ok) {
        loopId = null;
        return createNew();
      }
      settle(r);
    },
    check: async () => {
      if (v.phase !== 'unsure' || v.reading || !alive(ctx)) return;
      const g = gen;
      set({ reading: true });
      const r = await o.api.list();
      if (g !== gen) return;
      if (!r.ok) return set({ reading: false, observed: 'failed', now: null });
      if (v.step === 'create') {
        const c = pendingNew ? candidates(r.items, pendingNew.body, pendingNew.intervalMs, sentAt) : [];
        return set({ reading: false, observed: 'same', candidates: c });
      }
      const loop = r.items.find((l) => str(l.id) === loopId);
      const a = v.action === 'replace' ? 'delete' : v.action;
      if (a && proofOf(a, intent, loop) === 'done') {
        if (v.action === 'replace') {
          loopId = null;
          return set({ phase: 'idle', step: 'delete', reading: false, observed: null, now: null, refusal: null, awaitingCreate: true });
        }
        if (a === 'delete') loopId = null;
        return set({ phase: 'done', fromRead: true, reading: false, observed: null, now: null, refusal: null });
      }
      set({ reading: false, observed: 'same', now: loop ? { state: str(loop.state), runCount: num(loop.run_count), expiresAt: str(loop.expires_at) } : null });
    },
    startNew: async () => {
      if (!v.awaitingCreate || busy()) return;
      await createNew();
    },
    pick: (id) => {
      if (v.phase !== 'unsure' || v.reading || !v.candidates.some((c) => str(c.id) === id)) return;
      gen++;
      set({ phase: 'done', newId: id, candidates: [], observed: null, refusal: null });
    },
    // The old loop id goes only when its delete was proven (run, replace, check): a dismissed refusal keeps it, so a
    // retried replace deletes first again.
    forget: () => {
      if (v.phase !== 'unsure' && !v.awaitingCreate) return;
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
