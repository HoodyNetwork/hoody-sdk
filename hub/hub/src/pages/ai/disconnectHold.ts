// A disconnect (a key removed, a sign-in ended, an endpoint deleted) whose outcome is unknown, held by core the way an
// agent's model change is (modelHold.ts): the same durable hold (stored, every tab of the account sees it) and its own
// sender. The lock names what the change touches on one computer: ai.signin:<project>/<container>/<provider> for a
// sign-in, ai.credential:<project>/<container>/<provider> for the provider's stored credential (its key, or an own endpoint
// and its key; core names it, providers.credentialLock). A key save takes the credential lock too (core's key-save hold,
// from this page's key step and the kit's KeySetup alike), so core admits one credential change of a provider at a
// time: a key that lands late never outlives a removal sent after it. A sign-out ends neither a key nor an
// endpoint, so it takes its own lock. A provider's sign-ins and keys belong to the computer's agent, not to a realm, so the
// lock names no realm. Closing the dialog and opening it again, leaving the page or another tab therefore shows "may have
// gone through" with Check again, never a Confirm a second removal could be sent from.
//   - The hold is taken before the request leaves. Refused (this provider's disconnect is already held, or storage that
//     cannot keep it): nothing is sent.
//   - Every call of a disconnect (the removal, its read-back, a later Check again) goes only to the computer the caller
//     was shown (shownGate.ts). A switch while the hold is being taken sends nothing and lets the hold go; a switch after
//     the removal left keeps the hold, unread, for that computer.
//   - It is let go only on a proved outcome: removed (the answer, a 404, or the read-back showing it gone) or a definite
//     refusal. Every other answer (lost, a context that moved on) keeps it.
//   - Check again only reads back what was removed (confirmGone with the provider and the kind captured at the press), and
//     frees the hold through core's checked free ('proved'), never while the send may still be out. Stop tracking is the
//     person's warned dismiss (core refuses it while the request may still be out).
//   - A removal that landed takes its account off the page's list (logic.ts accountsOf), and with it the dialog that reads
//     it back: the page then reads it back itself, once per list read (useSettleUnlisted), and lets it go only on a proof.
//   - The meta keeps what was removed ('key', 'signin' or 'endpoint'): plain data, never a secret.
import { attemptFor, heldAttempts, holdAttempt, providers, useAttemptsVersion, type HeldAttempt, type Target } from '@core';
import { useEffect, useMemo, useRef } from 'react';
import type { Api } from './api';
import { confirmGone, disconnect, type DisconnectResult, type DisconnectWhat, type GoneResult } from './flows-disconnect';
import { disconnectWhat, type Account } from './logic';
import { onlyOn, shownComputer } from './shownGate';

/** The sender of these holds in core: only it lets them go. */
export const DISCONNECT_HOLD_BY = 'ai.disconnect';
/** A project id as core's computer identities take it (modelHold.ts). */
const PROJECT = /^[A-Za-z0-9_-]{1,64}$/;
const COMPUTER = /^[A-Za-z0-9_.-]{1,48}$/;
/** A provider id, an own endpoint's included (EndpointStep.tsx plans those ids with ':' allowed). */
const PROVIDER = /^[A-Za-z0-9_.:-]{1,64}$/;
const WHATS: readonly DisconnectWhat[] = ['key', 'signin', 'endpoint'];

/** The computer a disconnect goes to: its project and container id (a container id alone is not unique across projects). */
export interface DisconnectAt { project: string; computer: string }

/** What a lock covers: a sign-in, or the provider's stored credential (a key, or an own endpoint and its key). */
export type LockFamily = 'signin' | 'credential';
const SIGNIN = 'ai.signin';
const FAMILIES: readonly LockFamily[] = ['signin', 'credential'];
/** The lock family a removal of `what` takes. */
const familyOf = (what: DisconnectWhat): LockFamily => (what === 'signin' ? 'signin' : 'credential');

/** The computer the AI page shows, as a disconnect names it; null without one. */
export function disconnectAtOf(m: { computer: { id: string } | null; target: Target | null }): DisconnectAt | null {
  return m.computer && m.target ? { project: m.target.project.id, computer: m.computer.id } : null;
}

