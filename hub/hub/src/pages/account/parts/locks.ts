// The one lock table of account changes, shared by every drawer and section of the page (C9: a change whose
// outcome is unknown stays locked until the status is read back).
import { keepsChanges, onBump } from '@core';
import { useSyncExternalStore } from 'react';
import { type OpState, OpLocks } from '../logic';

export const locks = new OpLocks();

// Core's own rule: a realm switch (same account and session) keeps unresolved changes; an account change or a
// sign-out drops them, whether or not the page is mounted.
onBump((reason) => {
  if (!keepsChanges(reason)) locks.clear();
});

export type OpName = 'setup' | 'codes' | 'off' | 'password' | 'gate' | 'name' | 'email' | 'emailCancel';

export function useOpLock(op: OpName): OpState | undefined {
  return useSyncExternalStore(
    locks.subscribe,
    () => locks.snapshot().get(op),
    () => undefined,
  );
}

/** True while the op's last send may have applied and nothing sure has answered since. */
export function useOpMaybe(op: OpName): boolean {
  return useSyncExternalStore(
    locks.subscribe,
    () => locks.maybeSnapshot().has(op),
    () => false,
  );
}

/**
 * A send's answer that says its change is still out: unknown (pending), or refused only because an earlier send
 * of it, here or on a page this one replaced, has not been read back. Neither is a failure.
 */
export const stillOut = (r: { outcome: string; code?: string }): boolean =>
  r.outcome === 'pending' || (r.outcome === 'not_sent' && (r.code === 'BUSY' || r.code === 'READ_BACK_FIRST'));

const TWO_FACTOR_OPS = ['setup', 'codes', 'off', 'gate'] as const;

/** True while a 2FA change waits on a read-back (a pending password change is the password drawer's own). */
export function useAnyPending(): boolean {
  return useSyncExternalStore(
    locks.subscribe,
    () => locks.anyPending(TWO_FACTOR_OPS) ? true : false,
    () => false,
  );
}

/**
 * A fresh read-back settles the op it covered, and only while that op is still waiting on one and no newer send
 * happened since the read began (`version` from locks.version(op), read before the read-back started).
 */
export function releaseOp(op: OpName, version: number): boolean {
  return locks.release(op, version);
}
