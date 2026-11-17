// The loops list's pure parts: a loop row from the agent's listing (GET /loops, LoopInfo), which loops count
// toward the computer's limit, a chat's title, and the inputs of the Every / Runs / Spent words. No React, no I/O.

import { stringOrEmpty as str } from '@core';

/** At most this many loops are active on one computer, counted over every realm (daemon loopMaxConcurrent). */
export const LOOP_CAP = 8;
/** Chats whose title is read for the list, at most (one session read each). */
export const TITLE_READS = 20;

export type LoopState = 'running' | 'firing' | 'paused' | 'error' | 'ended' | 'expired' | 'stopped' | 'unknown';
const STATES: readonly LoopState[] = ['running', 'firing', 'paused', 'error', 'ended', 'expired', 'stopped'];
const OVER: readonly LoopState[] = ['ended', 'expired', 'stopped'];
/** active: counts toward the limit; paused: paused (also after errors); over: finished, expired or stopped. */
export type LoopGroup = 'active' | 'paused' | 'over';

export interface LoopRow {
  /** realm / session / loop: a loop id is unique only within its chat. */
  key: string;
  id: string;
  sid: string;
  realm: string;
  /** The prompt on one line. */
  prompt: string;
  /** The prompt as written (its lines kept). */
  promptFull: string;
  intervalMs: number;
  runs: { n: number; max: number };
  /** Dollars spent so far (0 when the agent reports none). */
  spentUsd: number;
  /** Its spending limit in dollars and its running-time limit in ms (0: none); a start again keeps them. */
  maxCostUsd: number;
  maxWallMs: number;
  state: LoopState;
  group: LoopGroup;
  /** RFC3339 times as the agent gives them ('' when absent). */
  createdAt: string;
  lastRunAt: string;
  expiresAt: string;
  /** Milliseconds to the next run (0 when paused, running now or over). */
  nextInMs: number;
  /** Why a loop that is over stopped (a StopReason the agent names), '' when none. */
  stopReason: StopReason | '';
  /** The agent's own words on the last problem ('' when none). */
  lastError: string;
}

export type StopReason = 'stop_when' | 'max_runs' | 'max_cost_usd' | 'max_wall_clock_ms' | 'expired' | 'circuit_breaker' | 'predicate_error';
const STOPS: readonly StopReason[] = ['stop_when', 'max_runs', 'max_cost_usd', 'max_wall_clock_ms', 'expired', 'circuit_breaker', 'predicate_error'];

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : null);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);

/** The listing's rows; a row without its loop or session id is dropped, never guessed. An answer that is not a
 *  listing throws (the read fails): it never reads as "no loops". */
export function loopsOf(raw: unknown): Rec[] {
  const items = rec(raw)?.items;
  if (!Array.isArray(items)) throw new Error('not a loop listing');
  return items.map(rec).filter((r): r is Rec => !!r && !!str(r.id) && !!str(r.session_id));
}

export function loopRow(l: Rec): LoopRow {
  const st = str(l.state);
  const state: LoopState = (STATES as readonly string[]).includes(st) ? (st as LoopState) : 'unknown';
  // The daemon's limit counts loops that are neither paused nor ended; only a loop
  // the agent says is running and not paused counts here.
  const active = l.paused === false && (state === 'running' || state === 'firing');
  const realm = str(l.realm);
  const sid = str(l.session_id);
  const id = str(l.id);
  return {
    key: `${realm}/${sid}/${id}`,
    id,
    sid,
    realm,
    prompt: str(l.prompt).replace(/\s+/g, ' ').trim(),
    promptFull: str(l.prompt).trim(),
    intervalMs: num(l.interval_ms),
    runs: { n: num(l.run_count), max: num(l.max_runs) },
    spentUsd: num(l.spent_usd),
    maxCostUsd: num(l.max_cost_usd),
    maxWallMs: num(l.max_wall_ms),
    state,
    group: active ? 'active' : OVER.includes(state) ? 'over' : 'paused',
    createdAt: str(l.created_at),
    lastRunAt: str(l.last_run_at),
    expiresAt: str(l.expires_at),
    nextInMs: state === 'running' && l.paused === false ? num(l.next_in_ms) : 0,
    stopReason: (STOPS as readonly string[]).includes(str(l.stop_reason)) ? (str(l.stop_reason) as StopReason) : '',
    lastError: str(l.last_error).trim(),
  };
}

export function activeCount(rows: readonly LoopRow[]): number {
  return rows.filter((r) => r.group === 'active').length;
}

/** A chat's title from GET /sessions/{id}: its name, else the first line of its first message, else null. An answer
 *  that names no session throws (the read fails): it is never shown as an untitled chat. */
export function chatTitle(raw: unknown): string | null {
  const s = rec(rec(raw)?.session);
  if (!s) throw new Error('not a session');
  const name = str(s.name).trim();
  if (name) return name;
  const first = str(s.first_message).split('\n').map((x) => x.trim()).find(Boolean);
  return first || null;
}

/** The chats to read titles for: each (session, realm) once, in list order, at most TITLE_READS. */
export function sessionsToRead(rows: readonly LoopRow[]): Array<{ sid: string; realm: string }> {
  const seen = new Set<string>();
  const out: Array<{ sid: string; realm: string }> = [];
  for (const r of rows) {
    const k = `${r.realm}/${r.sid}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ sid: r.sid, realm: r.realm });
    if (out.length === TITLE_READS) break;
  }
  return out;
}

/** The interval in its largest whole unit. */
export function everyOf(ms: number): { unit: 'h' | 'min' | 's'; n: number } {
  if (ms > 0 && ms % 3600000 === 0) return { unit: 'h', n: ms / 3600000 };
  if (ms > 0 && ms % 60000 === 0) return { unit: 'min', n: ms / 60000 };
  return { unit: 's', n: Math.round(ms / 1000) };
}

/** What Spent says: dollars, under a cent, free (it ran and cost nothing), or nothing yet. */
export type Spent = { k: 'usd'; v: number } | { k: 'small' } | { k: 'free' } | { k: 'none' };
export function spentOf(r: LoopRow): Spent {
  if (r.spentUsd >= 0.005) return { k: 'usd', v: r.spentUsd };
  if (r.spentUsd > 0) return { k: 'small' };
  return r.runs.n > 0 ? { k: 'free' } : { k: 'none' };
}
