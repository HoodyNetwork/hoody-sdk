// The pairing code of a chat app: one holder per (Bot, chat app), because the agent keeps one active code per chat app (an
// issue replaces it and a cancel removes it). Both places that show a code (Setup for the owner code, People for an invite) read
// this holder, so they can never disagree. The code lives here, never in a change's answer (which the page keeps), a lock key
// or an identity.
//
// - Pressing Issue or Cancel claims a request number and drops the shown code at once, before anything is awaited: the agent
//   may replace or remove it whatever the answer, so the old code is never shown again. The answer is written only if that is
//   still the latest number for the app, so a slower, older answer never replaces a newer code, and an issue that was admitted
//   after the drawer closed finds its number overtaken and writes nothing.
// - Cancelling, closing the drawer or pressing Done clears the holder and drops every issue still in flight.
// - While a press has no answer yet the holder says so (`useCodeMayHaveChanged`), so a lost answer reads "the code may have
//   changed", never the old code.
// - Expiry belongs to the holder: one timer per app, and a code past its time reads as none the moment it is read, whether or not
//   anything is mounted to hear the timer.
import { useSyncExternalStore } from 'react';

export type CodeKind = 'owner' | 'invite';

/** A pairing or owner code and when it stops working (ms since the epoch; 0 when the agent gave none). */
export interface HeldCode {
  code: string;
  expiresAt: number;
  kind: CodeKind;
}

// The most a timer can wait; a code that lasts longer is cleared by the read-time check instead.
const MAX_WAIT = 2_147_483_647;

const held = new Map<string, HeldCode>();
const latest = new Map<string, number>();
// Apps with a press (issue or cancel) that no answer, clear or newer code has settled.
const open = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let seq = 0;

const slot = (uid: string, channelId: string): string => `${uid}\u0000${channelId}`;
const expired = (c: HeldCode): boolean => c.expiresAt > 0 && c.expiresAt <= Date.now();
const changed = (): void => listeners.forEach((l) => l());

function drop(key: string): void {
  const t = timers.get(key);
  if (t !== undefined) clearTimeout(t);
  timers.delete(key);
  held.delete(key);
}

/**
 * An issue or a cancel is pressed: take its request number and drop the shown code now. The answer counts only while no later
 * issue, cancel or clear has happened for this app. Call it when the button is pressed, before the change is admitted or sent.
 */
export function beginIssue(uid: string, channelId: string): number {
  const key = slot(uid, channelId);
  seq += 1;
  latest.set(key, seq);
  open.add(key);
  drop(key);
  changed();
  return seq;
}

/** Put an issued code in the holder. False (and nothing written) when the request was overtaken. A code already past its time clears the holder: the issue replaced the old one. */
export function offerCode(uid: string, channelId: string, request: number, code: HeldCode): boolean {
  const key = slot(uid, channelId);
  if (latest.get(key) !== request) return false;
  open.delete(key);
  drop(key);
  if (code.code !== '' && !expired(code)) {
    held.set(key, code);
    if (code.expiresAt > 0) {
      const timer = setTimeout(() => {
        if (held.get(key) === code) {
          drop(key);
          changed();
        }
      }, Math.min(MAX_WAIT, Math.max(0, code.expiresAt - Date.now())));
      timers.set(key, timer);
    }
  }
  changed();
  return true;
}

/** A press was refused or definitely failed: the old code stays gone, but nothing is left open. */
export function settlePress(uid: string, channelId: string): void {
  if (open.delete(slot(uid, channelId))) changed();
}

/** Forget the code of this app (Done, a cancel, the drawer closing) and drop every issue still in flight for it. */
export function clearCode(uid: string, channelId: string): void {
  const key = slot(uid, channelId);
  seq += 1;
  latest.set(key, seq);
  open.delete(key);
  drop(key);
  changed();
}

/** The code now held for this app, or null: a code past its time reads as none even before its timer has run. */
export function heldCode(uid: string, channelId: string): HeldCode | null {
  const c = held.get(slot(uid, channelId));
  return c && !expired(c) ? c : null;
}

/** The fake API answers an issue with a fixed code, because it has no agent to issue one; a live answer never carries one. */
export function adoptDemo(uid: string, channelId: string, kind: CodeKind, answer: { demo?: { code: string; expiresAt: number } } | undefined, request: number): void {
  if (!answer?.demo) return;
  offerCode(uid, channelId, request, { ...answer.demo, kind });
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The held code of one app, kept current: it re-renders when a code arrives, is cleared or expires. */
export function useHeldCode(uid: string, channelId: string | undefined): HeldCode | null {
  return useSyncExternalStore(
    subscribe,
    () => (channelId === undefined ? null : heldCode(uid, channelId)),
    () => null,
  );
}

/** A press of Issue or Cancel is still unanswered: the agent may have replaced or removed the code, so none is shown. */
export function useCodeMayHaveChanged(uid: string, channelId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => channelId !== undefined && open.has(slot(uid, channelId)),
    () => false,
  );
}

/** Tests only. */
export function resetCodesForTests(): void {
  for (const k of [...held.keys()]) drop(k);
  latest.clear();
  open.clear();
  seq = 0;
  changed();
}
