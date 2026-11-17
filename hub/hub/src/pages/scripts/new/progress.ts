// progress.ts: what the Build step says while the assistant works. Pure: the Build step
// owns the network and the clock and feeds frames, replays and /state snapshots in; it draws what words() returns.
//
// Rules:
//   - Display only. Done, failed and stopped come from the turn receipt and a readable answer, never from here (C9):
//     nothing here says a build finished, and the activity list is never called complete.
//   - Only the attempt's own turn counts: a frame of another turn_id, an untagged frame, a helper's frame
//     (helper_id) and any frame before the turn id is known are ignored.
//   - A call becomes an activity row only once its event.tool_result (same tool_id) arrives; is_error makes it a ✕.
//     A ✓ on a code check says it ran, never that it passed.
//   - Following frames after a return or reload (the agent's turn_since and its stream): read
//     /replay, apply its events, open the stream with since=max_seq&incarnation=<replay's> (cursor()), and drop every
//     seq at or below the last one applied. A turn start below the replay's min_seq, a replay_gap frame or a change of
//     incarnation means steps were missed: the list starts over and says earlier steps aren't available (partial),
//     and `resync` asks the caller to read /replay again.
//   - Retry words are neutral whatever the reason; the wait counts down from when the frame arrived.

import { stringOrEmpty as str } from '@core';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const safeInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
const SEG = /^[A-Za-z0-9._~-]{1,128}$/;
const INC = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_ROWS = 50;
const MAX_PENDING = 64;
const MAX_RETIRED = 16;
/** An opening or closing fence line: three or more backticks or tildes, then an optional info string. */
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/;

/** What a call looked at: the three tools of the script-writer (and the monitor's actions). */
export type ToolKind = 'routes' | 'validate' | 'health' | 'perf' | 'computer';
export interface Activity { id: string; kind: ToolKind; ok: boolean }
export type Current =
  | { k: 'model' }
  | { k: 'tool'; kind: ToolKind }
  | { k: 'code'; lines: number }
  | { k: 'gate' }
  | { k: 'retry'; attempt: number; max: number; wait: number; at: number };

export interface Progress {
  turnId: string | null;
  inc: string | null;
  /** The last seq applied in `inc`. */
  seq: number;
  /** Incarnations left behind: anything that names one is dropped. */
  retired: string[];
  /** Steps were missed: the list is not the whole story ("Earlier steps aren't available"). */
  partial: boolean;
  /** The caller should read /replay again (a gap or another incarnation); cleared by resynced(). */
  resync: boolean;
  pending: { id: string; kind: ToolKind }[];
  rows: Activity[];
  current: Current | null;
  /** The reply text's fence state: inside a fenced block, how many lines it holds, and the line still arriving. */
  fence: { open: string; lines: number; tail: string };
  /** event.agent_done was seen: the turn stopped running (the receipt says how). */
  ended: boolean;
}

export function start(turnId?: unknown): Progress {
  return {
    turnId: typeof turnId === 'string' && SEG.test(turnId) ? turnId : null,
    inc: null, seq: 0, retired: [], partial: false, resync: false,
    pending: [], rows: [], current: null, fence: { open: '', lines: 0, tail: '' }, ended: false,
  };
}

function copy(p: Progress): Progress {
  return { ...p, retired: p.retired.slice(), pending: p.pending.slice(), rows: p.rows.slice(), fence: { ...p.fence } };
}

/** The turn id became known (the turn was accepted). A different id than one already held changes nothing. */
export function withTurn(p: Progress, turnId: unknown): Progress {
  if (p.turnId || typeof turnId !== 'string' || !SEG.test(turnId)) return p;
  return { ...copy(p), turnId };
}

/** The steps so far are not the whole story any more: the list starts over and says so, and the next replay is
 *  applied from its own start (seq 0), so what it still holds is shown again. */
function startOver(p: Progress): void {
  p.partial = true;
  p.seq = 0;
  p.pending = []; p.rows = []; p.current = null; p.fence = { open: '', lines: 0, tail: '' };
}

function newIncarnation(p: Progress, inc: string): void {
  if (p.inc && !p.retired.includes(p.inc)) { p.retired.push(p.inc); if (p.retired.length > MAX_RETIRED) p.retired.shift(); }
  p.inc = inc;
  startOver(p);
}

/** Which tool a call is, from its name and (for the monitor) its arguments' action. Other tools: null. */
export function toolKind(name: unknown, args?: unknown): ToolKind | null {
  switch (name) {
    case 'hoody_exec_routes': return 'routes';
    case 'hoody_exec_validate': return 'validate';
    case 'hoody_exec_monitor': {
      const a = isObj(args) ? args.action : undefined;
      if (a === 'health' || a === 'stats' || a === 'active') return 'health';
      if (a === 'performance') return 'perf';
      return 'computer';
    }
    default: return null;
  }
}