/** Every lock of `family` on `at` starts with this; null when the computer cannot be named. The credential lock is core's
 *  (a key save takes it there), so it is named in one place. */
function lockBase(at: DisconnectAt, family: LockFamily): string | null {
  if (family === 'credential') return providers.credentialLockBase(at);
  return PROJECT.test(at.project) && COMPUTER.test(at.computer) ? `${SIGNIN}:${at.project}/${at.computer}/` : null;
}
function lockOf(at: DisconnectAt, family: LockFamily, provider: string): string | null {
  if (family === 'credential') return providers.credentialLock(at, provider);
  const base = lockBase(at, family);
  return base && PROVIDER.test(provider) ? base + provider : null;
}

/** The lock of one provider's removal of `what` on one computer; null when a part cannot be named (nothing is sent). */
export function disconnectLock(at: DisconnectAt, provider: string, what: DisconnectWhat): string | null {
  return lockOf(at, familyOf(what), provider);
}

/** The lock of one provider's stored credential on one computer: its key or endpoint removal, and its key save. */
export function credentialLock(at: DisconnectAt, provider: string): string | null {
  return lockOf(at, 'credential', provider);
}

/** A held disconnect as the dialog shows it. `what` is what was removed (null if the stored meta cannot be read: never
 *  proved, only Stop tracking lets it go); `inFlight`: its request may still be out. */
export interface HeldDisconnect { id: string; what: DisconnectWhat | null; metaVersion: number; inFlight: boolean }

