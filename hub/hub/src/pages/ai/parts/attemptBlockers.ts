// The part of another attempt store (rename, close, delete, trim) a dialog reads to refuse while that store holds an unsettled record for
// the same chat: no two of the four writes on one chat run together (the agent loads a chat's record and saves it back without a lock
// shared across them, so a rename racing a delete could write a deleted chat back). The records are keyed by the chat's
// `attemptKey`, so every mount of the chat (the open chat's menu, a list row) sees the same record.
import { useCallback, useRef, useSyncExternalStore } from 'react';

export interface AttemptBlocker {
  get(key: string): unknown;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export const NO_BLOCKERS: readonly AttemptBlocker[] = [];

const sameStores = (a: readonly AttemptBlocker[], b: readonly AttemptBlocker[]): boolean => a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

/** True while any of `blockers` holds a record for `key`; re-renders when one changes. A host builds its list each render, so the
 *  hook keeps the first list of the same stores (compared one by one): the subscription is made again only when the stores change. */
export function useBlockedBy(blockers: readonly AttemptBlocker[], key: string | null): boolean {
  const kept = useRef(blockers);
  if (!sameStores(kept.current, blockers)) kept.current = blockers;
  const list = kept.current;
  const subscribe = useCallback((fn: () => void) => { const off = list.map((b) => b.subscribe(fn)); return () => { for (const o of off) o(); }; }, [list]);
  const snapshot = useCallback(() => list.reduce((n, b) => n + b.version(), 0), [list]);
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return key !== null && list.some((b) => b.get(key) !== undefined);
}