// Reply text: counts the lines of a fenced code block while it is written. A tool call ends the text before it.
function text(p: Progress, chunk: string): void {
  let t = p.fence.tail + chunk;
  let nl = t.indexOf('\n');
  while (nl >= 0) {
    const line = t.slice(0, nl).replace(/\r$/, '');
    t = t.slice(nl + 1);
    const m = FENCE.exec(line);
    if (!p.fence.open) {
      if (m) { p.fence.open = m[1] as string; p.fence.lines = 0; }
    } else if (m && !m[2] && (m[1] as string)[0] === p.fence.open[0] && (m[1] as string).length >= p.fence.open.length) {
      p.fence.open = ''; p.fence.lines = 0;
    } else {
      p.fence.lines++;
    }
    nl = t.indexOf('\n');
  }
  p.fence.tail = t.length > 4096 ? t.slice(-4096) : t;
  p.current = p.fence.open ? { k: 'code', lines: p.fence.lines + (p.fence.tail ? 1 : 0) } : { k: 'model' };
}

function onEvent(p: Progress, type: string, d: Record<string, unknown>, now: number): void {
  if (d.helper_id) return;
  switch (type) {
    case 'event.stream_chunk':
      if (typeof d.text === 'string' && d.text) text(p, d.text);
      return;
    case 'event.tool_call': {
      p.fence = { open: '', lines: 0, tail: '' };
      const kind = toolKind(d.name, d.arguments);
      if (!kind) { p.current = { k: 'model' }; return; }
      const id = str(d.tool_id);
      if (id) { p.pending.push({ id, kind }); if (p.pending.length > MAX_PENDING) p.pending.shift(); }
      p.current = { k: 'tool', kind };
      return;
    }
    case 'event.tool_result': {
      const id = str(d.tool_id);
      const i = id ? p.pending.findIndex((c) => c.id === id) : -1;
      if (i < 0) return;
      const call = p.pending[i] as { id: string; kind: ToolKind };
      p.pending.splice(i, 1);
      p.rows.push({ id, kind: call.kind, ok: d.is_error !== true });
      if (p.rows.length > MAX_ROWS) p.rows.shift();
      if (p.current && p.current.k === 'tool') {
        const next = p.pending[p.pending.length - 1];
        p.current = next ? { k: 'tool', kind: next.kind } : { k: 'model' };
      }
      return;
    }
    case 'event.retry': {
      if (!safeInt(d.attempt) || !safeInt(d.max_retries) || !safeInt(d.wait_secs) || d.wait_secs < 0) return;
      p.current = { k: 'retry', attempt: d.attempt, max: d.max_retries, wait: d.wait_secs, at: now };
      return;
    }
    case 'event.confirm_request':
    case 'event.user_question':
      p.current = { k: 'gate' };
      return;
    case 'event.gate_resolved':
      if (p.current && p.current.k === 'gate') p.current = { k: 'model' };
      return;
    case 'event.agent_done':
      p.ended = true;
      p.current = null;
      return;
  }
}

function onEnvelope(p: Progress, env: unknown, now: number): void {
  if (!isObj(env) || !safeInt(env.seq) || env.seq < 1) return;
  const ev = env.event;
  if (!isObj(ev) || typeof ev.type !== 'string' || ev.type.indexOf('event.') !== 0) return;
  const inc = str(env.incarnation);
  if (inc && !INC.test(inc)) return;
  if (inc && p.retired.includes(inc)) return;
  if (inc && p.inc && inc !== p.inc) { newIncarnation(p, inc); p.resync = true; }
  else if (inc && !p.inc) p.inc = inc;
  if (env.seq <= p.seq) return;
  p.seq = env.seq;
  if (!p.turnId || env.turn_id !== p.turnId) return;
  onEvent(p, ev.type, isObj(ev.data) ? ev.data : {}, now);
}

/** One SSE frame of the session stream: `name` is the event line, `data` the parsed JSON. */
export function frame(p0: Progress, name: string, data: unknown, now = 0): Progress {
  const p = copy(p0);
  if (name === 'replay_boundary') {
    const inc = isObj(data) ? str(data.incarnation) : '';
    if (!inc || !INC.test(inc) || p.retired.includes(inc)) return p0;
    if (p.inc && inc !== p.inc) { newIncarnation(p, inc); p.resync = true; } else if (!p.inc) p.inc = inc;
    return p;
  }
  if (name === 'lagged') {
    if (isObj(data) && data.code === 'replay_gap') { startOver(p); p.resync = true; return p; }
    return p0;
  }
  // A taxonomy frame: the SSE name is the event type without its prefix.
  if (!isObj(data) || !isObj(data.event) || data.event.type !== 'event.' + name) return p0;
  onEnvelope(p, data, now);
  return p;
}

/**
 * GET /sessions/{sid}/replay, read before the stream opens (and again after a resync). `turnSince` is /state's
 * turn_since: where the turn began. A turn start the replay no longer holds (below min_seq), or no turn_since while the
 * replay does not start at the first seq, marks the list partial.
 */
