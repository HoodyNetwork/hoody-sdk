// The operation held for a schedule (C9). Lives in module state, never in a node: a redraw, a
// refresh or a remount shows the same state, and one operation per schedule is held at a time.
import { useSyncExternalStore } from 'react';
import { keepsChanges, onBump } from '@core';
import type { Act, SchedRow } from '../logic';

export type OpStatus = 'working' | 'unknown' | 'failed' | 'refused';

export interface Op {
  act: Act | 'save';
  status: OpStatus;
  /** The server code of a failure. */
  code?: string;
  /** A read-back is under way. */
  checking?: boolean;
  /** A check found nothing new. */
  stuck?: boolean;
  /** The value a pause asked for. */
  enabled?: boolean;
  /** The schedule an action was sent for, so a held action stays checkable and closable after its row leaves the list. */
  row?: SchedRow;
  /** The expression a save sent, for the read-back. */
  expr?: string;
  /** The hold of the send that is held (the pending answer's): its proof settles that send only. */
  hold?: string;
  /** A loop change: the realm it was sent in. Only a read of that realm proves it. */
  realm?: string;
  /** Refused because an earlier send of the same lock is held (READ_BACK_FIRST). That send may carry other values
   *  (another tab's, a pause before an edit), so no read of this press's values proves it: only the warned Dismiss
   *  frees it. */
  earlier?: boolean;
}

/** The arguments of each held save, for its read-back and release (key: the op key `save:<target>`), and the hold of
 *  the send that is held when its answer named one. */
export const savedArgs = new Map<string, { args: unknown; before: number | null; hold?: string; earlier?: boolean }>();

let ops: ReadonlyMap<string, Op> = new Map();
const listeners = new Set<() => void>();

function commit(next: Map<string, Op>): void {
  ops = next;
  for (const l of listeners) l();
}

export const opsStore = {
  get: (key: string): Op | undefined => ops.get(key),
  set(key: string, op: Op): void {
    commit(new Map(ops).set(key, op));
  },
  patch(key: string, patch: Partial<Op>): void {
    const cur = ops.get(key);
    if (cur) commit(new Map(ops).set(key, { ...cur, ...patch }));
  },
  clear(key: string): void {
    savedArgs.delete(key);
    if (!ops.has(key)) return;
    const next = new Map(ops);
    next.delete(key);
    commit(next);
  },
  /** Drops everything; only runs when the change is not kept (account change, sign-out, boot) and in tests. */
  reset(): void {
    savedArgs.clear();
    commit(new Map());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: (): ReadonlyMap<string, Op> => ops,
};

// Core's own rule: an account change or sign-out ends the session these held changes belong to; a realm
// switch, a computer switch or a remount keeps them (a change of unknown outcome must stay locked).
onBump((reason) => {
  if (!keepsChanges(reason)) opsStore.reset();
});

export function useOps(): ReadonlyMap<string, Op> {
  return useSyncExternalStore(opsStore.subscribe, opsStore.snapshot, opsStore.snapshot);
}

/** An operation that blocks a second press: working or unconfirmed. */
export function isHeld(op: Op | undefined): boolean {
  return !!op && (op.status === 'working' || op.status === 'unknown');
}

const ON_OFF: ReadonlySet<string> = new Set(['pause', 'curl.pause', 'loop.pause']);

/** A turn on/off that is under way or may have gone through: whether the schedule is on is not known, so no switch shows it.
 *  Run now on an errored loop also turns it back on (its confirm is 'resume'); running a paused loop once does not. */
export function onOffUnknown(op: Op | undefined): boolean {
  if (!isHeld(op)) return false;
  return ON_OFF.has(op?.act ?? '') || (op?.act === 'loop.run' && op.row?.confirm === 'resume');
}
