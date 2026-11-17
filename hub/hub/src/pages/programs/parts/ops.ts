// The operation held for a program (C9). Keyed by `opKey(scope.part, row.key)`: account, realm,
// computer and program, so an op never shows on, or is cleared from, another computer. Lives in
// module state, never in a node: a redraw, a refresh or a remount shows the same state, and one
// operation per program is held at a time.
import { useSyncExternalStore } from 'react';
import { onAuthPurge, type Target } from '@core';
import type { PressArgs } from '../data';
import type { Action } from '../logic';

export type OpStatus = 'working' | 'unknown' | 'failed' | 'gone' | 'refused';

export interface Op {
  act: Action;
  /** The computer the press went to; a read-back reads this one, never the current one. */
  target: Target;
  port: number | null;
  status: OpStatus;
  /** The server code of a failure. */
  code?: string;
  /** What was sent, so a check completes (or discards) exactly that change in core. */
  press: PressArgs;
  /** The restart key, for reading its receipt. */
  key?: string;
  /** The hold this send left in core (its token): Check again and Dismiss name it, so they never free a later send
   *  of the same change; the row counts only while core still holds it. */
  hold?: string;
  /** The value a boot change asked for. */
  boot?: boolean;
  /** A check found nothing new (shown once). */
  stuck?: boolean;
  /** A read-back is under way. */
  checking?: boolean;
  /** 'other': another page sent the held change (core frees it only for that sender), so it is shown read-only
   *  here, and only while core still holds it. */
  from?: 'other';
  /** That page's id, for the link to it; absent when its sender named none. */
  fromPage?: string;
}

let ops: ReadonlyMap<string, Op> = new Map();
const listeners = new Set<() => void>();

function commit(next: Map<string, Op>): void {
  ops = next;
  for (const l of listeners) l();
}

// The store ends with the session. On the web a session's end is a page load, which empties module state by itself; a
// terminal process goes on to the next session (sign-out and back in, the next account), where the last one's note
// would show for a press nobody there made, naming the last session's computer. Core drops its own held sends then
// (resetChanges), so nothing here could be checked or dismissed any more. Hooked at the first op kept: a page that
// never holds one registers nothing.
let purgeHooked = false;
function hookPurge(): void {
  if (purgeHooked) return;
  purgeHooked = true;
  try {
    onAuthPurge(() => { commit(new Map()); });
  } catch {
    /* a unit test's partial @core mock has no purge; the app's core always does */
  }
}

export const opsStore = {
  get: (key: string): Op | undefined => ops.get(key),
  set(key: string, op: Op): void {
    hookPurge();
    commit(new Map(ops).set(key, op));
  },
  patch(key: string, patch: Partial<Op>): void {
    const cur = ops.get(key);
    if (cur) commit(new Map(ops).set(key, { ...cur, ...patch }));
  },
  clear(key: string): void {
    if (!ops.has(key)) return;
    const next = new Map(ops);
    next.delete(key);
    commit(next);
  },
  /** Drops everything (tests, computer switch). */
  reset(): void {
    commit(new Map());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: (): ReadonlyMap<string, Op> => ops,
};

/** All held operations; re-renders on any change. */
export function useOps(): ReadonlyMap<string, Op> {
  return useSyncExternalStore(opsStore.subscribe, opsStore.snapshot, opsStore.snapshot);
}

/** An operation that blocks a second press: working or unconfirmed. */
export function isHeld(op: Op | undefined): boolean {
  return !!op && (op.status === 'working' || op.status === 'unknown');
}

/** The store key of a program's op within one account/realm/computer partition. */
export function opKey(part: string, rowKey: string): string {
  return `${part}|${rowKey}`;
}
