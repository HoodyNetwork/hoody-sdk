// program-model.ts: the daemon's program overview as rows, and what a fresh overview proves about a program change.
// Shared by Programs and Computers' Programs tab, so one meaning of "running" and one proof for the whole Hub.
//
// Contract, in plain words:
//   - programModel(overview) parses the daemon's GET programs overview: rows for programs and temporary programs,
//     the features, the counts. A body that is not the daemon's answer is null. Rows never carry a command, an
//     environment, a directory or a log path.
//   - programProof(act, row, port, want) says whether a row read back proves what the action asked for: true,
//     false, or 'gone' (the program left the list). A restart is never proved by state (a program that kept
//     running proves nothing): only its receipt (restartReceiptVerdict) does.
//   - programProves(act) and temporaryStopProves are ready `proves` functions for defineMutation/coreSource over
//     the overview read: 'applied' only when the newest fresh overview proves the change, else undefined
//     (held: "may have gone through" until a proof or the person's Dismiss). Never 'not_applied'.

import { stringOrEmpty as str } from './shape';

// ── The daemon's overview, as it arrives ─────────────────────────────────────────────

export interface RawResult {
  final?: boolean;
  exit_code?: number;
  ended_at?: number;
  signal?: string;
  failure?: string | null;
}

export interface RawInstance {
  port?: number;
  status?: string;
  pid?: number;
  uptime_s?: number;
  last_result?: RawResult | null;
}

export interface RawProgram {
  id: number;
  name: string;
  status?: string;
  states_known?: boolean;
  lazy_load?: boolean;
  hoody_kit?: boolean;
  enabled?: boolean;
  boot?: boolean;
  autorestart?: string;
  instances?: RawInstance[];
  port_range?: { start: number; end: number } | null;
  last_result?: RawResult | null;
  uptime_s?: number;
}

export interface RawTemporary {
  temporary_id: string;
  name?: string;
  status?: string;
  expires_at?: number;
}

