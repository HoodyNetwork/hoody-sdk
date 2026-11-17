// An agent's reasoning effort change: PATCH /agents/<name>/effort, sent once, called
// saved only when the agents list, read back, shows the level. Its outcome is held in core the way the model's is
// (../modelHold.ts): the same durable hold, its own sender, the lock ai.agent-effort:<project>/<container>/<realm>/<agent>
// (a container id alone is not unique across projects). So leaving the page, coming back or another tab shows "may have
// gone through" with Check again, never an editable row a second change could be sent over.
//   - The hold is taken before the PATCH leaves. Refused (another hold of this agent's effort, or storage that cannot keep
//     it): nothing is sent.
//   - It is let go only on a proved outcome: the list read back shows the level (saved), or a definite refusal (400: the
//     daemon wrote nothing). Every other answer keeps it.
//   - Check again only reads the list; it frees the hold through core's checked free ('proved'), never while the send may
//     still be out. Stop tracking is the person's warned Dismiss (core refuses it while the request may still be out).
import { attemptFor, heldAttempts, holdAttempt, useAttemptsVersion, type HeldAttempt } from '@core';
import { useMemo } from 'react';
import { isStale, isUnknown } from '../api';
import type { PickResult } from '../flows-default';
import { rows } from '../logic';
import { agentSettingLock, type ModelAt } from '../modelHold';
import type { Settled } from '../types';

/** The sender of these holds in core: only it lets them go. */
export const EFFORT_HOLD_BY = 'ai.agent-effort';

/** The levels the route takes; '' removes the agent's line (the model's default applies). */
export const AGENT_EFFORTS = ['', 'adaptive', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AgentEffort = (typeof AGENT_EFFORTS)[number];

/** The two calls an effort change makes: the change itself and the agents list read back. */
export interface EffortApi {
  agentEffort(realm: string, agent: string, effort: AgentEffort): Promise<Settled<unknown>>;
  agents(realm: string): Promise<Settled<unknown>>;
}

/** The lock of one agent's effort on one computer and realm; null when a part cannot be named (nothing is sent). */
export const effortLock = (at: ModelAt, agent: string): string | null => agentSettingLock(EFFORT_HOLD_BY, at, agent);

/** A held change as the row shows it. `effort` is what was sent (null if the stored meta cannot be read: never proved,
 *  only Stop tracking lets it go); `inFlight`: its request may still be out. */
export interface HeldEffort { id: string; effort: AgentEffort | null; metaVersion: number; inFlight: boolean }

const isEffort = (v: unknown): v is AgentEffort => typeof v === 'string' && (AGENT_EFFORTS as readonly string[]).includes(v);

function heldOf(h: HeldAttempt): HeldEffort {
  const m = (h.meta && typeof h.meta === 'object' ? h.meta : {}) as { effort?: unknown };
  return { id: h.id, effort: isEffort(m.effort) ? m.effort : null, metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
}

/** The held effort change of `agent` at `at`, re-read whenever core's holds move; null when none. */
export function useHeldEffort(at: ModelAt | null, agent: string): HeldEffort | null {
  const version = useAttemptsVersion();
  const lock = at ? effortLock(at, agent) : null;
  return useMemo(() => {
    const h = lock ? heldAttempts(lock).find((x) => x.by === EFFORT_HOLD_BY) : undefined;
    return h ? heldOf(h) : null;
    // `version` is core's signal that the holds moved: the read is redone on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, version]);
}

/** Whether the agents list shows `agent` at `effort` ('' = no effort line: the field absent or empty). Any other shape
 *  (a number, null) proves nothing, so a held removal stays held. */
const showsEffort = (body: unknown, agent: string, effort: AgentEffort): boolean => {
  const row = rows<{ name: string; effort?: unknown }>(body, 'agents').find((x) => x.name === agent);
  if (!row) return false;
  if (!('effort' in row) || row.effort === undefined) return effort === '';
  return typeof row.effort === 'string' && row.effort === effort;
};

/** Reads the list back: saved once it shows the level. Never a second send. */
export async function confirmEffort(api: EffortApi, realm: string, agent: string, effort: AgentEffort): Promise<PickResult> {
  const back = await api.agents(realm);
  if (isStale(back)) return { state: 'stale' };
  if (!back.ok) return { state: 'not_confirmed' };
  return showsEffort(back.body, agent, effort) ? { state: 'saved' } : { state: 'not_confirmed' };
}

/** A send's result: the flow's, or `held` (refused: this agent's effort change is already held) or `not_held` (refused:
 *  core could not keep the hold). Neither refusal sent anything. */
export type EffortResult = PickResult | { state: 'held' } | { state: 'not_held' };

/** A refusal that proves nothing was applied (shown as a failure, never as pending). */
const definite = (r: PickResult): boolean => r.state === 'failed' && r.err.kind !== 'pending' && r.err.code !== 'READ_BACK_FIRST';

/** Holds the change, sends it once, reads the list back, and lets the hold go only on a proved outcome. */
export async function sendEffort(api: EffortApi, at: ModelAt, agent: string, effort: AgentEffort): Promise<EffortResult> {
  const lock = effortLock(at, agent);
  if (!lock) return { state: 'not_held' };
  const got = await holdAttempt(lock, {
    by: EFFORT_HOLD_BY,
    realm: at.realm,
    identity: { project: at.project, computer: at.computer, realm: at.realm, agent },
    meta: { effort },
  }).catch(() => null);
  if (!got || !got.ok) return got && got.code === 'HELD' ? { state: 'held' } : { state: 'not_held' };
  const hold = got.hold;
  const flow = async (): Promise<PickResult> => {
    const r = await api.agentEffort(at.realm, agent, effort);
    if (isStale(r)) return { state: 'stale' };
    if (!r.ok && !isUnknown(r)) return { state: 'failed', err: r.err };
    return confirmEffort(api, at.realm, agent, effort);
  };
  const r = await flow().catch((): PickResult => ({ state: 'not_confirmed' }));
  if (r.state === 'saved' || definite(r)) hold.release();
  else hold.sent();
  return r;
}

/** Check again: reads the list; the hold goes once it shows the level and core's checked free agrees (never while the
 *  send may still be out). Refused: the hold stays and the row reads as before. */
export async function checkEffort(api: EffortApi, at: ModelAt, agent: string, held: HeldEffort): Promise<PickResult> {
  const r = held.effort !== null ? await confirmEffort(api, at.realm, agent, held.effort) : { state: 'not_confirmed' as const };
  if (r.state !== 'saved') return r;
  const h = attemptFor(held.id, EFFORT_HOLD_BY);
  const freed = h ? await h.free('proved', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const) : 'freed';
  return freed === 'freed' ? r : { state: 'not_confirmed' };
}

/** The person's Stop tracking (after the page's warning): true once core let the hold go. */
export async function stopEffort(held: HeldEffort): Promise<boolean> {
  const h = attemptFor(held.id, EFFORT_HOLD_BY);
  if (!h) return false;
  return (await h.free('dismissed', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const)) === 'freed';
}
