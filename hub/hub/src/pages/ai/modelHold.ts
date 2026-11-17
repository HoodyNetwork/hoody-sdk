// An agent's model change whose outcome is unknown, held by core. The agent page's Model row
// (agents/Model.tsx) and Settings → Default model (parts/Default.tsx) both send through flows-default setModel over their own
// Api, and both keep the change here, in core's durable hold (core attempts: stored, every tab of the account sees it), keyed by
// the computer (its project and container: a container id alone is not unique across projects), the realm and the agent. So leaving the page and coming back, or another tab, shows "may have gone through"
// with Check again, never an editable row a second change could be sent over.
//   - The hold is taken before the PATCH leaves (holdAttempt). Refused (another hold of the same agent, or storage that cannot
//     keep it): nothing is sent. A page whose Api sends to the computer shown at the call (Settings → Default model) asks
//     sendHeld to check that computer is still the one the change was chosen for once the hold is taken (the storage lock
//     can be waited on across a computer switch): when it moved, the hold goes and nothing is sent. Its PATCH and the
//     list read back then go only to that computer (shownGate.ts onlyOn): after a switch the read-back reads nothing, so
//     another computer's list can never let this hold go.
//   - It is let go only on a proved outcome: the agents list, read back, shows the model (saved), or a definite refusal.
//     Every other answer (lost, a 2xx the list does not show yet, a context that moved on) keeps it.
//   - Check again (checkHeld) only reads the agents list (confirmModel); it never sends the change again. It lets the hold go
//     once the list shows the held model and core's checked free agrees (never while the send may still be out); otherwise
//     the hold stays. A page whose Api follows the shown computer passes the computer it drew the hold for (`on`): the
//     read goes there or nowhere.
//   - Stop tracking (stopHeld) is the person's warned Dismiss, refused by core while the request may still be out.
//   - The meta keeps what the row needs after a remount: the model sent and whether its readiness was unknown when it was
//     judged (the def.savedUnknown caveat). Plain data, never a secret.
import { attemptFor, heldAttempts, holdAttempt, useAttemptsVersion, type HeldAttempt } from '@core';
import { useMemo } from 'react';
import { confirmModel, setModel, type ModelApi, type PickResult } from './flows-default';
import { onlyOn, shownComputer } from './shownGate';

/** The sender of these holds in core: only it lets them go. Both pages send as it, so either one settles the other's. */
export const MODEL_HOLD_BY = 'ai.agent-model';
const PART = /^[A-Za-z0-9_.-]{1,48}$/;
/** A project id as core's computer identities take it (core/script-asks DraftRecord.project). */
const PROJECT = /^[A-Za-z0-9_-]{1,64}$/;

/** Where a model change goes: the computer (its project and container id: a container id alone is not unique across
 *  projects) and one realm. */
export interface ModelAt { project: string; computer: string; realm: string }

/** The lock of one agent setting (`by`, the sender: the model's or the effort's, agents/effortHold.ts) on one computer and
 *  realm; null when a part cannot be named in a lock (nothing is sent). */
export function agentSettingLock(by: string, at: ModelAt, agent: string): string | null {
  const parts = [at.computer, at.realm, agent];
  return PROJECT.test(at.project) && parts.every((p) => PART.test(p)) ? `${by}:${[at.project, ...parts].join('/')}` : null;
}

/** The lock of one agent's model on one computer and realm; null when a part cannot be named in a lock (nothing is sent). */
export function modelLock(at: ModelAt, agent: string): string | null {
  return agentSettingLock(MODEL_HOLD_BY, at, agent);
}

/** A held change as the row shows it. `model` is what was sent ('' if the stored meta cannot be read: never proved, only
 *  Stop tracking lets it go); `inFlight`: its request may still be out (Stop tracking waits for it). */
export interface HeldModel { id: string; model: string; unknown: boolean; metaVersion: number; inFlight: boolean }