export interface RawOverview {
  programs: RawProgram[];
  temporary?: RawTemporary[];
  features?: string[];
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────

export type StateKey =
  | 'running' | 'starting' | 'stopping' | 'stopped' | 'idle' | 'fatal' | 'restarting'
  | 'finished' | 'ended' | 'failed' | 'unknown' | 'off';

export type Scope = 'yours' | 'temporary' | 'system';
export type Action = 'start' | 'stop' | 'restart' | 'boot';

export interface Can {
  start: boolean;
  stop: boolean;
  restart: boolean;
  boot: boolean;
  /** A port of the range with no part of its own can be started by number. */
  portStart: boolean;
}

export interface Part {
  port: number;
  state: StateKey;
  up: number | null;
  can: { start: boolean; stop: boolean; restart: boolean };
}

export interface StopInfo {
  at: number | null;
  exit: number | null;
  /** launch_failed | ttl_expired | daemon_restarted | problem */
  fail: string | null;
}

export interface Row {
  /** 'prog:7' or 'temp:quick_1_2': the URL selection and the op key. */
  key: string;
  /** The daemon's program id (a decimal string) or the temporary id. */
  id: string;
  scope: Scope;
  name: string;
  /** System programs: the kit name without "hoody-". */
  kit: string | null;
  state: StateKey;
  /** Exit code of an ended program. */
  exitCode: number | null;
  enabled: boolean;
  lazy: boolean;
  boot: boolean;
  policy: string | null;
  up: number | null;
  /** The port of a single-instance program, when it has one. */
  port: number | null;
  range: { start: number; end: number } | null;
  parts: Part[];
  partsUp: number;
  stop: StopInfo | null;
  /** Temporary programs: when they stop by themselves. */
  ends: number | null;
  known: boolean;
  attention: boolean;
  bucket: number;
  can: Can;
}

export interface Counts {
  total: number;
  running: number;
  attention: number;
  system: number;
  yours: number;
  systemAttention: number;
}

export interface Model {
  rows: Row[];
  features: string[];
  counts: Counts;
}

const NAME_MAX = 80;
const UNLOADED_PORTS = 17;
const CTRL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
const FAILS = /^(launch_failed|ttl_expired|daemon_restarted)$/;
const QUICK = /^quick_[0-9]{1,20}_[0-9]{1,10}$/;

// Attention first, then what is running, then what is not.
const BUCKET: Record<string, number> = {
  fatal: 0, restarting: 0, ended: 0, failed: 0, unknown: 1,
  running: 2, starting: 2, stopping: 2, stopped: 3, idle: 3, finished: 3, off: 3,
};
const ATTENTION = new Set<StateKey>(['fatal', 'restarting', 'ended', 'failed', 'unknown']);
const STARTABLE = /^(stopped|idle|finished|ended|fatal)$/;
const STOPPABLE = /^(running|starting|restarting)$/;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
const cleanName = (v: unknown): string => str(v).replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const kitOf = (name: string): string | null => /^hoody-([a-z][a-z0-9-]{0,31})$/.exec(name)?.[1] ?? null;
const bucketOf = (k: StateKey): number => BUCKET[k] ?? 1;

function word(status: string | undefined, lazy: boolean, known: boolean, lr: RawResult | null | undefined): StateKey {
  switch (status) {
    case 'running': return 'running';
    case 'starting': return 'starting';
    case 'stopping': return 'stopping';
    case 'fatal': return 'fatal';
    case 'backoff': return 'restarting';
    case 'stopped': return lazy ? 'idle' : known ? 'stopped' : 'unknown';
    case 'exited': return lr?.final ? (lr.exit_code === 0 ? 'finished' : 'ended') : 'unknown';
    default: return 'unknown';
  }
}

function stopOf(lr: RawResult | null | undefined): StopInfo | null {
  if (!lr) return null;
  return {
    at: isInt(lr.ended_at) ? lr.ended_at : null,
    exit: isInt(lr.exit_code) ? lr.exit_code : null,
    fail: lr.failure == null ? null : FAILS.test(lr.failure) ? lr.failure : 'problem',
  };
}

function part(i: RawInstance): Part {
  let state: StateKey =
    i.status === 'backoff' ? 'restarting'
    : typeof i.status === 'string' && Object.hasOwn(BUCKET, i.status) ? (i.status as StateKey)
    : i.status === 'exited' ? 'stopped'
    : 'unknown';
  const lr = i.last_result;
  if (i.status === 'exited' && lr?.final) state = lr.exit_code === 0 ? 'finished' : 'ended';
  const running = state === 'running' || state === 'starting';
  return {
    port: isInt(i.port) && i.port >= 1 && i.port <= 65535 ? i.port : 0,
    state,
    up: running && isInt(i.uptime_s) && i.uptime_s >= 0 ? i.uptime_s : null,
    can: { start: false, stop: false, restart: false },
  };
}

function programRow(p: RawProgram, features: readonly string[]): Row {
  const ins = Array.isArray(p.instances) ? p.instances.filter((x): x is RawInstance => !!x && typeof x === 'object') : [];
  const range = p.port_range && isInt(p.port_range.start) && isInt(p.port_range.end) ? { start: p.port_range.start, end: p.port_range.end } : null;
  const system = p.hoody_kit === true;
  const enabled = p.enabled !== false;
  const lazy = p.lazy_load === true;
  const known = p.states_known === true;
  let state = word(p.status, lazy, known, p.last_result);
  if (!enabled && !STOPPABLE.test(state) && state !== 'stopping') state = 'off';
  // A program the daemon has not loaded lists no instance: stopped, not unreadable.
  if (enabled && !range && known && p.status === 'unknown' && ins.length === 0) state = lazy ? 'idle' : 'stopped';

  let parts: Part[] = range ? ins.map(part).filter((x) => x.port !== 0) : [];
  // A small range offers each port as a stopped part so Start can name it; a large one guesses none.
  if (range && ins.length === 0 && range.end >= range.start && range.end - range.start < UNLOADED_PORTS) {
    parts = [];
    for (let n = range.start; n <= range.end; n++) parts.push(part({ status: 'stopped', port: n }));
  }
  const partsUp = parts.filter((x) => x.state === 'running' || x.state === 'starting').length;
  const first = ins[0];
  const up = !range && first && (state === 'running' || state === 'starting') && isInt(first.uptime_s) && first.uptime_s >= 0 ? first.uptime_s : null;

  const can: Can = { start: false, stop: false, restart: false, boot: false, portStart: false };
  const canRestart = features.includes('restart') && enabled;
  if (isInt(p.id) && p.id >= 0 && known) {
    if (range) {
      can.portStart = enabled && range.end >= range.start && range.end - range.start + 1 > parts.length;
      can.stop = partsUp > 0 || parts.some((x) => x.state === 'restarting');
      can.restart = can.stop && canRestart;
      for (const x of parts) {
        x.can.start = enabled && STARTABLE.test(x.state);
        x.can.stop = STOPPABLE.test(x.state);
        x.can.restart = x.state === 'running' && canRestart;
      }
    } else {
      can.start = enabled && STARTABLE.test(state);
      can.stop = STOPPABLE.test(state);
      can.restart = state === 'running' && canRestart;
    }
    // Starting with the computer is the owner's setting on their own programs.
    can.boot = !system && !lazy && features.includes('boot_switch');
  }
  const name = cleanName(p.name);
  return {
    key: `prog:${p.id}`, id: String(p.id), scope: system ? 'system' : 'yours', name, kit: system ? kitOf(name) : null,
    state, exitCode: state === 'ended' && p.last_result && isInt(p.last_result.exit_code) ? p.last_result.exit_code : null,
    enabled, lazy, boot: p.boot === true, policy: typeof p.autorestart === 'string' ? p.autorestart : null, up,
    port: !range && first && isInt(first.port) && first.port >= 1 && first.port <= 65535 ? first.port : null, range, parts, partsUp,
    stop: stopOf(p.last_result), ends: null, known, attention: ATTENTION.has(state), bucket: bucketOf(state), can,
  };
}

function tempRow(t: RawTemporary, now: number): Row {
  const status = t.status;
  const state: StateKey = status === 'backoff' ? 'restarting' : typeof status === 'string' && Object.hasOwn(BUCKET, status) ? (status as StateKey) : status === 'exited' ? 'stopped' : 'unknown';
  const ends = isInt(t.expires_at) && t.expires_at > now ? t.expires_at : null;
  return {
    key: `temp:${t.temporary_id}`, id: t.temporary_id, scope: 'temporary', name: cleanName(t.name), kit: null,
    state, exitCode: null, enabled: true, lazy: false, boot: false, policy: null, up: null, port: null, range: null, parts: [], partsUp: 0,
    stop: null, ends, known: true, attention: ATTENTION.has(state), bucket: bucketOf(state),
    can: { start: false, stop: QUICK.test(t.temporary_id) && STOPPABLE.test(state), restart: false, boot: false, portStart: false },
  };
}

/** The overview as the page draws it; a body that is not the daemon's answer is null. */
export function programModel(ov: unknown, now: number = Date.now()): Model | null {
  const o = ov as Partial<RawOverview> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.programs)) return null;
  const features = (Array.isArray(o.features) ? o.features : []).filter((x): x is string => typeof x === 'string');
  const seen = new Set<number>();
  const rows: Row[] = [];
  for (const p of o.programs) {
    if (!p || typeof p !== 'object' || !isInt(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    rows.push(programRow(p, features));
  }
  for (const t of Array.isArray(o.temporary) ? o.temporary : []) {
    if (t && typeof t === 'object' && typeof t.temporary_id === 'string') rows.push(tempRow(t, now));
  }
  return { rows: programOrder(rows), features, counts: programCounts(rows) };
}

export function programCounts(rows: readonly Row[]): Counts {
  const c: Counts = { total: 0, running: 0, attention: 0, system: 0, yours: 0, systemAttention: 0 };
  for (const r of rows) {
    if (r.scope === 'temporary') continue;
    c.total++;
    if (r.state === 'running') c.running++;
    if (r.attention) c.attention++;
    if (r.scope === 'system') {
      c.system++;
      if (r.attention) c.systemAttention++;
    } else c.yours++;
  }
  return c;
}

const SCOPE_ORDER: Record<Scope, number> = { yours: 0, temporary: 1, system: 2 };

/** Your programs, then temporary, then system; attention first, then running, then the rest; name breaks ties. */
export function programOrder(rows: readonly Row[]): Row[] {
  return rows.slice().sort((a, b) => {
    if (a.scope !== b.scope) return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    const n = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return n || a.key.localeCompare(b.key);
  });
}

// ── Proofs (read-back after an action) ───────────────────────────────────────────────

const isUp = (k: StateKey) => k === 'running' || k === 'starting';

/**
 * Does the row read back prove what the action asked for? `null` row: the program left the list.
 * A restart is never proved by state alone (a program that kept running proves nothing): its
 * receipt does. Anything not proved stays "may have gone through".
 */
export function programProof(act: Action, after: Row | null, port: number | null, want?: { boot?: boolean }): boolean | 'gone' {
  if (!after) return 'gone';
  const p = port === null ? null : after.parts.find((x) => x.port === port);
  // A port action needs evidence for that exact port: a part missing from the read-back proves nothing.
  if (port !== null && !p && act !== 'boot') return false;
  switch (act) {
    case 'start':
      return p ? isUp(p.state) : after.partsUp > 0 || isUp(after.state);
    case 'stop':
      // Only a stopped program (or part) proves a stop: restarting, unknown or unreadable prove nothing,
      // and a whole range needs every part stopped. A stopped lazy program reads 'idle' (it waits for its first
      // visitor), which is stopped too. An absent program is 'gone' above.
      if (!after.known) return false;
      if (p) return p.state === 'stopped';
      return (after.state === 'stopped' || (after.lazy && after.state === 'idle')) && after.partsUp === 0 && after.parts.every((x) => x.state === 'stopped');
    case 'boot':
      return want?.boot !== undefined && after.boot === want.boot;
    default:
      return false;
  }
}

/** A restart's receipt (the daemon's RestartAnswer). Only `completed` with `restarted` proves it applied;
 * `completed` with `failed` means a target was stopped and did not start again (START_FAILED). Anything else
 * (under way, unknown, a refusal, a missing outcome) proves nothing. */
export function restartReceiptVerdict(r: { success?: boolean; code?: string | null; state?: string | null; outcome?: string | null } | null | undefined): 'completed' | 'failed' | 'unknown' {
  if (!r || r.state !== 'completed') return 'unknown';
  if (r.outcome === 'failed') return 'failed';
  if (r.outcome === 'restarted') return 'completed';
  return 'unknown';
}

type Answers = readonly (readonly unknown[])[];

/** A `proves` for a program start, stop or boot over the overview read (answers[0]): the newest fresh overview
 *  must show the effect on the program the change named (its identity: {id, port, boot}). */
// `wireOf` maps a stored answer back to the overview wire: a coreSource table caches its selected value (the
// Computers page's program rows), so its proves answers arrive already shaped. Default: the answer is the wire.
export const programProves = (act: 'start' | 'stop' | 'boot', wireOf: (answer: unknown) => unknown = (a) => a) => (identity: unknown, answers: Answers): 'applied' | undefined => {
  const i = identity as { id?: unknown; port?: unknown; boot?: unknown } | undefined;
  const fresh = answers[0];
  const m = fresh && fresh.length > 0 ? programModel(wireOf(fresh[fresh.length - 1])) : null;
  if (!i || typeof i.id !== 'string' || !m) return undefined;
  const after = m.rows.find((r) => r.key === `prog:${i.id}`) ?? null;
  const port = typeof i.port === 'number' ? i.port : null;
  return programProof(act, after, port, act === 'boot' ? { boot: i.boot === true } : undefined) === true ? 'applied' : undefined;
};

/** A `proves` for a temporary program's stop: gone from an overview that carries the temporary list, or stopped. */
export const temporaryStopProves = (identity: unknown, answers: Answers): 'applied' | undefined => {
  const i = identity as { id?: unknown } | undefined;
  const fresh = answers[0];
  const raw = fresh && fresh.length > 0 ? fresh[fresh.length - 1] : undefined;
  const m = programModel(raw);
  if (!i || typeof i.id !== 'string' || !m) return undefined;
  const after = m.rows.find((r) => r.key === `temp:${i.id}`) ?? null;
  // Absence proves the stop only in an answer that carries the temporary list at all.
  if (after === null) return Array.isArray((raw as { temporary?: unknown }).temporary) ? 'applied' : undefined;
  return programProof('stop', after, null) === true ? 'applied' : undefined;
};
