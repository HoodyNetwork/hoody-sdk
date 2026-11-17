// A Claude Code change (turning it on, or making it or Hoody's own agent the one new chats use) whose outcome is unknown,
// held by core the way an agent's model change is (modelHold.ts): the same durable hold (stored, every tab of the account
// sees it), its own sender, the lock ai.claude:<project>/<container>/<realm>/claude. Both changes share the lock: while one
// may still land, neither is sent. So leaving Settings, a realm switch and back, or another tab shows "may have gone
// through" with Check again, never a button a second change could be sent from.
//   - The hold is taken before the request leaves. Refused (a change of this computer and realm is already held, or
//     storage that cannot keep it): nothing is sent. The page's api sends to the computer shown at each call, so a computer
//     switch while the hold is being taken sends nothing and lets the hold go (as Default model's followsShown,
//     modelHold.ts). The write and its read-back then go only to that computer (shownGate.ts onlyOn): after a switch the
//     read-back reads nothing and the hold stays.
//   - It is let go only on a proved outcome: the read-back shows the change (saved), or a definite refusal. Every other
//     answer (lost, a 2xx the read-back does not show yet, a context that moved on) keeps it.
//   - Check again only reads back what was sent (confirmEnabled or confirmBackend), and only from the computer the caller
//     was shown, then frees the hold through core's checked free ('proved'), never while the send may still be out. Stop
//     tracking is the person's warned dismiss.
//   - The meta keeps what was sent ({kind, v}): plain data, never a secret.
import { attemptFor, heldAttempts, holdAttempt, useAttemptsVersion, type HeldAttempt } from '@core';
import { useMemo } from 'react';
import type { Api } from './api';
import { confirmBackend, confirmEnabled, setBackend, setEnabled, type ToggleResult } from './flows-claude';
import { agentSettingLock, type ModelAt } from './modelHold';
import { onlyOn, shownComputer } from './shownGate';

/** The sender of these holds in core: only it lets them go. */
export const CLAUDE_HOLD_BY = 'ai.claude';

/** What a change sends: Claude Code turned on, or the agent new chats use ('' is Hoody's own). */
export type ClaudeChange = { kind: 'enabled'; v: boolean } | { kind: 'backend'; v: '' | 'claude' };

/** The lock of Claude Code's changes on one computer and realm; null when a part cannot be named (nothing is sent). */
export const claudeLock = (at: ModelAt): string | null => agentSettingLock(CLAUDE_HOLD_BY, at, 'claude');

/** A held change as the page shows it. `change` is what was sent (null if the stored meta cannot be read: never proved,
 *  only Stop tracking lets it go); `inFlight`: its request may still be out. */
export interface HeldClaude { id: string; change: ClaudeChange | null; metaVersion: number; inFlight: boolean }

function changeOf(meta: unknown): ClaudeChange | null {
  const m = meta && typeof meta === 'object' ? (meta as { kind?: unknown; v?: unknown }) : {};
  if (m.kind === 'enabled' && typeof m.v === 'boolean') return { kind: 'enabled', v: m.v };
  if (m.kind === 'backend' && (m.v === '' || m.v === 'claude')) return { kind: 'backend', v: m.v };
  return null;
}

function heldOf(h: HeldAttempt): HeldClaude {
  return { id: h.id, change: changeOf(h.meta), metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
}

/** The held change at `at`, re-read whenever core's holds move; null when none. */
export function useHeldClaude(at: ModelAt | null): HeldClaude | null {
  const version = useAttemptsVersion();
  const lock = at ? claudeLock(at) : null;
  return useMemo(() => {
    const h = lock ? heldAttempts(lock).find((x) => x.by === CLAUDE_HOLD_BY) : undefined;
    return h ? heldOf(h) : null;
    // `version` is core's signal that the holds moved: the read is redone on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, version]);
}

/** A send's result: the flow's, or `held` (refused: a change here is already held) or `not_held` (refused: core could not
 *  keep the hold). Neither refusal sent anything. */
export type ClaudeHoldResult = ToggleResult | { state: 'held' } | { state: 'not_held' };

/** A refusal that proves nothing was applied (shown as a failure, never as pending). */
const definite = (r: ToggleResult): boolean => r.state === 'failed' && r.err.kind !== 'pending' && r.err.code !== 'READ_BACK_FIRST';

/** Holds the change, sends it once (the flow: the write, then the read-back) and lets the hold go only on a proved
 *  outcome. The realm the change is sent for is the hold's. The change is sent only if the computer shown did not change
 *  while the hold was being taken (else `stale`: nothing sent, the hold let go), and the write and its read-back go to
 *  that computer or nowhere. */
export async function sendClaude(api: Api, at: ModelAt, change: ClaudeChange, on?: string): Promise<ClaudeHoldResult> {
  const lock = claudeLock(at);
  if (!lock) return { state: 'not_held' };
  // The render's computer when the caller passes it (the sections do), else the one shown at the call. Core showing
  // another one sends nothing and holds nothing.
  const chosenOn = on ?? shownComputer();
  if (shownComputer() !== chosenOn) return { state: 'stale' };
  const got = await holdAttempt(lock, {
    by: CLAUDE_HOLD_BY,
    realm: at.realm,
    identity: { project: at.project, computer: at.computer, realm: at.realm, setting: 'claude' },
    meta: change,
  }).catch(() => null);
  if (!got || !got.ok) return got && got.code === 'HELD' ? { state: 'held' } : { state: 'not_held' };
  const hold = got.hold;
  if (shownComputer() !== chosenOn) {
    hold.release();
    return { state: 'stale' };
  }
  const via = onlyOn(api, chosenOn);
  const send = change.kind === 'enabled' ? setEnabled(via, at.realm, change.v) : setBackend(via, at.realm, change.v);
  const r = await send.catch((): ToggleResult => ({ state: 'not_confirmed' }));
  if (r.state === 'saved' || definite(r)) hold.release();
  else hold.sent();
  return r;
}

/** Check again: reads back what was sent, never a second send, and only from `on` (the computer the caller was shown,
 *  shownComputer(); shown another one, it answers `stale` with nothing read). The hold goes once the read shows it and
 *  core's checked free agrees (never while the send may still be out). Refused: the hold stays and the page reads as
 *  before. */
export async function checkClaude(api: Api, realm: string, held: HeldClaude, on: string): Promise<ToggleResult> {
  const c = held.change;
  const via = onlyOn(api, on);
  const r = !c ? ({ state: 'not_confirmed' } as const) : c.kind === 'enabled' ? await confirmEnabled(via, realm, c.v) : await confirmBackend(via, realm, c.v);
  if (r.state !== 'saved') return r;
  const h = attemptFor(held.id, CLAUDE_HOLD_BY);
  const freed = h ? await h.free('proved', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const) : 'freed';
  return freed === 'freed' ? r : { state: 'not_confirmed' };
}

/** The person's Stop tracking (after the kit's warning): true once core let the hold go. */
export async function stopClaude(held: HeldClaude): Promise<boolean> {
  const h = attemptFor(held.id, CLAUDE_HOLD_BY);
  if (!h) return false;
  return (await h.free('dismissed', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const)) === 'freed';
}