function heldOf(h: HeldAttempt): HeldModel {
  const m = (h.meta && typeof h.meta === 'object' ? h.meta : {}) as { model?: unknown; unknown?: unknown };
  return { id: h.id, model: typeof m.model === 'string' ? m.model : '', unknown: m.unknown === true, metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
}

/** The held change of `agent` at `at`, re-read whenever core's holds move; null when none. */
export function useHeldModel(at: ModelAt | null, agent: string): HeldModel | null {
  const version = useAttemptsVersion();
  const lock = at ? modelLock(at, agent) : null;
  return useMemo(() => {
    const h = lock ? heldAttempts(lock).find((x) => x.by === MODEL_HOLD_BY) : undefined;
    return h ? heldOf(h) : null;
    // `version` is core's signal that the holds moved: the read is redone on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, version]);
}

/** A send's result: setModel's, or `held` (refused: this agent's change is already held, shown by useHeldModel) or
 *  `not_held` (refused: core could not keep the hold). Neither refusal sent anything. */
export type HeldResult = PickResult | { state: 'held' } | { state: 'not_held' };

/** A refusal that proves nothing was applied (failedUi shows it as a failure, never as pending). */
const definite = (r: PickResult): boolean => r.state === 'failed' && r.err.kind !== 'pending' && r.err.code !== 'READ_BACK_FIRST';

/** Holds the change, sends it once (setModel: the PATCH, then the list read back) and lets the hold go only on a proved
 *  outcome. `unknown`: the pick's readiness was unknown when it was judged (kept with the hold for the saved words).
 *  `followsShown`: `api` sends to the computer shown at the call, not a bound one; the change is sent only if that
 *  computer did not change while the hold was being taken (else `stale`, nothing sent, the hold let go), and the PATCH and
 *  its read-back go to that computer or nowhere. */
export async function sendHeld(api: ModelApi, at: ModelAt, agent: string, model: string, unknown: boolean, guard: { defaultAgent: string }, opts: { followsShown?: boolean; on?: string } = {}): Promise<HeldResult> {
  const lock = modelLock(at, agent);
  if (!lock) return { state: 'not_held' };
  // The render's computer when the caller passes it (the sections do), else the one shown at the call. Core showing
  // another one sends nothing and holds nothing.
  const chosenOn = opts.followsShown ? (opts.on ?? shownComputer()) : '';
  if (opts.followsShown && shownComputer() !== chosenOn) return { state: 'stale' };
  const got = await holdAttempt(lock, {
    by: MODEL_HOLD_BY,
    realm: at.realm,
    identity: { project: at.project, computer: at.computer, realm: at.realm, agent },
    meta: unknown ? { model, unknown: true } : { model },
  }).catch(() => null);
  if (!got || !got.ok) return got && got.code === 'HELD' ? { state: 'held' } : { state: 'not_held' };
  const hold = got.hold;
  if (opts.followsShown && shownComputer() !== chosenOn) {
    hold.release();
    return { state: 'stale' };
  }
  const via = opts.followsShown ? onlyOn(api, chosenOn) : api;
  const r = await setModel(via, at.realm, agent, model, guard).catch((): PickResult => ({ state: 'not_confirmed' }));
  if (r.state === 'saved' || definite(r)) hold.release();
  else hold.sent();
  return r;
}

/** Check again: reads the agents list (confirmModel), never a second send. The hold goes once the list shows its model,
 *  through core's checked free ('proved', the state the row showed): core refuses it while the send may still be out (in
 *  this tab or another), so a list that already shows the model, set by someone else, never frees a hold whose PATCH could
 *  still land after a second change. Refused: the hold stays and the row reads as before. `on`: `api` sends to the
 *  computer shown at the call, and the read goes only to `on`, the computer the caller was shown (shownComputer());
 *  shown another one, it answers `stale` with nothing read. */
export async function checkHeld(api: ModelApi, at: ModelAt, agent: string, held: HeldModel, opts: { on?: string } = {}): Promise<PickResult> {
  const via = opts.on === undefined ? api : onlyOn(api, opts.on);
  const r = held.model ? await confirmModel(via, at.realm, agent, held.model) : { state: 'not_confirmed' as const };
  if (r.state !== 'saved') return r;
  const h = attemptFor(held.id, MODEL_HOLD_BY);
  const freed = h ? await h.free('proved', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const) : 'freed';
  return freed === 'freed' ? r : { state: 'not_confirmed' };
}

/** The person's Stop tracking (after the page's warning): true once core let the hold go. Core refuses while the request
 *  may still be out, and frees only the state the row showed (its meta version). */
export async function stopHeld(held: HeldModel): Promise<boolean> {
  const h = attemptFor(held.id, MODEL_HOLD_BY);
  if (!h) return false;
  return (await h.free('dismissed', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const)) === 'freed';
}
