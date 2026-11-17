// activity.ts: how many of this computer's Hub conversations are running right now (a turn in
// progress, or waiting on the person's answer or approval), from the agent's own state: one GET /sessions/{id}/state
// per stored conversation (a dormant session reads idle without being attached; a deleted one is 404, not running).
// The conversations are the shared store's (every tab of this browser writes it), so another tab's count here too.
// One read that does not answer makes the whole round unknown: no badge, never 0 or the last round's numbers.
import * as C from './conv';
import type { AgentIO } from './data';
import type { AskRecord } from './logic';
import * as L from './logic';

/** 'gone': the agent no longer has the session (404); not running. */
export type ConvActivity = 'running' | 'waiting' | 'idle' | 'gone';
export interface Activity {
  /** Conversations running now; waiting ones are counted here too. */
  running: number;
  /** Of those, the ones waiting for the person. */
  waiting: number;
  /** Per conversation (record k1): what the agent said. */
  by: Readonly<Record<string, ConvActivity>>;
}

/** At most this many conversations are read per round, the most recent first. */
export const ACTIVITY_MAX = 12;

/** The state of one conversation from its GET /state body, or null when the body does not say. */
export function activityOf(body: unknown): ConvActivity | null {
  if (!L.isObj(body) || typeof body.state !== 'string') return null;
  const helpers = Array.isArray(body.pending_helper_gates) && body.pending_helper_gates.length > 0;
  if (body.state === 'parked' || helpers) return 'waiting';
  if (body.state === 'running') return 'running';
  if (body.state === 'idle' || body.state === 'closed') return 'idle';
  return null;
}

/** True only when `body` proves that session `sid` is idle with nothing parked, queued or running (Clear list's server-read check). Anything
 *  else (malformed, contradictory, another session, a field of the wrong type) is false: keep. `activityOf` is looser on purpose: it
 *  feeds a count, where a wrong guess costs a digit, not a record. */
export function cleanIdle(body: unknown, sid: string): boolean {
  if (!L.isObj(body) || !sid) return false;
  if (body.session_id !== sid) return false;
  if (body.state !== 'idle' && body.state !== 'closed') return false;
  // A gate object or id: absent or null only.
  for (const k of ['pending_gate', 'pending_gate_ref', 'current_turn_id']) if (body[k] !== undefined && body[k] !== null) return false;
  // Lists: absent or an empty array only (a non-array is a field this reading does not understand).
  for (const k of ['pending_lead_gates', 'pending_helper_gates', 'pending_lead_gate_refs', 'pending_helper_gate_refs', 'queued_turn_ids']) {
    const v = body[k];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.length > 0) return false;
  }
  return true;
}

/** One round over `recs` (a computer's stored conversations, most recent first). null = not every read answered. */
export async function readActivity(io: AgentIO, recs: readonly AskRecord[]): Promise<Activity | null> {
  const list = recs.filter((r) => !!r.s && r.ph !== 'gone').slice(0, ACTIVITY_MAX);
  const got = await Promise.all(list.map(async (r): Promise<ConvActivity | null> => {
    try {
      return activityOf(await io.state(r.s as string, r.r));
    } catch (e) {
      // Gone from the agent: not running. Anything else (lost answer, refusal, timeout) is not known.
      return L.isObj(e) && e.status === 404 ? 'gone' : null;
    }
  }));
  if (got.some((x) => x === null)) return null;
  const by: Record<string, ConvActivity> = {};
  let running = 0, waiting = 0;
  list.forEach((r, i) => {
    const a = got[i] as ConvActivity;
    by[r.k1] = a;
    if (a === 'running' || a === 'waiting') running++;
    if (a === 'waiting') waiting++;
  });
  return { running, waiting, by };
}

/** A Recent row's state with the agent's word on it. Running or waiting: as the agent says. Idle or gone: never
 *  running or waiting (the stored phase may lag behind); 'Ended' when the stored phase still says so, as idle alone
 *  does not prove how the turn ended. A send whose outcome is unknown stays unknown (C9). */
export type RecentState = C.RowState | 'Ended';
export function recentState(ph: string, live: ConvActivity | undefined): RecentState {
  const stored = C.rowState(ph);
  // A send whose outcome is unknown stays unknown whatever the session does: activity says nothing about that message.
  if (stored === 'Unknown') return stored;
  if (live === 'waiting') return 'Waiting';
  if (live === 'running') return 'Running';
  if (live === 'gone') return 'Gone';
  if (live === 'idle' && (stored === 'Running' || stored === 'Waiting')) return 'Ended';
  return stored;
}
/** Each stored conversation's Recent phase (C.recentPhase: a turn with a message still unsettled reads unknown), by
 *  record k1. The registry takes it from the store read every round starts with, whether or not the agent answers. */
export function phasesOf(recs: readonly AskRecord[]): Record<string, string> {
  const ph: Record<string, string> = {};
  for (const r of recs) ph[r.k1] = C.recentPhase(r);
  return ph;
}

/** The phase a Recent row shows: the latest round's store read (fresher than the one made when Recent opened), else
 *  the opened one. Unknown when either says so: one of the two may be the older read, and an unknown send is never
 *  shown settled without proof (C9); reopening Recent reads the store again. */
export function shownPhase(opened: string, fresh: string | undefined): string {
  if (opened === 'unknown' || fresh === 'unknown') return 'unknown';
  return fresh ?? opened;
}
/** Recent's order: waiting ones (needing the person) first, then running ones (both by the agent's word), then the
 *  rest as stored (most recent first). */
export function orderRecent<R extends { k1: string }>(rows: readonly R[], act: Activity | null): R[] {
  const rank = (k1: string) => { const v = act?.by[k1]; return v === 'waiting' ? 0 : v === 'running' ? 1 : 2; };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.k1) - rank(b.r.k1) || a.i - b.i).map((x) => x.r);
}