function heldOf(h: HeldAttempt): HeldDisconnect {
  const w = h.meta && typeof h.meta === 'object' ? (h.meta as { what?: unknown }).what : undefined;
  const what = WHATS.find((x) => x === w) ?? null;
  return { id: h.id, what, metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
}

/** The held removal of `what` of `provider` at `at`, re-read whenever core's holds move; null when none. */
export function useHeldDisconnect(at: DisconnectAt | null, provider: string | null, what: DisconnectWhat | null): HeldDisconnect | null {
  const version = useAttemptsVersion();
  const lock = at && provider && what ? disconnectLock(at, provider, what) : null;
  return useMemo(() => {
    const h = lock ? heldAttempts(lock).find((x) => x.by === DISCONNECT_HOLD_BY) : undefined;
    return h ? heldOf(h) : null;
    // `version` is core's signal that the holds moved: the read is redone on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, version]);
}

/** Every held disconnect on `at`, with its provider (the lock's last part) and its lock family. */
export function heldDisconnectsAt(at: DisconnectAt): { provider: string; family: LockFamily; held: HeldDisconnect }[] {
  const out: { provider: string; family: LockFamily; held: HeldDisconnect }[] = [];
  for (const family of FAMILIES) {
    const base = lockBase(at, family);
    if (!base) return [];
    for (const h of heldAttempts()) {
      const provider = h.lock.slice(base.length);
      if (h.by === DISCONNECT_HOLD_BY && h.lock.startsWith(base) && PROVIDER.test(provider)) out.push({ provider, family, held: heldOf(h) });
    }
  }
  return out;
}

/** A send's result: the flow's, or `held` (refused: a change on this lock is already held: a removal, or for a key or
 *  endpoint a key save) or `not_held` (refused: core could not keep the hold). Neither refusal sent anything; neither does
 *  `stale` from a switch before the send. */
export type DisconnectHoldResult = DisconnectResult | { state: 'held' } | { state: 'not_held' };

/** Holds the disconnect, sends it once (flows-disconnect: the removal, then the read-back) and lets the hold go only on a
 *  proved outcome. `on`: the computer the caller was shown (shownComputer()); every call goes there or nowhere. */
export async function sendDisconnect(api: Api, at: DisconnectAt, a: Account, on: string): Promise<DisconnectHoldResult> {
  const what = disconnectWhat(a);
  const lock = disconnectLock(at, a.id, what);
  if (!lock) return { state: 'not_held' };
  if (shownComputer() !== on) return { state: 'stale' };
  const got = await holdAttempt(lock, {
    by: DISCONNECT_HOLD_BY,
    identity: { project: at.project, computer: at.computer, provider: a.id },
    meta: { what },
  }).catch(() => null);
  if (!got || !got.ok) return got && got.code === 'HELD' ? { state: 'held' } : { state: 'not_held' };
  const hold = got.hold;
  // The computer moved while the hold was being taken: nothing is sent, so nothing is held.
  if (shownComputer() !== on) {
    hold.release();
    return { state: 'stale' };
  }
  const r = await disconnect(onlyOn(api, on), a).catch((): DisconnectResult => ({ state: 'not_confirmed' }));
  // `failed` is a definite refusal (flows-disconnect: an unknown answer is read back, never failed).
  if (r.state === 'removed' || r.state === 'failed') hold.release();
  else hold.sent();
  return r;
}

/** Check again's result: `removed` (read gone and let go), `present` (read whole: still there), `busy` (read gone, but core
 *  kept the hold: a request of it may still be out), `not_confirmed` (nothing read whole) or `stale` (the computer moved:
 *  nothing read). Only `removed` let the hold go. */
export type CheckResult = 'removed' | 'present' | 'busy' | 'not_confirmed' | 'stale';

/** Check again: reads back what was removed, never a second send, and only from `on` (the computer the caller was shown).
 *  The hold goes once the read shows it gone and core's checked free agrees (never while the send may still be out). */
export async function checkDisconnect(api: Api, provider: string, held: HeldDisconnect, on: string): Promise<CheckResult> {
  if (!held.what) return 'not_confirmed';
  const r = await confirmGone(onlyOn(api, on), provider, held.what).catch((): GoneResult => ({ state: 'not_confirmed' }));
  if (r.state !== 'removed') return r.state;
  // This tab cannot let the hold go (no copy of it here) while it is still held: busy. Gone from the holds = removed.
  // Such a hold is another sender's: that sender's own check or the person's Stop tracking lets it go.
  const h = attemptFor(held.id, DISCONNECT_HOLD_BY);
  const freed = h ? await h.free('proved', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const) : heldAttempts().some((x) => x.id === held.id) ? 'unresolved' : 'freed';
  return freed === 'freed' ? 'removed' : 'busy';
}

/** The person's Stop tracking (after the warning): true once core let the hold go. */
export async function stopDisconnect(held: HeldDisconnect): Promise<boolean> {
  const h = attemptFor(held.id, DISCONNECT_HOLD_BY);
  if (!h) return false;
  return (await h.free('dismissed', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const)) === 'freed';
}

/** Holds being read back by useSettleUnlisted now (one read per hold at a time, StrictMode's second run included). */
const settling = new Set<string>();

/** What makes a list read new: its read time (`read`, the bundle's data time) and the ids it lists, never the array's
 *  identity (the page model rebuilds `accounts` on every unrelated query update, and each rebuild would read again). */
export function listReadKey(read: number | null, accounts: readonly { id: string }[] | null): string | null {
  return accounts ? `${read ?? ''}\n${accounts.map((a) => a.id).sort().join('\n')}` : null;
}

/** The page's reader of holds no dialog can reach. Once per read of the accounts list (`read` + the listed ids, listReadKey), every
 *  held disconnect of `at` that no listed account's dialog shows (its provider is not listed, or listed with a removal of
 *  the other lock family: a sign-out held while the row now shows a key) and whose request is not out is read back once
 *  (checkDisconnect: a read, never a send), from the computer shown when that list was drawn. A read that proves nothing
 *  leaves it held for the next list read. */
export function useSettleUnlisted(at: DisconnectAt | null, accounts: readonly Account[] | null, read: number | null, api: Api): void {
  const on = shownComputer();
  const project = at?.project ?? null;
  const computer = at?.computer ?? null;
  const key = listReadKey(read, accounts);
  const list = useRef(accounts);
  list.current = accounts;
  useEffect(() => {
    const accounts = list.current;
    if (project === null || computer === null || key === null || !accounts) return;
    const listed = new Set(accounts.map((x) => `${familyOf(disconnectWhat(x))}\n${x.id}`));
    for (const { provider, family, held } of heldDisconnectsAt({ project, computer })) {
      if (listed.has(`${family}\n${provider}`) || held.inFlight || settling.has(held.id)) continue;
      settling.add(held.id);
      void checkDisconnect(api, provider, held, on)
        .catch(() => 'not_confirmed' as const)
        .finally(() => settling.delete(held.id));
    }
  }, [project, computer, key, api, on]);
}
