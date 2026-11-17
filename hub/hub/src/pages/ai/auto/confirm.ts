// A confirm bound to the attempt it was opened for (loops and TODOs).
// Opening one captures the target (the row key) and, through `identify`, a fresh read of what exactly it
// acts on (a TODO's revision, the lease's worker session, a proposal still pending; a loop's id). The store re-reads at
// the send and refuses when that identity moved (nothing is sent). The confirm is discarded, never only hidden, in an
// effect (not at render) when the target, the capability or a deadline moves: another selection, a TODO that a worker
// now holds or let go, a proposal whose expires_at passed. A discarded confirm says "This changed; review again" and
// needs a new press to open; take() rechecks all of it at the press itself. Which confirm is open is held in a ref set
// synchronously (open sets it before its read starts; close, take, a discard and the next open clear or replace it), so
// a read that answers after any of them, in the same batch or before the first render, is dropped.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Bound<A extends string> {
  readonly action: A;
  /** A proposal's id, or ''. */
  readonly pid: string;
  /** The row key the confirm was opened on. */
  readonly target: string;
  /** What `identify` read at the open; null until it answers. */
  readonly ident: string | null;
  /** Epoch ms after which the confirm is void (a proposal's expires_at), or null. */
  readonly until: number | null;
}

export interface BoundConfirm<A extends string> {
  /** The open confirm, while it is still valid. */
  ask: Bound<A> | null;
  /** The open read (identify) is out. */
  reading: boolean;
  /** The open read failed or found nothing to act on: confirm stays off. */
  unreadable: boolean;
  /** The last confirm was discarded because what it was for changed. */
  changed: boolean;
  open(action: A, pid?: string, until?: number | null): void;
  close(): void;
  /** At the confirming press: the confirm if it is still valid (target, capability, deadline, its identity read),
   *  closed either way; null (and changed) otherwise. */
  take(): Bound<A> | null;
}

export function useBoundConfirm<A extends string>(o: {
  target: string;
  offered: (action: A, pid: string) => boolean;
  identify: (action: A, pid: string) => Promise<string | null>;
  now?: () => number;
}): BoundConfirm<A> {
  const now = o.now ?? Date.now;
  const [ask, setAsk] = useState<Bound<A> | null>(null);
  const [reading, setReading] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [changed, setChanged] = useState(false);
  // The open confirm, authoritative between renders (`ask` is its rendered copy).
  const cur = useRef<Bound<A> | null>(null);
  const drop = useCallback(() => {
    cur.current = null;
    setAsk(null);
    setReading(false);
  }, []);
  const valid = (b: Bound<A> | null): b is Bound<A> =>
    b !== null && b.target === o.target && o.offered(b.action, b.pid) && (b.until === null || now() < b.until);
  const stale = ask !== null && !valid(ask);
  // Discard in an effect, so a confirm hidden by a passing state never comes back when that state passes again.
  // Another target (a selection change) closes it quietly: "this changed" would be about a TODO or loop no longer shown.
  const moved = ask !== null && ask.target !== o.target;
  useEffect(() => {
    if (!stale || cur.current !== ask) return;
    drop();
    setChanged(!moved);
  }, [stale, moved, ask, drop]);
  useEffect(() => {
    if (!ask || ask.until === null) return;
    const id = setTimeout(() => {
      if (cur.current === ask) {
        drop();
        setChanged(true);
      }
    }, Math.max(0, ask.until - now()) + 1);
    return () => clearTimeout(id);
    // now is the caller's clock, fixed for the hook's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);
  const close = drop;
  const open = (action: A, pid = '', until: number | null = null) => {
    if (!o.offered(action, pid) || (until !== null && now() >= until)) return;
    const b: Bound<A> = { action, pid, target: o.target, ident: null, until };
    cur.current = b;
    setAsk(b);
    setChanged(false);
    setUnreadable(false);
    setReading(true);
    void o.identify(action, pid).then(
      (ident) => {
        if (cur.current !== b) return;
        setReading(false);
        if (ident === null) return setUnreadable(true);
        const read = { ...b, ident };
        cur.current = read;
        setAsk(read);
      },
      () => {
        if (cur.current !== b) return;
        setReading(false);
        setUnreadable(true);
      },
    );
  };
  const take = () => {
    const b = cur.current;
    drop();
    if (!valid(b) || b.ident === null) {
      if (b) setChanged(true);
      return null;
    }
    return b;
  };
  return { ask: stale ? null : ask, reading, unreadable, changed, open, close, take };
}

/** Re-renders at the earliest of `times` (epoch ms) still ahead, so a deadline that passes while the page is open shows
 *  as passed without another render. */
export function useDeadlines(times: readonly number[], now: () => number = Date.now): void {
  const [, tick] = useState(0);
  const next = times.filter((t) => Number.isFinite(t) && t > now()).reduce((a, b) => Math.min(a, b), Infinity);
  useEffect(() => {
    if (next === Infinity) return;
    const id = setTimeout(() => tick((n) => n + 1), Math.min(2 ** 31 - 1, Math.max(0, next - now()) + 1));
    return () => clearTimeout(id);
    // now is the caller's clock, fixed for the hook's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);
}