export function replay(p0: Progress, body: unknown, turnSince?: unknown, now = 0): Progress {
  if (!isObj(body)) return p0;
  const p = copy(p0);
  const rinc = str(body.incarnation);
  if (rinc && (!INC.test(rinc) || p.retired.includes(rinc))) return p0;
  if (rinc && p.inc && rinc !== p.inc) newIncarnation(p, rinc);
  else if (rinc && !p.inc) p.inc = rinc;
  const min = safeInt(body.min_seq) ? body.min_seq : 1;
  if (safeInt(turnSince) ? min > turnSince + 1 && min > p.seq + 1 : min > 1 && min > p.seq + 1) startOver(p);
  const evs = Array.isArray(body.events) ? (body.events as unknown[]) : [];
  for (const e of evs) onEnvelope(p, e, now);
  // Events of the turn after the replay's own: what the stream must not repeat.
  if (safeInt(body.max_seq) && (!rinc || rinc === p.inc) && body.max_seq > p.seq) p.seq = body.max_seq;
  p.resync = false;
  return p;
}

/** The cursor the stream opens with after a replay: since = the last seq applied, in the replay's incarnation. */
export function cursor(p: Progress): { since: string; incarnation: string | undefined } {
  return { since: String(p.seq), incarnation: p.inc || undefined };
}

/** The caller read /replay again after a resync request. */
export function resynced(p: Progress): Progress {
  return p.resync ? { ...copy(p), resync: false } : p;
}

/**
 * GET /sessions/{sid}/state: its current_step fills the line only when no frame has said anything yet, or when its
 * watermark ({incarnation, seq}) is not older than the frames applied.
 */
export function snapshot(p0: Progress, body: unknown): Progress {
  if (!isObj(body) || !isObj(body.current_step)) return p0;
  const sinc = str(body.incarnation);
  const fresh = p0.current === null || (safeInt(body.seq) && sinc !== '' && sinc === p0.inc && body.seq >= p0.seq);
  if (!fresh || p0.ended) return p0;
  const cs = body.current_step;
  let cur: Current | null = null;
  if (cs.kind === 'model') cur = { k: 'model' };
  else if (cs.kind === 'gate') cur = { k: 'gate' };
  else if (cs.kind === 'tool') { const kind = toolKind(cs.tool); if (kind) cur = { k: 'tool', kind }; }
  if (!cur) return p0;
  return { ...copy(p0), current: cur };
}

// ── words ──────────────────────────────────────────────────────────────────────────────────────

export interface Words { key: string; vars?: Record<string, string | number> }
export interface ProgressView {
  /** The current line, or null when there is nothing to say. */
  line: Words | null;
  rows: (Words & { ok: boolean; id: string })[];
  partial: boolean;
}

const NOW_KEY: Record<ToolKind, string> = { routes: 'flow.build.routes.now', validate: 'flow.build.validate.now', health: 'flow.build.health.now', perf: 'flow.build.perf.now', computer: 'flow.build.computer.now' };
const OK_KEY: Record<ToolKind, string> = { routes: 'flow.build.routes.ok', validate: 'flow.build.validate.ok', health: 'flow.build.health.ok', perf: 'flow.build.perf.ok', computer: 'flow.build.computer.ok' };
const ERR_KEY: Record<ToolKind, string> = { routes: 'flow.build.routes.err', validate: 'flow.build.validate.err', health: 'flow.build.health.err', perf: 'flow.build.perf.err', computer: 'flow.build.computer.err' };

/**
 * The words for the Build step. `phase` is the stored ask's phase: before the turn is accepted (create/turn) the line
 * is "Starting the assistant on {computer}…". `now` counts the retry wait down.
 */
export function words(p: Progress, o: { computer: string; phase?: string; now?: number }): ProgressView {
  const computer = o.computer;
  const rows = p.rows.map((r) => ({ id: r.id, ok: r.ok, key: r.ok ? OK_KEY[r.kind] : ERR_KEY[r.kind], vars: { computer } }));
  let line: Words | null = null;
  const c = p.current;
  if ((o.phase === 'create' || o.phase === 'turn') && !p.turnId) line = { key: 'flow.build.starting', vars: { computer } };
  else if (c && c.k === 'model') line = { key: 'flow.build.model' };
  else if (c && c.k === 'tool') line = { key: NOW_KEY[c.kind], vars: { computer } };
  else if (c && c.k === 'code') line = { key: 'flow.build.code', vars: { n: c.lines } };
  else if (c && c.k === 'gate') line = { key: 'flow.build.gate' };
  else if (c && c.k === 'retry') {
    const left = typeof o.now === 'number' && o.now >= c.at ? Math.max(0, c.wait - Math.floor((o.now - c.at) / 1000)) : c.wait;
    line = { key: 'flow.build.retry', vars: { s: left, attempt: c.attempt, max: c.max } };
  }
  return { line, rows, partial: p.partial };
}

/** Elapsed time since the turn was sent: "1 min 12 s" / "40 s". Null when unknown or in the future. */
export function elapsed(sentAt: unknown, now: number): Words | null {
  if (typeof sentAt !== 'number' || !isFinite(sentAt) || now < sentAt) return null;
  const secs = Math.floor((now - sentAt) / 1000);
  return secs >= 60 ? { key: 'flow.build.elapsedMin', vars: { m: Math.floor(secs / 60), s: secs % 60 } } : { key: 'flow.build.elapsedSec', vars: { s: secs } };
}
