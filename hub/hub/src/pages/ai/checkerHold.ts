// The safety checker's change (its switch or its model) whose outcome is unknown, held by core the way an agent's model
// change is (modelHold.ts): the same durable hold (stored, every tab of the account sees it), its own sender, the lock
// ai.checker:<project>/<container>/<realm>/checker. So leaving Settings, a realm switch and back, or another tab shows
// "may have gone through" with Check again, never a switch a second change could be sent over.
//   - The hold is taken before the PUT leaves. Refused (another hold of this checker, or storage that cannot keep it):
//     nothing is sent. The page's api sends to the computer shown at each call, so a computer switch while the hold is
//     being taken sends nothing and lets the hold go (as Default model's followsShown, modelHold.ts). The PUT and its
//     read-back then go only to that computer (shownGate.ts onlyOn): after a switch the read-back reads nothing and the
//     hold stays.
//   - It is let go only on a proved outcome: the checker, read back, shows the change (saved), or a definite refusal.
//     Every other answer (lost, a 2xx the read-back does not show yet, a context that moved on) keeps it.
//   - Check again only reads the checker back (confirmChecker), from the computer the caller was shown only; it frees the
//     hold through core's checked free ('proved'), never while the send may still be out. Stop tracking is the person's
//     warned dismiss (core refuses it while the request may still be out).
//   - The meta keeps what was sent ({enabled} or {model}): plain data, never a secret.
import { attemptFor, heldAttempts, holdAttempt, useAttemptsVersion, type HeldAttempt } from '@core';
import { useMemo } from 'react';
import type { Api } from './api';
import { confirmChecker, setChecker, type CheckerResult } from './flows-checker';
import { agentSettingLock, type ModelAt } from './modelHold';
import { onlyOn, shownComputer } from './shownGate';

/** The sender of these holds in core: only it lets them go. */
export const CHECKER_HOLD_BY = 'ai.checker';

/** What a checker change sends: the switch or the model. */
export type CheckerBody = { enabled?: boolean; model?: string };
type Guard = { realm: string; realmSettings: boolean };

/** The lock of the checker on one computer and realm; null when a part cannot be named (nothing is sent). */
export const checkerLock = (at: ModelAt): string | null => agentSettingLock(CHECKER_HOLD_BY, at, 'checker');

/** A held change as the row shows it. `body` is what was sent (null if the stored meta cannot be read: never proved, only
 *  Stop tracking lets it go); `inFlight`: its request may still be out. */
export interface HeldChecker { id: string; body: CheckerBody | null; metaVersion: number; inFlight: boolean }

function bodyOf(meta: unknown): CheckerBody | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as { enabled?: unknown; model?: unknown };
  const out: CheckerBody = {};
  if (m.enabled !== undefined) {
    if (typeof m.enabled !== 'boolean') return null;
    out.enabled = m.enabled;
  }
  if (m.model !== undefined) {
    if (typeof m.model !== 'string') return null;
    out.model = m.model;
  }
  return out.enabled === undefined && out.model === undefined ? null : out;
}

function heldOf(h: HeldAttempt): HeldChecker {
  return { id: h.id, body: bodyOf(h.meta), metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
}

/** The held checker change at `at`, re-read whenever core's holds move; null when none. */
export function useHeldChecker(at: ModelAt | null): HeldChecker | null {
  const version = useAttemptsVersion();
  const lock = at ? checkerLock(at) : null;
  return useMemo(() => {
    const h = lock ? heldAttempts(lock).find((x) => x.by === CHECKER_HOLD_BY) : undefined;
    return h ? heldOf(h) : null;
    // `version` is core's signal that the holds moved: the read is redone on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, version]);
}

/** A send's result: the flow's, or `held` (refused: this checker's change is already held) or `not_held` (refused: core
 *  could not keep the hold). Neither refusal sent anything. */
export type CheckerHoldResult = CheckerResult | { state: 'held' } | { state: 'not_held' };

/** A refusal that proves nothing was applied (shown as a failure, never as pending). */
const definite = (r: CheckerResult): boolean => r.state === 'failed' && r.err.kind !== 'pending' && r.err.code !== 'READ_BACK_FIRST';

/** Holds the change, sends it once (setChecker: the PUT, then the read-back) and lets the hold go only on a proved
 *  outcome. `wire` is the realm the calls are sent with (checkerWireRealm). The change is sent only if the computer shown
 *  did not change while the hold was being taken (else `stale`: nothing sent, the hold let go), and the PUT and its
 *  read-back go to that computer or nowhere. */
export async function sendChecker(api: Api, at: ModelAt, wire: string | null, guard: Guard, body: CheckerBody, on?: string): Promise<CheckerHoldResult> {
  const lock = checkerLock(at);
  if (!lock) return { state: 'not_held' };
  // The render's computer when the caller passes it (the sections do), else the one shown at the call. Core showing
  // another one sends nothing and holds nothing.
  const chosenOn = on ?? shownComputer();
  if (shownComputer() !== chosenOn) return { state: 'stale' };
  const got = await holdAttempt(lock, {
    by: CHECKER_HOLD_BY,
    realm: at.realm,
    identity: { project: at.project, computer: at.computer, realm: at.realm, setting: 'checker' },
    meta: body,
  }).catch(() => null);
  if (!got || !got.ok) return got && got.code === 'HELD' ? { state: 'held' } : { state: 'not_held' };
  const hold = got.hold;
  if (shownComputer() !== chosenOn) {
    hold.release();
    return { state: 'stale' };
  }
  const r = await setChecker(onlyOn(api, chosenOn), wire, guard, body).catch((): CheckerResult => ({ state: 'not_confirmed' }));
  if (r.state === 'saved' || definite(r)) hold.release();
  else hold.sent();
  return r;
}

/** Check again: reads the checker back, never a second send, and only from `on` (the computer the caller was shown,
 *  shownComputer(); shown another one, it answers `stale` with nothing read). The hold goes once the read shows what was
 *  sent and core's checked free agrees (never while the send may still be out). Refused: the hold stays and the row reads
 *  as before. */
export async function checkChecker(api: Api, wire: string | null, guard: Guard, held: HeldChecker, on: string): Promise<CheckerResult> {
  const r = held.body ? await confirmChecker(onlyOn(api, on), wire, guard, held.body) : { state: 'not_confirmed' as const };
  if (r.state !== 'saved') return r;
  const h = attemptFor(held.id, CHECKER_HOLD_BY);
  const freed = h ? await h.free('proved', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const) : 'freed';
  return freed === 'freed' ? r : { state: 'not_confirmed' };
}

/** The person's Stop tracking (after the kit's warning): true once core let the hold go. */
export async function stopChecker(held: HeldChecker): Promise<boolean> {
  const h = attemptFor(held.id, CHECKER_HOLD_BY);
  if (!h) return false;
  return (await h.free('dismissed', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const)) === 'freed';
}
